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
import { historyFail } from "../predictions/history-contract.ts";
import { goalMarketExtensionFromRow, type StoredGoalMarketExtension } from "../predictions/goal-market-store.ts";
import { assertHistorySeal, historyTime, type HistoryRow } from "../predictions/history-read.ts";
import type { GoalMarketDefinition } from "../../domain/score-distribution-markets.ts";

const goalDefinitions = new Map<string, string>([
  [slipTotal15Market.key, evidenceFingerprint(slipTotal15Market)],
  ...additionalSlipGoalMarkets.map(({ key, line, metric }) => [key, evidenceFingerprint(goalTotalsMarket(line, metric))] as const),
]);

export type SlipGoalExtension = Pick<StoredGoalMarketExtension,
  "revisionId" | "cycleId" | "fixtureId" | "recordedAt" | "contentHash" | "ruleVersion" | "localPoisson" | "markets">;
type VerifiedArchiveGoal = Readonly<{ seal: string; extension: SlipGoalExtension; bytes: number }>;
const archiveGoalCache = new Map<string, VerifiedArchiveGoal>();
const maximumArchiveGoalCacheEntries = 1024;
const maximumArchiveGoalCacheBytes = 8 * 1024 * 1024;
let archiveGoalBytes = 0;

function rememberArchiveGoal(seal: string, extension: SlipGoalExtension) {
  const bytes = Buffer.byteLength(JSON.stringify(extension));
  if (bytes > maximumArchiveGoalCacheBytes) return;
  const previous = archiveGoalCache.get(extension.revisionId);
  if (previous) archiveGoalBytes -= previous.bytes;
  archiveGoalCache.delete(extension.revisionId);
  archiveGoalCache.set(extension.revisionId, { seal, extension, bytes });
  archiveGoalBytes += bytes;
  for (const [id, entry] of archiveGoalCache) {
    if (archiveGoalBytes <= maximumArchiveGoalCacheBytes && archiveGoalCache.size <= maximumArchiveGoalCacheEntries) break;
    archiveGoalCache.delete(id);
    archiveGoalBytes -= entry.bytes;
  }
}

/** Keep the exact verified slip projection across archive requests. The current
 * snapshot must still provide the original row and prove its body seal. */
export async function readArchivedSlipGoalExtensions(tx: Prisma.TransactionClient, revisionIds: readonly string[]) {
  if (!revisionIds.length) return new Map<string, SlipGoalExtension>();
  const known = new Map<string, VerifiedArchiveGoal>();
  for (const id of revisionIds) {
    const entry = archiveGoalCache.get(id);
    if (entry) known.set(id, entry);
  }
  const body = known.size ? Prisma.sql`CASE WHEN (e.revisionId, BINARY e.integrity) IN (
    ${Prisma.join([...known].map(([id, { seal }]) => Prisma.sql`(${id}, BINARY ${seal})`))})
    THEN NULL ELSE e.body END` : Prisma.sql`e.body`;
  const rows = await tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT e.revisionId, e.cycleId, e.fixtureId, e.recordedAt,
    e.contentHash, e.ruleVersion, e.integrity, ${body} AS body, e.integrity = SHA2(CAST(e.body AS CHAR),256) AS validIntegrity
    FROM GoalMarketExtension e WHERE e.revisionId IN (${Prisma.join(revisionIds)})`);
  return new Map(rows.map((row) => {
    assertHistorySeal(row.validIntegrity);
    if (typeof row.revisionId !== "string" || typeof row.integrity !== "string" || !/^[a-f0-9]{64}$/iu.test(row.integrity))
      return historyFail("invalid-state");
    if (row.body === null) {
      const entry = known.get(row.revisionId), cached = entry?.extension;
      if (!cached || entry.seal !== row.integrity || cached.cycleId !== row.cycleId || cached.fixtureId !== row.fixtureId
        || cached.recordedAt !== historyTime(row.recordedAt) || cached.contentHash !== row.contentHash
        || cached.ruleVersion !== row.ruleVersion) return historyFail("invalid-state");
      if (archiveGoalCache.get(row.revisionId) === entry) {
        archiveGoalCache.delete(row.revisionId);
        archiveGoalCache.set(row.revisionId, entry);
      }
      return [row.revisionId, cached];
    }
    const { revisionId, cycleId, fixtureId, recordedAt, contentHash, ruleVersion, localPoisson, markets } = goalMarketExtensionFromRow(row);
    const extension = Object.freeze({ revisionId, cycleId, fixtureId, recordedAt, contentHash, ruleVersion,
      ...(localPoisson ? { localPoisson } : {}),
      markets: Object.freeze(markets.filter(({ definition }) => goalDefinitions.has(definition.key))) });
    rememberArchiveGoal(row.integrity, extension);
    return [revisionId, extension];
  }));
}

export async function readSlipGoalExtensions(tx: Prisma.TransactionClient, revisionIds: readonly string[]) {
  if (!revisionIds.length) return new Map<string, StoredGoalMarketExtension>();
  const rows = await tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT *, integrity = SHA2(CAST(body AS CHAR),256) AS validIntegrity
    FROM GoalMarketExtension WHERE revisionId IN (${Prisma.join(revisionIds)})`);
  return new Map(rows.map((row) => {
    const extension = goalMarketExtensionFromRow(row);
    return [extension.revisionId, extension];
  }));
}

function eligibleExtension(extension: SlipGoalExtension | null, fixtureId: string, kickoffAt: number,
  reference: SlipForecastReference, asOf: number): extension is SlipGoalExtension {
  return !!extension && extension.fixtureId === fixtureId && extension.cycleId === reference.cycleId && extension.revisionId === reference.revisionId
    && extension.recordedAt >= reference.publishedAt && extension.recordedAt <= asOf
    && extension.recordedAt < getPublicationDeadline(utcInstantFromEpochMilliseconds(kickoffAt));
}

function goalProbabilities(extension: SlipGoalExtension, key: GoalMarketDefinition["key"], editorial = false) {
  const entry = extension.markets.find(({ definition }) => definition.key === key);
  if (!entry || evidenceFingerprint(entry.definition) !== goalDefinitions.get(key)) return null;
  const derivation = editorial ? entry.localDerivation ?? entry.derivation : entry.derivation;
  if (!derivation.available || (editorial && derivation.market.source !== "local-poisson")) return null;
  const { source, selections } = derivation.market;
  const over = selections.find(({ key }) => key === "over")?.winProbability;
  const under = selections.find(({ key }) => key === "under")?.winProbability;
  return over === undefined || under === undefined ? null : { source, probabilities: { over, under } };
}

/** Same fixture, cycle, revision and event rules for Builder and original slip settlement. */
export function projectSlipTotal15Forecast(extension: SlipGoalExtension | null, fixtureId: string, kickoffAt: number,
  reference: SlipForecastReference, asOf: number): SlipTotal15Forecast | null {
  if (!eligibleExtension(extension, fixtureId, kickoffAt, reference, asOf)) return null;
  const forecast = goalProbabilities(extension, slipTotal15Market.key);
  if (!forecast) return null;
  const parsed = slipTotal15ForecastSchema.safeParse({ reference, source: forecast.source, probabilities: {
    "over-1.5": forecast.probabilities.over, "under-1.5": forecast.probabilities.under,
  } });
  return parsed.success ? parsed.data : null;
}

export function projectSlipAdditionalGoalForecast(extension: SlipGoalExtension | null, fixtureId: string, kickoffAt: number,
  reference: SlipForecastReference, asOf: number, keys: readonly AdditionalSlipGoalMarketKey[],
  { editorial = false }: { editorial?: boolean } = {}): SlipAdditionalGoalForecast | null {
  if (!eligibleExtension(extension, fixtureId, kickoffAt, reference, asOf)) return null;
  const markets = keys.flatMap((key) => {
    const forecast = goalProbabilities(extension, key, editorial);
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
