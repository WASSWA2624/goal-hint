import "server-only";

import { z } from "zod";
import { getPublicationDeadline, getReportingDate, parseReportingDate, utcInstantFromEpochMilliseconds, validateReportingDateRange } from "../../domain/calendar.ts";
import { bestSlipBandCriteria, bestSlipViews, compareBestSlips, jointSlipProbability, qualifiedJointModel, type BestSlip, type BestSlipView, type BestSlipsResult, type JointSlipModel } from "../../domain/best-slips.ts";
import { bestSlipOddsBands, bestSlipBandLimit, bestSlipOddsBandFor, bestSlipPublicationBands, bestSlipPublicRank, defaultBestSlipOddsBand, type BestSlipOddsBand } from "../../domain/best-slip-odds-bands.ts";
import { bestSlipsQueryRules, parseBestSlipsCursor, parseBestSlipsQuery, resolveBestSlipsDates, serializeBestSlipsQuery, type BestSlipsQuery } from "../../domain/best-slips-query.ts";
import type { ReportingDate } from "../../domain/calendar.ts";
import { parseDecimalOdds } from "../../domain/odds.ts";
import { publishedSlipRules, type PublishedSlipHistory, type PublishedSlipHistoryQuery } from "../../domain/published-slips.ts";
import { completedSlipFixtureIds, indexSlipResults, slipCompleted, slipSnapshotOutcome, slipSnapshotStatus, slipSnapshotSchema, slipResultView } from "../../domain/slip-snapshot.ts";
import { slipStatusCategory } from "../../domain/slip-status.ts";
import { predictionResults } from "../../domain/performance-summary.ts";
import { summarizeSlipPerformance } from "../../domain/slip-performance.ts";
import { slipMatchStatesFromResults } from "../../domain/slip-match-state.ts";
import { compareSlipDisplayProbability } from "../../domain/slip-pagination.ts";
import { parseSlipCriteria, serializeSlipCriteria, type BuiltSlip, type SlipCriteria } from "../../domain/slip-builder.ts";
import { getDatabase, type DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { assertHistorySeal, historyJson } from "../predictions/history-read.ts";
import { provenTrue } from "../shared/authority-proof.ts";
import { isDevelopmentDemo } from "../../domain/development-demo.ts";
import { addReportingDays } from "../../domain/calendar.ts";
import { bindSlipForecasts, readSlipForecastResults } from "./slip-forecast.ts";
import { readWithSlipAccess } from "./slip-access.ts";

const hash = z.string().regex(/^[a-f0-9]{64}$/u), instant = z.number().int().positive();
const modelSchema = z.strictObject({ id: hash, calibrationReference: z.string().trim().min(1).max(512),
  correlationReference: z.string().trim().min(1).max(512), validFrom: instant, validUntil: instant });
const oddsBandSchema = z.enum(bestSlipOddsBands.map(band => band.id));
const historyStatusSchema = z.enum(["all", ...predictionResults]);
const publicationSchema = z.strictObject({ version: z.union([z.literal(1), z.literal(2)]), oddsBand: oddsBandSchema.optional(), day: z.string().refine((value) => {
  try { parseReportingDate(value); return true; } catch { return false; }
}), publishedAt: instant, model: modelSchema, criteria: z.string().max(2048),
  count: z.number().int().min(1).max(publishedSlipRules.maximumDailySlips), searchLimited: z.boolean(), partialCoverage: z.boolean(),
}).refine((value) => value.model.validFrom <= value.publishedAt && value.publishedAt < value.model.validUntil
  && getReportingDate(utcInstantFromEpochMilliseconds(value.publishedAt)) === value.day
  && (value.version === 1 ? value.oddsBand === undefined && value.count <= 100 : value.oddsBand !== undefined && value.count <= bestSlipBandLimit));
const snapshotSchema = z.strictObject({ slip: slipSnapshotSchema, estimatedProbability: z.number().min(0).max(1) })
  .refine((value) => value.slip.selections.every((selection) => selection.forecast !== undefined), "Original forecasts are required.")
  .transform((value) => ({ ...value, slip: value.slip as BuiltSlip }));
type Publication = z.infer<typeof publicationSchema> & Readonly<{ bounds: SlipCriteria | null }>;
type PublicationRow = { id: string; eatDate: Date; oddsBand?: string; publishedAt: Date; modelId: string; bodyJson: unknown; validIntegrity: unknown };
type SlipRow = { id: string; publicationId: string; rank: number; snapshotJson: unknown; validIntegrity: unknown };
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
function publication(row: PublicationRow): Publication {
  assertHistorySeal(row.validIntegrity);
  const value = publicationSchema.parse(historyJson(row.bodyJson));
  if (row.id !== slipPublicationIdentity(value.day, value.oddsBand) || (row.oddsBand ?? "legacy") !== (value.oddsBand ?? "legacy") || row.eatDate.toISOString().slice(0, 10) !== value.day ||
    row.publishedAt.getTime() !== value.publishedAt || row.modelId !== value.model.id) fail("unavailable");
  return { ...value, bounds: value.oddsBand ? parseSlipCriteria(new URLSearchParams(value.criteria), value.day) : null };
}
/** Sealed publications retain their original bounds when the browsing policy changes. */
function verifyPublishedOdds(parent: Publication, totalOdds: string) {
  if (!parent.bounds) return;
  const value = BigInt(totalOdds.replace(".", ""));
  if (value < BigInt(parent.bounds.totalMin) || parent.bounds.totalMax !== undefined && value > BigInt(parent.bounds.totalMax)) fail("unavailable");
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

/** Append-only editorial publications, independent of member saves, erasure and visitor requests. */
export function createPublishedSlips(database: DatabaseRuntime, {
  bindForecasts = bindSlipForecasts, resolveResults = readSlipForecastResults,
}: { bindForecasts?: typeof bindSlipForecasts; resolveResults?: typeof readSlipForecastResults } = {}) {
  const transaction = <T>(run: (tx: Prisma.TransactionClient) => Promise<T>) => database.transaction(run,
    { isolationLevel: "RepeatableRead", timeout: 30_000 });
  return Object.freeze({
    async publishedBands(day: string): Promise<readonly (BestSlipOddsBand | "legacy")[]> {
      parseReportingDate(day);
      return transaction(async tx => {
        const rows = await tx.$queryRaw<PublicationRow[]>`SELECT *,integrity=SHA2(CAST(bodyJson AS CHAR),256) AS validIntegrity
          FROM DailySlipPublication WHERE eatDate=${new Date(`${day}T00:00:00Z`)}`;
        return rows.map(row => publication(row).oddsBand ?? "legacy");
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
      const ids = new Set<string>();
      if (!input.slips.length || input.slips.length > bestSlipBandLimit) fail("invalid-input");
      const proposed = [...input.slips].sort(compareBestSlips).map(({ estimatedProbability, ...slip }) => {
        const snapshot = slipSnapshotSchema.parse(slip);
        if (jointSlipProbability(input.model, snapshot as BuiltSlip) !== estimatedProbability) fail("invalid-input");
        const denominator = 100n ** BigInt(snapshot.selections.length);
        const product = snapshot.selections.reduce((value, selection) => value * BigInt(selection.odds.replace(".", "")), 1n);
        const quoted = BigInt(snapshot.totalOdds.replace(".", ""));
        const rounded = (product * 200n + denominator) / (2n * denominator);
        const criteria = bestSlipBandCriteria(input.day, oddsBand);
        const average = snapshot.selections.reduce((value, selection) => value + selection.probability, 0) / snapshot.selections.length;
        if (snapshot.selections.length < criteria.teamsMin || criteria.teamsMax !== undefined && snapshot.selections.length > criteria.teamsMax
          || bestSlipOddsBandFor(snapshot.totalOdds) !== oddsBand || quoted !== rounded || product * 100n < BigInt(criteria.totalMin) * denominator
          || criteria.totalMax !== undefined && product * 100n > BigInt(criteria.totalMax) * denominator
          || Math.abs(average - snapshot.averageProbability) > Number.EPSILON * snapshot.selections.length * 2) fail("invalid-input");
        for (const selection of snapshot.selections) {
          if (parseDecimalOdds(selection.odds) === null || ids.has(selection.fixtureId)
            || getReportingDate(utcInstantFromEpochMilliseconds(selection.kickoffAt)) !== input.day) fail("invalid-input");
          ids.add(selection.fixtureId);
        }
        return { slip: snapshot as BuiltSlip, estimatedProbability };
      });
      // Locks are acquired by fixture identity across the entire batch, before any individual binding.
      // Competing publishers and lifecycle/result writers use the same order, avoiding crossed-slip deadlocks.
      return transaction(async (tx) => {
        authorized(await databaseTime(tx));
        const id = slipPublicationIdentity(input.day, oddsBand);
        const existingDay = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM DailySlipPublication
          WHERE eatDate=${new Date(`${input.day}T00:00:00Z`)} AND oddsBand IN ('legacy',${oddsBand})`;
        if (existingDay.length) return "already-published";
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
        const body = publicationSchema.parse({ version: 2, oddsBand, day: input.day, publishedAt: at,
          model: { id: slipModelIdentity(input.model), calibrationReference: input.model.calibrationReference,
            correlationReference: input.model.correlationReference, validFrom: input.model.validFrom, validUntil: input.model.validUntil },
          criteria: serializeSlipCriteria(bestSlipBandCriteria(input.day, oddsBand)).toString(), count: snapshots.length,
          searchLimited: input.searchLimited, partialCoverage: input.partialCoverage });
        const json = JSON.stringify(body);
        const inserted = await tx.$executeRaw`INSERT IGNORE INTO DailySlipPublication (id,eatDate,oddsBand,publishedAt,modelId,bodyJson,integrity)
          VALUES (${id},${new Date(`${input.day}T00:00:00Z`)},${oddsBand},${new Date(at)},${body.model.id},JSON_EXTRACT(${json},'$'),SHA2(CAST(JSON_EXTRACT(${json},'$') AS CHAR),256))`;
        if (inserted === 0) {
          // IGNORE may suppress a non-duplicate constraint failure. Only a current locked row proves a prior publication;
          // a plain repeatable-read lookup could miss another publisher's intervening commit.
          const existing = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM DailySlipPublication WHERE eatDate=${new Date(`${input.day}T00:00:00Z`)} AND oddsBand=${oddsBand} FOR SHARE`;
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
          await tx.publishedSlipLeg.createMany({ data: snapshot.slip.selections.map((selection) => ({ slipId, fixtureId: selection.fixtureId,
            cycleId: selection.forecast!.cycleId, revisionId: selection.forecast!.revisionId })) });
        }
        const committedAt = await databaseTime(tx); authorized(committedAt);
        if (snapshots.some((item) => item.slip.selections.some((selection) => committedAt >= getPublicationDeadline(utcInstantFromEpochMilliseconds(selection.kickoffAt))))) fail("invalid-input");
        return "published";
      });
    },
    async day(day: string, completedOnly = false, oddsBand?: BestSlipOddsBand): Promise<BestSlipsResult | null> {
      parseReportingDate(day);
      return transaction(async tx => {
        const rows = await tx.$queryRaw<PublicationRow[]>`SELECT *,integrity=SHA2(CAST(bodyJson AS CHAR),256) AS validIntegrity
          FROM DailySlipPublication WHERE eatDate=${new Date(`${day}T00:00:00Z`)}`;
        if (!rows.length) return null;
        const parents = new Map(rows.map(row => [row.id, publication(row)]));
        const asOf = await databaseTime(tx);
        if (rows.length > bestSlipOddsBands.length || [...parents.values()].some(parent => parent.publishedAt > asOf)) fail("unavailable");
        const items = await tx.$queryRaw<SlipRow[]>(Prisma.sql`SELECT *,integrity=SHA2(CAST(snapshotJson AS CHAR),256) AS validIntegrity
          FROM PublishedSlip WHERE publicationId IN (${Prisma.join([...parents.keys()])}) ORDER BY publicationId,\`rank\``);
        const snapshots = await readSnapshots(tx, items);
        for (const [id, parent] of parents) {
          const family = items.filter(row => row.publicationId === id);
          if (family.length !== parent.count || family.some((row, index) => row.rank !== index + 1)) fail("unavailable");
        }
        const results = await resolveResults(tx, snapshots.flatMap(snapshot => snapshot.slip.selections), asOf);
        const resultsFor = indexSlipResults(results);
        const views: BestSlipView[] = [];
        for (const [index, row] of items.entries()) {
          const snapshot = snapshots[index]!, parent = parents.get(row.publicationId)!;
          const band = bestSlipOddsBandFor(snapshot.slip.totalOdds);
          verifyPublishedOdds(parent, snapshot.slip.totalOdds);
          if (oddsBand && oddsBand !== band) continue;
          const slipResults = resultsFor(snapshot.slip), completed = slipCompleted(snapshot.slip, slipResults);
          if (completedOnly && !completed) continue;
          const [view] = bestSlipViews([{ ...snapshot.slip, estimatedProbability: snapshot.estimatedProbability }], true,
            slipMatchStatesFromResults(snapshot.slip.selections, slipResults));
          views.push({ ...view!, id: row.id, rank: publicRank(parent, row.rank), publicationDay: parseReportingDate(day), publishedAt: parent.publishedAt,
            outcome: slipSnapshotOutcome(snapshot.slip, slipResults), status: slipSnapshotStatus(snapshot.slip, slipResults), completed,
            completedFixtureIds: completedSlipFixtureIds(snapshot.slip, slipResults) });
        }
        views.sort((a,b) => a.rank - b.rank);
        const statistics = { total: views.length, won: 0, lost: 0, pending: 0, void: 0, cancelled: 0 };
        for (const view of views) statistics[slipStatusCategory(view.status ?? "pending")]++;
        return { day: parseReportingDate(day), state: "generated", slips: views, statistics,
          searchLimited: [...parents.values()].some(parent => parent.searchLimited), partialCoverage: [...parents.values()].some(parent => parent.partialCoverage) };
      });
    },
    /** Date/result browsing reuses original-cycle adjudication and keeps active rows behind the caller's access gate. */
    async browse(input: BestSlipsQuery, today: ReportingDate, completedOnly = false): Promise<BestSlipsResult> {
      const query = parseBestSlipsQuery(serializeBestSlipsQuery(input), today), dates = resolveBestSlipsDates(query, today);
      const cursor = query.cursor === undefined ? null : parseBestSlipsCursor(query.cursor), allDates = query.period === "all";
      // A daily view fits in one batch. Archive traversal follows publication date and rank.
      const dailyView = dates.from !== null && dates.from === dates.to;
      return transaction(async (tx) => {
        const asOf = await databaseTime(tx);
        const scope = allDates ? cursor ? Prisma.sql`AND eatDate<=${new Date(`${cursor.day}T00:00:00Z`)}` : Prisma.empty
          : Prisma.sql`AND eatDate>=${new Date(`${dates.from}T00:00:00Z`)} AND eatDate<=${new Date(`${dates.to}T00:00:00Z`)}`;
        const sourceBands = bestSlipPublicationBands(query.oddsBand);
        const publicationLimit = (allDates ? bestSlipsQueryRules.scanDays : bestSlipsQueryRules.maximumDays) * sourceBands.length;
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
        const statistics = { total: 0, won: 0, lost: 0, pending: 0, void: 0, cancelled: 0 };
        const views: BestSlipView[] = [];
        let total = 0;
        const membership: string[] = [];
        const offset = (query.page - 1) * bestSlipsQueryRules.pageSize;
        for (let start = 0; start < selected.length; start += bestSlipsQueryRules.scanDays) {
          const batch = selected.slice(start, start + bestSlipsQueryRules.scanDays);
          const rows = await tx.$queryRaw<SlipRow[]>(Prisma.sql`SELECT *,integrity=SHA2(CAST(snapshotJson AS CHAR),256) AS validIntegrity
            FROM PublishedSlip WHERE publicationId IN (${Prisma.join(batch.map((row) => row.id))}) ORDER BY publicationId,\`rank\`
            LIMIT ${bestSlipsQueryRules.scanDays * publishedSlipRules.maximumDailySlips + 1}`);
          if (rows.length !== batch.reduce((count, row) => count + parents.get(row.id)!.count, 0)) fail("unavailable");
          const siblings = new Map<string, SlipRow[]>();
          for (const row of rows) {
            if (!parents.has(row.publicationId)) fail("unavailable");
            const family = siblings.get(row.publicationId) ?? []; family.push(row); siblings.set(row.publicationId, family);
          }
          for (const row of batch) {
            const family = siblings.get(row.id) ?? [];
            if (family.length !== parents.get(row.id)!.count || family.some((slip, index) => slip.rank !== index + 1)) fail("unavailable");
          }
          const snapshots = await readSnapshots(tx, rows);
          const results = await resolveResults(tx, snapshots.flatMap((snapshot) => snapshot.slip.selections), asOf);
          const resultsFor = indexSlipResults(results);
          const ordered = rows.map((row, index) => ({ row, snapshot: snapshots[index]!, parent: parents.get(row.publicationId)! }))
            .sort((left, right) => (dailyView ? compareSlipDisplayProbability(left.snapshot.slip, right.snapshot.slip) : 0)
              || right.parent.day.localeCompare(left.parent.day) || publicRank(left.parent, left.row.rank) - publicRank(right.parent, right.row.rank));
          for (const { row, snapshot, parent } of ordered) {
            const band = bestSlipOddsBandFor(snapshot.slip.totalOdds);
            verifyPublishedOdds(parent, snapshot.slip.totalOdds);
            if (band !== (query.oddsBand ?? defaultBestSlipOddsBand)) continue;
            const slipResults = resultsFor(snapshot.slip);
            const completed = slipCompleted(snapshot.slip, slipResults);
            if (completedOnly && !completed) continue;
            const outcome = slipSnapshotOutcome(snapshot.slip, slipResults), status = slipSnapshotStatus(snapshot.slip, slipResults, outcome);
            const category = slipStatusCategory(status);
            statistics.total++; statistics[category]++;
            if (cursor && (parent.day > cursor.day || parent.day === cursor.day && publicRank(parent, row.rank) <= cursor.rank)) continue;
            if (query.status !== "all" && category !== query.status) continue;
            membership.push(row.id);
            const position = total++;
            if (allDates ? views.length > bestSlipsQueryRules.pageSize : position < offset || position >= offset + bestSlipsQueryRules.pageSize) continue;
            const slip: BestSlip = { ...snapshot.slip, estimatedProbability: snapshot.estimatedProbability };
            const [view] = bestSlipViews([slip], true, slipMatchStatesFromResults(slip.selections, slipResults));
            views.push({ ...view!, id: row.id, rank: publicRank(parent, row.rank), publicationDay: parseReportingDate(parent.day), publishedAt: parent.publishedAt, outcome, status, completed, completedFixtureIds: completedSlipFixtureIds(snapshot.slip, slipResults) });
          }
        }
        const retained = views.slice(0, bestSlipsQueryRules.pageSize), overflow = views.length > retained.length;
        const last = retained.at(-1), oldest = selected.at(-1);
        const nextCursor = allDates && overflow && last ? `${last.publicationDay}:${last.rank}`
          : allDates && hasOlder && oldest ? `${parents.get(oldest.id)!.day}:${publishedSlipRules.maximumDailySlips}` : null;
        return { day: today, state: "generated", slips: retained,
          searchLimited: [...parents.values()].some((value) => value.searchLimited),
          partialCoverage: [...parents.values()].some((value) => value.partialCoverage), statistics: allDates ? null : statistics,
          browse: { query, version: allDates ? null : evidenceFingerprint(membership), total: allDates ? null : total, pageSize: bestSlipsQueryRules.pageSize,
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
        const publicationLimit = publishedSlipRules.maximumDays * sourceBands.length;
        const publications = await tx.$queryRaw<PublicationRow[]>(Prisma.sql`SELECT *,integrity=SHA2(CAST(bodyJson AS CHAR),256) AS validIntegrity
          FROM DailySlipPublication WHERE eatDate>=${new Date(`${query.from}T00:00:00Z`)} AND eatDate<=${new Date(`${query.to}T00:00:00Z`)}
          AND oddsBand IN ('legacy',${Prisma.join([...sourceBands])}) AND publishedAt<=${new Date(asOf)} ORDER BY eatDate DESC LIMIT ${publicationLimit + 1}`);
        if (publications.length > publicationLimit) fail("unavailable");
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
        const resultsFor = indexSlipResults(results);
        const samples = [], records = [];
        for (const [index, row] of rows.entries()) {
          const parent = parents.get(row.publicationId)!, snapshot = snapshots[index]!;
          const band = bestSlipOddsBandFor(snapshot.slip.totalOdds);
          verifyPublishedOdds(parent, snapshot.slip.totalOdds);
          if (band !== (query.oddsBand ?? defaultBestSlipOddsBand)) continue;
          const slipResults = resultsFor(snapshot.slip);
          if (completedOnly && !slipCompleted(snapshot.slip, slipResults)) continue;
          const publishedAt = new Date(parent.publishedAt).toISOString();
          const view = slipResultView(row.id, publishedAt, snapshot.slip, slipResults);
          const outcome = view?.outcome ?? slipSnapshotOutcome(snapshot.slip, slipResults);
          const status = view?.status ?? slipSnapshotStatus(snapshot.slip, slipResults, outcome);
          samples.push({ id: row.id, publishedAt: parent.publishedAt, rank: publicRank(parent, row.rank),
            totalOdds: view ? snapshot.slip.totalOdds : "", outcome, status });
          // Until every original cycle has ended, no selections, quote or probabilities leave this boundary.
          if (view && (query.status === "all" || slipStatusCategory(status) === query.status)) records.push({ ...view, publicationDay: parent.day, publishedAt, modelId: parent.model.id,
            rank: publicRank(parent, row.rank), estimatedProbability: snapshot.estimatedProbability });
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
  const membershipBySlip = new Map<string, typeof legs>();
  for (const leg of legs) {
    const group = membershipBySlip.get(leg.slipId) ?? []; group.push(leg); membershipBySlip.set(leg.slipId, group);
  }
  return rows.map((row) => {
    assertHistorySeal(row.validIntegrity);
    const value = snapshotSchema.parse(historyJson(row.snapshotJson));
    if (row.rank < 1 || row.rank > publishedSlipRules.maximumDailySlips || row.id !== evidenceFingerprint({ publicationId: row.publicationId, rank: row.rank, snapshot: value })) fail("unavailable");
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
