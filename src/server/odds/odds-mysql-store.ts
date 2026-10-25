import "server-only";

import { z } from "zod";
import { utcInstantFromEpochMilliseconds, type UtcInstant } from "../../domain/calendar.ts";
import { launchOddsGroup, launchOddsMapping } from "../../domain/odds-markets.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint, evidenceSerialize, freezeEvidence } from "../evidence/evidence-input.ts";
import type { NormalizedFixtureOdds } from "../football/api-football-normalize.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { assertHistorySeal, historyJson } from "../predictions/history-read.ts";
import { OddsError, oddsFail, type OddsApplyResult, type OddsBatchBody, type OddsPolicy } from "./odds-contract.ts";

type Tx = Prisma.TransactionClient;
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const instant = z.number().int().min(0).max(253_402_300_799_999);
const provenanceSchema = z.strictObject({ provider: z.literal("api-football"), endpoint: z.enum(["odds", "oddsBets", "oddsBookmakers"]),
  requestParameters: z.record(z.string(), z.string().max(512)), contractVersion: z.string().max(64), retrievedAt: instant,
  providerUpdatedAt: instant.nullable(), fromCache: z.boolean(), currentPage: z.number().int().positive().nullable(),
  totalPages: z.number().int().positive().nullable() });
const batchSchema = z.strictObject({
  id: hash, accountId: hash, kind: z.enum(["prices", "bets", "bookmakers"]), scopeKey: z.string().min(1).max(96), policyHash: hash,
  status: z.enum(["complete", "partial", "failed"]), requestsDispatched: z.number().int().nonnegative().max(4_294_967_295),
  receivedAt: instant, requestId: hash, slot: instant, date: z.iso.date().nullable(), contractVersion: z.string().min(1).max(64),
  reasons: z.array(z.string().regex(/^[a-z-]{1,64}$/u)).max(64), missingCoverage: z.array(z.string().max(128)).max(5_000),
  pages: z.array(provenanceSchema).max(1_000),
  fixtures: z.array(z.strictObject({ externalId: z.number().int().positive(), observationHash: hash,
    outcome: z.enum(["apply", "unknown-fixture", "after-kickoff", "kickoff-mismatch", "not-scheduled"]) })).max(10_000),
  catalog: z.array(z.strictObject({ id: z.number().int().positive(), name: z.string().min(1).max(256) })).max(5_000),
});
export const storedOddsBatchSchema = batchSchema;
const snapshotValues = z.array(z.strictObject({ label: z.string().min(1).max(64), odd: z.string().min(1).max(12) })).min(1).max(1_000);
export const storedOddsSnapshotSchema = z.strictObject({ id: hash, fixtureId: z.uuid(), previousId: hash.nullable(), bookmakerId: z.number().int().positive(),
  bookmakerName: z.string().max(128).nullable(), betId: z.number().int().positive(), betName: z.string().max(256).nullable(), valuesHash: hash,
  retrievedAt: instant, providerUpdatedAt: instant.nullable(), retainUntil: instant, values: snapshotValues });
const snapshotSchema = storedOddsSnapshotSchema;
export type StoredOddsSnapshot = z.infer<typeof snapshotSchema>;

export type OddsFixtureTarget = Readonly<{ fixtureId: string; externalId: number; kickoff: UtcInstant | null; status: string }>;
type PriceRow = Readonly<{ marketKey: string; selection: string; basis: string; bookmakerExternalId: number | null; line: string | null;
  priceDecimal: string; displayHundredths: number; impliedProbability: string; overround: string; method: string; mappingVersion: string;
  snapshotId: string | null; retrievedAt: number; providerUpdatedAt: number | null; stale: boolean }>;

/** A sealed receipt, verified once and indexed for per-fixture provenance checks. */
type VerifiedBatch = Readonly<{ batch: OddsBatchBody; fixtures: ReadonlyMap<number, OddsBatchBody["fixtures"][number]>; pages: ReadonlySet<number> }>;
/** Receipts are append-only (no UPDATE or DELETE grant, sealed integrity), so a verified body never changes. */
const MAX_VERIFIED_BATCHES = 16;
/** Multi-row snapshot statements stay far below MySQL's placeholder limit (15 values per row). */
const SNAPSHOT_CHUNK = 100;
const chunks = <Item>(items: readonly Item[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
const byCodePoint = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
/** Canonical values: label order, so a provider reordering never creates a new snapshot. */
export function canonicalOddsValues(values: readonly Readonly<{ label: string; odd: string }>[]) {
  return [...values].map(({ label, odd }) => ({ label, odd })).sort((left, right) => byCodePoint(left.label, right.label));
}
export const oddsValuesHash = (values: readonly Readonly<{ label: string; odd: string }>[]) => evidenceFingerprint({ values: canonicalOddsValues(values) });
const places = (text: string, count: number) => { const [whole, fraction = ""] = text.split("."); return `${whole}.${fraction.padEnd(count, "0")}`; };
const asNumber = (value: unknown) => typeof value === "bigint" ? Number(value) : Number(value);
const asBoolean = (value: unknown) => value === true || value === 1 || value === 1n || value === "1";
const time = (value: unknown) => value instanceof Date ? value.getTime() : oddsFail("invalid-state");
const sameRow = (left: PriceRow, right: PriceRow) => evidenceFingerprint(left) === evidenceFingerprint(right);

/** Odds persistence. Short per-fixture ReadCommitted transactions serialize on FixtureOddsState only:
 * odds never take the global catalog lock, bump FootballFixture.dataVersion or write prediction change events. */
export function createMysqlOddsStore(database: DatabaseRuntime) {
  /** Short ReadCommitted transaction. Callbacks hold only transactional reads and writes (never provider I/O), so a
   * genuine deadlock or write conflict is retried twice; domain refusals are rethrown with their own reason. */
  async function write<Result>(operation: (tx: Tx) => Promise<Result>, timeout = 30_000): Promise<Result> {
    for (let attempt = 0; ; attempt++) {
      let domainError: OddsError | undefined;
      try {
        return await database.transaction(async (tx) => {
          try { return await operation(tx); } catch (error) { if (error instanceof OddsError) domainError = error; throw error; }
        }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout });
      } catch (error) {
        if (domainError) throw domainError;
        if (error instanceof OddsError) throw error;
        const conflict = error !== null && typeof error === "object" && "code" in error && error.code === "conflict";
        if (!conflict || attempt >= 2) return oddsFail("unavailable");
      }
    }
  }
  async function read<Result>(operation: (tx: Tx) => Promise<Result>): Promise<Result> {
    // The database boundary sanitizes every thrown error; keep a domain refusal's own reason.
    let domainError: OddsError | undefined;
    try {
      return await database.query(async (tx) => {
        try { return await operation(tx); } catch (error) { if (error instanceof OddsError) domainError = error; throw error; }
      });
    } catch (error) {
      if (domainError) throw domainError;
      if (error instanceof OddsError) throw error;
      return oddsFail("unavailable");
    }
  }
  async function now(tx: Tx): Promise<number> {
    return (await tx.$queryRaw<{ at: Date }[]>`SELECT UTC_TIMESTAMP(3) AS at`)[0]!.at.getTime();
  }
  async function sealedBatch(tx: Tx, id: string): Promise<OddsBatchBody | null> {
    const row = (await tx.$queryRaw<{ body: unknown; validIntegrity: unknown }[]>`SELECT body, integrity = SHA2(CAST(body AS CHAR), 256) AS validIntegrity
      FROM OddsImportBatch WHERE id = ${id}`)[0];
    if (!row) return null;
    try { assertHistorySeal(row.validIntegrity); } catch { return oddsFail("invalid-state"); }
    const parsed = batchSchema.safeParse(historyJson(row.body));
    return parsed.success && parsed.data.id === id ? freezeEvidence(parsed.data as unknown as OddsBatchBody) : oddsFail("invalid-state");
  }
  const verifiedBatches = new Map<string, VerifiedBatch>();
  /** Indexes and keeps a receipt that is known to be committed. Callers never remember a receipt read inside the
   * transaction that inserted it, since that transaction could still roll back. */
  function remember(batch: OddsBatchBody | null): VerifiedBatch | null {
    if (batch === null) return null;
    const verified = Object.freeze({ batch, fixtures: new Map(batch.fixtures.map((entry) => [entry.externalId, entry])),
      pages: new Set(batch.pages.map((page) => page.retrievedAt)) });
    verifiedBatches.delete(batch.id); verifiedBatches.set(batch.id, verified);
    while (verifiedBatches.size > MAX_VERIFIED_BATCHES) verifiedBatches.delete(verifiedBatches.keys().next().value!);
    return verified;
  }
  /** Sealed snapshots by id, read in bounded chunks; a broken seal or body is invalid state. */
  async function sealedSnapshots(tx: Tx, ids: readonly string[]): Promise<Map<string, StoredOddsSnapshot>> {
    const found = new Map<string, StoredOddsSnapshot>();
    for (const part of chunks([...new Set(ids)], 500)) {
      const rows = await tx.$queryRaw<{ id: string; body: unknown; validIntegrity: unknown }[]>(Prisma.sql`SELECT id, body,
        integrity = SHA2(CAST(body AS CHAR), 256) AS validIntegrity FROM ProviderOddsSnapshot WHERE id IN (${Prisma.join(part)})`);
      for (const row of rows) {
        try { assertHistorySeal(row.validIntegrity); } catch { return oddsFail("invalid-state"); }
        const parsed = snapshotSchema.safeParse(historyJson(row.body));
        if (!parsed.success || parsed.data.id !== row.id) return oddsFail("invalid-state");
        found.set(row.id, freezeEvidence(parsed.data));
      }
    }
    return found;
  }
  async function sealedSnapshot(tx: Tx, id: string): Promise<StoredOddsSnapshot | null> {
    return (await sealedSnapshots(tx, [id])).get(id) ?? null;
  }
  async function lockState(tx: Tx, fixtureId: string) {
    return (await tx.$queryRaw<{ latestBatchId: string; policyHash: string; lastRetrievedAt: Date; withdrawnAt: Date | null; publicVersion: unknown }[]>`
      SELECT latestBatchId, policyHash, lastRetrievedAt, withdrawnAt, publicVersion FROM FixtureOddsState WHERE fixtureId = ${fixtureId} FOR UPDATE`)[0];
  }
  async function prices(tx: Tx, fixtureId: string): Promise<Map<string, PriceRow>> {
    const rows = await tx.$queryRaw<Record<string, unknown>[]>`SELECT marketKey, selection, basis, bookmakerExternalId,
      CAST(line AS CHAR) AS line, CAST(priceDecimal AS CHAR) AS priceDecimal, displayHundredths, CAST(impliedProbability AS CHAR) AS impliedProbability,
      CAST(overround AS CHAR) AS overround, method, mappingVersion, snapshotId, retrievedAt, providerUpdatedAt, stale
      FROM FixtureOddsPrice WHERE fixtureId = ${fixtureId} FOR UPDATE`;
    return new Map(rows.map((row) => [`${row.marketKey}\u0000${row.selection}`, Object.freeze({ marketKey: String(row.marketKey), selection: String(row.selection),
      basis: String(row.basis), bookmakerExternalId: row.bookmakerExternalId === null ? null : asNumber(row.bookmakerExternalId),
      line: row.line === null ? null : String(row.line), priceDecimal: String(row.priceDecimal), displayHundredths: asNumber(row.displayHundredths),
      impliedProbability: String(row.impliedProbability), overround: String(row.overround), method: String(row.method),
      mappingVersion: String(row.mappingVersion), snapshotId: row.snapshotId === null ? null : String(row.snapshotId), retrievedAt: time(row.retrievedAt),
      providerUpdatedAt: row.providerUpdatedAt === null ? null : time(row.providerUpdatedAt), stale: asBoolean(row.stale) })]));
  }
  async function upsertPrice(tx: Tx, fixtureId: string, row: PriceRow) {
    await tx.$executeRaw`INSERT INTO FixtureOddsPrice (fixtureId, marketKey, selection, basis, bookmakerExternalId, line, priceDecimal,
      displayHundredths, impliedProbability, overround, method, mappingVersion, snapshotId, basisJson, retrievedAt, providerUpdatedAt, stale)
      VALUES (${fixtureId}, ${row.marketKey}, ${row.selection}, ${row.basis}, ${row.bookmakerExternalId},
        ${row.line === null ? null : row.line}, CAST(${row.priceDecimal} AS DECIMAL(10,4)), ${row.displayHundredths},
        CAST(${row.impliedProbability} AS DECIMAL(13,12)), CAST(${row.overround} AS DECIMAL(13,12)), ${row.method}, ${row.mappingVersion},
        ${row.snapshotId}, NULL, ${new Date(row.retrievedAt)}, ${row.providerUpdatedAt === null ? null : new Date(row.providerUpdatedAt)}, ${row.stale})
      AS next ON DUPLICATE KEY UPDATE basis = next.basis, bookmakerExternalId = next.bookmakerExternalId, line = next.line,
        priceDecimal = next.priceDecimal, displayHundredths = next.displayHundredths, impliedProbability = next.impliedProbability,
        overround = next.overround, method = next.method, mappingVersion = next.mappingVersion, snapshotId = next.snapshotId,
        basisJson = next.basisJson, retrievedAt = next.retrievedAt, providerUpdatedAt = next.providerUpdatedAt, stale = next.stale`;
  }
  /** Marks every public price of one fixture stale; returns how many rows changed. */
  async function staleAll(tx: Tx, fixtureId: string): Promise<number> {
    return tx.$executeRaw`UPDATE FixtureOddsPrice SET stale = TRUE WHERE fixtureId = ${fixtureId} AND stale = FALSE`;
  }
  async function bumpState(tx: Tx, fixtureId: string, fields: Readonly<{ latestBatchId?: string; withdrawnAt?: Date }>, publicChanged: boolean) {
    const state = await lockState(tx, fixtureId);
    if (!state) return oddsFail("invalid-state");
    const version = asNumber(state.publicVersion) + (publicChanged ? 1 : 0);
    await tx.$executeRaw`UPDATE FixtureOddsState SET latestBatchId = ${fields.latestBatchId ?? state.latestBatchId},
      withdrawnAt = ${fields.withdrawnAt ?? state.withdrawnAt}, publicVersion = ${version} WHERE fixtureId = ${fixtureId}`;
  }

  return Object.freeze({
    /** Maps provider fixture ids to stored fixtures. Unknown fixtures are reported, never created. */
    resolveFixtures(externalIds: readonly number[]): Promise<Map<number, OddsFixtureTarget>> {
      return read(async (tx) => {
        const unique = [...new Set(externalIds)];
        if (unique.length === 0) return new Map();
        const rows = await tx.footballFixture.findMany({ where: { provider: "api-football", externalId: { in: unique.map(BigInt) } },
          select: { id: true, externalId: true, kickoff: true, status: true } });
        return new Map(rows.map((row) => [Number(row.externalId), Object.freeze({ fixtureId: row.id, externalId: Number(row.externalId),
          kickoff: row.kickoff === null ? null : utcInstantFromEpochMilliseconds(row.kickoff.getTime()), status: row.status })]));
      });
    },
    /** Receipt first: insert-if-absent, then a sealed re-read must reproduce the exact body. */
    async saveBatch(input: OddsBatchBody): Promise<OddsBatchBody> {
      const parsed = batchSchema.safeParse(input);
      if (!parsed.success) return oddsFail("invalid-request");
      const { id, ...content } = parsed.data, body = evidenceSerialize(parsed.data);
      if (evidenceFingerprint(content) !== id) return oddsFail("invalid-request");
      const stored = await write(async (tx) => {
        await tx.$executeRaw`INSERT IGNORE INTO OddsImportBatch (id, accountId, kind, scopeKey, policyHash, status, requestsDispatched, receivedAt, integrity, body)
          VALUES (${id}, ${parsed.data.accountId}, ${parsed.data.kind}, ${parsed.data.scopeKey}, ${parsed.data.policyHash}, ${parsed.data.status},
            ${parsed.data.requestsDispatched}, ${new Date(parsed.data.receivedAt)}, SHA2(CAST(JSON_EXTRACT(${body}, '$') AS CHAR), 256), JSON_EXTRACT(${body}, '$'))`;
        const sealed = await sealedBatch(tx, id);
        if (!sealed || evidenceFingerprint(sealed) !== evidenceFingerprint(parsed.data)) return oddsFail("conflicting-request");
        return sealed;
      });
      // Committed: the import's per-fixture writes reuse this verified body instead of re-reading it each time.
      remember(stored);
      return stored;
    },
    batch(id: string) { return read((tx) => sealedBatch(tx, id)); },
    /** Every observed /odds/bets name is kept once; later renames add rows, never overwrite. */
    saveBetObservations(batchId: string, entries: readonly Readonly<{ id: number; name: string }>[]): Promise<number> {
      return write(async (tx) => {
        const batch = await sealedBatch(tx, batchId);
        if (!batch || batch.kind !== "bets") return oddsFail("invalid-request");
        const at = await now(tx);
        let inserted = 0;
        for (const entry of entries) {
          if (!batch.catalog.some((item) => item.id === entry.id && item.name === entry.name)) return oddsFail("invalid-request");
          const id = evidenceFingerprint({ provider: "api-football", betId: entry.id, name: entry.name });
          inserted += await tx.$executeRaw`INSERT IGNORE INTO OddsBetObservation (id, provider, betExternalId, name, batchId, firstSeenAt)
            VALUES (${id}, 'api-football', ${entry.id}, ${entry.name}, ${batchId}, ${new Date(at)})`;
          const stored = await tx.oddsBetObservation.findUnique({ where: { id } });
          if (!stored || stored.betExternalId !== entry.id || stored.name !== entry.name) return oddsFail("invalid-state");
        }
        return inserted;
      });
    },
    /** The latest complete /odds/bets catalog (id -> exact name), or null before any catalog import. */
    latestBetCatalog(): Promise<ReadonlyMap<number, string> | null> {
      return read(async (tx) => {
        const row = (await tx.$queryRaw<{ id: string }[]>`SELECT id FROM OddsImportBatch WHERE scopeKey = 'bets' AND kind = 'bets'
          AND status = 'complete' ORDER BY receivedAt DESC, id DESC LIMIT 1`)[0];
        if (!row) return null;
        const batch = await sealedBatch(tx, row.id);
        return batch ? new Map(batch.catalog.map((entry) => [entry.id, entry.name])) : null;
      });
    },
    /** Applies one validated fixture observation in one short transaction. New chained snapshots are written only for
     * changed values; the public projection is recomputed from this observation's complete launch groups. The receipt
     * named by `batchId` must have recorded exactly this observation: its fixture entry (outcome `apply`) carries the
     * row's observation hash and one of its pages carries the row's retrieval time, so every snapshot's `batchId`
     * points at a receipt that observed those values. */
    async applyFixture(input: Readonly<{ batchId: string; policy: OddsPolicy; policyHash: string; fixtureId: string; row: NormalizedFixtureOdds;
      publicDisplay: boolean; catalog: ReadonlyMap<number, string> | null }>): Promise<OddsApplyResult> {
      const { row, policy } = input, retrievedAt = row.source.retrievedAt, providerUpdatedAt = row.source.providerUpdatedAt;
      const bookmaker = row.bookmakers.find((entry) => entry.id === policy.bookmakerId);
      if (row.bookmakers.some((entry) => entry.id !== policy.bookmakerId) || row.kickoff === null) return oddsFail("invalid-request");
      const observationHash = evidenceFingerprint(row);
      return write(async (tx) => {
        // A receipt visible here is committed (this transaction never inserts receipts), so it may be remembered.
        const receipt = verifiedBatches.get(input.batchId) ?? remember(await sealedBatch(tx, input.batchId));
        const entry = receipt?.fixtures.get(row.fixtureId);
        if (!receipt || receipt.batch.kind !== "prices" || receipt.batch.policyHash !== input.policyHash || entry?.outcome !== "apply" ||
          entry.observationHash !== observationHash || !receipt.pages.has(retrievedAt)) return oddsFail("invalid-request");
        const at = await now(tx);
        const fixture = (await tx.$queryRaw<{ kickoff: Date | null; status: string }[]>`SELECT kickoff, status FROM FootballFixture
          WHERE id = ${input.fixtureId} AND provider = 'api-football' AND externalId = ${BigInt(row.fixtureId)}`)[0];
        // Pre-match only: after kickoff the last valid price is frozen as the closing price.
        if (!fixture || fixture.kickoff === null || fixture.kickoff.getTime() !== row.kickoff || fixture.status !== "scheduled" ||
          fixture.kickoff.getTime() <= Math.max(retrievedAt, at)) return "skipped";
        await tx.$executeRaw`INSERT INTO FixtureOddsState (fixtureId, latestBatchId, policyHash, lastRetrievedAt, lastProviderUpdatedAt, withdrawnAt, publicVersion)
          VALUES (${input.fixtureId}, ${input.batchId}, ${input.policyHash}, ${new Date(retrievedAt)},
            ${providerUpdatedAt === null ? null : new Date(providerUpdatedAt)}, NULL, 0)
          ON DUPLICATE KEY UPDATE publicVersion = publicVersion`;
        const state = await lockState(tx, input.fixtureId);
        if (!state) return oddsFail("invalid-state");
        // Out-of-order observations never move a fixture backwards.
        if (state.lastRetrievedAt.getTime() > retrievedAt) return "skipped";
        const heads = new Map((await tx.$queryRaw<{ id: string; betExternalId: unknown; valuesHash: string; bookmakerName: string | null;
          betName: string | null; retrievedAt: Date; providerUpdatedAt: Date | null }[]>`
          SELECT s.id, s.betExternalId, s.valuesHash, s.bookmakerName, s.betName, s.retrievedAt, s.providerUpdatedAt FROM ProviderOddsSnapshot s
          LEFT JOIN ProviderOddsSnapshot n ON n.previousId = s.id
          WHERE s.fixtureId = ${input.fixtureId} AND s.bookmakerExternalId = ${policy.bookmakerId} AND n.id IS NULL`)
          .map((head) => [asNumber(head.betExternalId), head]));
        const current = new Map<number, Readonly<{ id: string; retrievedAt: number; providerUpdatedAt: number | null }>>();
        const pending: StoredOddsSnapshot[] = [];
        for (const bet of bookmaker?.bets ?? []) {
          const values = canonicalOddsValues(bet.values), valuesHash = oddsValuesHash(values), head = heads.get(bet.id);
          // Unchanged content (canonical values and the recorded names) adds no row; a renamed bet or bookmaker is recorded.
          if (head && head.valuesHash === valuesHash && head.betName === bet.name && head.bookmakerName === bookmaker!.name) {
            current.set(bet.id, { id: head.id, retrievedAt: head.retrievedAt.getTime(), providerUpdatedAt: head.providerUpdatedAt?.getTime() ?? null });
            continue;
          }
          const previousId = head?.id ?? null, retainUntil = row.kickoff + policy.retainAfterKickoffMs;
          const id = evidenceFingerprint({ fixtureId: input.fixtureId, bookmakerId: policy.bookmakerId, bookmakerName: bookmaker!.name, betId: bet.id,
            betName: bet.name, valuesHash, previousId });
          pending.push({ id, fixtureId: input.fixtureId, previousId, bookmakerId: policy.bookmakerId, bookmakerName: bookmaker!.name,
            betId: bet.id, betName: bet.name, valuesHash, retrievedAt, providerUpdatedAt, retainUntil, values });
        }
        // Changed bets are written together: multi-row INSERT IGNORE statements, then one sealed re-read that must
        // reproduce every body exactly (a concurrent replica may have written the same content-addressed rows).
        for (const part of chunks(pending, SNAPSHOT_CHUNK)) {
          await tx.$executeRaw(Prisma.sql`INSERT IGNORE INTO ProviderOddsSnapshot (id, fixtureId, batchId, previousId, bookmakerExternalId, bookmakerName,
            betExternalId, betName, valuesHash, selectionCount, retrievedAt, providerUpdatedAt, retainUntil, integrity, body)
            VALUES ${Prisma.join(part.map((body) => {
              const json = evidenceSerialize(body);
              return Prisma.sql`(${body.id}, ${body.fixtureId}, ${input.batchId}, ${body.previousId}, ${body.bookmakerId}, ${body.bookmakerName}, ${body.betId},
                ${body.betName}, ${body.valuesHash}, ${body.values.length}, ${new Date(retrievedAt)},
                ${providerUpdatedAt === null ? null : new Date(providerUpdatedAt)}, ${new Date(body.retainUntil)},
                SHA2(CAST(JSON_EXTRACT(${json}, '$') AS CHAR), 256), JSON_EXTRACT(${json}, '$'))`;
            }))}`);
        }
        const sealed = pending.length === 0 ? new Map<string, StoredOddsSnapshot>() : await sealedSnapshots(tx, pending.map((body) => body.id));
        for (const body of pending) {
          const stored = sealed.get(body.id);
          if (!stored || evidenceFingerprint(stored) !== evidenceFingerprint(body)) return oddsFail("invalid-state");
          current.set(body.betId, { id: body.id, retrievedAt, providerUpdatedAt });
        }
        const snapshots = pending.length;
        const existing = await prices(tx, input.fixtureId);
        let publicChanges = 0;
        if (input.publicDisplay) {
          const desired = new Map<string, PriceRow>();
          for (const mapping of launchOddsMapping) {
            const bet = bookmaker?.bets.find((entry) => entry.id === mapping.betId), snapshot = bet ? current.get(bet.id) : undefined;
            const group = bet && snapshot ? launchOddsGroup(mapping, { betId: bet.id, betName: bet.name, values: bet.values },
              input.catalog?.get(mapping.betId)) : null;
            if (!group || !snapshot) continue;
            for (const selection of group.selections) desired.set(`${mapping.family}\u0000${selection.selection}`, Object.freeze({
              marketKey: mapping.family, selection: selection.selection, basis: "bookmaker", bookmakerExternalId: policy.bookmakerId,
              line: group.line === null ? null : places(group.line, 2), priceDecimal: places(selection.price.text, 4),
              displayHundredths: selection.displayHundredths, impliedProbability: selection.impliedProbability, overround: group.overround,
              method: group.method, mappingVersion: group.mappingVersion, snapshotId: snapshot.id, retrievedAt: snapshot.retrievedAt,
              providerUpdatedAt: snapshot.providerUpdatedAt, stale: false }));
          }
          for (const [key, next] of desired) {
            const previous = existing.get(key);
            if (previous && sameRow(previous, next)) continue;
            await upsertPrice(tx, input.fixtureId, next); publicChanges++;
          }
          // A family missing or incomplete in this observation keeps no fresh price; nothing is borrowed.
          for (const [key, previous] of existing) {
            if (desired.has(key) || previous.stale) continue;
            await upsertPrice(tx, input.fixtureId, { ...previous, stale: true }); publicChanges++;
          }
        } else publicChanges = await staleAll(tx, input.fixtureId);
        const version = asNumber(state.publicVersion) + (publicChanges > 0 ? 1 : 0);
        await tx.$executeRaw`UPDATE FixtureOddsState SET latestBatchId = ${input.batchId}, policyHash = ${input.policyHash},
          lastRetrievedAt = ${new Date(retrievedAt)}, lastProviderUpdatedAt = ${providerUpdatedAt === null ? null : new Date(providerUpdatedAt)},
          withdrawnAt = NULL, publicVersion = ${version} WHERE fixtureId = ${input.fixtureId}`;
        return snapshots > 0 || publicChanges > 0 ? "changed" : "unchanged";
      });
    },
    /** Only after a COMPLETE sweep of one EAT date: pre-match fixtures absent from it are withdrawn and their prices go stale. */
    async markWithdrawn(input: Readonly<{ batchId: string; date: string; seenFixtureIds: readonly string[] }>): Promise<number> {
      // Candidate reads use the same transactional clock as the per-fixture re-check below.
      const { batch, candidates } = await write(async (tx) => {
        const batch = await sealedBatch(tx, input.batchId);
        if (!batch || batch.kind !== "prices" || batch.status !== "complete" || batch.date !== input.date) return oddsFail("invalid-request");
        return { batch, candidates: await tx.$queryRaw<{ fixtureId: string }[]>`SELECT s.fixtureId FROM FixtureOddsState s
          JOIN FootballFixture f ON f.id = s.fixtureId
          WHERE f.eatDate = ${input.date} AND s.withdrawnAt IS NULL AND f.kickoff > UTC_TIMESTAMP(3) ORDER BY s.fixtureId` };
      });
      const seen = new Set(input.seenFixtureIds);
      let withdrawn = 0;
      for (const { fixtureId } of candidates.filter((candidate) => !seen.has(candidate.fixtureId))) {
        withdrawn += await write(async (tx) => {
          const state = await lockState(tx, fixtureId), at = await now(tx);
          const fixture = (await tx.$queryRaw<{ kickoff: Date | null }[]>`SELECT kickoff FROM FootballFixture WHERE id = ${fixtureId}`)[0];
          // A later observation (another sweep) that reconfirmed the fixture wins over this sweep's absence.
          if (!state || state.withdrawnAt !== null || state.lastRetrievedAt.getTime() > batch.receivedAt ||
            !fixture?.kickoff || fixture.kickoff.getTime() <= at) return 0;
          await bumpState(tx, fixtureId, { latestBatchId: input.batchId, withdrawnAt: new Date(at) }, await staleAll(tx, fixtureId) > 0);
          return 1;
        });
      }
      return withdrawn;
    },
    /** Write-time staleness: prices not reconfirmed within the freshness window before kickoff (or now) go stale.
     * After kickoff the comparison point stays at kickoff, freezing the last valid closing price. */
    async expireStale(freshnessMs: number, limit: number): Promise<number> {
      if (!Number.isSafeInteger(freshnessMs) || freshnessMs <= 0 || !Number.isSafeInteger(limit) || limit <= 0 || limit > 10_000) oddsFail("invalid-request");
      const window = BigInt(freshnessMs) * 1000n;
      // Candidate reads use the same transactional clock as the per-fixture re-check below.
      const candidates = await write((tx) => tx.$queryRaw<{ fixtureId: string }[]>`SELECT DISTINCT p.fixtureId FROM FixtureOddsPrice p
        JOIN FixtureOddsState s ON s.fixtureId = p.fixtureId JOIN FootballFixture f ON f.id = p.fixtureId
        WHERE p.stale = FALSE AND s.lastRetrievedAt < DATE_SUB(LEAST(UTC_TIMESTAMP(3), COALESCE(f.kickoff, UTC_TIMESTAMP(3))), INTERVAL ${window} MICROSECOND)
        ORDER BY p.fixtureId LIMIT ${limit}`);
      let expired = 0;
      for (const { fixtureId } of candidates) {
        expired += await write(async (tx) => {
          const state = await lockState(tx, fixtureId);
          const due = (await tx.$queryRaw<{ due: unknown }[]>`SELECT s.lastRetrievedAt < DATE_SUB(LEAST(UTC_TIMESTAMP(3), COALESCE(f.kickoff, UTC_TIMESTAMP(3))),
            INTERVAL ${window} MICROSECOND) AS due FROM FixtureOddsState s JOIN FootballFixture f ON f.id = s.fixtureId WHERE s.fixtureId = ${fixtureId}`)[0];
          if (!state || !asBoolean(due?.due)) return 0;
          const changed = await staleAll(tx, fixtureId);
          if (changed > 0) await bumpState(tx, fixtureId, {}, true);
          return changed > 0 ? 1 : 0;
        });
      }
      return expired;
    },
    /** Used while odds display rights are not verified: every fresh public price goes stale, before or after kickoff
     * (closing prices included), with no provider call. Bounded per call; each changed fixture's `publicVersion`
     * rises once, so its cache tags invalidate. Returns how many fixtures changed. */
    async staleUnauthorized(limit: number): Promise<number> {
      if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 10_000) oddsFail("invalid-request");
      const candidates = await read((tx) => tx.$queryRaw<{ fixtureId: string }[]>`SELECT DISTINCT fixtureId FROM FixtureOddsPrice
        WHERE stale = FALSE ORDER BY fixtureId LIMIT ${limit}`);
      let hidden = 0;
      for (const { fixtureId } of candidates) {
        hidden += await write(async (tx) => {
          const state = await lockState(tx, fixtureId), changed = await staleAll(tx, fixtureId);
          // Prices are only ever written after their state row; without one there is no version to bump.
          if (changed > 0 && state) await bumpState(tx, fixtureId, {}, true);
          return changed > 0 ? 1 : 0;
        });
      }
      return hidden;
    },
    /** Sealed snapshot chain for one fixture, bookmaker and bet, newest first (audits and 053/054 inputs). The order
     * follows the previousId links from the single head; a fork, gap or foreign link is invalid state. */
    snapshotChain(fixtureId: string, bookmakerId: number, betId: number): Promise<readonly StoredOddsSnapshot[]> {
      return read(async (tx) => {
        const rows = await tx.$queryRaw<{ id: string; previousId: string | null }[]>`SELECT id, previousId FROM ProviderOddsSnapshot
          WHERE fixtureId = ${fixtureId} AND bookmakerExternalId = ${bookmakerId} AND betExternalId = ${betId} LIMIT 10001`;
        if (rows.length > 10_000) return oddsFail("invalid-state");
        const byId = new Map(rows.map((row) => [row.id, row])), linked = new Set(rows.flatMap((row) => row.previousId === null ? [] : [row.previousId]));
        const heads = rows.filter((row) => !linked.has(row.id));
        if (rows.length === 0) return freezeEvidence([]);
        if (heads.length !== 1) return oddsFail("invalid-state");
        const chain: StoredOddsSnapshot[] = [];
        for (let cursor: string | null = heads[0]!.id; cursor !== null;) {
          const snapshot = await sealedSnapshot(tx, cursor);
          if (!snapshot || snapshot.fixtureId !== fixtureId || snapshot.bookmakerId !== bookmakerId || snapshot.betId !== betId) return oddsFail("invalid-state");
          chain.push(snapshot); cursor = snapshot.previousId;
          if (cursor !== null && !byId.has(cursor)) return oddsFail("invalid-state");
        }
        return chain.length === rows.length ? freezeEvidence(chain) : oddsFail("invalid-state");
      });
    },
  });
}
export type MysqlOddsStore = ReturnType<typeof createMysqlOddsStore>;
