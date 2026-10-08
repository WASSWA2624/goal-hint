import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import type { CostAccountState, CostAmount, CostAttempt, CostCategory, CostJobPolicy, CostPeriodPolicy, CostPermit, CostQuantities, CostRateCard, CostRequest, CostUsage } from "./cost-contract.ts";

export const COST_USD_SCALE = 1_000_000_000_000n;
export const COST_MAX_USD_PICOS = 10n ** 38n - 1n;
export class CostInputError extends Error {
  readonly reason: "invalid-request" | "unpriced" | "invalid-pricing";
  constructor(reason: CostInputError["reason"] = "invalid-request") {
    super("Cost accounting input is invalid. Private values are withheld.");
    this.name = "CostInputError";
    this.reason = reason;
  }
}
const quantity = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positive = quantity.positive();
const duration = positive.max(2_147_483_647);
const category = z.enum(["ai", "research"]);
const identity = z.string().regex(/^[a-f0-9]{64}$/u);
const label = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u);
const instant = z.number().int().refine((value) => {
  try {
    utcInstantFromEpochMilliseconds(value);
    const year = new Date(value).getUTCFullYear();
    return year >= 1000 && year <= 9999;
  } catch { return false; }
}).transform(utcInstantFromEpochMilliseconds);
const reference = z.string().min(1).max(512).refine((value) => {
  if (value !== value.trim() || /[\r\n\0]/u.test(value)) return false;
  if (!/^https?:/iu.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
});
const amount = z.bigint().min(0n).max(COST_MAX_USD_PICOS);
const decimal = z.string().max(39).refine((value) => {
  try { costUsdPicosFromDecimal(value); return true; } catch { return false; }
}).transform((value) => costUsdDecimal(costUsdPicosFromDecimal(value)));
const rationalInteger = z.string().max(38).regex(/^[1-9][0-9]*$/u);
const quantitiesSchema = z.object({ requests: quantity, inputTokens: quantity, outputTokens: quantity, billedUnits: quantity }).strict();
const periodSchema = z.object({ accountId: identity, category, periodId: identity, startsAt: instant, endsAt: instant,
  capUsdPicos: amount, openingChargedUsdPicos: amount, evidenceRef: reference,
}).strict().refine((value) => value.startsAt < value.endsAt);
const jobSchema = z.object({ accountId: identity, category, jobId: identity, workKey: identity, costCapUsdPicos: amount,
  requestLimit: positive, inputTokenLimit: quantity, outputTokenLimit: quantity, billedUnitLimit: quantity,
  startsAt: instant, deadlineAt: instant, timeLimitMs: duration, fallbackReserveMs: quantity.max(2_147_483_647), evidenceRef: reference,
}).strict().refine((value) => value.startsAt < value.deadlineAt && value.fallbackReserveMs < value.timeLimitMs &&
  value.fallbackReserveMs < value.deadlineAt - value.startsAt);
const rateUnit = z.object({ amount: decimal, perUnits: positive }).strict().nullable();
const rateSchema = z.object({ category, provider: label, model: label.nullable(), version: label, currency: z.string().regex(/^[A-Z]{3}$/u),
  startsAt: instant, endsAt: instant, usdConversion: z.object({ numerator: rationalInteger, denominator: rationalInteger, evidenceRef: reference }).strict(),
  rounding: z.literal("ceil-per-component"), billingRule: z.enum(["measured-usage", "invoice-required"]),
  rates: z.object({ requests: rateUnit, inputTokens: rateUnit, outputTokens: rateUnit, billedUnits: rateUnit }).strict(), evidenceRef: reference,
}).strict().refine((value) => value.startsAt < value.endsAt &&
  (value.currency !== "USD" || BigInt(value.usdConversion.numerator) === BigInt(value.usdConversion.denominator)));
const prioritySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fixture"), kickoffAt: instant }).strict(), z.object({ kind: z.literal("background") }).strict(),
]);
const requestSchema = z.object({ accountId: identity, category, attemptId: identity, jobId: identity,
  rateVersion: label, provider: label, model: label.nullable(), maximum: quantitiesSchema.refine((value) => value.requests === 1),
  timeoutMs: duration, priority: prioritySchema, evidenceRef: reference,
}).strict();
const usageSchema = z.object({ attemptId: identity, reconciliationId: identity, kind: z.enum(["complete", "partial", "unknown"]),
  observedQuantities: quantitiesSchema.refine((value) => value.requests <= 1).nullable(), elapsedMs: quantity.max(2_147_483_647),
  observedUsdPicos: amount.nullable(), invoicedUsdPicos: amount.nullable(), observedAt: instant, evidenceRef: reference,
}).strict().refine((value) => value.kind !== "complete" || value.observedQuantities !== null || value.invoicedUsdPicos !== null);
const permitSchema = z.object({ attemptId: identity, jobId: identity, periodId: identity, ownerToken: identity,
  reservedAt: instant, launchBefore: instant, maximumCostUsdPicos: amount,
}).strict().refine((value) => value.reservedAt < value.launchBefore);
const accountSchema = z.object({ accountId: identity, category, activePeriodId: identity, lastNow: instant }).strict();
const attemptSchema = z.object({ request: requestSchema, requestFingerprint: identity, rate: rateSchema,
  state: z.enum(["queued", "reserved", "dispatched", "completed", "uncertain", "canceled"]), queuedAt: instant,
  reservedAt: instant.nullable(), dispatchedAt: instant.nullable(), completedAt: instant.nullable(), launchBefore: instant.nullable(),
  periodId: identity.nullable(), ownerToken: identity.nullable(), maximumCostUsdPicos: amount, liabilityUsdPicos: amount,
  estimatedUsdPicos: amount.nullable(), observedUsdPicos: amount.nullable(), invoicedUsdPicos: amount.nullable(),
  usage: usageSchema.nullable(), reconciliationFingerprint: identity.nullable(),
  reconciliations: z.array(z.object({ id: identity, fingerprint: identity, usage: usageSchema }).strict()),
}).strict().refine((value) => {
  if (value.rate.category !== value.request.category || value.rate.provider !== value.request.provider || value.rate.model !== value.request.model ||
    value.rate.version !== value.request.rateVersion || costFingerprint(value.request) !== value.requestFingerprint) return false;
  if (new Set(value.reconciliations.map((entry) => entry.id)).size !== value.reconciliations.length || value.reconciliations.some((entry) =>
    entry.id !== entry.usage.reconciliationId || entry.usage.attemptId !== value.request.attemptId || costFingerprint(entry.usage) !== entry.fingerprint)) return false;
  const latest = value.reconciliations.reduce<(typeof value.reconciliations)[number] | undefined>((current, entry) =>
    current === undefined || entry.usage.observedAt >= current.usage.observedAt ? entry : current, undefined);
  if ((latest === undefined) !== (value.usage === null) || (latest === undefined) !== (value.reconciliationFingerprint === null) ||
    latest !== undefined && (latest.fingerprint !== value.reconciliationFingerprint || costFingerprint(value.usage) !== latest.fingerprint)) return false;
  if (value.state === "queued") return value.periodId === null && value.ownerToken === null && value.reservedAt === null && value.launchBefore === null &&
    value.dispatchedAt === null && value.completedAt === null && value.liabilityUsdPicos === 0n && value.estimatedUsdPicos === null &&
    value.observedUsdPicos === null && value.invoicedUsdPicos === null && latest === undefined;
  if (value.periodId === null || value.ownerToken === null || value.reservedAt === null || value.launchBefore === null ||
    value.queuedAt > value.reservedAt || value.reservedAt >= value.launchBefore) return false;
  if (value.state === "canceled") return value.dispatchedAt === null && value.completedAt === null && value.liabilityUsdPicos === 0n &&
    value.estimatedUsdPicos === null && value.observedUsdPicos === null && value.invoicedUsdPicos === null && latest === undefined;
  if (value.state === "reserved") return value.dispatchedAt === null && value.completedAt === null && value.liabilityUsdPicos >= value.maximumCostUsdPicos &&
    value.estimatedUsdPicos === value.maximumCostUsdPicos && value.observedUsdPicos === null && value.invoicedUsdPicos === null && latest === undefined;
  if (value.dispatchedAt === null || value.dispatchedAt < value.reservedAt || value.dispatchedAt >= value.launchBefore ||
    value.reconciliations.some((entry) => entry.usage.observedAt < value.dispatchedAt!)) return false;
  const observed = value.reconciliations.reduce((result, entry) => entry.usage.observedUsdPicos === null ? result :
    result === null || entry.usage.observedUsdPicos > result ? entry.usage.observedUsdPicos : result, null as bigint | null);
  const invoiced = value.reconciliations.reduce((result, entry) => entry.usage.invoicedUsdPicos === null ? result :
    result === null || entry.usage.invoicedUsdPicos > result ? entry.usage.invoicedUsdPicos : result, null as bigint | null);
  if (observed !== value.observedUsdPicos || invoiced !== value.invoicedUsdPicos || value.liabilityUsdPicos < (observed ?? 0n) ||
    value.liabilityUsdPicos < (invoiced ?? 0n)) return false;
  if (value.state === "dispatched") return latest === undefined && value.completedAt === null && value.liabilityUsdPicos >= value.maximumCostUsdPicos;
  if (latest === undefined) return false;
  if (value.state === "uncertain") return value.completedAt === null && value.liabilityUsdPicos >= value.maximumCostUsdPicos;
  return value.usage?.kind === "complete" && value.completedAt !== null && value.completedAt >= value.dispatchedAt &&
    value.reconciliations.every((entry) => entry.usage.observedAt <= value.completedAt!);
});

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function parse<Output>(schema: z.ZodType<Output>, value: unknown): Output {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new CostInputError();
  return freeze(parsed.data);
}
export function parseCostCategory(value: unknown): CostCategory { return parse(category, value); }
export function parseCostIdentity(value: unknown): string { return parse(identity, value); }
export function parseCostEvidenceRef(value: unknown): string { return parse(reference, value); }
export function parseCostAmount(value: unknown): CostAmount { return parse(amount, value); }
export function parseCostQuantities(value: unknown): CostQuantities { return parse(quantitiesSchema, value); }
export function parseCostPeriod(value: unknown): CostPeriodPolicy { return parse(periodSchema, value); }
export function parseCostJob(value: unknown): CostJobPolicy { return parse(jobSchema, value); }
export function parseCostRate(value: unknown): CostRateCard { return parse(rateSchema, value); }
export function parseCostRequest(value: unknown): CostRequest { return parse(requestSchema, value); }
export function parseCostUsage(value: unknown): CostUsage { return parse(usageSchema, value); }
export function parseCostPermit(value: unknown): CostPermit { return parse(permitSchema, value); }
/** Persistence callers clone these immutable validated values before transaction mutations. */
export function parseCostAccountState(value: unknown): CostAccountState { return parse(accountSchema, value); }
export function parseCostAttempt(value: unknown): CostAttempt { return parse(attemptSchema, value); }

/** Explicit decimal conversion; number inputs and silently rounded prices are rejected. */
export function costUsdPicosFromDecimal(value: unknown): CostAmount {
  if (typeof value !== "string" || value.length > 39 || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,12})?$/u.test(value)) throw new CostInputError("invalid-pricing");
  const [whole = "", fraction = ""] = value.split(".");
  const result = BigInt(whole) * COST_USD_SCALE + BigInt(fraction.padEnd(12, "0"));
  if (result > COST_MAX_USD_PICOS) throw new CostInputError("invalid-pricing");
  return result;
}
/** Fixed precision is used at the SQL boundary and in concise monetary summaries. */
export function costUsdDecimal(value: CostAmount): string {
  const parsed = parseCostAmount(value);
  return `${parsed / COST_USD_SCALE}.${String(parsed % COST_USD_SCALE).padStart(12, "0")}`;
}
export function costUsdPicosFromCents(value: unknown): CostAmount {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new CostInputError();
  return parseCostAmount(BigInt(value as number) * (COST_USD_SCALE / 100n));
}
function canonical(value: unknown): unknown {
  if (typeof value === "bigint") return { $usdPicos: value.toString() };
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([, child]) => child !== undefined).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, child]) => [key, canonical(child)]));
  return value;
}
export function costFingerprint(value: unknown): string {
  try { return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex"); }
  catch { throw new CostInputError(); }
}
/** Hash trusted stable account/job/attempt/period identities before storage or safe logging. */
export function costIdentity(namespace: string, ...parts: readonly string[]): string {
  if (typeof namespace !== "string" || !/^[a-z][a-z0-9-]{0,63}$/u.test(namespace) || parts.length < 1 ||
    parts.some((part) => typeof part !== "string" || part.length < 1 || part.length > 1024 || /[\r\n\0]/u.test(part))) throw new CostInputError();
  return costFingerprint({ namespace, parts });
}
