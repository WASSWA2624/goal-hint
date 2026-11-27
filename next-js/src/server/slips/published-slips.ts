import "server-only";

import { z } from "zod";
import { getReportingDate, getReportingDayBounds, parseReportingDate, utcInstantFromEpochMilliseconds, validateReportingDateRange } from "../../domain/calendar.ts";
import { bestSlipCombinationIdentity, bestSlipDailyCriteria, bestSlipExactTotal, bestSlipView, compareBestSlips, jointSlipProbability, qualifiedJointModel, type BestSlip, type BestSlipView, type BestSlipsResult, type JointSlipModel } from "../../domain/best-slips.ts";
import { bestSlipBandRank, bestSlipExactRange, bestSlipOddsBands, bestSlipBandLimit, bestSlipOddsBandFor, bestSlipPublicationBands, bestSlipPublicRank, dailyBestSlipBandLimit, defaultBestSlipOddsBand, maximumBestSlipLocalRank, maximumBestSlipPublicRank, type BestSlipOddsBand } from "../../domain/best-slip-odds-bands.ts";
import { bestSlipsQueryRules, matchesBestSlipsRanges, parseBestSlipsCursor, parseBestSlipsQuery, resolveBestSlipsDates, serializeBestSlipsQuery, type BestSlipsQuery } from "../../domain/best-slips-query.ts";
import type { ReportingDate } from "../../domain/calendar.ts";
import { bestSlipActivePublicationDays, bestSlipAppendBatchSize, bestSlipFixtureInterval, bestSlipFixtureWindow, bestSlipKickoffBufferMs, bestSlipPublicationHour, bestSlipPublicationIntervalMs } from "../../domain/best-slip-publication-hour.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import { publishedSlipRules, type PublishedSlipHistory, type PublishedSlipHistoryQuery } from "../../domain/published-slips.ts";
import { completedSlipFixtureIds, indexSlipResults, slipCompleted, slipSnapshotOutcome, slipSnapshotStatus, slipSnapshotSchema, slipResultView, type SlipResult } from "../../domain/slip-snapshot.ts";
import { slipStatusCategory } from "../../domain/slip-status.ts";
import { predictionResults } from "../../domain/performance-summary.ts";
import { summarizeSlipPerformance } from "../../domain/slip-performance.ts";
import { slipMatchStatesFromResults } from "../../domain/slip-match-state.ts";
import { compareSlipDisplayProbability } from "../../domain/slip-pagination.ts";
import { isEditorialSlipOfferFresh } from "../../domain/slip-quote.ts";
import { parseSlipCriteria, serializeSlipCriteria, type BuiltSlip, type SlipCriteria } from "../../domain/slip-builder.ts";
import { DatabaseOperationError, getDatabase, type DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { assertHistorySeal, historyJson } from "../predictions/history-read.ts";
import { provenTrue } from "../shared/authority-proof.ts";
import { isDevelopmentDemo } from "../../domain/development-demo.ts";
import { addReportingDays } from "../../domain/calendar.ts";
import { bindSlipForecasts, readSlipForecastResults } from "./slip-forecast.ts";
import { readWithSlipAccess } from "./slip-access.ts";
import { lockFeaturedSlipOdds, verifyFeaturedSlipOffers } from "./best-slip-recommendations.ts";

const hash = z.string().regex(/^[a-f0-9]{64}$/u), instant = z.number().int().positive();
const modelSchema = z.strictObject({ id: hash, calibrationReference: z.string().trim().min(1).max(512),
  correlationReference: z.string().trim().min(1).max(512), validFrom: instant, validUntil: instant });
const oddsBandSchema = z.enum(bestSlipOddsBands.map(band => band.id));
const historyStatusSchema = z.enum(["all", ...predictionResults]);
const publicationSchema = z.strictObject({ version: z.literal([1, 2, 3, 4, 5]), oddsBand: oddsBandSchema.optional(), day: z.string().refine((value) => {
  try { parseReportingDate(value); return true; } catch { return false; }
}), publishedAt: instant, model: modelSchema.nullable(), criteria: z.string().max(2048),
  count: z.number().int().min(0).max(100), searchLimited: z.boolean(), partialCoverage: z.boolean(),
}).refine((value) => (value.version === 5 ? bestSlipActivePublicationDays(value.publishedAt).includes(parseReportingDate(value.day))
  : getReportingDate(utcInstantFromEpochMilliseconds(value.publishedAt)) === value.day)
  && (value.version >= 4 ? value.oddsBand !== undefined && value.count === 0 && value.model === null
    : value.model !== null && value.model.validFrom <= value.publishedAt && value.publishedAt < value.model.validUntil && value.count > 0
    && (value.version === 1 ? value.oddsBand === undefined && value.count <= 100
      : value.oddsBand !== undefined && value.count <= (value.version === 2 ? bestSlipBandLimit : dailyBestSlipBandLimit))));
const snapshotSchema = z.strictObject({ slip: slipSnapshotSchema, estimatedProbability: z.number().min(0).max(1).optional() })
  .refine((value) => value.slip.selections.every((selection) => selection.forecast !== undefined), "Reviewed original forecasts are required.")
  .transform((value) => ({ ...value, slip: value.slip as BuiltSlip }));
const appendBatchSchema = z.strictObject({ version: z.literal([1, 2]), hourAt: instant, publishedAt: instant,
  firstRank: z.number().int().positive().max(maximumBestSlipLocalRank), count: z.number().int().positive().max(maximumBestSlipLocalRank),
  searchLimited: z.boolean(), partialCoverage: z.boolean(),
}).refine(({ version, hourAt, publishedAt, firstRank, count }) => hourAt % bestSlipPublicationIntervalMs === 0 && publishedAt >= hourAt
  && publishedAt - hourAt < (version === 1 && hourAt % 3_600_000 === 0 ? 3_600_000 : bestSlipPublicationIntervalMs)
  && firstRank + count - 1 <= (version === 1 ? dailyBestSlipBandLimit : maximumBestSlipLocalRank));
type Publication = z.infer<typeof publicationSchema> & Readonly<{ bounds: SlipCriteria | null }>;
type PublicationRow = { id: string; eatDate: Date; oddsBand?: string; publishedAt: Date; modelId: string | null; bodyJson: unknown; validIntegrity: unknown };
type SlipRow = { id: string; publicationId: string; appendBatchId?: string | null; rank: number; snapshotJson: unknown; validIntegrity: unknown };
type RawSlipRow = Omit<SlipRow, "rank"> & { rank: number | bigint };
type AppendBatch = z.infer<typeof appendBatchSchema> & Readonly<{ id: string }>;
type AppendBatchRow = { id: string; publicationId: string; hourAt: Date; publishedAt: Date; firstRank: number | bigint; count: number | bigint;
  bodyJson: unknown; validIntegrity: unknown };
export class SlipPublicationError extends Error {
  readonly reason: "invalid-input" | "unauthorized" | "unavailable";
  constructor(reason: SlipPublicationError["reason"]) {
    super(`Slip publication ${reason}; private diagnostics are withheld.`); this.name = "SlipPublicationError"; this.reason = reason;
  }
}
const fail = (reason: SlipPublicationError["reason"]): never => { throw new SlipPublicationError(reason); };
export const slipPublicationIdentity = (day: string, oddsBand?: BestSlipOddsBand) => evidenceFingerprint(
  oddsBand ? { kind: "daily-best-slips", version: 2, day, oddsBand } : { kind: "daily-best-slips", version: 1, day });
const publicRank = (parent: Publication, rank: number) => parent.oddsBand ? bestSlipPublicRank(parent.oddsBand, rank) : rank;
export function slipModelIdentity(model: JointSlipModel) {
  return evidenceFingerprint({ calibrationReference: model.calibrationReference, correlationReference: model.correlationReference,
    validFrom: model.validFrom, validUntil: model.validUntil });
}
const appendBatchIdentity = (publicationId: string, hourAt: number) =>
  evidenceFingerprint({ kind: "hourly-best-slip-append", publicationId, hourAt });

function publication(row: PublicationRow): Publication {
  assertHistorySeal(row.validIntegrity);
  const value = publicationSchema.parse(historyJson(row.bodyJson));
  if (row.id !== slipPublicationIdentity(value.day, value.oddsBand) || (row.oddsBand ?? "legacy") !== (value.oddsBand ?? "legacy") || row.eatDate.toISOString().slice(0, 10) !== value.day ||
    row.publishedAt.getTime() !== value.publishedAt || row.modelId !== (value.model?.id ?? null)) fail("unavailable");
  return { ...value, bounds: value.oddsBand ? parseSlipCriteria(new URLSearchParams(value.criteria), value.day) : null };
}

async function readAppendBatches(tx: Prisma.TransactionClient, parents: ReadonlyMap<string, Publication>, asOf?: number) {
  const appendable = [...parents].filter(([, parent]) => parent.version >= 3).map(([id]) => id);
  const batches = new Map<string, AppendBatch[]>();
  if (!appendable.length) return batches;
  const maximum = appendable.reduce((total, id) => {
    const day = parseReportingDate(parents.get(id)!.day);
    return total + (bestSlipFixtureWindow(day).endExclusive - getReportingDayBounds(day).startInclusive) / bestSlipPublicationIntervalMs;
  }, 0);
  const rows = await tx.$queryRaw<AppendBatchRow[]>(Prisma.sql`SELECT *,integrity=SHA2(CAST(bodyJson AS CHAR),256) AS validIntegrity
    FROM DailyBestSlipAppendBatch WHERE publicationId IN (${Prisma.join(appendable)}) ORDER BY publicationId,firstRank LIMIT ${maximum + 1}`);
  if (rows.length > maximum) fail("unavailable");
  for (const row of rows) {
    assertHistorySeal(row.validIntegrity);
    const parent = parents.get(row.publicationId), batch = appendBatchSchema.parse(historyJson(row.bodyJson));
    if (!parent || parent.version < 3 || row.id !== appendBatchIdentity(row.publicationId, batch.hourAt)
      || row.hourAt.getTime() !== batch.hourAt || row.publishedAt.getTime() !== batch.publishedAt
      || Number(row.firstRank) !== batch.firstRank || Number(row.count) !== batch.count
      || (batch.version === 1 ? parent.version === 5 || getReportingDate(utcInstantFromEpochMilliseconds(batch.publishedAt)) !== parent.day
        : !bestSlipActivePublicationDays(batch.hourAt).includes(parseReportingDate(parent.day)))
      || asOf !== undefined && batch.publishedAt > asOf) return fail("unavailable");
    const group = batches.get(row.publicationId) ?? [], last = group.at(-1);
    const nextRank = last ? last.firstRank + last.count : parent.count + 1;
    if (batch.firstRank !== nextRank || (last ? batch.hourAt <= last.hourAt
      : parent.version >= 4 ? batch.publishedAt !== parent.publishedAt : batch.publishedAt < parent.publishedAt)) fail("unavailable");
    group.push({ id: row.id, ...batch });
    batches.set(row.publicationId, group);
  }
  for (const id of appendable) {
    if (parents.get(id)!.version >= 4 && !batches.has(id)) fail("unavailable");
  }
  return batches;
}

function publicationCount(parent: Publication, appendBatches: readonly AppendBatch[] = []) {
  const last = appendBatches.at(-1);
  return last ? last.firstRank + last.count - 1 : parent.count;
}

function publicationCoverage(parents: ReadonlyMap<string, Publication>, batches: ReadonlyMap<string, readonly AppendBatch[]>) {
  const sources = [...parents.values(), ...[...batches.values()].flat()];
  return { searchLimited: sources.some((source) => source.searchLimited), partialCoverage: sources.some((source) => source.partialCoverage) };
}

async function readDayPublicationParents(tx: Prisma.TransactionClient, day: ReportingDate) {
  const rows = await tx.$queryRaw<PublicationRow[]>`SELECT *,integrity=SHA2(CAST(bodyJson AS CHAR),256) AS validIntegrity
    FROM DailySlipPublication WHERE eatDate=${new Date(`${day}T00:00:00Z`)}`;
  const asOf = await databaseTime(tx);
  const parents = new Map(rows.map(row => [row.id, publication(row)]));
  if (rows.length > bestSlipOddsBands.length || [...parents.values()].some(parent => parent.publishedAt > asOf)) fail("unavailable");
  return { parents, asOf };
}
function exactSlipOdds(slip: BuiltSlip, { minimum, maximum, exclusiveMaximum }: ReturnType<typeof bestSlipExactRange>) {
  const { product, denominator } = bestSlipExactTotal(slip.selections), scaled = product * 100n;
  const upper = BigInt(maximum) * denominator;
  const rounded = (scaled * 2n + denominator) / (2n * denominator);
  return scaled >= BigInt(minimum) * denominator && (exclusiveMaximum ? scaled < upper : scaled <= upper)
    && rounded === BigInt(slip.totalOdds.replace(".", ""));
}

/** Stored version-two bounds and public rank addresses remain valid for the original archive. */
function verifyPublishedOdds(parent: Publication, slip: BuiltSlip, publishedAt: number): BestSlipOddsBand | null {
  if (parent.version >= 3) {
    if (!parent.oddsBand || !parent.bounds || parent.bounds.totalMax === undefined || !exactSlipOdds(slip, {
      minimum: parent.bounds.totalMin, maximum: parent.bounds.totalMax, exclusiveMaximum: parent.oddsBand !== "100-200",
    }) || !reviewedSlipOffers(slip, publishedAt)) return fail("unavailable");
    return parent.oddsBand;
  }
  const value = BigInt(slip.totalOdds.replace(".", ""));
  if (parent.bounds && (value < BigInt(parent.bounds.totalMin) || parent.bounds.totalMax !== undefined && value > BigInt(parent.bounds.totalMax))) fail("unavailable");
  return bestSlipOddsBandFor(slip.totalOdds);
}

function reviewedSlipOffers(slip: BuiltSlip, at: number) {
  return slip.oddsBasis === "bookmaker" && slip.selections.every((selection) => selection.oddsBasis === "bookmaker" &&
    selection.source === "local-engine" && selection.offer !== undefined && selection.offer.checkedAt <= at &&
    selection.bookmaker?.id === slip.selections[0]!.bookmaker?.id && selection.forecast !== undefined);
}

function offerStillEligible(selection: BuiltSlip["selections"][number], at: number) {
  const { offer, kickoffAt } = selection;
  return offer && isEditorialSlipOfferFresh(offer, at) && kickoffAt - at >= bestSlipKickoffBufferMs;
}

function publicEditorialSlip(slip: BuiltSlip): BuiltSlip {
  if (!slip.selections.some(({ offer }) => offer)) return slip;
  const selections = slip.selections.map((selection) => {
    const view = { ...selection };
    delete view.offer;
    return view;
  });
  return { ...slip, selections };
}
const databaseTime = async (tx: Prisma.TransactionClient) => (await tx.$queryRaw<{ at: Date }[]>`SELECT UTC_TIMESTAMP(3) AS at`)[0]!.at.getTime();
export function parsePublishedSlipHistoryQuery(input: PublishedSlipHistoryQuery): PublishedSlipHistoryQuery {
  try {
    validateReportingDateRange(input.from, input.to, publishedSlipRules.maximumDays);
    if (!Number.isSafeInteger(input.page) || input.page < 1 || input.page > 9999 || !Number.isSafeInteger(input.pageSize)
      || input.pageSize < 1 || input.pageSize > publishedSlipRules.maximumPageSize) fail("invalid-input");
    return { ...input, oddsBand: oddsBandSchema.parse(input.oddsBand ?? defaultBestSlipOddsBand),
      status: historyStatusSchema.parse(input.status ?? "all") };
  } catch { return fail("invalid-input"); }
}

const emptyAppend = (status: "already-published" | "full" | "stale" | "no-qualifying") => ({ status, appended: 0 } as const);

const publicationConflict = (error: unknown) => error instanceof DatabaseOperationError
  && (error.code === "conflict" || error.code === "lock-timeout");

const publicationDate = (day: ReportingDate) => new Date(`${day}T00:00:00Z`);
const adjacentPublicationDates = (day: ReportingDate) => [publicationDate(addReportingDays(day, -1)), publicationDate(addReportingDays(day, 1))] as const;

/** Overlapping next-key locks make competing writes retry before a fixture can be allocated twice. */
async function lockPublicationDay(tx: Prisma.TransactionClient, day: ReportingDate) {
  const [previous, next] = adjacentPublicationDates(day);
  await tx.$queryRaw`SELECT combination FROM DailyBestSlipCombination FORCE INDEX (PRIMARY)
    WHERE eatDate BETWEEN ${previous} AND ${next} ORDER BY eatDate,combination LOCK IN SHARE MODE`;
}

async function lockPublicationFixtures(tx: Prisma.TransactionClient, ids: readonly string[]) {
  const fixtures = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM FootballFixture
    WHERE id IN (${Prisma.join([...ids].sort())}) ORDER BY id LOCK IN SHARE MODE`);
  // Lock odds before the first consistent read so the commit check cannot see superseded prices.
  await lockFeaturedSlipOdds(tx, fixtures.map(({ id }) => id));
  return fixtures;
}

async function readHourlyPublicationState(tx: Prisma.TransactionClient, day: ReportingDate, asOf: number, includeAdjacent = true) {
  const date = publicationDate(day);
  const parents = new Map((await tx.$queryRaw<PublicationRow[]>`SELECT *,integrity=SHA2(CAST(bodyJson AS CHAR),256) AS validIntegrity
    FROM DailySlipPublication WHERE eatDate=${date}`).map(row => [row.id, publication(row)]));
  if (parents.size > bestSlipOddsBands.length || [...parents.values()].some(parent => parent.publishedAt > asOf)) fail("unavailable");
  const batches = await readAppendBatches(tx, parents, asOf);
  const counts = new Map<BestSlipOddsBand, number>(), publishedHours = new Map<BestSlipOddsBand, ReadonlySet<number>>();
  const bandFixtures = new Map<BestSlipOddsBand, Set<string>>(), fixtures = new Set<string>(), combinations = new Set<string>();
  const closed = new Set<BestSlipOddsBand>();
  for (const [id, parent] of parents) {
    if (!parent.oddsBand) {
      for (const { id: band } of bestSlipOddsBands) closed.add(band);
      continue;
    }
    const current = batches.get(id);
    counts.set(parent.oddsBand, publicationCount(parent, current));
    publishedHours.set(parent.oddsBand, new Set(current?.map(({ hourAt }) => hourAt)));
    if (parent.version === 2) closed.add(parent.oddsBand);
  }
  for await (const snapshots of readAuditedPublicationPages(tx, parents, batches)) {
    for (const { parent, snapshot } of snapshots) {
      combinations.add(bestSlipCombinationIdentity(snapshot.slip.selections));
      const inBand = parent.oddsBand ? bandFixtures.get(parent.oddsBand) ?? new Set<string>() : undefined;
      for (const { fixtureId } of snapshot.slip.selections) {
        fixtures.add(fixtureId);
        inBand?.add(fixtureId);
      }
      if (parent.oddsBand && inBand) bandFixtures.set(parent.oddsBand, inBand);
    }
  }
  if (includeAdjacent) {
    const [previous, next] = adjacentPublicationDates(day);
    const pageSize = 500;
    let after = "";
    for (;;) {
      const rows = await tx.$queryRaw<{ fixtureId: string }[]>`SELECT DISTINCT l.fixtureId FROM DailySlipPublication p
        JOIN PublishedSlip s ON s.publicationId=p.id JOIN PublishedSlipLeg l ON l.slipId=s.id
        WHERE p.eatDate IN (${previous},${next}) AND l.fixtureId>${after} ORDER BY l.fixtureId LIMIT ${pageSize}`;
      for (const { fixtureId } of rows) fixtures.add(fixtureId);
      if (rows.length < pageSize) break;
      after = rows.at(-1)!.fixtureId;
    }
  }
  return { parents, counts, publishedHours, bandFixtures, fixtures, combinations, closed };
}

/** Append-only editorial publications, independent of member saves, erasure and visitor requests. */
export function createPublishedSlips(database: DatabaseRuntime, {
  bindForecasts = bindSlipForecasts, resolveResults = readSlipForecastResults, verifyOffers = verifyFeaturedSlipOffers,
}: { bindForecasts?: typeof bindSlipForecasts; resolveResults?: typeof readSlipForecastResults; verifyOffers?: typeof verifyFeaturedSlipOffers } = {}) {
  const transaction = <T>(run: (tx: Prisma.TransactionClient) => Promise<T>) => database.transaction(run,
    { isolationLevel: "RepeatableRead", timeout: 30_000 });
  return Object.freeze({
    async hourlyState(day: ReportingDate) {
      parseReportingDate(day);
      return transaction(async tx => {
        const { counts, publishedHours, bandFixtures, fixtures, combinations, closed } =
          await readHourlyPublicationState(tx, day, await databaseTime(tx));
        return { counts, publishedHours, bandFixtures, fixtures, combinations, closed };
      });
    },
    async append(input: Readonly<{ day: ReportingDate; oddsBand: BestSlipOddsBand; hourAt: number; slips: readonly BuiltSlip[];
      searchLimited: boolean; partialCoverage: boolean; verifyPublicOdds: () => boolean }>) {
      const oddsBand = oddsBandSchema.parse(input.oddsBand), slot = bestSlipPublicationHour(input.hourAt);
      if (!bestSlipActivePublicationDays(input.hourAt).includes(input.day) || slot.hourAt !== input.hourAt
        || !input.slips.length || input.slips.length > bestSlipAppendBatchSize)
        return fail("invalid-input");
      const range = bestSlipExactRange(oddsBand), window = bestSlipFixtureWindow(input.day), interval = bestSlipFixtureInterval(input.day);
      const criteria = { ...bestSlipDailyCriteria(input.day, oddsBand), slips: bestSlipAppendBatchSize, dateTo: addReportingDays(input.day, 1),
        timeFrom: interval.from.slice(11), timeTo: interval.to.slice(11), interval: { ...interval, zone: publicPolicy.reportingTimeZone } };
      const publicationId = slipPublicationIdentity(input.day, oddsBand), date = publicationDate(input.day);
      const batchId = appendBatchIdentity(publicationId, input.hourAt), hourAt = new Date(input.hourAt);
      const proposed = new Map<string, BuiltSlip>(), proposedFixtures = new Set<string>();
      for (const slip of input.slips) {
        const snapshot = snapshotSchema.parse({ slip }).slip;
        const key = bestSlipCombinationIdentity(snapshot.selections);
        const average = snapshot.selections.reduce((value, selection) => value + selection.probability, 0) / snapshot.selections.length;
        if (proposed.has(key) || snapshot.selections.length < criteria.teamsMin
          || criteria.teamsMax !== undefined && snapshot.selections.length > criteria.teamsMax
          || !exactSlipOdds(snapshot, range) || !reviewedSlipOffers(snapshot, Number.MAX_SAFE_INTEGER)
          || Math.abs(average - snapshot.averageProbability) > Number.EPSILON * snapshot.selections.length * 2
          || snapshot.selections.some(({ fixtureId, kickoffAt }) => proposedFixtures.has(fixtureId)
            || kickoffAt < window.startInclusive || kickoffAt >= window.endExclusive))
          return fail("invalid-input");
        proposed.set(key, snapshot);
        snapshot.selections.forEach(({ fixtureId }) => proposedFixtures.add(fixtureId));
      }
      const authorized = (at: number) => {
        if (!provenTrue(input.verifyPublicOdds)) fail("unauthorized");
        return bestSlipPublicationHour(at).hourAt === input.hourAt && bestSlipActivePublicationDays(at).includes(input.day);
      };
      // Return a retry status after throwing through the transaction boundary so every provisional row rolls back.
      let rolledBack = false;
      const rollback = (): never => { rolledBack = true; return fail("unavailable"); };
      try {
        const write = () => database.transaction(async tx => {
          await lockPublicationDay(tx, input.day);
          const locked = new Set((await lockPublicationFixtures(tx, [...proposedFixtures])).map(({ id }) => id));
          const now = await databaseTime(tx);
          if (!authorized(now)) return emptyAppend("stale");
          const state = await readHourlyPublicationState(tx, input.day, now);
          const parent = state.parents.get(publicationId), count = state.counts.get(oddsBand) ?? 0;
          if (state.publishedHours.get(oddsBand)?.has(input.hourAt)) return emptyAppend("already-published");
          if (state.closed.has(oddsBand)) return emptyAppend("full");
          const advancing = [...proposed].filter(([key, { selections }]) => !state.combinations.has(key)
            && selections.every(({ fixtureId }) => locked.has(fixtureId) && !state.fixtures.has(fixtureId)));
          if (!advancing.length) return emptyAppend("no-qualifying");

          const eligible: BuiltSlip[] = [];
          for (const [, slip] of advancing) {
            const bound = await bindForecasts(tx, slip, await databaseTime(tx));
            if (bound) eligible.push(bound);
          }
          const at = await databaseTime(tx);
          if (!authorized(at)) return emptyAppend("stale");
          const fresh = eligible.filter(({ selections }) => selections.every(selection => offerStillEligible(selection, at)));
          if (!fresh.length) return emptyAppend("no-qualifying");
          const publishable = await verifyOffers(tx, fresh.flatMap(({ selections }) => selections), at) ? fresh : [];
          if (publishable !== fresh) {
            for (const slip of fresh) {
              if (await verifyOffers(tx, slip.selections, at)) publishable.push(slip);
            }
          }
          if (!publishable.length) return emptyAppend("no-qualifying");

          if (!parent) {
            const body = publicationSchema.parse({ version: 5, oddsBand, day: input.day, publishedAt: at, model: null,
              criteria: serializeSlipCriteria(criteria).toString(), count: 0, searchLimited: false, partialCoverage: false });
            const json = JSON.stringify(body);
            const stored = await tx.$executeRaw`INSERT IGNORE INTO DailySlipPublication
              (id,eatDate,oddsBand,publishedAt,modelId,bodyJson,integrity) VALUES
              (${publicationId},${date},${oddsBand},${new Date(at)},NULL,JSON_EXTRACT(${json},'$'),SHA2(CAST(JSON_EXTRACT(${json},'$') AS CHAR),256))`;
            if (!stored) {
              const [existing] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM DailySlipPublication
                WHERE eatDate=${date} AND oddsBand=${oddsBand} LOCK IN SHARE MODE`;
              if (existing?.id !== publicationId) return fail("unavailable");
              return emptyAppend("stale");
            }
          }
          const firstRank = count + 1;
          const body = appendBatchSchema.parse({ version: 2, hourAt: input.hourAt, publishedAt: at, firstRank,
            count: publishable.length, searchLimited: input.searchLimited, partialCoverage: input.partialCoverage });
          const json = JSON.stringify(body);
          const inserted = await tx.$executeRaw`INSERT IGNORE INTO DailyBestSlipAppendBatch
            (id,publicationId,hourAt,publishedAt,firstRank,count,bodyJson,integrity) VALUES
            (${batchId},${publicationId},${hourAt},${new Date(at)},${firstRank},${publishable.length},
              JSON_EXTRACT(${json},'$'),SHA2(CAST(JSON_EXTRACT(${json},'$') AS CHAR),256))`;
          if (!inserted) {
            const existing = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM DailyBestSlipAppendBatch
              WHERE publicationId=${publicationId} AND (hourAt=${hourAt} OR firstRank=${firstRank}) LOCK IN SHARE MODE`;
            if (!existing.length || !parent) return fail("unavailable");
            return emptyAppend(existing.some(({ id }) => id === batchId) ? "already-published" : "stale");
          }
          for (const [index, slip] of publishable.entries()) {
            const rank = firstRank + index;
            const snapshot = JSON.stringify(snapshotSchema.parse({ slip }));
            const [stored] = await tx.$queryRaw<{ snapshot: unknown }[]>`SELECT JSON_EXTRACT(${snapshot},'$') AS snapshot`;
            if (!stored) return fail("unavailable");
            const slipId = evidenceFingerprint({ publicationId, rank, snapshot: snapshotSchema.parse(historyJson(stored.snapshot)) });
            await tx.$executeRaw`INSERT INTO PublishedSlip (id,publicationId,appendBatchId,\`rank\`,snapshotJson,integrity)
              VALUES (${slipId},${publicationId},${batchId},${rank},JSON_EXTRACT(${snapshot},'$'),SHA2(CAST(JSON_EXTRACT(${snapshot},'$') AS CHAR),256))`;
            const expected = evidenceFingerprint(bestSlipCombinationIdentity(slip.selections));
            const linked = await tx.$executeRaw`INSERT IGNORE INTO DailyBestSlipCombination (eatDate,combination,slipId)
              VALUES (${date},${expected},${slipId})`;
            if (linked === 0) {
              const [existing] = await tx.$queryRaw<{ slipId: string }[]>`SELECT slipId FROM DailyBestSlipCombination
                WHERE eatDate=${date} AND combination=${expected} LOCK IN SHARE MODE`;
              if (!existing) return fail("unavailable");
              return rollback();
            }
            await tx.publishedSlipLeg.createMany({ data: slip.selections.map(({ fixtureId, forecast }) => ({
              slipId, fixtureId, cycleId: forecast!.cycleId, revisionId: forecast!.revisionId,
            })) });
          }
          const commitAt = await databaseTime(tx);
          if (!authorized(commitAt) || publishable.some(({ selections }) => !selections.every(selection => offerStillEligible(selection, commitAt))))
            return rollback();
          return { status: "published", appended: publishable.length } as const;
        }, { isolationLevel: "RepeatableRead", timeout: 30_000 });
        try { return await write(); }
        catch (error) { if (!rolledBack && publicationConflict(error)) return await write(); throw error; }
      } catch (error) {
        if (rolledBack || publicationConflict(error))
          return emptyAppend("stale");
        throw error;
      }
    },
    async publishedBands(day: string): Promise<readonly (BestSlipOddsBand | "legacy")[]> {
      parseReportingDate(day);
      return transaction(async tx => {
        const rows = await tx.$queryRaw<PublicationRow[]>`SELECT *,integrity=SHA2(CAST(bodyJson AS CHAR),256) AS validIntegrity
          FROM DailySlipPublication WHERE eatDate=${new Date(`${day}T00:00:00Z`)}`;
        return rows.map(row => publication(row).oddsBand ?? "legacy");
      });
    },
    async publishedSelections(day: ReportingDate) {
      return transaction(async (tx) => {
        const { fixtures, combinations } = await readHourlyPublicationState(tx, day, await databaseTime(tx), false);
        return { fixtures, combinations };
      });
    },
    async publish(input: Readonly<{ day: string; slips: readonly BestSlip[]; model: JointSlipModel; oddsBand?: BestSlipOddsBand;
      searchLimited: boolean; partialCoverage: boolean; verifyModel: (model: JointSlipModel) => boolean;
      verifyPublicOdds: () => boolean }>): Promise<"published" | "already-published"> {
      const authorized = (at: number) => {
        if (!provenTrue(() => input.verifyModel(input.model)) || !provenTrue(() => input.verifyPublicOdds())) fail("unauthorized");
        if (!qualifiedJointModel(input.model, at) || getReportingDate(utcInstantFromEpochMilliseconds(at)) !== input.day) fail("invalid-input");
      };
      const oddsBand = oddsBandSchema.parse(input.oddsBand ?? defaultBestSlipOddsBand);
      const range = bestSlipExactRange(oddsBand), criteria = bestSlipDailyCriteria(input.day, oddsBand);
      const ids = new Set<string>(), combinations = new Set<string>();
      if (!input.slips.length || input.slips.length > dailyBestSlipBandLimit) fail("invalid-input");
      const proposed = [...input.slips].sort(compareBestSlips).map(({ estimatedProbability, ...slip }) => {
        const snapshot = slipSnapshotSchema.parse(slip);
        if (jointSlipProbability(input.model, snapshot as BuiltSlip) !== estimatedProbability) fail("invalid-input");
        const original = snapshot as BuiltSlip;
        const combination = bestSlipCombinationIdentity(original.selections);
        if (combinations.has(combination)) fail("invalid-input");
        combinations.add(combination);
        const average = snapshot.selections.reduce((value, selection) => value + selection.probability, 0) / snapshot.selections.length;
        if (snapshot.selections.length < criteria.teamsMin || criteria.teamsMax !== undefined && snapshot.selections.length > criteria.teamsMax
          || !exactSlipOdds(original, range) || !reviewedSlipOffers(original, Number.MAX_SAFE_INTEGER)
          || Math.abs(average - snapshot.averageProbability) > Number.EPSILON * snapshot.selections.length * 2) fail("invalid-input");
        for (const selection of snapshot.selections) {
          if (ids.has(selection.fixtureId) || getReportingDate(utcInstantFromEpochMilliseconds(selection.kickoffAt)) !== input.day) fail("invalid-input");
          ids.add(selection.fixtureId);
        }
        return { slip: snapshot as BuiltSlip, estimatedProbability };
      });
      const day = parseReportingDate(input.day), id = slipPublicationIdentity(day, oddsBand), dayDate = new Date(`${day}T00:00:00Z`);
      const write = () => transaction(async (tx): Promise<"published" | "already-published"> => {
        await lockPublicationDay(tx, day);
        const locked = await lockPublicationFixtures(tx, [...ids]);
        const now = await databaseTime(tx);
        authorized(now);
        const state = await readHourlyPublicationState(tx, day, now);
        if (state.parents.has(id) || state.parents.has(slipPublicationIdentity(day))) return "already-published";
        if (locked.length !== ids.size || [...ids].some(fixture => state.fixtures.has(fixture))) return fail("invalid-input");
        const snapshots: z.infer<typeof snapshotSchema>[] = [];
        for (const item of proposed) {
          const slip = await bindForecasts(tx, item.slip, await databaseTime(tx));
          if (!slip) fail("invalid-input");
          snapshots.push(snapshotSchema.parse({ slip, estimatedProbability: item.estimatedProbability }));
        }
        const at = await databaseTime(tx); authorized(at);
        const selections = snapshots.flatMap(({ slip }) => slip.selections);
        if (!selections.every((selection) => offerStillEligible(selection, at)) || !await verifyOffers(tx, selections, at)) fail("invalid-input");
        const body = publicationSchema.parse({ version: 3, oddsBand, day: input.day, publishedAt: at,
          model: { id: slipModelIdentity(input.model), calibrationReference: input.model.calibrationReference,
            correlationReference: input.model.correlationReference, validFrom: input.model.validFrom, validUntil: input.model.validUntil },
          criteria: serializeSlipCriteria(criteria).toString(), count: snapshots.length,
          searchLimited: input.searchLimited, partialCoverage: input.partialCoverage });
        if (body.model === null) return fail("invalid-input");
        const json = JSON.stringify(body);
        const inserted = await tx.$executeRaw`INSERT IGNORE INTO DailySlipPublication (id,eatDate,oddsBand,publishedAt,modelId,bodyJson,integrity)
          VALUES (${id},${dayDate},${oddsBand},${new Date(at)},${body.model.id},JSON_EXTRACT(${json},'$'),SHA2(CAST(JSON_EXTRACT(${json},'$') AS CHAR),256))`;
        if (inserted === 0) {
          // IGNORE may suppress a non-duplicate constraint failure. Only a current locked row proves a prior publication.
          const existing = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM DailySlipPublication WHERE eatDate=${dayDate} AND oddsBand=${oddsBand} LOCK IN SHARE MODE`;
          if (existing[0]?.id !== id) fail("unavailable");
          return "already-published";
        }
        for (const [index, snapshot] of snapshots.entries()) {
          const rank = index + 1;
          const snapshotJson = JSON.stringify(snapshot);
          // Match the database's JSON number representation when sealing the identity.
          const [stored] = await tx.$queryRaw<{ snapshot: unknown }[]>`SELECT JSON_EXTRACT(${snapshotJson},'$') AS snapshot`;
          if (!stored) return fail("unavailable");
          const storedSnapshot = snapshotSchema.parse(historyJson(stored.snapshot));
          const slipId = evidenceFingerprint({ publicationId: id, rank, snapshot: storedSnapshot });
          await tx.$executeRaw`INSERT INTO PublishedSlip (id,publicationId,\`rank\`,snapshotJson,integrity)
            VALUES (${slipId},${id},${rank},JSON_EXTRACT(${snapshotJson},'$'),SHA2(CAST(JSON_EXTRACT(${snapshotJson},'$') AS CHAR),256))`;
          const combination = evidenceFingerprint(bestSlipCombinationIdentity(snapshot.slip.selections));
          await tx.$executeRaw`INSERT INTO DailyBestSlipCombination (eatDate,combination,slipId)
            VALUES (${dayDate},${combination},${slipId})`;
          await tx.publishedSlipLeg.createMany({ data: snapshot.slip.selections.map((selection) => ({ slipId, fixtureId: selection.fixtureId,
            cycleId: selection.forecast!.cycleId, revisionId: selection.forecast!.revisionId })) });
        }
        const committedAt = await databaseTime(tx); authorized(committedAt);
        if (!selections.every((selection) => offerStillEligible(selection, committedAt))) fail("invalid-input");
        return "published";
      });
      try { return await write(); }
      catch (error) { if (publicationConflict(error)) return write(); throw error; }
    },
    async day(day: string, completedOnly = false, oddsBand?: BestSlipOddsBand, sourceSlipId?: string): Promise<BestSlipsResult | null> {
      const publicationDay = parseReportingDate(day);
      return transaction(async tx => {
        const { parents, asOf } = await readDayPublicationParents(tx, publicationDay);
        if (!parents.size) return null;
        const batches = await readAppendBatches(tx, parents, asOf);
        const views: BestSlipView[] = [];
        const statistics = { total: 0, won: 0, lost: 0, pending: 0, void: 0, cancelled: 0 };
        const pages = sourceSlipId === undefined ? readAuditedPublicationPages(tx, parents, batches)
          : readSelectedPublicationPages(tx, parents, batches, sourceSlipId);
        for await (const entries of pages) {
          const matching = entries.filter(({ parent, snapshot, publishedAt }) => {
            const band = verifyPublishedOdds(parent, snapshot.slip, publishedAt);
            return !oddsBand || band === oddsBand;
          });
          const results = await resolveResults(tx, matching.flatMap(({ snapshot }) => snapshot.slip.selections), asOf, { editorial: true });
          const resultsFor = indexSlipResults(results);
          for (const entry of matching) {
            const view = publishedSlipView(entry, resultsFor(entry.snapshot.slip));
            if (completedOnly && !view.completed) continue;
            views.push(view);
            statistics.total++;
            statistics[slipStatusCategory(view.status ?? "pending")]++;
          }
        }
        views.sort((left, right) => left.rank - right.rank);
        return { day: publicationDay, state: "generated", slips: views, statistics, ...publicationCoverage(parents, batches) };
      });
    },
    async byRank(day: ReportingDate, rank: number): Promise<BestSlipsResult | null> {
      const publicationDay = parseReportingDate(day), address = bestSlipBandRank(rank);
      return transaction(async tx => {
        const { parents, asOf } = await readDayPublicationParents(tx, publicationDay);
        const matching = new Map([...parents].filter(([, parent]) => parent.oddsBand ? parent.oddsBand === address.band : rank <= parent.count));
        const batches = await readAppendBatches(tx, matching, asOf);
        for (const [id, parent] of matching) {
          const localRank = parent.oddsBand ? address.rank : rank;
          if (localRank > publicationCount(parent, batches.get(id))) continue;
          const rows = await tx.$queryRaw<RawSlipRow[]>(Prisma.sql`SELECT *,integrity=SHA2(CAST(snapshotJson AS CHAR),256) AS validIntegrity
            FROM PublishedSlip WHERE publicationId=${id} AND \`rank\`=${localRank}`);
          if (rows.length !== 1) return fail("unavailable");
          const [entry] = await readAuditedPublicationSnapshots(tx, new Map([[id, parent]]), rows, batches, localRank - 1);
          const { snapshot, publishedAt } = entry!;
          verifyPublishedOdds(parent, snapshot.slip, publishedAt);
          const results = await resolveResults(tx, snapshot.slip.selections, asOf, { editorial: true });
          return { day: publicationDay, state: "generated", slips: [publishedSlipView(entry!, results)], ...publicationCoverage(matching, batches) };
        }
        return null;
      });
    },
    /** Date/result browsing reuses original-cycle adjudication and keeps active rows behind the caller's access gate. */
    async browse(input: BestSlipsQuery, today: ReportingDate, completedOnly = false): Promise<BestSlipsResult> {
      const query = parseBestSlipsQuery(serializeBestSlipsQuery(input), today), dates = resolveBestSlipsDates(query, today);
      const cursor = query.cursor === undefined ? null : parseBestSlipsCursor(query.cursor), allDates = query.period === "all";
      const dailyView = dates.from !== null && dates.from === dates.to;
      return transaction(async (tx) => {
        const asOf = await databaseTime(tx);
        const activeDays = query.period === "today" && !completedOnly ? bestSlipActivePublicationDays(asOf) : [];
        const overlapDay = activeDays.length === 2 && activeDays[1] === today ? activeDays[0] : undefined;
        const overlapEnd = overlapDay ? bestSlipFixtureWindow(overlapDay).endExclusive : asOf;
        const scope = allDates ? cursor ? Prisma.sql`AND eatDate<=${new Date(`${cursor.day}T00:00:00Z`)}` : Prisma.empty
          : Prisma.sql`AND eatDate>=${new Date(`${overlapDay ?? dates.from}T00:00:00Z`)} AND eatDate<=${new Date(`${dates.to}T00:00:00Z`)}`;
        const sourceBands = bestSlipPublicationBands(query.oddsBand);
        const publicationLimit = (allDates ? bestSlipsQueryRules.scanDays : bestSlipsQueryRules.maximumDays) * (sourceBands.length + 1);
        const publications = await tx.$queryRaw<PublicationRow[]>(Prisma.sql`SELECT *,integrity=SHA2(CAST(bodyJson AS CHAR),256) AS validIntegrity
          FROM DailySlipPublication WHERE publishedAt<=${new Date(asOf)} AND oddsBand IN ('legacy',${Prisma.join([...sourceBands])}) ${scope}
          ORDER BY eatDate DESC, FIELD(oddsBand,'legacy',${Prisma.join([...sourceBands])}) LIMIT ${publicationLimit + 1}`);
        if (!allDates && publications.length > publicationLimit) fail("unavailable");
        const scannedDays = new Set<number>();
        let selected = publications.slice(0, publicationLimit).filter(row => {
          if (!allDates) return true;
          const date = row.eatDate.getTime();
          if (!scannedDays.has(date) && scannedDays.size >= bestSlipsQueryRules.scanDays) return false;
          scannedDays.add(date); return true;
        });
        const hasOlder = allDates && publications.length > selected.length;
        // Never skip the rest of a civil day when a bounded scan ends between adjacent bands.
        if (hasOlder && selected.at(-1)?.eatDate.getTime() === publications[publicationLimit]?.eatDate.getTime()) {
          const incompleteDay = selected.at(-1)!.eatDate.getTime();
          selected = selected.filter(row => row.eatDate.getTime() !== incompleteDay);
        }
        const parents = new Map(selected.map((row) => [row.id, publication(row)]));
        const requestedBand = query.oddsBand ?? defaultBestSlipOddsBand;
        const batches = await readAppendBatches(tx, parents, asOf);
        const dailyPublication = dailyView ? [...parents].find(([, parent]) => parent.day === dates.from && parent.version >= 3
          && parent.oddsBand === requestedBand) : undefined;
        const legacyDailyOrder = dailyView && !dailyPublication;
        const statistics = { total: 0, won: 0, lost: 0, pending: 0, void: 0, cancelled: 0 };
        const views: BestSlipView[] = [];
        let total = 0, bandTotal = 0, hasOverlap = false;
        const membership: string[] = [];
        const offset = (query.page - 1) * bestSlipsQueryRules.pageSize;
        for await (const entries of readOrderedBandPages(tx, parents, batches, requestedBand, legacyDailyOrder, overlapDay)) {
          const ordered = entries.filter(({ parent, snapshot }) => parent.day !== overlapDay
            || snapshot.slip.selections.every(({ kickoffAt }) => kickoffAt > asOf && kickoffAt < overlapEnd));
          const candidates = ordered.filter(({ snapshot }) => matchesBestSlipsRanges(query, {
            averageProbability: snapshot.slip.averageProbability, matchCount: snapshot.slip.selections.length,
          }));
          const needsAll = completedOnly || overlapDay !== undefined && ordered[0]?.parent.day === overlapDay;
          const results = await resolveResults(tx, (needsAll ? ordered : candidates).flatMap(({ snapshot }) => snapshot.slip.selections), asOf, { editorial: true });
          const resultsFor = indexSlipResults(results);
          if (!needsAll) bandTotal += ordered.length;
          else for (const { parent, snapshot } of ordered) {
            const slip = snapshot.slip, observed = resultsFor(slip);
            if (parent.day === overlapDay) {
              if (slipSnapshotStatus(slip, observed) !== "not-started") continue;
              hasOverlap = true;
            } else if (!slipCompleted(slip, observed)) continue;
            bandTotal++;
          }
          for (const entry of candidates) {
            const { row, snapshot, parent } = entry;
            const slipResults = resultsFor(snapshot.slip);
            const completed = slipCompleted(snapshot.slip, slipResults);
            if (completedOnly && !completed) continue;
            const outcome = slipSnapshotOutcome(snapshot.slip, slipResults), status = slipSnapshotStatus(snapshot.slip, slipResults, outcome);
            if (parent.day === overlapDay && status !== "not-started") continue;
            const category = slipStatusCategory(status);
            statistics.total++; statistics[category]++;
            if (cursor && (parent.day > cursor.day || parent.day === cursor.day && publicRank(parent, row.rank) <= cursor.rank)) continue;
            if (query.status !== "all" && category !== query.status) continue;
            membership.push(row.id);
            const position = total++;
            if (allDates ? views.length > bestSlipsQueryRules.pageSize : position < offset || position >= offset + bestSlipsQueryRules.pageSize) continue;
            views.push(publishedSlipView(entry, slipResults, outcome, status, completed));
          }
        }
        const retained = views.slice(0, bestSlipsQueryRules.pageSize), overflow = views.length > retained.length;
        const last = retained.at(-1), oldest = selected.at(-1);
        const nextCursor = allDates && overflow && last ? `${last.publicationDay}:${last.rank}`
          : allDates && hasOlder && oldest ? `${parents.get(oldest.id)!.day}:${maximumBestSlipPublicRank}` : null;
        const dailyCount = dailyPublication ? publicationCount(dailyPublication[1], batches.get(dailyPublication[0])) : undefined;
        const dailyBandLimit = !completedOnly && dates.from !== today && dailyCount === bandTotal && dailyPublication
          && dailyPublication[1].version < 5 && !batches.get(dailyPublication[0])?.some(({ version }) => version === 2) ? dailyBestSlipBandLimit : undefined;
        const periodStatistics = allDates ? null : statistics;
        if (overlapDay && !hasOverlap) for (const [id, parent] of parents) {
          if (parent.day !== overlapDay) continue;
          parents.delete(id);
          batches.delete(id);
        }
        return { day: today, state: "generated", slips: retained,
          ...publicationCoverage(parents, batches), statistics: periodStatistics,
          summary: { ...dates, asOf, statistics: periodStatistics },
          browse: { query, version: allDates ? null : evidenceFingerprint({ bandTotal, membership }), total: allDates ? null : total,
            bandTotal: allDates ? null : bandTotal, ...(dailyBandLimit === undefined ? {} : { dailyBandLimit }), pageSize: bestSlipsQueryRules.pageSize,
            hasMore: allDates ? nextCursor !== null : offset + retained.length < total, nextCursor,
            from: allDates ? oldest ? parseReportingDate(parents.get(oldest.id)!.day) : null : dates.from,
            to: allDates ? selected[0] ? parseReportingDate(parents.get(selected[0].id)!.day) : null : dates.to } };
      });
    },
    async history(input: PublishedSlipHistoryQuery, completedOnly = false): Promise<PublishedSlipHistory> {
      const query = parsePublishedSlipHistoryQuery(input);
      return transaction(async (tx) => {
        const asOf = await databaseTime(tx);
        const sourceBands = bestSlipPublicationBands(query.oddsBand);
        const publicationLimit = publishedSlipRules.maximumDays * (sourceBands.length + 1);
        const publications = await tx.$queryRaw<PublicationRow[]>(Prisma.sql`SELECT *,integrity=SHA2(CAST(bodyJson AS CHAR),256) AS validIntegrity
          FROM DailySlipPublication WHERE eatDate>=${new Date(`${query.from}T00:00:00Z`)} AND eatDate<=${new Date(`${query.to}T00:00:00Z`)}
          AND oddsBand IN ('legacy',${Prisma.join([...sourceBands])}) AND publishedAt<=${new Date(asOf)} ORDER BY eatDate DESC LIMIT ${publicationLimit + 1}`);
        if (publications.length > publicationLimit) fail("unavailable");
        const parents = new Map(publications.map((row) => [row.id, publication(row)]));
        const batches = await readAppendBatches(tx, parents, asOf);
        const samples = [], records: PublishedSlipHistory["records"][number][] = [];
        const through = query.page * query.pageSize;
        let total = 0;
        for await (const entries of readOrderedBandPages(tx, parents, batches, query.oddsBand ?? defaultBestSlipOddsBand, false)) {
          const results = await resolveResults(tx, entries.flatMap(({ snapshot }) => snapshot.slip.selections), asOf, { editorial: true });
          const resultsFor = indexSlipResults(results);
          for (const { row, parent, snapshot, publishedAt: at } of entries) {
            const slipResults = resultsFor(snapshot.slip);
            if (completedOnly && !slipCompleted(snapshot.slip, slipResults)) continue;
            const publishedAt = new Date(at).toISOString();
            const view = slipResultView(row.id, publishedAt, publicEditorialSlip(snapshot.slip), slipResults);
            const outcome = view?.outcome ?? slipSnapshotOutcome(snapshot.slip, slipResults);
            const status = view?.status ?? slipSnapshotStatus(snapshot.slip, slipResults, outcome);
            const rank = publicRank(parent, row.rank);
            samples.push({ id: row.id, publishedAt: at, rank, totalOdds: view ? snapshot.slip.totalOdds : "", outcome, status });
            // Until every original cycle has ended, no selections, quote or probabilities leave this boundary.
            if (view && (query.status === "all" || slipStatusCategory(status) === query.status)) {
              total++;
              records.push({ ...view, publicationDay: parseReportingDate(parent.day), publishedAt, rank,
                ...(snapshot.estimatedProbability !== undefined && parent.model ? { modelId: parent.model.id, estimatedProbability: snapshot.estimatedProbability } : {}) });
            }
          }
          records.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.rank - b.rank);
          if (records.length > through) records.length = through;
        }
        return { asOf, records: records.slice(through - query.pageSize), total, page: query.page, pageSize: query.pageSize,
          statistics: summarizeSlipPerformance(samples) };
      });
    },
  });
}

type PublishedSlipEntry = Readonly<{ row: SlipRow; parent: Publication; snapshot: z.infer<typeof snapshotSchema>;
  publishedAt: number; appendBatch?: AppendBatch }>;

/** Existing share requests identify the sealed slip by its snapshot identity. */
async function* readSelectedPublicationPages(tx: Prisma.TransactionClient, parents: ReadonlyMap<string, Publication>,
  batches: ReadonlyMap<string, readonly AppendBatch[]>, sourceSlipId: string) {
  for (const [id, parent] of parents) {
    const rows = await tx.$queryRaw<RawSlipRow[]>(Prisma.sql`SELECT *,integrity=SHA2(CAST(snapshotJson AS CHAR),256) AS validIntegrity
      FROM PublishedSlip WHERE publicationId=${id} AND CAST(JSON_UNQUOTE(JSON_EXTRACT(snapshotJson,'$.slip.id')) AS BINARY)=CAST(${sourceSlipId} AS BINARY)
      ORDER BY \`rank\` LIMIT 1`);
    const row = rows[0];
    if (!row) continue;
    yield await readAuditedPublicationSnapshots(tx, new Map([[id, parent]]), [row], batches, Number(row.rank) - 1);
  }
}

/** Each day's historical addresses sort before the extended ranks of the requested band. */
async function* readOrderedBandPages(tx: Prisma.TransactionClient, parents: ReadonlyMap<string, Publication>,
  batches: ReadonlyMap<string, readonly AppendBatch[]>, band: BestSlipOddsBand, legacyDailyOrder: boolean, overlapDay?: ReportingDate) {
  const days = new Map<string, Map<string, Publication>>();
  for (const [id, parent] of parents) {
    const group = days.get(parent.day) ?? new Map<string, Publication>();
    group.set(id, parent);
    days.set(parent.day, group);
  }
  const overlap = overlapDay ? days.get(overlapDay) : undefined;
  if (overlapDay) days.delete(overlapDay);
  let chunk: PublishedSlipEntry[] = [];
  for (const day of overlap ? [overlap, ...days.values()] : days.values()) {
    for await (const entries of readOrderedDayBandPages(tx, day, batches, band, legacyDailyOrder && day !== overlap)) {
      if (chunk.length && (chunk.length + entries.length > 128 || day !== overlap && chunk[0]?.parent.day === overlapDay)) {
        yield chunk;
        chunk = [];
      }
      chunk.push(...entries);
    }
  }
  if (chunk.length) yield chunk;
}

async function* readOrderedDayBandPages(tx: Prisma.TransactionClient, parents: ReadonlyMap<string, Publication>,
  batches: ReadonlyMap<string, readonly AppendBatch[]>, band: BestSlipOddsBand, sortByProbability: boolean) {
  // Adjacent legacy bands can contribute old boundary quotes, so read them before the only extendable band in this stream.
  const ordered = new Map([...parents].filter(([, parent]) => parent.version < 3 || parent.oddsBand === band)
    .sort(([, a], [, b]) => Number(a.oddsBand === band) - Number(b.oddsBand === band)));
  const head: PublishedSlipEntry[] = [];
  let reachedExtension = false;
  const sortHead = () => head.sort((a, b) => (sortByProbability ? compareSlipDisplayProbability(a.snapshot.slip, b.snapshot.slip) : 0)
    || publicRank(a.parent, a.row.rank) - publicRank(b.parent, b.row.rank));
  for await (const entries of readAuditedPublicationPages(tx, ordered, batches)) {
    const matching = entries.filter(({ parent, snapshot, publishedAt }) => verifyPublishedOdds(parent, snapshot.slip, publishedAt) === band);
    if (!matching.length) continue;
    if (reachedExtension) {
      yield matching;
      continue;
    }
    const firstExtended = matching.findIndex(({ parent, row }) => parent.oddsBand !== undefined && row.rank > bestSlipBandLimit);
    if (firstExtended === -1) {
      head.push(...matching);
      continue;
    }
    head.push(...matching.slice(0, firstExtended));
    if (head.length) yield sortHead();
    reachedExtension = true;
    yield matching.slice(firstExtended);
  }
  if (!reachedExtension && head.length) yield sortHead();
}

/** Traverse every sealed rank in bounded primary-index pages without truncating a publication. */
async function* readAuditedPublicationPages(tx: Prisma.TransactionClient, parents: ReadonlyMap<string, Publication>,
  batches: ReadonlyMap<string, readonly AppendBatch[]>) {
  const size = 64;
  for (const [id, parent] of parents) {
    const scope = new Map([[id, parent]]), count = publicationCount(parent, batches.get(id));
    let after = 0;
    do {
      const expected = Math.min(size, count - after), last = after + expected === count;
      const rows = await tx.$queryRaw<RawSlipRow[]>(Prisma.sql`SELECT *,integrity=SHA2(CAST(snapshotJson AS CHAR),256) AS validIntegrity
        FROM PublishedSlip WHERE publicationId=${id} AND \`rank\`>${after} ORDER BY \`rank\` LIMIT ${expected + Number(last)}`);
      if (rows.length !== expected) fail("unavailable");
      yield await readAuditedPublicationSnapshots(tx, scope, rows, batches, after);
      after += expected;
    } while (after < count);
  }
}

async function readAuditedPublicationSnapshots(tx: Prisma.TransactionClient, parents: ReadonlyMap<string, Publication>,
  rows: readonly RawSlipRow[], batches: ReadonlyMap<string, readonly AppendBatch[]>, after?: number): Promise<readonly PublishedSlipEntry[]> {
  const counts = new Map([...parents].map(([id, parent]) => [id, publicationCount(parent, batches.get(id))]));
  if (after === undefined && rows.length !== [...counts.values()].reduce((sum, count) => sum + count, 0)) fail("unavailable");
  const checked = new Map<string, number>();
  const memberships = rows.map((stored) => {
    const row = { ...stored, rank: Number(stored.rank) };
    const parent = parents.get(row.publicationId), rank = (checked.get(row.publicationId) ?? after ?? 0) + 1;
    if (!parent || row.rank !== rank || rank > counts.get(row.publicationId)!) return fail("unavailable");
    checked.set(row.publicationId, rank);
    const appendBatch = rank > parent.count ? batches.get(row.publicationId)?.find((batch) =>
      rank >= batch.firstRank && rank < batch.firstRank + batch.count) : undefined;
    if ((rank > parent.count && !appendBatch) || (row.appendBatchId ?? null) !== (appendBatch?.id ?? null)) return fail("unavailable");
    return { row, parent, publishedAt: appendBatch?.publishedAt ?? parent.publishedAt, ...(appendBatch ? { appendBatch } : {}) };
  });
  const snapshots = await readSnapshots(tx, memberships.map(({ row }) => row));
  const windows = new Map<string, ReturnType<typeof bestSlipFixtureWindow>>();
  return memberships.map((membership, index) => {
    const snapshot = snapshots[index]!;
    if ((snapshot.estimatedProbability === undefined) !== Boolean(membership.appendBatch)) fail("unavailable");
    if (membership.appendBatch?.version === 2) {
      const day = membership.parent.day;
      const window = windows.get(day) ?? bestSlipFixtureWindow(parseReportingDate(day));
      windows.set(day, window);
      const { startInclusive, endExclusive } = window;
      if (snapshot.slip.selections.some(({ kickoffAt }) => kickoffAt < startInclusive || kickoffAt >= endExclusive)) fail("unavailable");
    }
    return { ...membership, snapshot };
  });
}

function publishedSlipView({ row, parent, snapshot, publishedAt }: PublishedSlipEntry, results: readonly SlipResult[],
  outcome = slipSnapshotOutcome(snapshot.slip, results), status = slipSnapshotStatus(snapshot.slip, results, outcome),
  completed = slipCompleted(snapshot.slip, results)): BestSlipView {
  const slip = { ...publicEditorialSlip(snapshot.slip),
    ...(snapshot.estimatedProbability === undefined ? {} : { estimatedProbability: snapshot.estimatedProbability }) };
  return { ...bestSlipView(slip, publicRank(parent, row.rank), true, slipMatchStatesFromResults(snapshot.slip.selections, results)),
    id: row.id, publicationDay: parseReportingDate(parent.day), publishedAt, outcome, status, completed,
    completedFixtureIds: completedSlipFixtureIds(snapshot.slip, results) };
}

async function readSnapshots(tx: Prisma.TransactionClient, rows: readonly SlipRow[]) {
  const legs = rows.length ? await tx.publishedSlipLeg.findMany({ where: { slipId: { in: rows.map((row) => row.id) } } }) : [];
  const membershipBySlip = new Map<string, typeof legs>();
  for (const leg of legs) {
    const group = membershipBySlip.get(leg.slipId) ?? []; group.push(leg); membershipBySlip.set(leg.slipId, group);
  }
  return rows.map((row) => {
    assertHistorySeal(row.validIntegrity);
    const value = snapshotSchema.parse(historyJson(row.snapshotJson));
    if (row.rank < 1 || row.rank > maximumBestSlipLocalRank || row.id !== evidenceFingerprint({ publicationId: row.publicationId, rank: row.rank, snapshot: value })) fail("unavailable");
    const membership = membershipBySlip.get(row.id) ?? [];
    if (membership.length !== value.slip.selections.length || value.slip.selections.some((selection) => !membership.some((leg) =>
      leg.fixtureId === selection.fixtureId && leg.cycleId === selection.forecast!.cycleId && leg.revisionId === selection.forecast!.revisionId))) fail("unavailable");
    return value;
  });
}

export async function readPublishedSlipHistory(query: PublishedSlipHistoryQuery): Promise<PublishedSlipHistory | null> {
  try {
    const database = getDatabase();
    if (isDevelopmentDemo()) {
      const range = validateReportingDateRange(query.from, query.to, publishedSlipRules.maximumDays);
      const { ensureDemoSlipDates } = await import("../demo/slips-seed.ts");
      await ensureDemoSlipDates(database, Array.from({ length: range.dayCount }, (_, index) => addReportingDays(range.startDate, index)));
    }
    return await readWithSlipAccess((viewer) => createPublishedSlips(database).history(query, viewer.tier === "free"));
  } catch { return null; }
}
