import "server-only";

import type { DatabaseRuntime } from "../database/client.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { utcInstantFromEpochMilliseconds, type UtcInstant } from "../../domain/calendar.ts";
import type { CostAccountState, CostAttempt, CostCategory, CostJobState, CostPeriodState, CostStore, CostTotals, CostTransaction } from "./cost-contract.ts";
import { costFingerprint, costUsdDecimal, costUsdPicosFromDecimal, parseCostAccountState, parseCostAmount, parseCostAttempt,
  parseCostCategory, parseCostIdentity, parseCostJob, parseCostPeriod } from "./cost-input.ts";
import { costAttemptTotals } from "./cost-totals.ts";

export class CostStorageError extends Error {
  constructor() { super("Durable cost accounting is unavailable or invalid; private diagnostics are withheld."); this.name = "CostStorageError"; }
}
const invalid = (): never => { throw new CostStorageError(); };
function sqlDate(value: UtcInstant): Date {
  const date = new Date(utcInstantFromEpochMilliseconds(value));
  if (date.getUTCFullYear() < 1000 || date.getUTCFullYear() > 9999) invalid();
  return date;
}
function sameDate(value: unknown, expected: UtcInstant | null): boolean {
  return expected === null ? value === null : value instanceof Date && value.getTime() === expected;
}
function integer(value: unknown): bigint {
  const text = typeof value === "bigint" ? value.toString() : typeof value === "number" && Number.isSafeInteger(value) ? String(value)
    : typeof value === "string" ? value : "";
  if (!/^(?:0|[1-9][0-9]*)$/u.test(text)) return invalid();
  return BigInt(text);
}
function payload(value: unknown): string {
  return JSON.stringify(value, (_key, child) => typeof child === "bigint" ? { $costInteger: child.toString() } : child);
}
function boolean(value: unknown): boolean {
  if (value === true || value === 1 || value === 1n) return true;
  if (value === false || value === 0 || value === 0n) return false;
  return invalid();
}
function decode<Value>(value: unknown, parse: (input: unknown) => Value): Value {
  try {
    const encoded = typeof value === "string" ? value : JSON.stringify(value);
    const decoded = JSON.parse(encoded, (_key, child: unknown) => {
      if (child !== null && typeof child === "object" && "$costInteger" in child) {
        if (Object.keys(child).length !== 1 || typeof child.$costInteger !== "string" || !/^(?:0|[1-9][0-9]{0,37})$/u.test(child.$costInteger)) return invalid();
        return parseCostAmount(BigInt(child.$costInteger));
      }
      return child;
    });
    return structuredClone(parse(decoded));
  } catch { return invalid(); }
}
type Row = Record<string, unknown>;
const money = (value: unknown) => costUsdPicosFromDecimal(value);
function scopeMatches(value: { accountId: string; category: CostCategory }, accountId: string, category: CostCategory) {
  if (value.accountId !== accountId || value.category !== category) invalid();
}
function decodePeriod(row: Row): CostPeriodState {
  const state = decode(row.stateJson, parseCostPeriod);
  if (row.id !== state.periodId || !sameDate(row.startsAt, state.startsAt) || !sameDate(row.endsAt, state.endsAt)
    || money(row.capAmount) !== state.capUsdPicos || money(row.openingChargedAmount) !== state.openingChargedUsdPicos) invalid();
  return state;
}
function decodeJob(row: Row): CostJobState {
  const state = decode(row.stateJson, parseCostJob);
  if (row.id !== state.jobId || row.workKey !== state.workKey || !sameDate(row.startsAt, state.startsAt)
    || !sameDate(row.deadlineAt, state.deadlineAt) || money(row.capAmount) !== state.costCapUsdPicos) invalid();
  return state;
}
function decodeAttempt(row: Row): CostAttempt {
  if (!boolean(row.validIntegrity)) invalid();
  const state = decode(row.stateJson, (input) => {
    if (input === null || typeof input !== "object" || Object.keys(input).length !== 2
      || !("ledger" in input) || !("projection" in input)) return invalid();
    const ledger = parseCostAttempt(input.ledger);
    if (costFingerprint(costAttemptTotals(ledger)) !== costFingerprint(input.projection)) invalid();
    return ledger;
  }), totals = costAttemptTotals(state);
  const request = state.request;
  if (row.id !== request.attemptId || row.jobId !== request.jobId || row.periodId !== state.periodId || row.state !== state.state
    || row.provider !== request.provider || row.model !== request.model || row.rateVersion !== request.rateVersion
    || !sameDate(row.queuedAt, state.queuedAt) || !sameDate(row.dispatchedAt, state.dispatchedAt)
    || !sameDate(row.kickoffAt, request.priority.kind === "fixture" ? request.priority.kickoffAt : null)
    || row.priority !== (request.priority.kind === "fixture" ? 0 : 1)
    || money(row.maxCostAmount) !== state.maximumCostUsdPicos || money(row.liabilityAmount) !== totals.liabilityUsdPicos
    || integer(row.chargedRequests) !== totals.requests || integer(row.chargedInputTokens) !== totals.inputTokens
    || integer(row.chargedOutputTokens) !== totals.outputTokens || integer(row.chargedBilledUnits) !== totals.billedUnits
    || integer(row.timeMs) !== totals.elapsedMs || boolean(row.overage) !== totals.hasOverage) invalid();
  for (const [column, expected] of [["estimatedAmount", state.estimatedUsdPicos], ["observedAmount", state.observedUsdPicos],
    ["invoicedAmount", state.invoicedUsdPicos]] as const) {
    if (expected === null ? row[column] !== null : money(row[column]) !== expected) invalid();
  }
  return state;
}
const periodProjection = `id, startsAt, endsAt, CAST(capAmount AS CHAR) AS capAmount, CAST(openingChargedAmount AS CHAR) AS openingChargedAmount, stateJson`;
const jobProjection = `id, workKey, startsAt, deadlineAt, CAST(capAmount AS CHAR) AS capAmount, stateJson`;
const attemptProjection = `id, jobId, periodId, state, queuedAt, kickoffAt, priority, deadlineAt, dispatchedAt,
  CAST(maxCostAmount AS CHAR) AS maxCostAmount, CAST(liabilityAmount AS CHAR) AS liabilityAmount,
  CAST(estimatedAmount AS CHAR) AS estimatedAmount, CAST(observedAmount AS CHAR) AS observedAmount,
  CAST(invoicedAmount AS CHAR) AS invoicedAmount, chargedRequests, chargedInputTokens, chargedOutputTokens,
  chargedBilledUnits, timeMs, overage, provider, model, rateVersion, stateJson,
  integrity = SHA2(CAST(stateJson AS CHAR), 256) AS validIntegrity`;

// Verify the sealed, strictly parsed ledger and exact projections in SQL so workers never
// transfer the entire monthly ledger merely to calculate a spending limit.
const projectedInteger = (field: keyof CostTotals) =>
  `CAST(JSON_UNQUOTE(JSON_EXTRACT(stateJson, '$.projection.${field}."$costInteger"')) AS DECIMAL(38, 0))`;
const validAggregateProjection = [
  "integrity = SHA2(CAST(stateJson AS CHAR), 256)",
  "accountId = JSON_UNQUOTE(JSON_EXTRACT(stateJson, '$.ledger.request.accountId'))",
  "category = JSON_UNQUOTE(JSON_EXTRACT(stateJson, '$.ledger.request.category'))",
  "id = JSON_UNQUOTE(JSON_EXTRACT(stateJson, '$.ledger.request.attemptId'))",
  "jobId = JSON_UNQUOTE(JSON_EXTRACT(stateJson, '$.ledger.request.jobId'))",
  "periodId <=> IF(JSON_TYPE(JSON_EXTRACT(stateJson, '$.ledger.periodId')) = 'NULL', NULL, JSON_UNQUOTE(JSON_EXTRACT(stateJson, '$.ledger.periodId')))",
  "state = JSON_UNQUOTE(JSON_EXTRACT(stateJson, '$.ledger.state'))",
  "provider = JSON_UNQUOTE(JSON_EXTRACT(stateJson, '$.ledger.request.provider'))",
  "model <=> IF(JSON_TYPE(JSON_EXTRACT(stateJson, '$.ledger.request.model')) = 'NULL', NULL, JSON_UNQUOTE(JSON_EXTRACT(stateJson, '$.ledger.request.model')))",
  "rateVersion = JSON_UNQUOTE(JSON_EXTRACT(stateJson, '$.ledger.request.rateVersion'))",
  `maxCostAmount * 1000000000000 = CAST(JSON_UNQUOTE(JSON_EXTRACT(stateJson, '$.ledger.maximumCostUsdPicos."$costInteger"')) AS DECIMAL(38, 0))`,
  ...[["liabilityAmount", "liabilityUsdPicos"], ["estimatedAmount", "estimatedUsdPicos"],
    ["observedAmount", "observedUsdPicos"], ["invoicedAmount", "invoicedUsdPicos"]].map(([column, field]) =>
    `COALESCE(${column}, 0) * 1000000000000 = ${projectedInteger(field as keyof CostTotals)}`),
  ...[["chargedRequests", "requests"], ["chargedInputTokens", "inputTokens"], ["chargedOutputTokens", "outputTokens"],
    ["chargedBilledUnits", "billedUnits"], ["timeMs", "elapsedMs"]].map(([column, field]) =>
    `${column} = ${projectedInteger(field as keyof CostTotals)}`),
  `${projectedInteger("attemptCount")} = 1`,
  "CAST(overage AS CHAR) = CASE JSON_UNQUOTE(JSON_EXTRACT(stateJson, '$.projection.hasOverage')) WHEN 'true' THEN '1' WHEN 'false' THEN '0' END",
].join(" AND ");

function assertAttemptUpdate(previous: CostAttempt, next: CostAttempt): void {
  const transitions: Record<CostAttempt["state"], readonly CostAttempt["state"][]> = {
    queued: ["queued", "reserved"], reserved: ["reserved", "dispatched", "canceled"],
    dispatched: ["dispatched", "completed", "uncertain"], uncertain: ["uncertain", "completed"],
    completed: ["completed", "uncertain"], canceled: ["canceled"],
  };
  if (!transitions[previous.state].includes(next.state) || previous.queuedAt !== next.queuedAt
    || previous.requestFingerprint !== next.requestFingerprint || costFingerprint(previous.rate) !== costFingerprint(next.rate)
    || previous.maximumCostUsdPicos !== next.maximumCostUsdPicos) invalid();
  if (previous.reservedAt !== null && (previous.reservedAt !== next.reservedAt || previous.launchBefore !== next.launchBefore
    || previous.ownerToken !== next.ownerToken || previous.periodId !== next.periodId)) invalid();
  if (previous.dispatchedAt !== null && previous.dispatchedAt !== next.dispatchedAt) invalid();
  if (previous.completedAt !== null && next.completedAt !== null && next.completedAt < previous.completedAt) invalid();
  if (next.reconciliations.length < previous.reconciliations.length || previous.reconciliations.some((entry, index) =>
    costFingerprint(entry) !== costFingerprint(next.reconciliations[index]))) invalid();
  // Replaying a stored receipt cannot rewrite settlement. Lifecycle transitions before a receipt
  // are the only changes permitted without appending independently verified billing evidence.
  if (["completed", "uncertain", "canceled"].includes(previous.state)
    && next.reconciliations.length === previous.reconciliations.length && costFingerprint(previous) !== costFingerprint(next)) invalid();
}

function transactionApi(transaction: Prisma.TransactionClient, accountId: string, category: CostCategory): CostTransaction {
  // SQL fragments below are code-owned constants; every external value remains a parameter.
  async function rows(projection: string, table: string, suffix = "", parameters: unknown[] = []): Promise<Row[]> {
    return transaction.$queryRawUnsafe<Row[]>(`SELECT ${projection} FROM ${table} WHERE accountId = ? AND category = ? ${suffix}`,
      accountId, category, ...parameters);
  }
  async function one<Value>(projection: string, table: string, id: string, decoder: (row: Row) => Value): Promise<Value | null> {
    parseCostIdentity(id);
    const result = await rows(projection, table, "AND id = ?", [id]);
    if (result.length === 0) return null;
    if (result.length !== 1) return invalid();
    const value = decoder(result[0]!);
    scopeMatches(value as Value & { accountId: string; category: CostCategory }, accountId, category);
    return value;
  }
  async function attempts(filter: Readonly<{ periodId?: string; jobId?: string }> = {}) {
    const clauses: string[] = [], values: string[] = [];
    for (const field of ["periodId", "jobId"] as const) if (filter[field] !== undefined) {
      clauses.push(`AND ${field} = ?`); values.push(parseCostIdentity(filter[field]));
    }
    return Promise.all((await rows(attemptProjection, "CostBudgetAttempt", clauses.join(" "), values)).map(readAttempt));
  }
  async function readAttempt(row: Row) {
    const state = decodeAttempt(row); scopeMatches(state.request, accountId, category);
    const job = await one(jobProjection, "CostBudgetJob", state.request.jobId, decodeJob);
    if (!job || !sameDate(row.deadlineAt, job.deadlineAt)) invalid();
    return state;
  }
  return {
    async now() {
      const result = await transaction.$queryRaw<{ now: Date }[]>`SELECT UTC_TIMESTAMP(3) AS now`;
      if (result.length !== 1 || !(result[0]?.now instanceof Date)) return invalid();
      return utcInstantFromEpochMilliseconds(result[0].now.getTime());
    },
    async account() {
      const result = await rows("stateJson", "CostBudgetAccount");
      if (result.length !== 1) return invalid();
      if (result[0]!.stateJson === null) return null;
      const state = decode(result[0]!.stateJson, parseCostAccountState); scopeMatches(state, accountId, category); return state;
    },
    async saveAccount(input: CostAccountState) {
      const state = parseCostAccountState(input); scopeMatches(state, accountId, category);
      const value = payload(state);
      await transaction.$executeRaw`UPDATE CostBudgetAccount SET stateJson = CAST(${value} AS JSON) WHERE accountId = ${accountId} AND category = ${category}`;
    },
    period: (id) => one(periodProjection, "CostBudgetPeriod", id, decodePeriod),
    async periods() {
      return (await rows(periodProjection, "CostBudgetPeriod")).map((row) => {
        const state = decodePeriod(row); scopeMatches(state, accountId, category); return state;
      });
    },
    async savePeriod(input) {
      const state = parseCostPeriod(input); scopeMatches(state, accountId, category);
      const existing = await one(periodProjection, "CostBudgetPeriod", state.periodId, decodePeriod);
      if (existing) { if (costFingerprint(existing) !== costFingerprint(state)) invalid(); return; }
      const value = payload(state), startsAt = sqlDate(state.startsAt), endsAt = sqlDate(state.endsAt);
      const cap = costUsdDecimal(state.capUsdPicos), opening = costUsdDecimal(state.openingChargedUsdPicos);
      await transaction.$executeRaw`INSERT INTO CostBudgetPeriod (accountId, category, id, startsAt, endsAt, capAmount, openingChargedAmount, stateJson)
        VALUES (${accountId}, ${category}, ${state.periodId}, ${startsAt}, ${endsAt}, ${cap}, ${opening}, CAST(${value} AS JSON))`;
    },
    job: (id) => one(jobProjection, "CostBudgetJob", id, decodeJob),
    async jobByWorkKey(workKey) {
      const result = await rows(jobProjection, "CostBudgetJob", "AND workKey = ?", [parseCostIdentity(workKey)]);
      if (result.length === 0) return null;
      if (result.length !== 1) return invalid();
      const state = decodeJob(result[0]!); scopeMatches(state, accountId, category); return state;
    },
    async saveJob(input) {
      const state = parseCostJob(input); scopeMatches(state, accountId, category);
      const existing = await one(jobProjection, "CostBudgetJob", state.jobId, decodeJob);
      if (existing) { if (costFingerprint(existing) !== costFingerprint(state)) invalid(); return; }
      const value = payload(state), startsAt = sqlDate(state.startsAt), deadlineAt = sqlDate(state.deadlineAt), cap = costUsdDecimal(state.costCapUsdPicos);
      await transaction.$executeRaw`INSERT INTO CostBudgetJob (accountId, category, id, workKey, startsAt, deadlineAt, capAmount, stateJson)
        VALUES (${accountId}, ${category}, ${state.jobId}, ${state.workKey}, ${startsAt}, ${deadlineAt}, ${cap}, CAST(${value} AS JSON))`;
    },
    async attempt(id) {
      const result = await rows(attemptProjection, "CostBudgetAttempt", "AND id = ?", [parseCostIdentity(id)]);
      if (result.length === 0) return null;
      if (result.length !== 1) return invalid();
      return readAttempt(result[0]!);
    },
    async saveAttempt(input) {
      const state = parseCostAttempt(input); scopeMatches(state.request, accountId, category);
      const totals = costAttemptTotals(state), value = payload({ ledger: state, projection: totals }), request = state.request;
      const queuedAt = sqlDate(state.queuedAt), kickoffAt = request.priority.kind === "fixture" ? sqlDate(request.priority.kickoffAt) : null;
      const priority = request.priority.kind === "fixture" ? 0 : 1;
      const job = await one(jobProjection, "CostBudgetJob", request.jobId, decodeJob);
      if (!job) return invalid();
      const deadlineAt = sqlDate(job.deadlineAt), dispatchedAt = state.dispatchedAt === null ? null : sqlDate(state.dispatchedAt);
      const maximum = costUsdDecimal(state.maximumCostUsdPicos), liability = costUsdDecimal(totals.liabilityUsdPicos);
      const estimated = state.estimatedUsdPicos === null ? null : costUsdDecimal(state.estimatedUsdPicos);
      const observed = state.observedUsdPicos === null ? null : costUsdDecimal(state.observedUsdPicos);
      const invoiced = state.invoicedUsdPicos === null ? null : costUsdDecimal(state.invoicedUsdPicos);
      const existing = await rows(attemptProjection, "CostBudgetAttempt", "AND id = ?", [request.attemptId]);
      if (existing.length > 1) invalid();
      if (existing.length === 1) assertAttemptUpdate(await readAttempt(existing[0]!), state);
      if (!existing.length) {
        if (state.state !== "queued") invalid();
        await transaction.$executeRaw`INSERT INTO CostBudgetAttempt (accountId, category, id, jobId, periodId, state, queuedAt,
          kickoffAt, priority, deadlineAt, dispatchedAt, maxCostAmount, liabilityAmount, estimatedAmount, observedAmount, invoicedAmount,
          chargedRequests, chargedInputTokens, chargedOutputTokens, chargedBilledUnits, timeMs, overage, provider, model, rateVersion, stateJson, integrity)
          VALUES (${accountId}, ${category}, ${request.attemptId}, ${request.jobId}, ${state.periodId}, ${state.state}, ${queuedAt}, ${kickoffAt},
          ${priority}, ${deadlineAt}, ${dispatchedAt}, ${maximum}, ${liability}, ${estimated}, ${observed}, ${invoiced}, ${totals.requests},
          ${totals.inputTokens}, ${totals.outputTokens}, ${totals.billedUnits}, ${totals.elapsedMs}, ${totals.hasOverage},
          ${request.provider}, ${request.model}, ${request.rateVersion}, CAST(${value} AS JSON), SHA2(CAST(CAST(${value} AS JSON) AS CHAR), 256))`;
      } else {
        await transaction.$executeRaw`UPDATE CostBudgetAttempt SET periodId = ${state.periodId}, state = ${state.state}, dispatchedAt = ${dispatchedAt},
          liabilityAmount = ${liability}, estimatedAmount = ${estimated}, observedAmount = ${observed}, invoicedAmount = ${invoiced},
          chargedRequests = ${totals.requests}, chargedInputTokens = ${totals.inputTokens}, chargedOutputTokens = ${totals.outputTokens},
          chargedBilledUnits = ${totals.billedUnits}, timeMs = ${totals.elapsedMs}, overage = ${totals.hasOverage}, stateJson = CAST(${value} AS JSON),
          integrity = SHA2(CAST(CAST(${value} AS JSON) AS CHAR), 256)
          WHERE accountId = ${accountId} AND category = ${category} AND id = ${request.attemptId}`;
      }
    },
    attempts,
    async queued() { return Promise.all((await rows(attemptProjection, "CostBudgetAttempt", "AND state = 'queued'")).map(readAttempt)); },
    async totals(filter = {}): Promise<CostTotals> {
      const clauses: string[] = [], values: string[] = [];
      for (const field of ["periodId", "jobId"] as const) if (filter[field] !== undefined) {
        clauses.push(`AND ${field} = ?`); values.push(parseCostIdentity(filter[field]));
      }
      const projection = `CAST(COALESCE(SUM(liabilityAmount), 0) AS CHAR) AS liabilityUsd,
        CAST(COALESCE(SUM(estimatedAmount), 0) AS CHAR) AS estimatedUsd,
        CAST(COALESCE(SUM(observedAmount), 0) AS CHAR) AS observedUsd,
        CAST(COALESCE(SUM(invoicedAmount), 0) AS CHAR) AS invoicedUsd,
        CAST(COALESCE(SUM(chargedRequests), 0) AS CHAR) AS requests, CAST(COALESCE(SUM(chargedInputTokens), 0) AS CHAR) AS inputTokens,
        CAST(COALESCE(SUM(chargedOutputTokens), 0) AS CHAR) AS outputTokens, CAST(COALESCE(SUM(chargedBilledUnits), 0) AS CHAR) AS billedUnits,
        CAST(COALESCE(SUM(timeMs), 0) AS CHAR) AS elapsedMs, CAST(COUNT(*) AS CHAR) AS attemptCount, COALESCE(MAX(overage), 0) AS hasOverage,
        CAST(COALESCE(SUM(NOT COALESCE((${validAggregateProjection}), FALSE)), 0) AS CHAR) AS invalidCount`;
      const result = await rows(projection, "CostBudgetAttempt", clauses.join(" "), values);
      if (result.length !== 1) return invalid();
      const row = result[0]!;
      if (integer(row.invalidCount) !== 0n) invalid();
      const debt = await rows("id", "CostBudgetPeriod", "AND openingChargedAmount > capAmount LIMIT 1");
      return Object.freeze({ liabilityUsdPicos: money(row.liabilityUsd), estimatedUsdPicos: money(row.estimatedUsd),
        observedUsdPicos: money(row.observedUsd), invoicedUsdPicos: money(row.invoicedUsd),
        requests: integer(row.requests), inputTokens: integer(row.inputTokens),
        outputTokens: integer(row.outputTokens), billedUnits: integer(row.billedUnits), elapsedMs: integer(row.elapsedMs),
        attemptCount: integer(row.attemptCount), hasOverage: boolean(row.hasOverage) || debt.length > 0 });
    },
  };
}

/** The transaction owns account/category serialization; callbacks contain database work only and are never automatically retried. */
export function createMysqlCostStore(database: DatabaseRuntime): CostStore {
  return Object.freeze({
    async transaction<Result>(inputAccount: string, inputCategory: CostCategory, operation: (transaction: CostTransaction) => Promise<Result>): Promise<Result> {
      const accountId = parseCostIdentity(inputAccount), category = parseCostCategory(inputCategory);
      return database.transaction(async (transaction) => {
        await transaction.$executeRaw`INSERT INTO CostBudgetAccount (accountId, category) VALUES (${accountId}, ${category})
          ON DUPLICATE KEY UPDATE accountId = VALUES(accountId)`;
        const locked = await transaction.$queryRaw<Row[]>`SELECT accountId FROM CostBudgetAccount
          WHERE accountId = ${accountId} AND category = ${category} FOR UPDATE`;
        if (locked.length !== 1 || locked[0]!.accountId !== accountId) return invalid();
        return operation(transactionApi(transaction, accountId, category));
      }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 30_000 });
    },
  });
}
