import "server-only";

import { getPublicationDeadline, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { goalTotalsMarket } from "../../domain/goal-market-definitions.ts";
import type { StoredMatchFeedRecord } from "../../domain/match-feed.ts";
import type { SlipForecastReference } from "../../domain/slip-forecast-reference.ts";
import { slipAdditionalGoalForecastSchema, slipTotal15ForecastSchema } from "../../domain/slip-cohort.ts";
import { additionalSlipGoalMarkets, type AdditionalSlipGoalMarketKey, type SlipAdditionalGoalForecast,
  type SlipTotal15Forecast } from "../../domain/slip-markets.ts";
import { slipTotal15Market } from "../../domain/slip-settlement.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { goalMarketExtensionFromRow, type StoredGoalMarketExtension } from "../predictions/goal-market-store.ts";
import type { HistoryRow } from "../predictions/history-read.ts";
import type { GoalMarketDefinition } from "../../domain/score-distribution-markets.ts";

const goalDefinitions = new Map<string, string>([
  [slipTotal15Market.key, evidenceFingerprint(slipTotal15Market)],
  ...additionalSlipGoalMarkets.map(({ key, line, metric }) => [key, evidenceFingerprint(goalTotalsMarket(line, metric))] as const),
]);

export async function readSlipGoalExtensions(tx: Prisma.TransactionClient, revisionIds: readonly string[]) {
  if (!revisionIds.length) return new Map<string, StoredGoalMarketExtension>();
  const rows = await tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT *, integrity = SHA2(CAST(body AS CHAR),256) AS validIntegrity
    FROM GoalMarketExtension WHERE revisionId IN (${Prisma.join(revisionIds)})`);
  return new Map(rows.map((row) => {
    const extension = goalMarketExtensionFromRow(row);
    return [extension.revisionId, extension];
  }));
}

function eligibleExtension(extension: StoredGoalMarketExtension | null, fixtureId: string, kickoffAt: number,
  reference: SlipForecastReference, asOf: number): extension is StoredGoalMarketExtension {
  return !!extension && extension.fixtureId === fixtureId && extension.cycleId === reference.cycleId && extension.revisionId === reference.revisionId
    && extension.recordedAt >= reference.publishedAt && extension.recordedAt <= asOf
    && extension.recordedAt < getPublicationDeadline(utcInstantFromEpochMilliseconds(kickoffAt));
}

function goalProbabilities(extension: StoredGoalMarketExtension, key: GoalMarketDefinition["key"]) {
  const entry = extension.markets.find(({ definition }) => definition.key === key);
  if (!entry?.derivation.available || evidenceFingerprint(entry.definition) !== goalDefinitions.get(key)) return null;
  const { source, selections } = entry.derivation.market;
  const over = selections.find(({ key }) => key === "over")?.winProbability;
  const under = selections.find(({ key }) => key === "under")?.winProbability;
  return over === undefined || under === undefined ? null : { source, probabilities: { over, under } };
}

/** Same fixture, cycle, revision and event rules for Builder and original slip settlement. */
export function projectSlipTotal15Forecast(extension: StoredGoalMarketExtension | null, fixtureId: string, kickoffAt: number,
  reference: SlipForecastReference, asOf: number): SlipTotal15Forecast | null {
  if (!eligibleExtension(extension, fixtureId, kickoffAt, reference, asOf)) return null;
  const forecast = goalProbabilities(extension, slipTotal15Market.key);
  if (!forecast) return null;
  const parsed = slipTotal15ForecastSchema.safeParse({ reference, source: forecast.source, probabilities: {
    "over-1.5": forecast.probabilities.over, "under-1.5": forecast.probabilities.under,
  } });
  return parsed.success ? parsed.data : null;
}

export function projectSlipAdditionalGoalForecast(extension: StoredGoalMarketExtension | null, fixtureId: string, kickoffAt: number,
  reference: SlipForecastReference, asOf: number, keys: readonly AdditionalSlipGoalMarketKey[]): SlipAdditionalGoalForecast | null {
  if (!eligibleExtension(extension, fixtureId, kickoffAt, reference, asOf)) return null;
  const markets = keys.flatMap((key) => {
    const forecast = goalProbabilities(extension, key);
    return forecast ? [{ key, ...forecast }] : [];
  });
  const parsed = slipAdditionalGoalForecastSchema.safeParse({ reference, markets });
  return parsed.success ? parsed.data : null;
}

/** The input cohort is already bounded and shares this repeatable-read transaction. */
export async function storedSlipGoalForecasts(tx: Prisma.TransactionClient, records: readonly StoredMatchFeedRecord[], asOf: number,
  total15: boolean, keys: readonly AdditionalSlipGoalMarketKey[]) {
  const fixtures = new Map(records.flatMap((record) => record.forecast && record.cycleId && record.status === "scheduled" && record.kickoffAt !== null
    ? [[record.forecast.revisionId, { fixtureId: record.fixtureId, kickoffAt: record.kickoffAt,
      reference: { cycleId: record.cycleId, revisionId: record.forecast.revisionId, publishedAt: record.forecast.publishedAt } }]] as const : []));
  const extensions = await readSlipGoalExtensions(tx, [...fixtures.keys()]);
  const total15Forecasts: Record<string, SlipTotal15Forecast> = {};
  const additionalGoalForecasts: Record<string, SlipAdditionalGoalForecast> = {};
  for (const [revisionId, extension] of extensions) {
    const fixture = fixtures.get(revisionId);
    if (!fixture) continue;
    if (total15) {
      const forecast = projectSlipTotal15Forecast(extension, fixture.fixtureId, fixture.kickoffAt, fixture.reference, asOf);
      if (forecast) total15Forecasts[fixture.fixtureId] = forecast;
    }
    if (keys.length) {
      const forecast = projectSlipAdditionalGoalForecast(extension, fixture.fixtureId, fixture.kickoffAt, fixture.reference, asOf, keys);
      if (forecast) additionalGoalForecasts[fixture.fixtureId] = forecast;
    }
  }
  return { ...(total15 ? { total15Forecasts } : {}), ...(keys.length ? { additionalGoalForecasts } : {}) };
}

export async function storedSlipTotal15Forecasts(tx: Prisma.TransactionClient, records: readonly StoredMatchFeedRecord[], asOf: number) {
  return (await storedSlipGoalForecasts(tx, records, asOf, true, [])).total15Forecasts!;
}
