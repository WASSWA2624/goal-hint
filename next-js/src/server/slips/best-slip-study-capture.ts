import "server-only";

import { bestSlipCombinationIdentity, bestSlipDailyCriteria } from "../../domain/best-slips.ts";
import { bestSlipExactRange, bestSlipOddsBands, type BestSlipOddsBand } from "../../domain/best-slip-odds-bands.ts";
import { getPublicationDeadline, getReportingDate, getReportingDayBounds, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { isDevelopmentDemo } from "../../domain/development-demo.ts";
import { feedQueryRules, maximumCompetitionScope } from "../../domain/feed-query.ts";
import { isMarketFamily } from "../../domain/markets.ts";
import { parseDecimalOdds } from "../../domain/odds.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import { preMatchReferenceOddsFreshMs } from "../../domain/reference-odds.ts";
import { buildSlips, type BuiltSlip, type SlipSelection } from "../../domain/slip-builder.ts";
import { isSlipMarketSelection } from "../../domain/slip-markets.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { sealBestSlipStudyCapture } from "./best-slip-study-contract.ts";
import { createStoredSlipCohort, type SlipCohortReader } from "./slip-cohort.ts";

const samplingPolicy = "same-day-featured-compact-disjoint-v3";
const maximumCaptureAgeMs = 30_000;

type StudyScope = Readonly<{ environment?: "development" | "staging" | "production" }>;

export function bestSlipStudyScopeHash(competitionIds: readonly number[], { environment }: StudyScope) {
  if (competitionIds.length === 0 || competitionIds.length > maximumCompetitionScope || new Set(competitionIds).size !== competitionIds.length
    || competitionIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) throw new RangeError("Invalid Best Slips study competition scope.");
  return evidenceFingerprint({ policy: samplingPolicy, environment: environment ?? null,
    competitionIds: [...competitionIds].sort((left, right) => left - right) });
}

async function databaseNow(database: Pick<DatabaseRuntime, "query">) {
  const rows = await database.query((client) => client.$queryRaw<{ at: Date }[]>`SELECT UTC_TIMESTAMP(3) AS at`);
  const at = rows.length === 1 && rows[0]?.at instanceof Date ? rows[0].at.getTime() : NaN;
  if (!Number.isSafeInteger(at) || at <= 0) throw new RangeError("Best Slips study clock is unavailable.");
  return utcInstantFromEpochMilliseconds(at);
}

function quoteIsFresh(selection: SlipSelection, at: number) {
  const offer = selection.offer;
  return offer !== undefined && offer.observedAt <= offer.checkedAt && offer.checkedAt <= at
    && at - offer.observedAt <= preMatchReferenceOddsFreshMs && (offer.providerUpdatedAt === null
      || offer.providerUpdatedAt <= offer.checkedAt && at - offer.providerUpdatedAt <= preMatchReferenceOddsFreshMs);
}

/** Freeze original offers observed in the live decision path independently of any study estimator. */
export async function captureBestSlipStudy(database: DatabaseRuntime, competitionIds: readonly number[],
  options: StudyScope & Readonly<{ read?: SlipCohortReader }> = {}) {
  if (isDevelopmentDemo()) throw new RangeError("Best Slips study capture requires real stored evidence.");
  const scopeHash = bestSlipStudyScopeHash(competitionIds, options);
  const { read = createStoredSlipCohort({
    database: () => database, competitionIds: () => competitionIds, providerOdds: true,
  }) } = options;
  const observedAt = await databaseNow(database), day = getReportingDate(observedAt), window = getReportingDayBounds(day);
  const cohort = await read(new URLSearchParams({ from: day, to: day, status: "scheduled", market: publicPolicy.markets.join(","),
    sort: "probability", dir: "desc", pageSize: String(feedQueryRules.maximumPageSize) }), { featured: true }, { now: () => observedAt });
  if (cohort.asOf !== observedAt || cohort.today !== day || cohort.range.from !== day || cohort.range.to !== day
    || cohort.range.startInclusive !== window.startInclusive || cohort.range.endExclusive !== window.endExclusive
    || !cohort.featuredSelections) throw new RangeError("Incoherent Best Slips study cohort.");

  const original = new Set(cohort.records.map(({ fixtureId }) => fixtureId));
  const candidates = cohort.featuredSelections.filter((selection) => {
    const { fixtureId, family, probability, kickoffAt, source, odds, oddsBasis, offer, bookmaker, forecast } = selection;
    return original.has(fixtureId) && source === "local-engine" && oddsBasis === "bookmaker"
      && isMarketFamily(family) && publicPolicy.markets.includes(family) && isSlipMarketSelection(family, selection.selection)
      && Number.isFinite(probability) && probability >= 0 && probability <= 1
      && kickoffAt >= window.startInclusive && kickoffAt < window.endExclusive
      && observedAt < getPublicationDeadline(utcInstantFromEpochMilliseconds(kickoffAt))
      && forecast !== undefined && forecast.publishedAt <= observedAt
      && offer !== undefined && bookmaker?.id === offer.bookmakerId && bookmaker.name === offer.bookmakerName
      && parseDecimalOdds(odds)?.text === offer.decimal && quoteIsFresh(selection, observedAt);
  });

  const retained = new Set<string>();
  const slates: { band: BestSlipOddsBand; slip: BuiltSlip }[] = [];
  let searchLimited = cohort.searchLimited;
  for (const { id: band } of bestSlipOddsBands) {
    const selections = candidates.filter(({ fixtureId }) => !retained.has(fixtureId));
    if (new Set(selections.map(({ fixtureId }) => fixtureId)).size < 2) break;
    const result = buildSlips({ ...bestSlipDailyCriteria(day, band), teamsMin: 2 }, [], observedAt, {
      accepts: ({ selections }) => new Set(selections.flatMap(({ homeTeam, awayTeam }) => [homeTeam.id, awayTeam.id])).size === selections.length * 2,
      compare: (left, right) => left.selections.length - right.selections.length || (left.id < right.id ? -1 : Number(left.id > right.id)),
    }, { editorial: { selections, combinationIdentity: bestSlipCombinationIdentity, exclusiveMaximum: bestSlipExactRange(band).exclusiveMaximum } });
    searchLimited ||= result.searchLimited;
    for (const slip of result.slips) {
      slip.selections.forEach(({ fixtureId }) => retained.add(fixtureId));
      slates.push({ band, slip: { ...slip, id: bestSlipCombinationIdentity(slip.selections) } });
    }
  }

  const capturedAt = await databaseNow(database);
  if (capturedAt < observedAt || capturedAt - observedAt > maximumCaptureAgeMs || getReportingDate(capturedAt) !== day) {
    throw new RangeError("Best Slips study capture crossed its time boundary.");
  }
  const stillEligible = (selection: SlipSelection) => quoteIsFresh(selection, capturedAt)
    && capturedAt < getPublicationDeadline(utcInstantFromEpochMilliseconds(selection.kickoffAt));
  const eligible = new Set(candidates.filter(stillEligible).map(({ fixtureId }) => fixtureId)).size;
  return sealBestSlipStudyCapture({ observedAt, capturedAt, scopeHash, examined: cohort.records.length, eligible,
    searchLimited, partialCoverage: cohort.partialCoverage, slates: slates.filter(({ slip }) => slip.selections.every(stillEligible)) });
}
