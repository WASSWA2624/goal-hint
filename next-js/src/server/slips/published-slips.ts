import "server-only";

import { z } from "zod";
import { getPublicationDeadline, getReportingDate, parseReportingDate, utcInstantFromEpochMilliseconds, validateReportingDateRange } from "../../domain/calendar.ts";
import { bestSlipCriteria, bestSlipViews, compareBestSlips, jointSlipProbability, qualifiedJointModel, type BestSlip, type BestSlipsResult, type JointSlipModel } from "../../domain/best-slips.ts";
import { publishedSlipRules, type PublishedSlipHistory, type PublishedSlipHistoryQuery } from "../../domain/published-slips.ts";
import { savedSlipOutcome, savedSlipSnapshotSchema, savedSlipView } from "../../domain/saved-slips.ts";
import { summarizeSlipPerformance } from "../../domain/slip-performance.ts";
import { serializeSlipCriteria, type BuiltSlip } from "../../domain/slip-builder.ts";
import { getDatabase, type DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { assertHistorySeal, historyJson } from "../predictions/history-read.ts";
import { provenTrue } from "../shared/authority-proof.ts";
import { isDevelopmentDemo } from "../../domain/development-demo.ts";
import { addReportingDays } from "../../domain/calendar.ts";
import { bindSlipForecasts, readSlipForecastResults } from "./slip-forecast.ts";

const hash = z.string().regex(/^[a-f0-9]{64}$/u), instant = z.number().int().positive();
const modelSchema = z.strictObject({ id: hash, calibrationReference: z.string().trim().min(1).max(512),
  correlationReference: z.string().trim().min(1).max(512), validFrom: instant, validUntil: instant });
const publicationSchema = z.strictObject({ version: z.literal(1), day: z.string().refine((value) => {
  try { parseReportingDate(value); return true; } catch { return false; }
}), publishedAt: instant, model: modelSchema, criteria: z.string().max(2048),
  count: z.number().int().min(1).max(publishedSlipRules.maximumDailySlips), searchLimited: z.boolean(), partialCoverage: z.boolean(),
}).refine((value) => value.model.validFrom <= value.publishedAt && value.publishedAt < value.model.validUntil
  && getReportingDate(utcInstantFromEpochMilliseconds(value.publishedAt)) === value.day);
const snapshotSchema = z.strictObject({ slip: savedSlipSnapshotSchema, estimatedProbability: z.number().min(0).max(1) })
  .refine((value) => value.slip.selections.every((selection) => selection.forecast !== undefined), "Original forecasts are required.")
  .transform((value) => ({ ...value, slip: value.slip as BuiltSlip }));
type Publication = z.infer<typeof publicationSchema>;
type PublicationRow = { id: string; eatDate: Date; publishedAt: Date; modelId: string; bodyJson: unknown; validIntegrity: unknown };
type SlipRow = { id: string; publicationId: string; rank: number; snapshotJson: unknown; validIntegrity: unknown };
export class SlipPublicationError extends Error {
  readonly reason: "invalid-input" | "unauthorized" | "unavailable";
  constructor(reason: SlipPublicationError["reason"]) {
    super(`Slip publication ${reason}; private diagnostics are withheld.`); this.name = "SlipPublicationError"; this.reason = reason;
  }
}
const fail = (reason: SlipPublicationError["reason"]): never => { throw new SlipPublicationError(reason); };
const publicationId = (day: string) => evidenceFingerprint({ kind: "daily-best-slips", version: 1, day });
export function slipModelIdentity(model: JointSlipModel) {
  return evidenceFingerprint({ calibrationReference: model.calibrationReference, correlationReference: model.correlationReference,
    validFrom: model.validFrom, validUntil: model.validUntil });
}
function publication(row: PublicationRow): Publication {
  assertHistorySeal(row.validIntegrity);
  const value = publicationSchema.parse(historyJson(row.bodyJson));
  if (row.id !== publicationId(value.day) || row.eatDate.toISOString().slice(0, 10) !== value.day ||
    row.publishedAt.getTime() !== value.publishedAt || row.modelId !== value.model.id) fail("unavailable");
  return value;
}
const databaseTime = async (tx: Prisma.TransactionClient) => (await tx.$queryRaw<{ at: Date }[]>`SELECT UTC_TIMESTAMP(3) AS at`)[0]!.at.getTime();
export function parsePublishedSlipHistoryQuery(input: PublishedSlipHistoryQuery): PublishedSlipHistoryQuery {
  try {
    validateReportingDateRange(input.from, input.to, publishedSlipRules.maximumDays);
    if (!Number.isSafeInteger(input.page) || input.page < 1 || input.page > 9999 || !Number.isSafeInteger(input.pageSize)
      || input.pageSize < 1 || input.pageSize > publishedSlipRules.maximumPageSize) fail("invalid-input");
    return input;
  } catch { return fail("invalid-input"); }
}

/** Append-only editorial publications, independent of member saves, erasure and visitor requests. */
export function createPublishedSlips(database: DatabaseRuntime, {
  bindForecasts = bindSlipForecasts, resolveResults = readSlipForecastResults,
}: { bindForecasts?: typeof bindSlipForecasts; resolveResults?: typeof readSlipForecastResults } = {}) {
  const transaction = <T>(run: (tx: Prisma.TransactionClient) => Promise<T>) => database.transaction(run,
    { isolationLevel: "RepeatableRead", timeout: 30_000 });
  return Object.freeze({
    async publish(input: Readonly<{ day: string; slips: readonly BestSlip[]; model: JointSlipModel;
      searchLimited: boolean; partialCoverage: boolean; verifyModel: (model: JointSlipModel) => boolean;
      verifyPublicOdds: () => boolean }>): Promise<"published" | "already-published"> {
      const authorized = (at: number) => {
        if (!provenTrue(() => input.verifyModel(input.model)) || !provenTrue(() => input.verifyPublicOdds())) fail("unauthorized");
        if (!qualifiedJointModel(input.model, at) || getReportingDate(utcInstantFromEpochMilliseconds(at)) !== input.day) fail("invalid-input");
      };
      const ids = new Set<string>();
      if (!input.slips.length || input.slips.length > publishedSlipRules.maximumDailySlips) fail("invalid-input");
      const proposed = [...input.slips].sort(compareBestSlips).map(({ estimatedProbability, ...slip }) => {
        const snapshot = savedSlipSnapshotSchema.parse(slip);
        if (jointSlipProbability(input.model, snapshot as BuiltSlip) !== estimatedProbability) fail("invalid-input");
        const denominator = 100n ** BigInt(snapshot.selections.length);
        const product = snapshot.selections.reduce((value, selection) => value * BigInt(selection.odds.replace(".", "")), 1n);
        const quoted = BigInt(snapshot.totalOdds.replace(".", ""));
        const rounded = (product * 200n + denominator) / (2n * denominator);
        const criteria = bestSlipCriteria(input.day);
        const average = snapshot.selections.reduce((value, selection) => value + selection.probability, 0) / snapshot.selections.length;
        if (quoted !== rounded || product * 100n < BigInt(criteria.totalMin) * denominator || product * 100n > BigInt(criteria.totalMax) * denominator ||
          Math.abs(average - snapshot.averageProbability) > Number.EPSILON * snapshot.selections.length * 2) fail("invalid-input");
        for (const selection of snapshot.selections) {
          if (ids.has(selection.fixtureId) || getReportingDate(utcInstantFromEpochMilliseconds(selection.kickoffAt)) !== input.day) fail("invalid-input");
          ids.add(selection.fixtureId);
        }
        return { slip: snapshot as BuiltSlip, estimatedProbability };
      });
      // Locks are acquired by fixture identity across the entire batch, before any individual binding.
      // Competing publishers and lifecycle/result writers use the same order, avoiding crossed-slip deadlocks.
      return transaction(async (tx) => {
        authorized(await databaseTime(tx));
        const id = publicationId(input.day);
        if (await tx.dailySlipPublication.findUnique({ where: { eatDate: new Date(`${input.day}T00:00:00Z`) }, select: { id: true } })) return "already-published";
        const fixtureIds = [...ids].sort();
        for (const fixtureId of fixtureIds) await tx.$queryRaw`SELECT id FROM FootballFixture WHERE id=${fixtureId} FOR SHARE`;
        const snapshots: z.infer<typeof snapshotSchema>[] = [];
        for (const item of proposed) {
          const slip = await bindForecasts(tx, item.slip, await databaseTime(tx));
          if (!slip) fail("invalid-input");
          snapshots.push(snapshotSchema.parse({ slip, estimatedProbability: item.estimatedProbability }));
        }
        const at = await databaseTime(tx); authorized(at);
        if (snapshots.some((item) => item.slip.selections.some((selection) => at >= getPublicationDeadline(utcInstantFromEpochMilliseconds(selection.kickoffAt))))) fail("invalid-input");
        const body = publicationSchema.parse({ version: 1, day: input.day, publishedAt: at,
          model: { id: slipModelIdentity(input.model), calibrationReference: input.model.calibrationReference,
            correlationReference: input.model.correlationReference, validFrom: input.model.validFrom, validUntil: input.model.validUntil },
          criteria: serializeSlipCriteria(bestSlipCriteria(input.day)).toString(), count: snapshots.length,
          searchLimited: input.searchLimited, partialCoverage: input.partialCoverage });
        const json = JSON.stringify(body);
        const inserted = await tx.$executeRaw`INSERT IGNORE INTO DailySlipPublication (id,eatDate,publishedAt,modelId,bodyJson,integrity)
          VALUES (${id},${new Date(`${input.day}T00:00:00Z`)},${new Date(at)},${body.model.id},JSON_EXTRACT(${json},'$'),SHA2(CAST(JSON_EXTRACT(${json},'$') AS CHAR),256))`;
        if (inserted === 0) {
          // IGNORE may suppress a non-duplicate constraint failure. Only a current locked row proves a prior publication;
          // a plain repeatable-read lookup could miss another publisher's intervening commit.
          const existing = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM DailySlipPublication WHERE eatDate=${new Date(`${input.day}T00:00:00Z`)} FOR SHARE`;
          if (existing[0]?.id !== id) fail("unavailable");
          return "already-published";
        }
        for (const [index, snapshot] of snapshots.entries()) {
          const rank = index + 1, slipId = evidenceFingerprint({ publicationId: id, rank, snapshot });
          const snapshotJson = JSON.stringify(snapshot);
          await tx.$executeRaw`INSERT INTO PublishedSlip (id,publicationId,\`rank\`,snapshotJson,integrity)
            VALUES (${slipId},${id},${rank},JSON_EXTRACT(${snapshotJson},'$'),SHA2(CAST(JSON_EXTRACT(${snapshotJson},'$') AS CHAR),256))`;
          await tx.publishedSlipLeg.createMany({ data: snapshot.slip.selections.map((selection) => ({ slipId, fixtureId: selection.fixtureId,
            cycleId: selection.forecast!.cycleId, revisionId: selection.forecast!.revisionId })) });
        }
        const committedAt = await databaseTime(tx); authorized(committedAt);
        if (snapshots.some((item) => item.slip.selections.some((selection) => committedAt >= getPublicationDeadline(utcInstantFromEpochMilliseconds(selection.kickoffAt))))) fail("invalid-input");
        return "published";
      });
    },
    async day(day: string): Promise<BestSlipsResult | null> {
      parseReportingDate(day);
      return transaction(async (tx) => {
        const rows = await tx.$queryRaw<PublicationRow[]>`SELECT *,integrity=SHA2(CAST(bodyJson AS CHAR),256) AS validIntegrity
          FROM DailySlipPublication WHERE eatDate=${new Date(`${day}T00:00:00Z`)}`;
        if (!rows.length) return null;
        const value = publication(rows[0]!);
        if (value.publishedAt > await databaseTime(tx)) fail("unavailable");
        const rowsOfSlips = await tx.$queryRaw<SlipRow[]>`SELECT *,integrity=SHA2(CAST(snapshotJson AS CHAR),256) AS validIntegrity
          FROM PublishedSlip WHERE publicationId=${rows[0]!.id} ORDER BY \`rank\``;
        const snapshots = await readSnapshots(tx, rowsOfSlips);
        if (snapshots.length !== value.count || rowsOfSlips.some((row, index) => row.rank !== index + 1)) fail("unavailable");
        const results = await resolveResults(tx, snapshots.flatMap((snapshot) => snapshot.slip.selections), await databaseTime(tx));
        const statistics = { total: snapshots.length, won: 0, lost: 0, pending: 0, void: 0 };
        snapshots.forEach((snapshot) => {
          statistics[savedSlipOutcome(snapshot.slip, results)]++;
        });
        return { day: parseReportingDate(day), state: "generated", slips: bestSlipViews(snapshots.map((snapshot) =>
          ({ ...snapshot.slip, estimatedProbability: snapshot.estimatedProbability })), true),
          searchLimited: value.searchLimited, partialCoverage: value.partialCoverage, statistics };
      });
    },
    async history(input: PublishedSlipHistoryQuery): Promise<PublishedSlipHistory> {
      const query = parsePublishedSlipHistoryQuery(input);
      return transaction(async (tx) => {
        const asOf = await databaseTime(tx);
        const publications = await tx.$queryRaw<PublicationRow[]>`SELECT *,integrity=SHA2(CAST(bodyJson AS CHAR),256) AS validIntegrity
          FROM DailySlipPublication WHERE eatDate>=${new Date(`${query.from}T00:00:00Z`)} AND eatDate<=${new Date(`${query.to}T00:00:00Z`)}
          AND publishedAt<=${new Date(asOf)} ORDER BY eatDate DESC LIMIT 32`;
        if (publications.length > publishedSlipRules.maximumDays) fail("unavailable");
        const parents = new Map(publications.map((row) => [row.id, publication(row)]));
        const rows = publications.length ? await tx.$queryRaw<SlipRow[]>(Prisma.sql`SELECT *,integrity=SHA2(CAST(snapshotJson AS CHAR),256) AS validIntegrity
          FROM PublishedSlip WHERE publicationId IN (${Prisma.join([...parents.keys()])}) ORDER BY publicationId,\`rank\`
          LIMIT ${publishedSlipRules.maximumDays * publishedSlipRules.maximumDailySlips + 1}`) : [];
        if (rows.length !== [...parents.values()].reduce((sum, value) => sum + value.count, 0)) fail("unavailable");
        const snapshots = await readSnapshots(tx, rows);
        for (const id of parents.keys()) {
          const siblings = rows.filter((row) => row.publicationId === id);
          if (siblings.length !== parents.get(id)!.count || siblings.some((row, index) => row.rank !== index + 1)) fail("unavailable");
        }
        const results = await resolveResults(tx, snapshots.flatMap((snapshot) => snapshot.slip.selections), asOf);
        const samples = [], records = [];
        for (const [index, row] of rows.entries()) {
          const parent = parents.get(row.publicationId)!, snapshot = snapshots[index]!;
          const publishedAt = new Date(parent.publishedAt).toISOString();
          const view = savedSlipView(row.id, publishedAt, snapshot.slip, results);
          samples.push({ id: row.id, publishedAt: parent.publishedAt, rank: row.rank,
            totalOdds: view ? snapshot.slip.totalOdds : "", outcome: view?.outcome ?? savedSlipOutcome(snapshot.slip, results) });
          // Until every original cycle has ended, no selections, quote or probabilities leave this boundary.
          if (view) records.push({ ...view, publicationDay: parent.day, publishedAt, modelId: parent.model.id,
            rank: row.rank, estimatedProbability: snapshot.estimatedProbability });
        }
        records.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.rank - b.rank);
        return { asOf, records: records.slice((query.page - 1) * query.pageSize, query.page * query.pageSize),
          total: records.length, page: query.page, pageSize: query.pageSize, statistics: summarizeSlipPerformance(samples) };
      });
    },
  });
}

async function readSnapshots(tx: Prisma.TransactionClient, rows: readonly SlipRow[]) {
  const legs = rows.length ? await tx.publishedSlipLeg.findMany({ where: { slipId: { in: rows.map((row) => row.id) } } }) : [];
  return rows.map((row) => {
    assertHistorySeal(row.validIntegrity);
    const value = snapshotSchema.parse(historyJson(row.snapshotJson));
    if (row.rank < 1 || row.rank > publishedSlipRules.maximumDailySlips || row.id !== evidenceFingerprint({ publicationId: row.publicationId, rank: row.rank, snapshot: value })) fail("unavailable");
    const membership = legs.filter((leg) => leg.slipId === row.id);
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
    return await createPublishedSlips(database).history(query);
  } catch { return null; }
}
