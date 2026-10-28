import "server-only";

import { isPlayedFinalStatus } from "../../domain/market-settlement.ts";
import { liveClockFromProvider } from "../../domain/match-card.ts";
import { marketSelections, type MarketFamily } from "../../domain/markets.ts";
import { utcInstantFromEpochMilliseconds, type InstantWindow } from "../../domain/calendar.ts";
import type { StoredMatchFeedRecord } from "../../domain/match-feed.ts";
import { createMessages } from "../../i18n/messages.ts";
import { isSafeRemoteImageUrl } from "../../domain/remote-image.ts";
import { validTeamCode } from "../../domain/team-name.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { cycleFromRows, historyTime, revisionFromRows, storedCycleDisplay, type HistoryRow } from "../predictions/history-read.ts";
import { historyFail, type CycleDisplay } from "../predictions/history-contract.ts";
import { refreshResultFromRow, storedRefreshResult } from "../predictions/publication-read.ts";
import { projectSettlementCycle, settlementRevisionFromRow, storedSettlementProjection } from "../settlement/settlement-read.ts";
import type { SettlementRevision } from "../settlement/settlement-contract.ts";
import { fixtureResultFromRow, fixtureResultMatchesCanonical, resultStatus, storedFixtureResult, type StoredFixtureResult } from "../results/result-read.ts";
import { fixturePricesFromRows, storedFixturePrices, type FixturePriceRow } from "../odds/odds-read.ts";
import { publicRecommendation, recommendationMarket } from "../../domain/recommendation-view.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import { formatOddsHundredths, oddsDisplayHundredths, parseDecimalOdds } from "../../domain/odds.ts";

const families = Object.keys(marketSelections) as MarketFamily[];
const fixtureInclude = { homeTeam: true, awayTeam: true, season: { include: { competition: true } },
  resultState: true, lifecycleState: true } satisfies Prisma.FootballFixtureInclude;
type FeedFixture = Prisma.FootballFixtureGetPayload<{ include: typeof fixtureInclude }>;
type FeedFixtureSource = Readonly<{ fixture: FeedFixture; display: CycleDisplay | null; result: StoredFixtureResult | null;
  settlement: Awaited<ReturnType<typeof storedSettlementProjection>> | null;
  refresh: Awaited<ReturnType<typeof storedRefreshResult>>; jobState: string | null; priceRows: readonly FixturePriceRow[] }>;
const text = (value: string | null) => value?.normalize("NFC").replace(/\p{Cc}/gu, " ").trim() || null;
const voidKeys = { "formal-postponement": "outcome.postponement", "fixture-canceled": "outcome.cancellation",
  "fixture-abandoned": "outcome.abandonment", "fixture-awarded": "outcome.award", "locked-cutoff-invalidated": "outcome.invalidCutoff",
  "ineligible-cycle": "outcome.ineligible" } as const;

export function publicVoidReason(reason: string | null, locale = "en") {
  const code = reason && Object.hasOwn(voidKeys, reason) ? reason as keyof typeof voidKeys : "ineligible-cycle";
  return { code, explanation: createMessages(locale).text(voidKeys[code]) };
}

/** `prices` defaults to publicPolicy.features.providerOdds; prices come from the same snapshot as the feed SQL. */
export async function storedFeedFixture(tx: Prisma.TransactionClient, id: string, partialCoverage: boolean, window: InstantWindow, locale: string,
  options: Readonly<{ prices?: boolean; source?: FeedFixtureSource }> = {}): Promise<StoredMatchFeedRecord> {
  const fixture = options.source?.fixture ?? await tx.footballFixture.findUniqueOrThrow({ where: { id }, include: fixtureInclude });
  const messages = createMessages(locale), display = options.source ? options.source.display
    : fixture.activeCycleId ? await storedCycleDisplay(tx, fixture.activeCycleId) : null;
  const cycle = display?.cycle ?? null, revision = display?.revision ?? null;
  if (fixture.id !== id || options.source && (cycle?.id ?? null) !== fixture.activeCycleId) return historyFail("invalid-state");
  const settlement = options.source ? options.source.settlement : cycle?.lockedSetId ? await storedSettlementProjection(tx, id, cycle.id) : null;
  const result = options.source ? options.source.result
    : settlement?.result ?? (fixture.resultState?.resultId ? await storedFixtureResult(tx, id, fixture.resultState.resultId) : null);
  const latest = !options.source && cycle ? await tx.predictionRefreshResult.findFirst({ where: { fixtureId: id, cycleId: cycle.id }, orderBy: [{ runSequence: "desc" }, { fixtureVersion: "desc" }], select: { id: true } }) : null;
  const refresh = options.source ? options.source.refresh : latest ? await storedRefreshResult(tx, latest.id) : null;
  const work = options.source ? { job: options.source.jobState ? { state: options.source.jobState } : null }
    : cycle ? await tx.runFixture.findFirst({ where: { fixtureId: id, cycleId: cycle.id }, orderBy: { run: { sequence: "desc" } }, select: { job: { select: { state: true } } } }) : null;
  const outside = fixture.kickoff !== null && fixture.kickoff.getTime() >= window.endExclusive;
  const updating = cycle?.state === "open" && work?.job && ["pending", "running"].includes(work.job.state);
  const delayed = refresh?.outcome === "retained-previous" || work?.job && ["failed", "expired"].includes(work.job.state);
  const prediction = cycle && cycle.state !== "open" ? "locked" : updating ? "updating" : outside ? "outside-window" : delayed ? "delayed" : revision ? "current" : "unavailable";
  const voidReason = cycle?.state === "void" ? publicVoidReason(cycle.voidReason, locale) : null;
  const available = revision ? Object.values(revision.candidate.markets).filter((item) => item.available) : [];
  const markets: NonNullable<StoredMatchFeedRecord["forecast"]>["markets"] = available.map((item) => {
    const active = settlement?.cycles[0]?.markets.find((entry) => entry.base.family === item.market.family);
    const recorded = active?.previous;
    const current = recorded !== undefined && recorded !== null && active?.inputHash === recorded.inputHash && recorded.lockedSetId === revision!.id;
    const status = cycle?.state === "void" ? "void" : current ? recorded.status : "pending";
    return { market: item.market, reasons: [], uncertainty: null, outcome: {
      cycleId: cycle!.id, revisionId: revision!.id, selection: item.market.selection, status,
      explanation: status === "void" ? voidReason!.explanation : status === "pending" ? messages.text("outcome.awaitingResult") : null,
      correctedAt: current ? recorded.correctedAt : null,
    } };
  });
  const unavailableMarkets = families.filter((family) => !revision?.candidate.markets[family].available).map((family) => {
    const item = revision?.candidate.markets[family];
    const reason = !revision ? cycle?.state === "closed" ? "no-locked-selection" : "not-published"
      : item && !item.available && ["unsupported-family", "unsupported-markets"].includes(item.reason) ? "unsupported" : "insufficient-data";
    return { family, reason } as StoredMatchFeedRecord["unavailableMarkets"][number];
  });
  const recommendation = publicRecommendation(revision?.candidate.audit.recommendation);
  const picks = markets.map((item) => {
    const selected = recommendationMarket(item.market, recommendation);
    return { family: selected.family, selection: selected.selection };
  });
  const prices = options.source ? fixturePricesFromRows(options.source.priceRows, picks) : await storedFixturePrices(tx, id, picks, options.prices);
  const chosen = revision?.candidate.audit.recommendation?.selected;
  if ((options.prices ?? publicPolicy.features.providerOdds) && chosen) {
    const quote = chosen.quote, decimal = parseDecimalOdds(quote.decimal);
    // The recommended pick keeps its original publication quote; later odds updates do not replace it.
    if (decimal) {
      const index = prices.findIndex((price) => price.family === chosen.family);
      if (index >= 0) prices.splice(index, 1);
      prices.push({ family: chosen.family, selection: chosen.selection, price: formatOddsHundredths(oddsDisplayHundredths(decimal)),
        basis: "bookmaker", retrievedAt: utcInstantFromEpochMilliseconds(quote.observedAt),
        providerUpdatedAt: quote.providerUpdatedAt === null ? null : utcInstantFromEpochMilliseconds(quote.providerUpdatedAt) });
    }
  }
  const status = resultStatus.parse(fixture.status);
  const issue = fixture.lifecycleState?.issue ?? null;
  const coherentResult = fixtureResultMatchesCanonical(fixture, result, issue);
  const sealedRegulation = coherentResult && result!.regulation.verified && result!.regulation.home === fixture.regulationHome && result!.regulation.away === fixture.regulationAway;
  // Fixtures outside result tracking keep the catalog's provider-proven regulation score. A stored result that conflicts still hides it.
  const catalogRegulation = result === null && issue === null && fixture.regulationHome !== null && fixture.regulationAway !== null &&
    fixture.regulationVerifiedAt !== null && fixture.regulationEvidenceRef !== null;
  const regulation = sealedRegulation || catalogRegulation;
  const regulationScore = sealedRegulation ? { home: result!.regulation.home!, away: result!.regulation.away! }
    : catalogRegulation ? { home: fixture.regulationHome!, away: fixture.regulationAway! } : null;
  const live = coherentResult && fixture.status === "live" && result!.reportedGoals.home !== null && result!.reportedGoals.away !== null;
  // A stored code is published only in its validated form (2–5 letters or digits, uppercase); anything else reads as none.
  // Team fields change only with the fixture's dataVersion: a catalog change to a shared team bumps every fixture that renders it.
  const team = (value: typeof fixture.homeTeam) => ({ id: value.id, name: text(value.name), code: validTeamCode(value.code),
    logoUrl: isSafeRemoteImageUrl(value.logoUrl) ? value.logoUrl : null });
  // The country flag is stored only once approved (same rights check as logos); a flag change alone bumps no fixture version.
  const competition = fixture.season.competition;
  return { fixtureId: id, dataVersion: String(fixture.dataVersion), homeTeam: team(fixture.homeTeam), awayTeam: team(fixture.awayTeam),
    competition: { id: competition.id, name: text(competition.name), country: text(competition.country),
      logoUrl: isSafeRemoteImageUrl(competition.logoUrl) ? competition.logoUrl : null,
      countryFlagUrl: isSafeRemoteImageUrl(competition.countryFlagUrl) ? competition.countryFlagUrl : null },
    kickoffAt: fixture.kickoff ? historyTime(fixture.kickoff) : null, syncedAt: historyTime(fixture.resultState?.lastSyncAt ?? fixture.retrievedAt),
    status, score: isPlayedFinalStatus(status) && regulationScore
      ? regulationScore : live ? { home: result!.reportedGoals.home!, away: result!.reportedGoals.away! } : null,
    scorePeriod: isPlayedFinalStatus(status) && regulation ? "regulation" : live ? "live" : null,
    liveClock: coherentResult && status === "live" ? liveClockFromProvider(result!.providerStatus, result!.elapsedMinutes, result!.stoppageMinutes) : null,
    partialCoverage, cycleId: cycle?.id ?? null, cycle: cycle ? { state: cycle.state, mode: display!.mode, ordinal: cycle.ordinal,
      lockedAt: cycle.lockedAt, voidReason } : null,
    forecast: revision ? { runId: revision.runId, runSequence: String(revision.runSequence), revisionId: revision.id, publishedAt: revision.publishedAt, markets,
      ...(recommendation === undefined ? {} : { recommendation }),
      updateDelayed: delayed === true, provisional: available.some((item) => item.provenance.kind !== "ai" || item.provenance.provisional) } : null,
    unavailableMarkets, update: { prediction, result: fixture.resultState?.delayReason ? "delayed" : fixture.resultState ? "current" : "untracked" },
    availabilityMessage: outside && !revision ? messages.text("feed.sevenDayAvailability") : null, prices };
}

/** Hydrate one bounded page using shared archive validators and settlement rules.
 * Every statement is scoped to the selected fixture/cycle IDs; query count does
 * not grow with the number of matches or whether their predictions are locked. */
export async function storedFeedFixtures(tx: Prisma.TransactionClient, ids: readonly string[], partialCoverage: boolean,
  window: InstantWindow, locale: string, options: Readonly<{ prices?: boolean }> = {}): Promise<StoredMatchFeedRecord[]> {
  if (!ids.length) return [];
  if (ids.length > 100 || new Set(ids).size !== ids.length) return historyFail("invalid-state");
  const fixtures = await tx.footballFixture.findMany({ where: { id: { in: [...ids] } }, include: fixtureInclude });
  const fixtureMap = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  if (fixtureMap.size !== ids.length || ids.some((id) => !fixtureMap.has(id))) return historyFail("invalid-state");
  const cycleIds = fixtures.flatMap((fixture) => fixture.activeCycleId ? [fixture.activeCycleId] : []);
  const cycles = cycleIds.length ? await tx.predictionCycle.findMany({ where: { id: { in: cycleIds } } }) : [];
  const cycleMap = new Map(cycles.map((cycle) => [cycle.id, cycle]));
  if (cycleMap.size !== cycleIds.length) return historyFail("invalid-state");
  const schedules = cycles.length ? await tx.predictionSchedule.findMany({ where: {
    OR: cycles.map((cycle) => ({ cycleId: cycle.id, version: cycle.scheduleVersion })) } }) : [];
  const scheduleMap = new Map(schedules.map((schedule) => [`${schedule.cycleId}:${schedule.version}`, schedule]));
  const displays = new Map<string, CycleDisplay>();
  const retained = cycles.filter((cycle) => cycle.state === "void" && cycle.lockedSetId === null && cycle.currentSetId === null);
  const retainedRows = retained.length ? await tx.$queryRaw<{ id: string; cycleId: string }[]>(Prisma.sql`
    SELECT s.id,s.cycleId FROM PredictionSet s WHERE s.cycleId IN (${Prisma.join(retained.map((cycle) => cycle.id))})
      AND s.cycleRevision=(SELECT MAX(p.cycleRevision) FROM PredictionSet p WHERE p.cycleId=s.cycleId)`) : [];
  const retainedMap = new Map(retainedRows.map((row) => [row.cycleId, row.id]));
  const shown = new Map(cycles.map((cycle) => [cycle.id, cycle.state === "open" ? cycle.currentSetId
    : cycle.lockedSetId ?? (cycle.state === "void" ? cycle.currentSetId ?? retainedMap.get(cycle.id) ?? null : null)]));
  const sets = [...new Set([...shown.values()].filter((id): id is string => id !== null))];
  const setRows = sets.length ? await tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT r.*,
    r.integrity=SHA2(CONCAT(r.id,':',r.requestHash,':',CAST(r.candidateJson AS CHAR)),256) AS validIntegrity
    FROM PredictionSet r WHERE r.id IN (${Prisma.join(sets)})`) : [];
  const marketRows = sets.length ? await tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT r.*,
    r.integrity=SHA2(CAST(r.payloadJson AS CHAR),256) AS validIntegrity
    FROM MarketPrediction r WHERE r.setId IN (${Prisma.join(sets)})`) : [];
  const markets = new Map<string, HistoryRow[]>();
  for (const row of marketRows) {
    const key = String(row.setId), members = markets.get(key) ?? [];
    members.push(row); markets.set(key, members);
  }
  const revisions = new Map(setRows.map((row) => [String(row.id), revisionFromRows(row, markets.get(String(row.id)) ?? [])]));
  if (revisions.size !== sets.length) return historyFail("invalid-state");
  for (const row of cycles) {
    const cycle = cycleFromRows(row, scheduleMap.get(`${row.id}:${row.scheduleVersion}`) ?? null);
    const revisionId = shown.get(cycle.id), revision = revisionId ? revisions.get(revisionId) ?? null : null;
    if (revisionId && !revision || revision && (revision.fixtureId !== cycle.fixtureId || revision.cycleId !== cycle.id)) return historyFail("invalid-state");
    displays.set(cycle.id, { cycle, mode: cycle.state === "open" ? "current" : cycle.state === "void" ? "void" : "locked", revision });
  }
  const resultIds = [...new Set(fixtures.flatMap((fixture) => fixture.resultState?.resultId ? [fixture.resultState.resultId] : []))];
  const resultRows = resultIds.length ? await tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT r.*,
    r.integrity=SHA2(CAST(r.body AS CHAR),256) AS validIntegrity FROM FixtureResult r WHERE r.id IN (${Prisma.join(resultIds)})`) : [];
  const results = new Map(resultRows.map((row) => [String(row.id), fixtureResultFromRow(row)]));
  if (results.size !== resultIds.length) return historyFail("invalid-state");
  const lockedIds = cycles.filter((cycle) => cycle.lockedSetId !== null).map((cycle) => cycle.id);
  const settledRows = lockedIds.length ? await tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT r.*,
    r.integrity=SHA2(CAST(r.body AS CHAR),256) AS validIntegrity FROM MarketSettlement p
    JOIN MarketSettlementRevision r ON r.id=p.revisionId AND r.fixtureId=p.fixtureId AND r.cycleId=p.cycleId AND r.family=p.family
    WHERE p.cycleId IN (${Prisma.join(lockedIds)})`) : [];
  const settlements = new Map<string, Map<MarketFamily, SettlementRevision>>();
  for (const row of settledRows) {
    const revision = settlementRevisionFromRow(row), members = settlements.get(revision.cycleId) ?? new Map<MarketFamily, SettlementRevision>();
    if (members.has(revision.family)) return historyFail("invalid-state");
    members.set(revision.family, revision); settlements.set(revision.cycleId, members);
  }
  const refreshRows = cycleIds.length ? await tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT r.*,
    r.integrity=SHA2(CAST(r.resultJson AS CHAR),256) AS validIntegrity FROM PredictionCycle c
    JOIN PredictionRefreshResult r ON r.id=(SELECT p.id FROM PredictionRefreshResult p
      WHERE p.fixtureId=c.fixtureId AND p.cycleId=c.id ORDER BY p.runSequence DESC,p.fixtureVersion DESC LIMIT 1)
    WHERE c.id IN (${Prisma.join(cycleIds)})`) : [];
  const refreshes = new Map(refreshRows.map((row) => {
    const refresh = refreshResultFromRow(row);
    if (cycleMap.get(refresh.cycleId)?.fixtureId !== refresh.fixtureId) return historyFail("invalid-state");
    return [refresh.cycleId, refresh] as const;
  }));
  const workRows = cycleIds.length ? await tx.$queryRaw<{ cycleId: string; jobState: string | null }[]>(Prisma.sql`
    SELECT c.id AS cycleId,j.state AS jobState FROM PredictionCycle c
    LEFT JOIN RunFixture rf ON rf.fixtureId=c.fixtureId AND rf.cycleId=c.id AND rf.runId=(SELECT r.runId
      FROM RunFixture r JOIN DailyRun d ON d.id=r.runId WHERE r.fixtureId=c.fixtureId AND r.cycleId=c.id ORDER BY d.sequence DESC LIMIT 1)
    LEFT JOIN DurableJob j ON j.id=rf.jobId WHERE c.id IN (${Prisma.join(cycleIds)})`) : [];
  const work = new Map(workRows.map((row) => [row.cycleId, row.jobState]));
  const priceRows = (options.prices ?? publicPolicy.features.providerOdds) ? await tx.$queryRaw<(FixturePriceRow & { fixtureId: string })[]>(Prisma.sql`
    SELECT fixtureId,marketKey,selection,basis,displayHundredths,CAST(impliedProbability AS CHAR) AS impliedProbability,
      CAST(overround AS CHAR) AS overround,method,snapshotId,retrievedAt,providerUpdatedAt
    FROM FixtureOddsPrice WHERE fixtureId IN (${Prisma.join(ids)}) AND stale=FALSE ORDER BY fixtureId,marketKey,selection`) : [];
  const prices = new Map<string, FixturePriceRow[]>();
  for (const row of priceRows) { const members = prices.get(row.fixtureId) ?? []; members.push(row); prices.set(row.fixtureId, members); }
  return Promise.all(ids.map((id) => {
    const fixture = fixtureMap.get(id)!;
    const display = fixture.activeCycleId ? displays.get(fixture.activeCycleId)! : null;
    if (display && display.cycle.fixtureId !== id) return historyFail("invalid-state");
    const result = fixture.resultState?.resultId ? results.get(fixture.resultState.resultId)! : null;
    if (result && result.fixtureId !== id) return historyFail("invalid-state");
    const settlement = display?.cycle.lockedSetId ? { fixture, result, cycles: [projectSettlementCycle(fixture, result,
      fixture.lifecycleState?.issue ?? null, display.cycle, display.revision, settlements.get(display.cycle.id) ?? new Map())] } : null;
    return storedFeedFixture(tx, id, partialCoverage, window, locale, { ...options, source: { fixture, display, result, settlement,
      refresh: fixture.activeCycleId ? refreshes.get(fixture.activeCycleId) ?? null : null,
      jobState: fixture.activeCycleId ? work.get(fixture.activeCycleId) ?? null : null, priceRows: prices.get(id) ?? [] } });
  }));
}
