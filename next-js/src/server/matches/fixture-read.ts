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
import { storedRefreshResult } from "../predictions/publication-read.ts";
import { storedSettlementProjection } from "../settlement/settlement-read.ts";
import { fixtureResultFromRow, fixtureResultMatchesCanonical, resultStatus, storedFixtureResult, type StoredFixtureResult } from "../results/result-read.ts";
import { storedFixturePrices } from "../odds/odds-read.ts";
import { publicRecommendation, recommendationMarket } from "../../domain/recommendation-view.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import { formatOddsHundredths, oddsDisplayHundredths, parseDecimalOdds } from "../../domain/odds.ts";

const families = Object.keys(marketSelections) as MarketFamily[];
const fixtureInclude = { homeTeam: true, awayTeam: true, season: { include: { competition: true } },
  resultState: true, lifecycleState: true } satisfies Prisma.FootballFixtureInclude;
type FeedFixture = Prisma.FootballFixtureGetPayload<{ include: typeof fixtureInclude }>;
type FeedFixtureSource = Readonly<{ fixture: FeedFixture; display: CycleDisplay | null; result: StoredFixtureResult | null }>;
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
  if (fixture.id !== id || options.source && (cycle?.lockedSetId || (cycle?.id ?? null) !== fixture.activeCycleId)) return historyFail("invalid-state");
  const settlement = cycle?.lockedSetId ? await storedSettlementProjection(tx, id, cycle.id) : null;
  const result = options.source ? options.source.result
    : settlement?.result ?? (fixture.resultState?.resultId ? await storedFixtureResult(tx, id, fixture.resultState.resultId) : null);
  const latest = cycle ? await tx.predictionRefreshResult.findFirst({ where: { fixtureId: id, cycleId: cycle.id }, orderBy: [{ runSequence: "desc" }, { fixtureVersion: "desc" }], select: { id: true } }) : null;
  const refresh = latest ? await storedRefreshResult(tx, latest.id) : null;
  const work = cycle ? await tx.runFixture.findFirst({ where: { fixtureId: id, cycleId: cycle.id }, orderBy: { run: { sequence: "desc" } }, select: { job: { select: { state: true } } } }) : null;
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
  const prices = await storedFixturePrices(tx, id, markets.map((item) => {
    const selected = recommendationMarket(item.market, recommendation);
    return { family: selected.family, selection: selected.selection };
  }), options.prices);
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

/** Hydrate a bounded ordered cohort with the same canonical projection and archive
 * validators as individual feed reads. Open cycles share their fixture, schedule,
 * forecast and result queries; settled/void cycles retain their full audit reader. */
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
  const open = cycles.filter((cycle) => cycle.state === "open" && cycle.lockedSetId === null);
  const schedules = open.length ? await tx.predictionSchedule.findMany({ where: {
    OR: open.map((cycle) => ({ cycleId: cycle.id, version: cycle.scheduleVersion })) } }) : [];
  const scheduleMap = new Map(schedules.map((schedule) => [`${schedule.cycleId}:${schedule.version}`, schedule]));
  const displays = new Map<string, CycleDisplay>();
  const sets = open.flatMap((cycle) => cycle.currentSetId ? [cycle.currentSetId] : []);
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
  for (const row of open) {
    const cycle = cycleFromRows(row, scheduleMap.get(`${row.id}:${row.scheduleVersion}`) ?? null);
    const revision = cycle.currentSetId ? revisions.get(cycle.currentSetId) ?? null : null;
    if (cycle.currentSetId && !revision || revision && (revision.fixtureId !== cycle.fixtureId || revision.cycleId !== cycle.id)) return historyFail("invalid-state");
    displays.set(cycle.id, { cycle, mode: "current", revision });
  }
  const eligible = fixtures.filter((fixture) => fixture.activeCycleId === null || displays.has(fixture.activeCycleId));
  const resultIds = eligible.flatMap((fixture) => fixture.resultState?.resultId ? [fixture.resultState.resultId] : []);
  const resultRows = resultIds.length ? await tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT r.*,
    r.integrity=SHA2(CAST(r.body AS CHAR),256) AS validIntegrity FROM FixtureResult r WHERE r.id IN (${Prisma.join(resultIds)})`) : [];
  const results = new Map(resultRows.map((row) => [String(row.id), fixtureResultFromRow(row)]));
  if (results.size !== resultIds.length) return historyFail("invalid-state");
  return Promise.all(ids.map(async (id) => {
    const fixture = fixtureMap.get(id)!;
    if (fixture.activeCycleId && !displays.has(fixture.activeCycleId)) return storedFeedFixture(tx, id, partialCoverage, window, locale, options);
    const display = fixture.activeCycleId ? displays.get(fixture.activeCycleId)! : null;
    if (display && display.cycle.fixtureId !== id) return historyFail("invalid-state");
    const result = fixture.resultState?.resultId ? results.get(fixture.resultState.resultId)! : null;
    if (result && result.fixtureId !== id) return historyFail("invalid-state");
    return storedFeedFixture(tx, id, partialCoverage, window, locale, { ...options, source: { fixture, display, result } });
  }));
}
