import "server-only";

import { isPlayedFinalStatus } from "../../domain/market-settlement.ts";
import { marketSelections, type MarketFamily } from "../../domain/markets.ts";
import type { InstantWindow } from "../../domain/calendar.ts";
import type { MatchFeedRecord } from "../../domain/match-feed.ts";
import { createMessages } from "../../i18n/messages.ts";
import { isSafeRemoteImageUrl } from "../../domain/remote-image.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { historyTime, storedCycleDisplay } from "../predictions/history-read.ts";
import { storedRefreshResult } from "../predictions/publication-read.ts";
import { storedSettlementProjection } from "../settlement/settlement-read.ts";
import { fixtureResultMatchesCanonical, resultStatus, storedFixtureResult } from "../results/result-read.ts";

const families = Object.keys(marketSelections) as MarketFamily[];
const text = (value: string | null) => value?.normalize("NFC").replace(/\p{Cc}/gu, " ").trim() || null;
const voidKeys = { "formal-postponement": "outcome.postponement", "fixture-canceled": "outcome.cancellation",
  "fixture-abandoned": "outcome.abandonment", "fixture-awarded": "outcome.award", "locked-cutoff-invalidated": "outcome.invalidCutoff",
  "ineligible-cycle": "outcome.ineligible" } as const;

export function publicVoidReason(reason: string | null, locale = "en") {
  const code = reason && Object.hasOwn(voidKeys, reason) ? reason as keyof typeof voidKeys : "ineligible-cycle";
  return { code, explanation: createMessages(locale).text(voidKeys[code]) };
}

export async function storedFeedFixture(tx: Prisma.TransactionClient, id: string, partialCoverage: boolean, window: InstantWindow, locale: string): Promise<MatchFeedRecord> {
  const fixture = await tx.footballFixture.findUniqueOrThrow({ where: { id }, include: { homeTeam: true, awayTeam: true,
    season: { include: { competition: true } }, resultState: true, lifecycleState: true } });
  const messages = createMessages(locale), display = fixture.activeCycleId ? await storedCycleDisplay(tx, fixture.activeCycleId) : null;
  const cycle = display?.cycle ?? null, revision = display?.revision ?? null;
  const settlement = cycle?.lockedSetId ? await storedSettlementProjection(tx, id, cycle.id) : null;
  const result = settlement?.result ?? (fixture.resultState?.resultId ? await storedFixtureResult(tx, id, fixture.resultState.resultId) : null);
  const latest = cycle ? await tx.predictionRefreshResult.findFirst({ where: { fixtureId: id, cycleId: cycle.id }, orderBy: [{ runSequence: "desc" }, { fixtureVersion: "desc" }], select: { id: true } }) : null;
  const refresh = latest ? await storedRefreshResult(tx, latest.id) : null;
  const work = cycle ? await tx.runFixture.findFirst({ where: { fixtureId: id, cycleId: cycle.id }, orderBy: { run: { sequence: "desc" } }, select: { job: { select: { state: true } } } }) : null;
  const outside = fixture.kickoff !== null && fixture.kickoff.getTime() >= window.endExclusive;
  const updating = cycle?.state === "open" && work?.job && ["pending", "running"].includes(work.job.state);
  const delayed = refresh?.outcome === "retained-previous" || work?.job && ["failed", "expired"].includes(work.job.state);
  const prediction = cycle && cycle.state !== "open" ? "locked" : updating ? "updating" : outside ? "outside-window" : delayed ? "delayed" : revision ? "current" : "unavailable";
  const voidReason = cycle?.state === "void" ? publicVoidReason(cycle.voidReason, locale) : null;
  const available = revision ? Object.values(revision.candidate.markets).filter((item) => item.available) : [];
  const markets: NonNullable<MatchFeedRecord["forecast"]>["markets"] = available.map((item) => {
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
    return { family, reason } as MatchFeedRecord["unavailableMarkets"][number];
  });
  const status = resultStatus.parse(fixture.status);
  const coherentResult = fixtureResultMatchesCanonical(fixture, result, fixture.lifecycleState?.issue ?? null);
  const regulation = coherentResult && result!.regulation.verified && result!.regulation.home === fixture.regulationHome && result!.regulation.away === fixture.regulationAway;
  const live = coherentResult && fixture.status === "live" && result!.reportedGoals.home !== null && result!.reportedGoals.away !== null;
  const team = (value: typeof fixture.homeTeam) => ({ id: value.id, name: text(value.name), logoUrl: isSafeRemoteImageUrl(value.logoUrl) ? value.logoUrl : null });
  return { fixtureId: id, dataVersion: String(fixture.dataVersion), homeTeam: team(fixture.homeTeam), awayTeam: team(fixture.awayTeam),
    competition: { id: fixture.season.competition.id, name: text(fixture.season.competition.name), country: text(fixture.season.competition.country) },
    kickoffAt: fixture.kickoff ? historyTime(fixture.kickoff) : null, syncedAt: historyTime(fixture.resultState?.lastSyncAt ?? fixture.retrievedAt),
    status, score: isPlayedFinalStatus(status) && regulation
      ? { home: result!.regulation.home!, away: result!.regulation.away! } : live ? { home: result!.reportedGoals.home!, away: result!.reportedGoals.away! } : null,
    scorePeriod: isPlayedFinalStatus(status) && regulation ? "regulation" : live ? "live" : null,
    partialCoverage, cycleId: cycle?.id ?? null, cycle: cycle ? { state: cycle.state, mode: display!.mode, ordinal: cycle.ordinal,
      lockedAt: cycle.lockedAt, voidReason } : null,
    forecast: revision ? { runId: revision.runId, revisionId: revision.id, publishedAt: revision.publishedAt, markets,
      updateDelayed: delayed === true, provisional: available.some((item) => item.provenance.kind !== "ai" || item.provenance.provisional) } : null,
    unavailableMarkets, update: { prediction, result: fixture.resultState?.delayReason ? "delayed" : fixture.resultState ? "current" : "untracked" },
    availabilityMessage: outside && !revision ? messages.text("feed.sevenDayAvailability") : null };
}
