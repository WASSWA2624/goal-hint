import "server-only";

import { z } from "zod";
import { utcInstantFromEpochMilliseconds, type UtcInstant } from "../../domain/calendar.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import {
  quotaPriorities,
  type QuotaAccountState,
  type QuotaAttempt,
  type QuotaPeriodState,
  type QuotaStore,
  type QuotaTransaction,
} from "./quota-contract.ts";

const identifier = z.string().regex(/^[a-f0-9]{64}$/);
const counter = z.number().int().nonnegative();
const instant = z.number().int().min(-8_640_000_000_000_000).max(8_640_000_000_000_000)
  .transform(utcInstantFromEpochMilliseconds);
const accountSchema = z.object({
  activePeriodId: identifier,
  candidatePeriodId: identifier.nullable(),
  nextDispatchAt: instant,
  cooldownUntil: instant,
  lastNow: instant,
  lastLaunchedAt: instant,
  status: z.enum(["active", "credential-failure", "subscription-expired"]),
});
const periodSchema = z.object({
  id: identifier,
  kind: z.enum(["confirmed", "candidate"]),
  startsAt: instant,
  endsAt: instant,
  subscriptionExpiresAt: instant,
  providerDailyLimit: counter,
  secondLimit: counter,
  minuteLimit: counter,
  dayLimit: counter,
  used: counter,
  ordinaryUsed: counter,
  dayRemaining: counter,
  minuteRemaining: counter.nullable(),
  minuteFloorUntil: instant.nullable(),
  probeRequestId: identifier.nullable(),
  evidenceRef: z.string().min(1).max(512),
  observationRevision: counter,
}).refine((value) => value.startsAt < value.endsAt && value.ordinaryUsed <= value.used);
// Reuse the canonical durable-state contract for read-only private monitoring.
export { accountSchema as quotaAccountStateSchema, periodSchema as quotaPeriodStateSchema };
const attemptSchema = z.object({
  id: identifier,
  workKey: identifier.nullable(),
  priority: z.enum([
    "results-cutoff", "recovery", "near-kickoff-fallback", "live-date-sync", "daily-inputs", "enrichment",
  ]),
  rank: counter,
  essential: z.boolean(),
  queuedAt: instant,
  deadlineAt: instant,
  timeoutMs: z.number().int().positive(),
  state: z.enum(["queued", "attempted", "completed", "uncertain", "expired"]),
  dispatchedAt: instant.nullable(),
  leaseUntil: instant.nullable(),
  periodId: identifier.nullable(),
  sequence: counter.nullable(),
  ownerToken: identifier.nullable(),
  responseKind: z.enum([
    "success", "uncertain", "rate-limited", "credential-failure", "subscription-expired", "provider-error",
  ]).nullable(),
  launchedAt: instant.nullable(),
  observationRevision: counter,
}).refine((value) => {
  const priority = quotaPriorities[value.priority];
  if (value.rank !== priority.rank || value.essential !== priority.essential) return false;
  if (value.state === "queued") return value.dispatchedAt === null && value.periodId === null && value.sequence === null;
  if (value.state === "expired" && value.dispatchedAt === null) return true;
  return value.dispatchedAt !== null && value.periodId !== null && value.sequence !== null;
});

class QuotaStorageError extends Error {
  constructor() {
    super("Durable quota state is invalid; private storage details are withheld.");
    this.name = "QuotaStorageError";
  }
}

function decode<Schema extends z.ZodType>(schema: Schema, value: unknown): z.output<Schema> {
  try {
    const result = schema.safeParse(typeof value === "string" ? JSON.parse(value) : value);
    if (result.success) return result.data;
  } catch { /* Invalid stored JSON fails closed without revealing its contents. */ }
  throw new QuotaStorageError();
}

function checkedIdentifier(value: string): string {
  if (!identifier.safeParse(value).success) throw new QuotaStorageError();
  return value;
}

function sqlDate(value: UtcInstant): Date {
  const date = new Date(utcInstantFromEpochMilliseconds(value));
  if (date.getUTCFullYear() < 1000 || date.getUTCFullYear() > 9999) throw new QuotaStorageError();
  return date;
}

function storedInstant(value: unknown): UtcInstant {
  if (!(value instanceof Date)) throw new QuotaStorageError();
  try { return utcInstantFromEpochMilliseconds(value.getTime()); }
  catch { throw new QuotaStorageError(); }
}

type AttemptRow = {
  id: string;
  workKey: string | null;
  state: string;
  priority: number;
  queuedAt: Date;
  deadlineAt: Date;
  dispatchedAt: Date | null;
  periodId: string | null;
  sequence: number | null;
  payloadJson: unknown;
};

// Validate the indexed projection as well as the payload. Corruption must never
// make an attempted dispatch disappear from a rolling window or queue ordering.
function decodeAttempt(row: AttemptRow): QuotaAttempt {
  const attempt = decode(attemptSchema, row.payloadJson);
  const dispatchedAt = row.dispatchedAt === null ? null : storedInstant(row.dispatchedAt);
  if (attempt.id !== row.id || attempt.workKey !== row.workKey || attempt.state !== row.state ||
      attempt.rank !== row.priority || attempt.queuedAt !== storedInstant(row.queuedAt) ||
      attempt.deadlineAt !== storedInstant(row.deadlineAt) || attempt.dispatchedAt !== dispatchedAt ||
      attempt.periodId !== row.periodId || attempt.sequence !== row.sequence) {
    throw new QuotaStorageError();
  }
  return attempt;
}

function quotaTransaction(transaction: Prisma.TransactionClient, accountId: string): QuotaTransaction {
  return {
    async now() {
      const rows = await transaction.$queryRaw<{ now: Date }[]>`SELECT UTC_TIMESTAMP(3) AS now`;
      if (rows.length !== 1) throw new QuotaStorageError();
      return storedInstant(rows[0]!.now);
    },
    async account() {
      const rows = await transaction.$queryRaw<{ stateJson: unknown }[]>`
        SELECT stateJson FROM ApiQuotaAccount WHERE id = ${accountId}
      `;
      if (rows.length !== 1) throw new QuotaStorageError();
      return rows[0]!.stateJson === null ? null : decode(accountSchema, rows[0]!.stateJson);
    },
    async saveAccount(state: QuotaAccountState) {
      const payload = JSON.stringify(decode(accountSchema, state));
      await transaction.$executeRaw`
        UPDATE ApiQuotaAccount SET stateJson = CAST(${payload} AS JSON) WHERE id = ${accountId}
      `;
    },
    async period(id: string) {
      checkedIdentifier(id);
      const rows = await transaction.$queryRaw<{ id: string; stateJson: unknown }[]>`
        SELECT id, stateJson FROM ApiQuotaPeriod WHERE accountId = ${accountId} AND id = ${id}
      `;
      if (rows.length === 0) return null;
      if (rows.length !== 1) throw new QuotaStorageError();
      const period = decode(periodSchema, rows[0]!.stateJson);
      if (period.id !== rows[0]!.id) throw new QuotaStorageError();
      return period;
    },
    async savePeriod(state: QuotaPeriodState) {
      const period = decode(periodSchema, state);
      const payload = JSON.stringify(period);
      await transaction.$executeRaw`
        INSERT INTO ApiQuotaPeriod (accountId, id, stateJson)
        VALUES (${accountId}, ${period.id}, CAST(${payload} AS JSON))
        ON DUPLICATE KEY UPDATE stateJson = VALUES(stateJson)
      `;
    },
    async attempt(id: string) {
      checkedIdentifier(id);
      const rows = await transaction.$queryRaw<AttemptRow[]>`
        SELECT id, workKey, state, priority, queuedAt, deadlineAt, dispatchedAt, periodId, sequence, payloadJson
        FROM ApiQuotaAttempt WHERE accountId = ${accountId} AND id = ${id}
      `;
      if (rows.length === 0) return null;
      if (rows.length !== 1) throw new QuotaStorageError();
      return decodeAttempt(rows[0]!);
    },
    async inFlight(workKey: string) {
      checkedIdentifier(workKey);
      const rows = await transaction.$queryRaw<AttemptRow[]>`
        SELECT id, workKey, state, priority, queuedAt, deadlineAt, dispatchedAt, periodId, sequence, payloadJson
        FROM ApiQuotaAttempt WHERE accountId = ${accountId} AND workKey = ${workKey}
      `;
      if (rows.length === 0) return null;
      if (rows.length !== 1) throw new QuotaStorageError();
      return decodeAttempt(rows[0]!);
    },
    async saveAttempt(state: QuotaAttempt) {
      const attempt = decode(attemptSchema, state);
      const payload = JSON.stringify(attempt);
      const queuedAt = sqlDate(attempt.queuedAt);
      const deadlineAt = sqlDate(attempt.deadlineAt);
      const dispatchedAt = attempt.dispatchedAt === null ? null : sqlDate(attempt.dispatchedAt);
      const existing = await transaction.$queryRaw<{ id: string }[]>`
        SELECT id FROM ApiQuotaAttempt WHERE accountId = ${accountId} AND id = ${attempt.id}
      `;
      // A native ON DUPLICATE KEY UPDATE could target somebody else's attempt
      // through the independent workKey unique constraint. Account locking makes
      // this explicit primary-key upsert atomic; a workKey collision must fail.
      if (existing.length === 0) {
        await transaction.$executeRaw`
          INSERT INTO ApiQuotaAttempt (
            accountId, id, workKey, state, priority, queuedAt, deadlineAt, dispatchedAt, periodId, sequence, payloadJson
          ) VALUES (
            ${accountId}, ${attempt.id}, ${attempt.workKey}, ${attempt.state}, ${attempt.rank}, ${queuedAt},
            ${deadlineAt}, ${dispatchedAt}, ${attempt.periodId}, ${attempt.sequence}, CAST(${payload} AS JSON)
          )
        `;
      } else if (existing.length === 1 && existing[0]!.id === attempt.id) {
        await transaction.$executeRaw`
          UPDATE ApiQuotaAttempt SET
            workKey = ${attempt.workKey}, state = ${attempt.state}, priority = ${attempt.rank}, queuedAt = ${queuedAt},
            deadlineAt = ${deadlineAt}, dispatchedAt = ${dispatchedAt}, periodId = ${attempt.periodId},
            sequence = ${attempt.sequence}, payloadJson = CAST(${payload} AS JSON)
          WHERE accountId = ${accountId} AND id = ${attempt.id}
        `;
      } else {
        throw new QuotaStorageError();
      }
    },
    async rollingAttempts(since: UtcInstant) {
      const start = sqlDate(since);
      const rows = await transaction.$queryRaw<AttemptRow[]>`
        SELECT id, workKey, state, priority, queuedAt, deadlineAt, dispatchedAt, periodId, sequence, payloadJson
        FROM ApiQuotaAttempt WHERE accountId = ${accountId} AND dispatchedAt > ${start}
        ORDER BY dispatchedAt, id
      `;
      return rows.map(decodeAttempt);
    },
    async periodAttempts(periodId: string, afterSequence: number) {
      checkedIdentifier(periodId);
      if (!counter.safeParse(afterSequence).success) throw new QuotaStorageError();
      const rows = await transaction.$queryRaw<AttemptRow[]>`
        SELECT id, workKey, state, priority, queuedAt, deadlineAt, dispatchedAt, periodId, sequence, payloadJson
        FROM ApiQuotaAttempt WHERE accountId = ${accountId} AND periodId = ${periodId} AND sequence > ${afterSequence}
        ORDER BY sequence, id
      `;
      return rows.map(decodeAttempt);
    },
    async unresolvedBefore(periodId: string, sequence: number) {
      checkedIdentifier(periodId);
      if (!counter.safeParse(sequence).success) throw new QuotaStorageError();
      const rows = await transaction.$queryRaw<{ count: bigint | number }[]>`
        SELECT COUNT(*) AS count FROM ApiQuotaAttempt
        WHERE accountId = ${accountId} AND periodId = ${periodId} AND sequence < ${sequence}
          AND state IN ('attempted', 'uncertain')
      `;
      if (rows.length !== 1) throw new QuotaStorageError();
      const count = Number(rows[0]!.count);
      if (!counter.safeParse(count).success) throw new QuotaStorageError();
      return count;
    },
    async queueHead(now: UtcInstant) {
      const current = sqlDate(now);
      const rows = await transaction.$queryRaw<AttemptRow[]>`
        SELECT id, workKey, state, priority, queuedAt, deadlineAt, dispatchedAt, periodId, sequence, payloadJson
        FROM ApiQuotaAttempt
        WHERE accountId = ${accountId} AND state = 'queued' AND deadlineAt > ${current}
        ORDER BY priority, queuedAt, id LIMIT 1
      `;
      if (rows.length === 0) return null;
      if (rows.length !== 1) throw new QuotaStorageError();
      return decodeAttempt(rows[0]!);
    },
  };
}

/** Durable account-wide serialization; the callback must contain database work only. */
export function createMysqlQuotaStore(database: DatabaseRuntime): QuotaStore {
  return Object.freeze({
    async transaction<Result>(accountId: string, operation: (transaction: QuotaTransaction) => Promise<Result>): Promise<Result> {
      checkedIdentifier(accountId);
      return database.transaction(async (transaction) => {
        // INSERT also handles the first caller racing another process to bootstrap
        // the row. Its lock remains held until this entire reservation commits.
        await transaction.$executeRaw`
          INSERT INTO ApiQuotaAccount (id) VALUES (${accountId}) ON DUPLICATE KEY UPDATE id = id
        `;
        const locked = await transaction.$queryRaw<{ id: string }[]>`
          SELECT id FROM ApiQuotaAccount WHERE id = ${accountId} FOR UPDATE
        `;
        if (locked.length !== 1 || locked[0]!.id !== accountId) throw new QuotaStorageError();
        return operation(quotaTransaction(transaction, accountId));
      }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 10_000 });
    },
  });
}
