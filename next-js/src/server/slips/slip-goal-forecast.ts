import "server-only";

import { getPublicationDeadline, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import type { StoredMatchFeedRecord } from "../../domain/match-feed.ts";
import type { SlipForecastReference } from "../../domain/slip-forecast-reference.ts";
import { slipTotal15ForecastSchema } from "../../domain/slip-cohort.ts";
import type { SlipTotal15Forecast } from "../../domain/slip-markets.ts";
import { slipTotal15Market } from "../../domain/slip-settlement.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { goalMarketExtensionFromRow, type StoredGoalMarketExtension } from "../predictions/goal-market-store.ts";
import type { HistoryRow } from "../predictions/history-read.ts";

const total15DefinitionHash = evidenceFingerprint(slipTotal15Market);

export async function readSlipGoalExtensions(tx: Prisma.TransactionClient, revisionIds: readonly string[]) {
  if (!revisionIds.length) return new Map<string, StoredGoalMarketExtension>();
  const rows = await tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT *, integrity = SHA2(CAST(body AS CHAR),256) AS validIntegrity
    FROM GoalMarketExtension WHERE revisionId IN (${Prisma.join(revisionIds)})`);
  return new Map(rows.map((row) => {
    const extension = goalMarketExtensionFromRow(row);
    return [extension.revisionId, extension];
  }));
}

/** Same fixture, cycle, revision and event rules for Builder and original slip settlement. */
export function projectSlipTotal15Forecast(extension: StoredGoalMarketExtension | null, fixtureId: string, kickoffAt: number,
  reference: SlipForecastReference, asOf: number): SlipTotal15Forecast | null {
  if (!extension || extension.fixtureId !== fixtureId || extension.cycleId !== reference.cycleId || extension.revisionId !== reference.revisionId
    || extension.recordedAt < reference.publishedAt || extension.recordedAt > asOf
    || extension.recordedAt >= getPublicationDeadline(utcInstantFromEpochMilliseconds(kickoffAt))) return null;
  const entry = extension.markets.find(({ definition }) => definition.key === slipTotal15Market.key);
  if (!entry?.derivation.available || evidenceFingerprint(entry.definition) !== total15DefinitionHash) return null;
  const { source, selections } = entry.derivation.market;
  const parsed = slipTotal15ForecastSchema.safeParse({ reference, source, probabilities: {
    "over-1.5": selections.find(({ key }) => key === "over")?.winProbability,
    "under-1.5": selections.find(({ key }) => key === "under")?.winProbability,
  } });
  return parsed.success ? parsed.data : null;
}

/** The input cohort is already bounded and shares this repeatable-read transaction. */
export async function storedSlipTotal15Forecasts(tx: Prisma.TransactionClient, records: readonly StoredMatchFeedRecord[], asOf: number) {
  const fixtures = new Map(records.flatMap((record) => record.forecast && record.cycleId && record.status === "scheduled" && record.kickoffAt !== null
    ? [[record.forecast.revisionId, { fixtureId: record.fixtureId, kickoffAt: record.kickoffAt,
      reference: { cycleId: record.cycleId, revisionId: record.forecast.revisionId, publishedAt: record.forecast.publishedAt } }]] as const : []));
  const extensions = await readSlipGoalExtensions(tx, [...fixtures.keys()]);
  const forecasts: Record<string, SlipTotal15Forecast> = {};
  for (const [revisionId, extension] of extensions) {
    const fixture = fixtures.get(revisionId);
    if (!fixture) continue;
    const forecast = projectSlipTotal15Forecast(extension, fixture.fixtureId, fixture.kickoffAt, fixture.reference, asOf);
    if (forecast) forecasts[fixture.fixtureId] = forecast;
  }
  return forecasts;
}
