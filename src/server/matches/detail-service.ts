import "server-only";

import { createPredictionWindow, getReportingDate, utcInstantFromEpochMilliseconds, validateReportingDateRange, type Clock } from "../../domain/calendar.ts";
import { matchDetailResponseSchema, type MatchDetailResponse } from "../../domain/match-detail.ts";
import { matchFeedRules } from "../../domain/match-feed.ts";
import { matchHref } from "../../domain/navigation.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { createMysqlEvidenceStore } from "../evidence/evidence-mysql-store.ts";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import { storedCycle, storedCycleDisplay, storedRevision } from "../predictions/history-read.ts";
import { storedFeedFixture } from "./fixture-read.ts";
import { storedFeedCoverage } from "./feed-read.ts";
import { MatchFeedError } from "./feed-error.ts";
import { detailHistoryLink, parseMatchDetailQuery } from "./detail-query.ts";
import { publicDetailCycle, publicDetailRevision, publicDetailSnapshot } from "./detail-read.ts";
import { publicCacheDescriptor, type PublicResponseCache } from "../cache/public-cache.ts";

export function canonicalMatchSlug(home: string | null, away: string | null): string {
  const part = (name: string | null, fallback: string) => name?.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 75).replace(/-+$/gu, "") || fallback;
  return `${part(home, "home")}-vs-${part(away, "away")}`;
}

export function createMatchDetailService(options: Readonly<{ database: DatabaseRuntime; clock?: Clock; cache?: PublicResponseCache }>) {
  const clock = options.clock ?? { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
  const evidenceStore = createMysqlEvidenceStore(options.database);
  return Object.freeze({ async query(id: string, parameters = new URLSearchParams()): Promise<MatchDetailResponse> {
    const query = parseMatchDetailQuery(id, parameters), asOf = clock.now(), today = getReportingDate(asOf);
    let refused: MatchFeedError | undefined;
    let permissionDeadline = Number.MAX_SAFE_INTEGER;
    try {
      const read = () => options.database.transaction(async (tx) => {
        try {
          const known = await tx.footballFixture.findUnique({ where: { id }, select: { id: true, kickoff: true } });
          if (!known) throw new MatchFeedError("not-found");
          const date = known.kickoff ? getReportingDate(utcInstantFromEpochMilliseconds(known.kickoff.getTime())) : today;
          const coverage = await storedFeedCoverage(tx, validateReportingDateRange(date, date, 1));
          const fixture = await storedFeedFixture(tx, id, !coverage[0]?.authoritative, createPredictionWindow(today), "en");
          const currentRevisionId = fixture.forecast?.revisionId ?? null;
          let display = fixture.cycleId ? await storedCycleDisplay(tx, fixture.cycleId) : null;
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
          const snapshot = revision && display ? await publicDetailSnapshot(tx, revision, display.cycle, currentRevisionId, evidence!.snapshot, asOf, options.cache) : null;
          const latestRevision = await tx.predictionSet.findFirst({ where: { fixtureId: id }, orderBy: { fixtureRevision: "desc" }, select: { fixtureRevision: true } });
          const latestCycle = await tx.predictionCycle.findFirst({ where: { fixtureId: id }, orderBy: { ordinal: "desc" }, select: { ordinal: true } });
          const anchors = { revision: query.revisionAnchor ?? latestRevision?.fixtureRevision ?? 0, cycle: query.cycleAnchor ?? latestCycle?.ordinal ?? 0 };
          const rows = await tx.predictionSet.findMany({ where: { fixtureId: id, fixtureRevision: { lte: anchors.revision ?? 0, ...(query.revisionBefore ? { lt: query.revisionBefore } : {}) } },
            orderBy: { fixtureRevision: "desc" }, take: query.limit + 1, select: { id: true } });
          const cycles = await tx.predictionCycle.findMany({ where: { fixtureId: id, ordinal: { lte: anchors.cycle ?? 0, ...(query.cycleBefore ? { lt: query.cycleBefore } : {}) } },
            orderBy: { ordinal: "desc" }, take: query.limit + 1, select: { id: true } });
          const revisions = [], cycleHistory = [];
          for (const row of rows.slice(0, query.limit)) revisions.push(publicDetailRevision((await storedRevision(tx, row.id))!));
          for (const row of cycles.slice(0, query.limit)) cycleHistory.push(publicDetailCycle((await storedCycle(tx, row.id))!));
          const slug = canonicalMatchSlug(fixture.homeTeam.name, fixture.awayTeam.name);
          const response = matchDetailResponseSchema.parse({ fixture, asOf, route: { fixtureId: id, slug, path: matchHref(id, slug, "en") },
            currentRevisionId, selection: query.revision ? "revision" : query.cycle ? "cycle" : "applicable", selectedCycle: display ? publicDetailCycle(display.cycle) : null, snapshot,
            history: { limit: query.limit, revisions: { anchor: anchors.revision, entries: revisions,
              next: detailHistoryLink(id, parameters, anchors, "revision", rows.length > query.limit ? revisions.at(-1)!.fixtureRevision : null) },
            cycles: { anchor: anchors.cycle, entries: cycleHistory,
              next: detailHistoryLink(id, parameters, anchors, "cycle", cycles.length > query.limit ? cycleHistory.at(-1)!.ordinal : null) } } });
          if (Buffer.byteLength(JSON.stringify(response), "utf8") > matchFeedRules.maximumResponseBytes) throw new MatchFeedError("unavailable");
          return freezeEvidence(response);
        } catch (error) { if (error instanceof MatchFeedError) refused = error; throw error; }
      }, { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 30_000 });
      const descriptor = publicCacheDescriptor({ kind: "detail", locale: "en", now: asOf, fixtureId: id,
        query: { id, ...query }, parse: (value) => matchDetailResponseSchema.parse(value) });
      return options.cache ? await options.cache.read({ ...descriptor, validUntil: () => permissionDeadline }, read) : await read();
    } catch (error) {
      if (refused) throw refused;
      if (error instanceof MatchFeedError) throw error;
      throw new MatchFeedError("unavailable");
    }
  } });
}
