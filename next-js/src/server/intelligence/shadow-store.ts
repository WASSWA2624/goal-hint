import "server-only";

import type { DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint, evidenceSerialize } from "../evidence/evidence-input.ts";
import type { ValidatedIntelligenceForecast } from "./intelligence-contract.ts";
import type { MonitoringObservation, ObservationChange } from "./monitoring.ts";

export type ShadowRevisionBody = Readonly<{
  forecast: ValidatedIntelligenceForecast; observation: MonitoringObservation;
  change: ObservationChange; policyVersion: string; dependencyHash: string;
}>;
export type ShadowRevision = Readonly<{
  id: string; fixtureId: string; sequence: number; semanticHash: string;
  modelVersion: string; createdAt: number; eligible: boolean; body: ShadowRevisionBody;
}>;
export type ShadowState = Readonly<{
  fixtureId: string; lastCheckedAt: number; checks: bigint; availability: string;
  observation: MonitoringObservation | null; observationHash: string | null;
  latest: ShadowRevision | null; latestEligibleRevisionId: string | null;
}>;
export type ShadowCheckReceipt = Readonly<{
  id: string; fixtureId: string; checkedAt: number; requestHash: string;
  outcome: string; revisionId: string | null;
}>;
export type ShadowRecord = Readonly<{
  check: Omit<ShadowCheckReceipt, "revisionId">; expectedObservationHash: string | null;
  expectedLatestRevisionId: string | null; observation: MonitoringObservation | null;
  observationHash: string | null; availability: string;
  executionDeadlineAt?: number;
  revision: Readonly<{ semanticHash: string; modelVersion: string; body: ShadowRevisionBody }> | null;
}>;
export interface ShadowStore {
  read(fixtureId: string): Promise<ShadowState | null>;
  check(checkId: string): Promise<ShadowCheckReceipt | null>;
  record(input: ShadowRecord): Promise<ShadowCheckReceipt>;
}
const hashPattern = /^[a-f0-9]{64}$/u, fixturePattern = /^[a-f0-9-]{36}$/iu;
const instant = (n: number) => Number.isSafeInteger(n) && n >= 0;
export class ShadowStoreError extends Error {
  readonly reason: "invalid-input" | "conflicting-check" | "concurrent-change" | "out-of-order" | "corrupt-record" | "cutoff-passed";
  constructor(reason: ShadowStoreError["reason"]) { super(`Shadow persistence refused: ${reason}.`); this.reason = reason; }
}
type Row = Record<string, unknown>;
/** MySQL JSON numeric parsing can shift IEEE doubles by one ULP. Preserve the
 * canonical payload as text inside JSON; only safe mode/publication metadata is
 * duplicated for SQL checks. Hashes still cover the exact original model body. */
export function encodeShadowArchive(value: unknown, forecast?: Readonly<{ mode: "shadow"; publish: false }>): string {
  return JSON.stringify({ archiveVersion: 1, ...(forecast ? { forecast } : {}), canonicalBody: evidenceSerialize(value) });
}
export function decodeShadowArchive<T>(value: unknown): T {
  try {
    const archive = (typeof value === "string" ? JSON.parse(value) : value) as { archiveVersion?: unknown; canonicalBody?: unknown };
    if (archive?.archiveVersion !== 1 || typeof archive.canonicalBody !== "string") throw new Error();
    const body = JSON.parse(archive.canonicalBody) as T;
    if (evidenceSerialize(body) !== archive.canonicalBody) throw new Error();
    return body;
  } catch { throw new ShadowStoreError("corrupt-record"); }
}
function receipt(row: Row): ShadowCheckReceipt {
  return { id: String(row.id), fixtureId: String(row.fixtureId), checkedAt: (row.checkedAt as Date).getTime(),
    requestHash: String(row.requestHash), outcome: String(row.outcome), revisionId: row.revisionId === null ? null : String(row.revisionId) };
}
function revision(row: Row): ShadowRevision {
  const body = decodeShadowArchive<ShadowRevisionBody>(row.bodyJson);
  if (evidenceFingerprint(body) !== row.integrity || body.forecast.mode !== "shadow" || body.forecast.publish !== false)
    throw new ShadowStoreError("corrupt-record");
  return { id: String(row.id), fixtureId: String(row.fixtureId), sequence: Number(row.sequence), semanticHash: String(row.semanticHash),
    modelVersion: String(row.modelVersion), createdAt: (row.createdAt as Date).getTime(), eligible: Boolean(row.eligible), body };
}
export function validateShadowRecord(input: ShadowRecord) {
  const check = input.check;
  if (input.executionDeadlineAt !== undefined && !instant(input.executionDeadlineAt)) throw new ShadowStoreError("invalid-input");
  if (!hashPattern.test(check.id) || !hashPattern.test(check.requestHash) || !fixturePattern.test(check.fixtureId) || !instant(check.checkedAt) ||
    !["unchanged", "minor", "significant", "critical", "initial", "unavailable", "cutoff-locked", "model-changed"].includes(check.outcome) ||
    !["available", "suspended", "unavailable", "cutoff-locked"].includes(input.availability) ||
    [input.expectedObservationHash, input.expectedLatestRevisionId, input.observationHash].some((hash) => hash !== null && !hashPattern.test(hash)))
    throw new ShadowStoreError("invalid-input");
  if (input.observation !== null && input.observation.fixtureId !== check.fixtureId) throw new ShadowStoreError("invalid-input");
  if (input.revision) {
    const { body, modelVersion, semanticHash } = input.revision;
    if (!hashPattern.test(semanticHash) || !hashPattern.test(body.dependencyHash) || !modelVersion || modelVersion.length > 128 || body.forecast.fixtureId !== check.fixtureId ||
      body.forecast.mode !== "shadow" || body.forecast.publish !== false || body.observation.fixtureId !== check.fixtureId ||
      body.observation.receivedAt > check.checkedAt || body.forecast.forecastAt > check.checkedAt ||
      check.checkedAt >= body.observation.kickoffAt - 5 * 60_000 || Buffer.byteLength(evidenceSerialize(body)) > 2_097_152)
      throw new ShadowStoreError("invalid-input");
  }
}
/** All check/revision/pointer writes share one fixture row lock and one transaction.
 * No provider I/O and no writes to public prediction, slip or settlement tables. */
export function createMysqlShadowStore(database: Pick<DatabaseRuntime, "query" | "transaction">): ShadowStore {
  return Object.freeze({
    async check(checkId: string) {
      if (!hashPattern.test(checkId)) throw new ShadowStoreError("invalid-input");
      return database.query(async (tx) => {
        const rows = await tx.$queryRaw<Row[]>`SELECT * FROM IntelligenceShadowCheck WHERE id = ${checkId}`;
        return rows[0] ? receipt(rows[0]) : null;
      });
    },
    async read(fixtureId: string) {
      if (!fixturePattern.test(fixtureId)) throw new ShadowStoreError("invalid-input");
      return database.transaction(async (tx) => {
        const rows = await tx.$queryRaw<Row[]>`SELECT * FROM IntelligenceShadowState WHERE fixtureId = ${fixtureId}`;
        const row = rows[0]; if (!row) return null;
        const revisions = row.latestRevisionId === null ? [] : await tx.$queryRaw<Row[]>`SELECT * FROM IntelligenceShadowRevision WHERE id = ${row.latestRevisionId as string}`;
        const latest = revisions[0] ? revision(revisions[0]) : null;
        if (latest && latest.fixtureId !== fixtureId || row.latestRevisionId !== null && latest === null) throw new ShadowStoreError("corrupt-record");
        return { fixtureId, lastCheckedAt: (row.lastCheckedAt as Date).getTime(), checks: BigInt(String(row.checks)), availability: String(row.availability),
          observation: row.lastObservationJson === null ? null : decodeShadowArchive<MonitoringObservation>(row.lastObservationJson),
          observationHash: row.lastObservationHash === null ? null : String(row.lastObservationHash), latest,
          latestEligibleRevisionId: row.latestEligibleRevisionId === null ? null : String(row.latestEligibleRevisionId) };
      });
    },
    async record(input: ShadowRecord) {
      validateShadowRecord(input);
      return database.transaction(async (tx) => {
        const check = input.check;
        await tx.$executeRaw`INSERT INTO IntelligenceShadowState (fixtureId, lastCheckedAt, availability)
          VALUES (${check.fixtureId}, ${new Date(check.checkedAt)}, 'unavailable') ON DUPLICATE KEY UPDATE fixtureId = fixtureId`;
        const states = await tx.$queryRaw<Row[]>`SELECT * FROM IntelligenceShadowState WHERE fixtureId = ${check.fixtureId} FOR UPDATE`;
        const state = states[0]!;
        const prior = await tx.$queryRaw<Row[]>`SELECT * FROM IntelligenceShadowCheck WHERE id = ${check.id}`;
        if (prior[0]) {
          const known = receipt(prior[0]);
          if (known.requestHash !== check.requestHash || known.fixtureId !== check.fixtureId) throw new ShadowStoreError("conflicting-check");
          return known;
        }
        if (input.executionDeadlineAt !== undefined) {
          const clock = await tx.$queryRaw<{ at: Date }[]>`SELECT UTC_TIMESTAMP(3) AS at`;
          if (clock[0]!.at.getTime() >= input.executionDeadlineAt) throw new ShadowStoreError("cutoff-passed");
        }
        if (check.checkedAt < (state.lastCheckedAt as Date).getTime()) throw new ShadowStoreError("out-of-order");
        if (state.lastObservationHash !== input.expectedObservationHash || state.latestRevisionId !== input.expectedLatestRevisionId)
          throw new ShadowStoreError("concurrent-change");
        let revisionId = state.latestRevisionId === null ? null : String(state.latestRevisionId);
        let eligibleId = state.latestEligibleRevisionId === null ? null : String(state.latestEligibleRevisionId);
        if (input.revision !== null) {
          const current = revisionId === null ? [] : await tx.$queryRaw<Row[]>`SELECT * FROM IntelligenceShadowRevision WHERE id = ${revisionId}`;
          if (!current[0] || current[0].semanticHash !== input.revision.semanticHash || current[0].modelVersion !== input.revision.modelVersion) {
            const sequence = Number(current[0]?.sequence ?? 0) + 1;
            revisionId = evidenceFingerprint({ fixtureId: check.fixtureId, sequence, semanticHash: input.revision.semanticHash, modelVersion: input.revision.modelVersion });
            const body = input.revision.body, eligible = body.forecast.decision === "eligible-shadow";
            await tx.$executeRaw`INSERT INTO IntelligenceShadowRevision
              (id, fixtureId, sequence, semanticHash, modelVersion, createdAt, eligible, bodyJson, integrity)
              VALUES (${revisionId}, ${check.fixtureId}, ${sequence}, ${input.revision.semanticHash}, ${input.revision.modelVersion},
                ${new Date(check.checkedAt)}, ${eligible}, ${encodeShadowArchive(body, { mode: body.forecast.mode, publish: body.forecast.publish })}, ${evidenceFingerprint(body)})`;
            // This pointer is eligibility in shadow mode only; it conveys no publication authority.
            eligibleId = eligible ? revisionId : null;
          } else eligibleId = current[0].eligible ? revisionId : null;
        }
        if (input.availability !== "available") eligibleId = null;
        const observation = input.observation === null ? state.lastObservationJson : encodeShadowArchive(input.observation);
        const observationHash = input.observation === null ? state.lastObservationHash : input.observationHash;
        await tx.$executeRaw`UPDATE IntelligenceShadowState SET latestRevisionId = ${revisionId}, latestEligibleRevisionId = ${eligibleId},
          lastCheckedAt = ${new Date(check.checkedAt)}, checks = checks + 1, lastObservationJson = ${observation === null ? null : typeof observation === "string" ? observation : JSON.stringify(observation)},
          lastObservationHash = ${observationHash as string | null}, availability = ${input.availability} WHERE fixtureId = ${check.fixtureId}`;
        await tx.$executeRaw`INSERT INTO IntelligenceShadowCheck (id, fixtureId, checkedAt, requestHash, outcome, revisionId)
          VALUES (${check.id}, ${check.fixtureId}, ${new Date(check.checkedAt)}, ${check.requestHash}, ${check.outcome}, ${revisionId})`;
        return { ...check, revisionId };
      });
    },
  });
}
