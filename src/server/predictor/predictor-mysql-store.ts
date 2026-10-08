import "server-only";

import type { DatabaseRuntime } from "../database/client.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import type { ModelAuthority, ModelVersion } from "./predictor-contract.ts";
import { parseModelVersion, serializeModelVersion } from "./predictor-input.ts";
import { assertModelAuthorized } from "./predictor-registry.ts";

export class ModelStorageError extends Error {
  readonly reason: "invalid-request" | "not-authorized" | "invalid-state" | "unavailable";
  constructor(reason: ModelStorageError["reason"]) {
    super("Predictor model storage is invalid or unavailable. Private diagnostics are withheld.");
    this.name = "ModelStorageError"; this.reason = reason;
  }
}
const fail = (reason: ModelStorageError["reason"]): never => { throw new ModelStorageError(reason); };
type Row = Record<string, unknown>;
const identity = (value: unknown): string => {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) return fail("invalid-request");
  return value;
};
function authorized(model: ModelVersion, authority: ModelAuthority): void {
  try { assertModelAuthorized(model, authority); } catch { return fail("not-authorized"); }
}
function fromRow(row: Row): ModelVersion {
  if (row.validIntegrity !== true && row.validIntegrity !== 1 && row.validIntegrity !== 1n) return fail("invalid-state");
  let model: ModelVersion;
  try { model = parseModelVersion(typeof row.configurationJson === "string" ? JSON.parse(row.configurationJson) : row.configurationJson); }
  catch { return fail("invalid-state"); }
  const fields = ["id", "provider", "model", "providerModelVersion", "contractVersion", "promptVersion", "schemaVersion"] as const;
  if (fields.some((key) => row[key] !== model[key]) || row.calibrationKind !== model.calibration.kind ||
    row.calibrationVersion !== model.calibration.version || row.evaluationStatus !== model.evaluation.status ||
    row.evaluationVersion !== model.evaluation.version) return fail("invalid-state");
  for (const [name, value] of Object.entries(model.windows)) {
    const startsAt = row[`${name}StartsAt`], endsAt = row[`${name}EndsAt`];
    if (value === null ? startsAt !== null || endsAt !== null : !(startsAt instanceof Date) || !(endsAt instanceof Date) ||
      startsAt.getTime() !== value.startsAt || endsAt.getTime() !== value.endsAt) return fail("invalid-state");
  }
  return model;
}
/** App credentials require only SELECT and INSERT on ModelVersion. Existing
 * configurations are read and compared, never overwritten or silently edited. */
export function createMysqlModelVersionStore(database: DatabaseRuntime) {
  async function stored(transaction: Prisma.TransactionClient, id: string): Promise<ModelVersion | null> {
    const rows = await transaction.$queryRaw<Row[]>`SELECT *,
      integrity = SHA2(CONCAT(id, ':', CAST(configurationJson AS CHAR)), 256) AS validIntegrity
      FROM ModelVersion WHERE id = ${id}`;
    if (rows.length === 0) return null;
    const row = rows[0];
    if (rows.length !== 1 || row === undefined || row.id !== id) return fail("invalid-state");
    return fromRow(row);
  }
  async function find(id: string): Promise<ModelVersion | null> {
    identity(id);
    let domainError: ModelStorageError | undefined;
    try {
      return await database.transaction(async (transaction) => {
        try { return await stored(transaction, id); }
        catch (error) { if (error instanceof ModelStorageError) domainError = error; throw error; }
      }, { isolationLevel: "RepeatableRead", timeout: 30_000 });
    } catch { if (domainError) throw domainError; return fail("unavailable"); }
  }
  async function save(value: ModelVersion, authority: ModelAuthority): Promise<ModelVersion> {
    let model: ModelVersion;
    try { model = parseModelVersion(value); } catch { return fail("invalid-request"); }
    authorized(model, authority);
    let domainError: ModelStorageError | undefined;
    try {
      return await database.transaction(async (transaction) => {
        try {
          authorized(model, authority);
          const previous = await stored(transaction, model.id);
          if (previous !== null) { authorized(previous, authority); return previous; }
          const configuration = serializeModelVersion(model), windows = model.windows;
          const date = (value: number | undefined) => value === undefined ? null : new Date(value);
          await transaction.$executeRaw`INSERT INTO ModelVersion
            (id, provider, model, providerModelVersion, contractVersion, promptVersion, schemaVersion,
             calibrationKind, calibrationVersion, evaluationStatus, evaluationVersion,
             trainingStartsAt, trainingEndsAt, validationStartsAt, validationEndsAt,
             calibrationStartsAt, calibrationEndsAt, finalTestStartsAt, finalTestEndsAt, integrity, configurationJson)
            VALUES (${model.id}, ${model.provider}, ${model.model}, ${model.providerModelVersion}, ${model.contractVersion},
              ${model.promptVersion}, ${model.schemaVersion}, ${model.calibration.kind}, ${model.calibration.version},
              ${model.evaluation.status}, ${model.evaluation.version},
              ${date(windows.training?.startsAt)}, ${date(windows.training?.endsAt)},
              ${date(windows.validation?.startsAt)}, ${date(windows.validation?.endsAt)},
              ${date(windows.calibration?.startsAt)}, ${date(windows.calibration?.endsAt)},
              ${date(windows.finalTest?.startsAt)}, ${date(windows.finalTest?.endsAt)},
              SHA2(CONCAT(${model.id}, ':', CAST(CAST(${configuration} AS JSON) AS CHAR)), 256), CAST(${configuration} AS JSON))`;
          const saved = await stored(transaction, model.id);
          if (saved === null) return fail("invalid-state");
          authorized(saved, authority);
          return saved;
        } catch (error) { if (error instanceof ModelStorageError) domainError = error; throw error; }
      }, { isolationLevel: "ReadCommitted", timeout: 30_000 });
    } catch {
      if (domainError) throw domainError;
      // A concurrent identical insert may have won. Read its immutable record;
      // do not replay a transaction callback or acquire UPDATE privileges.
      const previous = await find(model.id);
      if (previous === null) return fail("unavailable");
      authorized(previous, authority);
      return previous;
    }
  }
  return Object.freeze({ save, find });
}
