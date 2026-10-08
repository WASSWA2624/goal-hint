import "server-only";

import type { DatabaseRuntime } from "../database/client.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { createFootballCatalogStore, type FootballCatalogStore, type CatalogFixtureSnapshot } from "../football/catalog-mysql-store.ts";
import type { EvidenceAuthority, EvidenceContext, EvidenceSource, EvidenceSnapshot } from "./evidence-contract.ts";
import { evidenceFingerprint, evidenceSerialize, parseEvidenceSource, parseEvidenceSnapshot } from "./evidence-input.ts";
import { assertPreparedEvidenceSnapshot } from "./evidence-snapshot.ts";

export class EvidenceStorageError extends Error {
  readonly reason: "invalid-request" | "not-authorized" | "fixture-changed" | "conflicting-request" | "invalid-state" | "unavailable";
  constructor(reason: EvidenceStorageError["reason"]) {
    super("Fixture evidence storage is invalid or unavailable. Private source diagnostics are withheld.");
    this.name = "EvidenceStorageError"; this.reason = reason;
  }
}
const fail = (reason: EvidenceStorageError["reason"]): never => { throw new EvidenceStorageError(reason); };
type Row = Record<string, unknown>;
export type StoredEvidenceSnapshot = Readonly<{ requestFingerprint: string; snapshot: EvidenceSnapshot }>;

function identity(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) return fail("invalid-request");
  return value;
}
function nativeInteger(value: unknown): bigint {
  const text = typeof value === "bigint" ? value.toString() : typeof value === "number" && Number.isSafeInteger(value) ? String(value) : typeof value === "string" ? value : "";
  if (!/^(?:0|[1-9][0-9]{0,19})$/u.test(text)) return fail("invalid-state");
  return BigInt(text);
}
function nativeBoolean(value: unknown): boolean {
  if (value === true || value === 1 || value === 1n) return true;
  if (value === false || value === 0 || value === 0n) return false;
  return fail("invalid-state");
}
function sameDate(value: unknown, expected: number | null): boolean {
  return expected === null ? value === null : value instanceof Date && value.getTime() === expected;
}
const sqlDate = (value: number | null) => value === null ? null : new Date(value);
function decode<Value>(value: unknown, parse: (input: unknown) => Value): Value {
  try {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    const body = JSON.parse(text, (_key, child: unknown) => {
      if (child !== null && typeof child === "object" && "$evidenceInteger" in child) {
        if (Object.keys(child).length !== 1 || typeof child.$evidenceInteger !== "string" || !/^[1-9][0-9]{0,19}$/u.test(child.$evidenceInteger)) return fail("invalid-state");
        return BigInt(child.$evidenceInteger);
      }
      return child;
    });
    return parse(body);
  } catch { return fail("invalid-state"); }
}
function bindingMatches(source: EvidenceSource, context: EvidenceContext): boolean {
  const binding = source.binding;
  return binding.fixtureId === context.fixtureId && binding.fixtureVersion === context.fixtureVersion &&
    binding.externalFixtureId === context.externalFixtureId && binding.homeTeamId === context.home.teamId &&
    binding.awayTeamId === context.away.teamId && binding.homeExternalId === context.home.externalId && binding.awayExternalId === context.away.externalId;
}
function sourceFromRow(row: Row): EvidenceSource {
  if (!nativeBoolean(row.validIntegrity)) return fail("invalid-state");
  const source = decode(row.metadataJson, parseEvidenceSource);
  if (row.id !== source.id || row.fixtureId !== source.binding.fixtureId || row.homeTeamId !== source.binding.homeTeamId ||
    row.awayTeamId !== source.binding.awayTeamId || nativeInteger(row.fixtureVersion) !== source.binding.fixtureVersion ||
    row.sourceKey !== source.sourceKey || row.syndicationKey !== source.syndicationKey || row.kind !== source.kind ||
    row.version !== source.version || row.publisher !== source.publisher || row.title !== source.title || row.sourceUrl !== source.sourceUrl ||
    !sameDate(row.publishedAt, source.publishedAt) || !sameDate(row.retrievedAt, source.retrievedAt) ||
    !sameDate(row.providerUpdatedAt, source.providerUpdatedAt) || !sameDate(row.retainUntil, source.reuse.retainUntil)) return fail("invalid-state");
  return source;
}
function snapshotFromRow(row: Row): StoredEvidenceSnapshot {
  if (!nativeBoolean(row.validIntegrity)) return fail("invalid-state");
  const snapshot = decode(row.snapshotJson, parseEvidenceSnapshot), context = snapshot.context;
  if (row.contentHash !== snapshot.hash || row.fixtureId !== context.fixtureId || row.homeTeamId !== context.home.teamId ||
    row.awayTeamId !== context.away.teamId || nativeInteger(row.fixtureVersion) !== context.fixtureVersion ||
    !sameDate(row.analysisAt, context.analysisAt) || !sameDate(row.cutoffAt, context.cutoffAt) || !sameDate(row.kickoffAt, context.kickoffAt) ||
    row.cycleId !== context.cycleId || row.runId !== context.runId || row.policyVersion !== snapshot.policy.version ||
    nativeBoolean(row.sufficient) !== snapshot.coverage.sufficient || snapshot.sources.some((source) => !bindingMatches(source, context))) return fail("invalid-state");
  return Object.freeze({ requestFingerprint: identity(row.requestFingerprint), snapshot });
}
function verifyPrepared(snapshot: EvidenceSnapshot, authority: EvidenceAuthority): void {
  try { assertPreparedEvidenceSnapshot(snapshot, authority); } catch { return fail("not-authorized"); }
}
function verifyFixture(snapshot: CatalogFixtureSnapshot, context: EvidenceContext): void {
  if (snapshot.id !== context.fixtureId || snapshot.externalId !== context.externalFixtureId || snapshot.dataVersion !== context.fixtureVersion ||
    snapshot.homeTeamId !== context.home.teamId || snapshot.awayTeamId !== context.away.teamId || snapshot.kickoff !== context.kickoffAt) fail("fixture-changed");
}

/** The catalog's existing provider → fixture locks also serialize these writes.
 * No provider I/O or caller mutation runs inside the transaction. */
export function createMysqlEvidenceStore(database: DatabaseRuntime, options: Readonly<{ catalog?: FootballCatalogStore }> = {}) {
  const catalog = options.catalog ?? createFootballCatalogStore(database);
  async function stored(transaction: Prisma.TransactionClient, requestId: string): Promise<StoredEvidenceSnapshot | null> {
    const rows = await transaction.$queryRaw<Row[]>`SELECT *,
      integrity = SHA2(CONCAT(requestId, ':', requestFingerprint, ':', CAST(snapshotJson AS CHAR)), 256) AS validIntegrity
      FROM FixtureEvidenceSnapshot WHERE requestId = ${requestId}`;
    if (rows.length === 0) return null;
    const row = rows[0];
    if (rows.length !== 1 || row === undefined || row.requestId !== requestId) return fail("invalid-state");
    const record = snapshotFromRow(row);
    const sources = await transaction.$queryRaw<Row[]>`SELECT s.*, s.integrity = SHA2(CAST(s.metadataJson AS CHAR), 256) AS validIntegrity
      FROM EvidenceSourceVersion s INNER JOIN FixtureEvidenceSnapshotSource link ON link.sourceVersionId = s.id
      AND link.fixtureId = s.fixtureId AND link.homeTeamId = s.homeTeamId AND link.awayTeamId = s.awayTeamId AND link.fixtureVersion = s.fixtureVersion
      WHERE link.requestId = ${requestId}`;
    if (sources.length !== record.snapshot.sources.length) return fail("invalid-state");
    const expected = new Map(record.snapshot.sources.map((source) => [source.id, source]));
    for (const row of sources) {
      const source = sourceFromRow(row), original = expected.get(source.id);
      if (original === undefined || evidenceFingerprint(original) !== evidenceFingerprint(source)) return fail("invalid-state");
      expected.delete(source.id);
    }
    if (expected.size !== 0) return fail("invalid-state");
    return record;
  }
  async function find(requestId: string): Promise<StoredEvidenceSnapshot | null> {
    identity(requestId);
    let domainError: EvidenceStorageError | undefined;
    try {
      return await database.transaction(async (transaction) => {
        try { return await stored(transaction, requestId); }
        catch (error) { if (error instanceof EvidenceStorageError) domainError = error; throw error; }
      }, { isolationLevel: "RepeatableRead", timeout: 30_000 });
    } catch { if (domainError) throw domainError; return fail("unavailable"); }
  }
  async function save(requestId: string, requestFingerprint: string, snapshot: EvidenceSnapshot, authority: EvidenceAuthority): Promise<StoredEvidenceSnapshot> {
    identity(requestId); identity(requestFingerprint); verifyPrepared(snapshot, authority);
    let domainError: EvidenceStorageError | undefined;
    try {
      return await catalog.withFixtureTransaction(snapshot.context.fixtureId, async (transaction, fixture) => {
        try {
          verifyPrepared(snapshot, authority); verifyFixture(fixture, snapshot.context);
          const context = snapshot.context;
          const mappings = await transaction.$queryRaw<Row[]>`SELECT externalId, teamId FROM FootballTeamProvider
            WHERE provider = ${context.provider} AND externalId IN (${BigInt(context.home.externalId)}, ${BigInt(context.away.externalId)}) FOR UPDATE`;
          if (mappings.length !== 2 || !mappings.some((row) => nativeInteger(row.externalId) === BigInt(context.home.externalId) && row.teamId === context.home.teamId) ||
            !mappings.some((row) => nativeInteger(row.externalId) === BigInt(context.away.externalId) && row.teamId === context.away.teamId)) return fail("fixture-changed");
          const known = await stored(transaction, requestId);
          if (known) {
            if (known.requestFingerprint !== requestFingerprint || known.snapshot.hash !== snapshot.hash) return fail("conflicting-request");
            verifyPrepared(snapshot, authority);
            return known;
          }
          for (const source of snapshot.sources) {
            if (!bindingMatches(source, context)) return fail("invalid-state");
            const prior = await transaction.$queryRaw<Row[]>`SELECT *, integrity = SHA2(CAST(metadataJson AS CHAR), 256) AS validIntegrity
              FROM EvidenceSourceVersion WHERE id = ${source.id}`;
            if (prior.length > 1) return fail("invalid-state");
            if (prior.length === 1) {
              const previous = prior[0];
              if (previous === undefined || evidenceFingerprint(sourceFromRow(previous)) !== evidenceFingerprint(source)) return fail("invalid-state");
              continue;
            }
            const payload = evidenceSerialize(source), binding = source.binding;
            await transaction.$executeRaw`INSERT INTO EvidenceSourceVersion
              (id, fixtureId, homeTeamId, awayTeamId, fixtureVersion, sourceKey, syndicationKey, kind, version, publisher, title, sourceUrl,
                publishedAt, retrievedAt, providerUpdatedAt, retainUntil, integrity, metadataJson)
              VALUES (${source.id}, ${binding.fixtureId}, ${binding.homeTeamId}, ${binding.awayTeamId}, ${binding.fixtureVersion}, ${source.sourceKey},
                ${source.syndicationKey}, ${source.kind}, ${source.version}, ${source.publisher}, ${source.title}, ${source.sourceUrl},
                ${sqlDate(source.publishedAt)}, ${sqlDate(source.retrievedAt)}, ${sqlDate(source.providerUpdatedAt)}, ${sqlDate(source.reuse.retainUntil)},
                SHA2(CAST(CAST(${payload} AS JSON) AS CHAR), 256), CAST(${payload} AS JSON))`;
          }
          const payload = evidenceSerialize(snapshot);
          await transaction.$executeRaw`INSERT INTO FixtureEvidenceSnapshot
            (requestId, requestFingerprint, contentHash, fixtureId, homeTeamId, awayTeamId, fixtureVersion, analysisAt, cutoffAt, kickoffAt,
              cycleId, runId, policyVersion, sufficient, integrity, snapshotJson)
            VALUES (${requestId}, ${requestFingerprint}, ${snapshot.hash}, ${context.fixtureId}, ${context.home.teamId}, ${context.away.teamId},
              ${context.fixtureVersion}, ${sqlDate(context.analysisAt)}, ${sqlDate(context.cutoffAt)}, ${sqlDate(context.kickoffAt)},
              ${context.cycleId}, ${context.runId}, ${snapshot.policy.version}, ${snapshot.coverage.sufficient},
              SHA2(CONCAT(${requestId}, ':', ${requestFingerprint}, ':', CAST(CAST(${payload} AS JSON) AS CHAR)), 256), CAST(${payload} AS JSON))`;
          for (const source of snapshot.sources) await transaction.$executeRaw`INSERT INTO FixtureEvidenceSnapshotSource
            (requestId, sourceVersionId, fixtureId, homeTeamId, awayTeamId, fixtureVersion)
            VALUES (${requestId}, ${source.id}, ${context.fixtureId}, ${context.home.teamId}, ${context.away.teamId}, ${context.fixtureVersion})`;
          // Revocation during a write rolls the entire source/snapshot transaction back.
          verifyPrepared(snapshot, authority);
          return Object.freeze({ requestFingerprint, snapshot });
        } catch (error) { if (error instanceof EvidenceStorageError) domainError = error; throw error; }
      });
    } catch { if (domainError) throw domainError; return fail("unavailable"); }
  }
  return Object.freeze({ find, save });
}
export type MysqlEvidenceStore = ReturnType<typeof createMysqlEvidenceStore>;
