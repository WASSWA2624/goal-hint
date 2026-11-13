import "server-only";

import { getReportingDate, utcInstantFromEpochMilliseconds, validateReportingDateRange, type Clock } from "../../domain/calendar.ts";
import { storedMatchDetailResponseSchema, type StoredMatchDetailResponse } from "../../domain/match-detail.ts";
import { total15MarketKey, type Total15Odds } from "../../domain/extended-markets.ts";
import { matchFeedRules } from "../../domain/match-feed.ts";
import { matchHref } from "../../domain/navigation.ts";
import { canonicalMatchSlug } from "../../domain/match-slug.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { createMysqlEvidenceStore } from "../evidence/evidence-mysql-store.ts";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import { runFromRow, storedCycles, storedCycleDisplay, storedRevision, storedRevisions } from "../predictions/history-read.ts";
import { readExtendedMarketSnapshot } from "../predictions/extended-market-read.ts";
import { storedFeedFixture } from "./fixture-read.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import { storedFixtureOddsGroups, storedUpcomingOddsForFixtures } from "../odds/odds-read.ts";
import { storedClosingBookmakerQuotes, storedCurrentBookmakerQuotes, total15OddsForBookmaker } from "../odds/odds-mysql-store.ts";
import { projectBookmakerOdds } from "../odds/bookmaker-odds-read.ts";
import { storedInPlayOdds } from "../odds/in-play-odds-read.ts";
import { isLocalFootballDevelopment } from "../../domain/development-demo.ts";
import { storedFeedCoverage, storedFeedRunContext } from "./feed-read.ts";
import { MatchFeedError } from "./feed-error.ts";
import { detailHistoryLink, parseMatchDetailQuery } from "./detail-query.ts";
import { publicDetailCycle, publicDetailRevision, publicDetailSnapshot } from "./detail-read.ts";
import { publicCacheDescriptor, type PublicResponseCache } from "../cache/public-cache.ts";
import { storedLiveMatchSnapshot } from "../live-match/live-match-read.ts";
import { isPlayedFinalStatus } from "../../domain/market-settlement.ts";
import { prepareDemoFixture } from "../demo/read-seed.ts";
import { createSettlementProjectionReader } from "../settlement/settlement-read.ts";

export { canonicalMatchSlug } from "../../domain/match-slug.ts";

/** Public readers supply their verified odds permission. */
export function createMatchDetailService(options: Readonly<{ database: DatabaseRuntime; clock?: Clock; cache?: PublicResponseCache;
  providerOdds?: boolean; allowLiveMatch?: boolean; allowInPlayOdds?: boolean; extendedMarketsEnabled?: boolean }>) {
  const clock = options.clock ?? { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
  const providerOdds = options.providerOdds ?? publicPolicy.features.providerOdds;
  const allowLiveMatch = options.allowLiveMatch ?? publicPolicy.features.liveMatchDetails;
  const allowInPlayOdds = providerOdds && (options.allowInPlayOdds ?? isLocalFootballDevelopment());
  const extendedMarketsEnabled = options.extendedMarketsEnabled ?? isLocalFootballDevelopment();
  const evidenceStore = createMysqlEvidenceStore(options.database);
  return Object.freeze({ async query(id: string, parameters = new URLSearchParams()): Promise<StoredMatchDetailResponse> {
    const query = parseMatchDetailQuery(id, parameters), asOf = clock.now(), today = getReportingDate(asOf);
    let refused: MatchFeedError | undefined;
    let permissionDeadline = Number.MAX_SAFE_INTEGER;
    try {
      await prepareDemoFixture(options.database, id, asOf);
      const read = () => options.database.transaction(async (tx) => {
        try {
          const readSettlement = createSettlementProjectionReader(tx);
          const known = await tx.footballFixture.findUnique({ where: { id }, select: { id: true, kickoff: true, activeCycleId: true } });
          if (!known) throw new MatchFeedError("not-found");
          const date = known.kickoff ? getReportingDate(utcInstantFromEpochMilliseconds(known.kickoff.getTime())) : today;
          const range = validateReportingDateRange(date, date, 1), coverage = await storedFeedCoverage(tx, range);
          const { run, window } = await storedFeedRunContext(tx, today, range);
          // The card projection and full current detail share this transaction's
          // verified cycle/revision instead of reading the same archive twice.
          const currentDisplay = known.activeCycleId ? await storedCycleDisplay(tx, known.activeCycleId) : null;
          const fixture = await storedFeedFixture(tx, id, !coverage[0]?.authoritative, window, "en", { prices: providerOdds, display: currentDisplay, readSettlement });
          const currentRevisionId = fixture.forecast?.revisionId ?? null;
          // History selections replace the detail snapshot; the card keeps the active cycle.
          let display = !query.cycle && !query.revision ? currentDisplay : null;
          if (query.cycle) {
            const owned = await tx.predictionCycle.findFirst({ where: { id: query.cycle, fixtureId: id }, select: { id: true } });
            if (!owned) throw new MatchFeedError("not-found");
            display = await storedCycleDisplay(tx, owned.id);
          }
          let revision = display?.revision ?? null;
          if (query.revision) {
            const owned = await tx.predictionSet.findFirst({ where: { id: query.revision, fixtureId: id }, select: { id: true } });
            if (!owned) throw new MatchFeedError("not-found");
            revision = await storedRevision(tx, owned.id);
            display = revision ? await storedCycleDisplay(tx, revision.cycleId) : null;
            if (!revision || !display) throw new MatchFeedError("unavailable");
          }
          const evidence = revision ? await evidenceStore.findInTransaction(tx, revision.evidenceSnapshotId) : null;
          if (revision && (!evidence || evidence.snapshot.hash !== revision.evidenceHash || evidence.snapshot.context.fixtureId !== id)) throw new MatchFeedError("unavailable");
          if (evidence) permissionDeadline = Math.min(permissionDeadline, ...evidence.snapshot.sources
            .filter((source) => source.reuse.retainUntil >= asOf).map((source) => source.reuse.retainUntil + 1));
          const snapshot = revision && display ? await publicDetailSnapshot(tx, revision, display.cycle, currentRevisionId, evidence!.snapshot, asOf, options.cache, readSettlement) : null;
          const [odds, extendedMarkets] = await Promise.all([
            storedFixtureOddsGroups(tx, id, providerOdds && !!snapshot?.markets.length),
            extendedMarketsEnabled && revision && display && snapshot?.applicability === display.mode && display.revision?.id === revision.id &&
              (display.cycle.state === "open" ? display.cycle.currentSetId : display.cycle.lockedSetId) === revision.id
              ? readExtendedMarketSnapshot(tx, display, { enabled: true }) : null,
          ]);
          const latestRevision = query.revisionAnchor === null ? await tx.predictionSet.findFirst({ where: { fixtureId: id }, orderBy: { fixtureRevision: "desc" }, select: { fixtureRevision: true } }) : null;
          const latestCycle = query.cycleAnchor === null ? await tx.predictionCycle.findFirst({ where: { fixtureId: id }, orderBy: { ordinal: "desc" }, select: { ordinal: true } }) : null;
          const anchors = { revision: query.revisionAnchor ?? latestRevision?.fixtureRevision ?? 0, cycle: query.cycleAnchor ?? latestCycle?.ordinal ?? 0 };
          const rows = await tx.predictionSet.findMany({ where: { fixtureId: id, fixtureRevision: { lte: anchors.revision ?? 0, ...(query.revisionBefore ? { lt: query.revisionBefore } : {}) } },
            orderBy: { fixtureRevision: "desc" }, take: query.limit + 1, select: { id: true } });
          const cycles = await tx.predictionCycle.findMany({ where: { fixtureId: id, ordinal: { lte: anchors.cycle ?? 0, ...(query.cycleBefore ? { lt: query.cycleBefore } : {}) } },
            orderBy: { ordinal: "desc" }, take: query.limit + 1, select: { id: true } });
          const revisionRows = rows.slice(0, query.limit), revisionCache = new Map(revision ? [[revision.id, revision]] : []);
          for (const [key, entry] of await storedRevisions(tx, revisionRows.filter((row) => !revisionCache.has(row.id)).map((row) => row.id))) revisionCache.set(key, entry);
          const published = revisionRows.map((row) => {
            const entry = revisionCache.get(row.id);
            if (!entry || entry.fixtureId !== id) throw new MatchFeedError("unavailable");
            return entry;
          });
          const cycleCache = new Map(display ? [[display.cycle.id, display.cycle]] : []);
          const historyCycleIds = [...new Set([...published.map((entry) => entry.cycleId), ...cycles.slice(0, query.limit).map((row) => row.id)])];
          for (const [key, cycle] of await storedCycles(tx, historyCycleIds.filter((cycleId) => !cycleCache.has(cycleId)))) cycleCache.set(key, cycle);
          const cycleFor = (cycleId: string) => {
            const cycle = cycleCache.get(cycleId);
            if (!cycle || cycle.fixtureId !== id) throw new MatchFeedError("unavailable");
            return cycle;
          };
          const runs = await tx.dailyRun.findMany({ where: { id: { in: [...new Set(published.map((entry) => entry.runId))] } },
            select: { id: true, sequence: true, eatDate: true, createdAt: true } });
          const runDates = new Map(runs.map((row) => { const run = runFromRow(row); return [run.id, run.eatDate]; }));
          const revisions = published.map((entry) => ({ ...publicDetailRevision(entry), runDate: runDates.get(entry.runId),
            sources: [...new Set(Object.values(entry.candidate.markets).flatMap((market) => market.available ? [market.market.source] : []))],
            cycle: publicDetailCycle(cycleFor(entry.cycleId)) }));
          const cycleHistory = cycles.slice(0, query.limit).map((row) => publicDetailCycle(cycleFor(row.id)));
          const slug = canonicalMatchSlug(fixture.homeTeam.name, fixture.awayTeam.name);
          const response = storedMatchDetailResponseSchema.parse({ fixture, asOf, run, odds, route: { fixtureId: id, slug, path: matchHref(id, slug, "en") },
            currentRevisionId, selection: query.revision ? "revision" : query.cycle ? "cycle" : "applicable", selectedCycle: display ? publicDetailCycle(display.cycle) : null, snapshot,
            ...(extendedMarketsEnabled ? { extendedMarkets } : {}),
            history: { limit: query.limit, revisions: { anchor: anchors.revision, entries: revisions,
              next: detailHistoryLink(id, parameters, anchors, "revision", rows.length > query.limit ? revisions.at(-1)!.fixtureRevision : null) },
            cycles: { anchor: anchors.cycle, entries: cycleHistory,
              next: detailHistoryLink(id, parameters, anchors, "cycle", cycles.length > query.limit ? cycleHistory.at(-1)!.ordinal : null) } } });
          if (Buffer.byteLength(JSON.stringify(response), "utf8") > matchFeedRules.maximumResponseBytes) throw new MatchFeedError("unavailable");
          return freezeEvidence(response);
        } catch (error) { if (error instanceof MatchFeedError) refused = error; throw error; }
      }, { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 30_000 });
      const descriptor = publicCacheDescriptor({ kind: "detail", locale: "en", now: asOf, fixtureId: id,
        query: { id, projection: 13, providerOdds, extendedMarketsEnabled, ...query }, parse: (value) => storedMatchDetailResponseSchema.parse(value) });
      const response = options.cache ? await options.cache.read({ ...descriptor, validUntil: () => permissionDeadline }, read) : await read();
      const historical = response.selection !== "applicable", kickoffAt = response.fixture.kickoffAt;
      const total15Available = response.extendedMarkets?.markets.some(({ key, source }) => key === total15MarketKey && source !== "market-implied");
      if (providerOdds && !historical && response.fixture.status === "scheduled") {
        const [[entry], quotes] = kickoffAt !== null && kickoffAt > asOf ? await Promise.all([
          options.database.query((tx) => storedUpcomingOddsForFixtures(tx, [id], asOf)).catch(() => []),
          options.database.transaction((tx) => storedCurrentBookmakerQuotes(tx, [{ fixtureId: id, kickoffAt }], asOf),
            { isolationLevel: "RepeatableRead", maxWait: 2_000, timeout: 5_000 }).then((read) => read.get(id)).catch(() => undefined),
        ]) : [[], null] as const;
        const marketOdds = entry?.kickoffAt === kickoffAt ? entry.observation : null;
        const extendedOdds = total15Available ? total15OddsForBookmaker(quotes) : null;
        const compact = { ...response, asOf, fixture: { ...response.fixture, marketOdds },
          ...(extendedOdds ? { extendedOdds } : {}) };
        const bookmakerOdds = projectBookmakerOdds(quotes, "pre-match", matchFeedRules.maximumResponseBytes - Buffer.byteLength(JSON.stringify(compact), "utf8"));
        const projected = storedMatchDetailResponseSchema.parse({ ...compact, bookmakerOdds });
        return freezeEvidence(Buffer.byteLength(JSON.stringify(projected), "utf8") <= matchFeedRules.maximumResponseBytes ? projected : compact);
      }
      if (!allowLiveMatch && !allowInPlayOdds && !providerOdds) return response;
      // The live envelope bypasses the revision/detail cache; repeated visitor reads only read this bounded stored row.
      if (!historical && response.fixture.status !== "live" && !isPlayedFinalStatus(response.fixture.status) && response.fixture.status !== "abandoned") return response;
      const [liveMatch, inPlayOdds, closingQuotes] = await Promise.all([
        allowLiveMatch ? options.database.query((tx) => storedLiveMatchSnapshot(tx, { fixtureId: id, asOf, historical,
          cycleId: historical ? response.selectedCycle?.id ?? null : response.fixture.cycleId,
          kickoffAt: historical ? response.selectedCycle?.kickoffAt ?? null : kickoffAt })).catch(() => null) : undefined,
        allowInPlayOdds && !historical && response.fixture.status === "live" && kickoffAt !== null
          ? options.database.query((tx) => storedInPlayOdds(tx, { fixtureId: id, kickoffAt, asOf })).catch(() => null) : undefined,
        providerOdds && !historical && kickoffAt !== null
          ? options.database.transaction((tx) => storedClosingBookmakerQuotes(tx, { fixtureId: id, kickoffAt }, asOf),
            { isolationLevel: "RepeatableRead", maxWait: 2_000, timeout: 5_000 }).catch(() => null) : null,
      ]);
      const extendedOdds: Total15Odds | null = total15Available && inPlayOdds?.prices.total15Prices
        ? { marketKey: total15MarketKey, kind: "in-play", checkedAt: inPlayOdds.checkedAt, selections: inPlayOdds.prices.total15Prices } : null;
      const compact = { ...response, asOf,
        ...(allowLiveMatch ? { liveMatch } : {}),
        ...(allowInPlayOdds ? { inPlayOdds: inPlayOdds ?? null } : {}),
        ...(extendedOdds ? { extendedOdds } : {}) };
      const bookmakerOdds = providerOdds && !historical ? projectBookmakerOdds(closingQuotes, "closing",
        matchFeedRules.maximumResponseBytes - Buffer.byteLength(JSON.stringify(compact), "utf8")) : undefined;
      const projected = storedMatchDetailResponseSchema.parse({ ...compact, ...(bookmakerOdds !== undefined ? { bookmakerOdds } : {}) });
      // A large optional observation cannot make an otherwise valid forecast response exceed its wire bound.
      return freezeEvidence(Buffer.byteLength(JSON.stringify(projected), "utf8") <= matchFeedRules.maximumResponseBytes
        ? projected : { ...response, asOf, ...(allowLiveMatch ? { liveMatch: null } : {}), ...(allowInPlayOdds ? { inPlayOdds: null } : {}) });
    } catch (error) {
      if (refused) throw refused;
      if (error instanceof MatchFeedError) throw error;
      throw new MatchFeedError("unavailable");
    }
  } });
}
