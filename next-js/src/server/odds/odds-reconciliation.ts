import "server-only";

import { z } from "zod";
import { addReportingDays, getReportingDate, getReportingDayBounds, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { total15Selections } from "../../domain/extended-markets.ts";
import { binaryGoalTotalOddsMapping, launchOddsMapping } from "../../domain/odds-markets.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { jobInstant, parseJobEnvelope } from "../jobs/job-input.ts";
import { defineJob, type JobOutcome } from "../jobs/job-registry.ts";
import { OddsError, type OddsPolicy } from "./odds-contract.ts";
import { oddsPolicyHash, oddsScopeKey } from "./odds-input.ts";
import { oddsJobOutcome, oddsQuotaAllows, PRE_MATCH_PROVIDER_LOOKAHEAD_DAYS, type OddsQuotaAllowance, type OddsQuotaUsage } from "./odds-jobs.ts";
import { storedCurrentBookmakerQuotes, type StoredCurrentBookmakerQuotes } from "./odds-mysql-store.ts";
import type { OddsImportService } from "./odds-service.ts";

const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
const STAGGER_MS = 5 * MINUTE;
const NEAR_KICKOFF_MS = 90 * MINUTE;
const PROVIDER_UPDATE_MS = 3 * HOUR;
const PROVIDER_FAILURE_RETRY_MS = 30_000;
const ODDS_RECONCILIATION_TYPE = "odds.reconcile";
export const ODDS_RECONCILIATION_MS = 30 * MINUTE;
export const ODDS_RECONCILIATION_FIXTURE_LIMIT = 24;
export const ODDS_RECONCILIATION_REQUEST_TIMEOUT_MS = 8_000;

const interval = z.number().int().min(15 * MINUTE).max(HOUR).refine(value => DAY % value === 0 && value % MINUTE === 0);
const payload = z.strictObject({ slot: jobInstant, intervalMs: interval })
  .refine(({ slot, intervalMs }) => (slot - STAGGER_MS) % intervalMs === 0);

export function latestOddsReconciliationSlot(now: number, intervalMs = ODDS_RECONCILIATION_MS): number {
  return Math.floor((now - STAGGER_MS) / intervalMs) * intervalMs + STAGGER_MS;
}

export function oddsReconciliationEnvelope(slot: number, intervalMs = ODDS_RECONCILIATION_MS) {
  const body = payload.parse({ slot, intervalMs });
  return parseJobEnvelope({ version: 1, type: ODDS_RECONCILIATION_TYPE, handlerVersion: 1,
    idempotencyKey: evidenceFingerprint({ type: ODDS_RECONCILIATION_TYPE, ...body }), payload: body, refresh: null,
    notBefore: slot, expiresAt: slot + intervalMs, priority: 7, maxAttempts: 4, timeoutMs: 300_000, leaseMs: 30_000,
    fallbackReserveMs: 0, backoff: { baseMs: MINUTE, maxMs: 5 * MINUTE } });
}

const requiredMarkets = launchOddsMapping.map(({ betId, betName, selections }) => ({ betId, betName,
  labels: [...Object.values(selections), ...(betId === binaryGoalTotalOddsMapping["full-time"].betId
    ? total15Selections.map((selection) => selection === "over" ? "Over 1.5" : "Under 1.5") : [])] }));
const marketIds = requiredMarkets.map(({ betId }) => betId);

type Coverage = "complete" | "missing-odds" | "missing-market" | "missing-selection" | "stale-near-kickoff";
type Candidate = Readonly<{ fixtureId: number; date: string; kickoffAt: number; reason: Exclude<Coverage, "complete"> }>;
type CandidateSelection = Readonly<{ candidates: readonly Candidate[]; coverage: Readonly<Record<Coverage, number>>;
  providerEmpty: number; providerFailures: number; catalogUnavailable: number; deferred: number; backlog: number;
  captured: number; priceAgeP95Ms: number | null }>;

/** Existing mapped markets and exact labels, across the same recorded books available to price consumers. */
export function preMatchOddsCoverage(quote: StoredCurrentBookmakerQuotes | undefined, nearKickoff: boolean, now: number): Coverage {
  if (!quote?.bookmakers.some(({ offers }) => offers.length)) return "missing-odds";
  const offers = quote.bookmakers.flatMap(book => book.offers);
  const available = requiredMarkets.map(({ betId, betName, labels }) => {
    const markets = offers.filter(offer => offer.betId === betId && offer.betName === betName);
    return { present: markets.length > 0, priced: labels.every(label => markets.some(({ values }) => values.some(value => value.label === label))) };
  });
  if (available.some(({ present }) => !present)) return "missing-market";
  if (available.some(({ priced }) => !priced)) return "missing-selection";
  if (nearKickoff && now - quote.checkedAt >= PROVIDER_UPDATE_MS) return "stale-near-kickoff";
  return "complete";
}

type LastCheck = Readonly<{ receivedAt: Date; status: string; providerEmpty: unknown; providerInvalid?: unknown }>;
type TargetTiming = Readonly<{ kickoffAt: number; observedAt: number | null; lastCheck?: LastCheck }>;

export function oddsReconciliationDue(now: number, { kickoffAt, observedAt, lastCheck }: TargetTiming): boolean {
  const near = kickoffAt - now <= NEAR_KICKOFF_MS;
  if (kickoffAt <= now) return false;
  const checkedAt = lastCheck?.receivedAt.getTime() ?? -Infinity;
  if (lastCheck?.status !== undefined && lastCheck.status !== "complete" && checkedAt >= (observedAt ?? -Infinity)) {
    return now - checkedAt >= PROVIDER_FAILURE_RETRY_MS;
  }
  const latest = Math.max(observedAt ?? -Infinity, checkedAt);
  const providerEmpty = lastCheck?.status === "complete" && Boolean(Number(lastCheck.providerEmpty)) && latest === checkedAt;
  return now - latest >= (near ? ODDS_RECONCILIATION_MS : providerEmpty ? PROVIDER_UPDATE_MS : HOUR);
}

export function createOddsReconciliationCandidates({ database, competitionIds, policy }: Readonly<{
  database: DatabaseRuntime; competitionIds: readonly number[]; policy: OddsPolicy;
}>) {
  const policyHash = oddsPolicyHash(policy), externalIds = [...new Set(competitionIds)].map(BigInt);
  return async (now: number, limit: number): Promise<CandidateSelection> => {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > ODDS_RECONCILIATION_FIXTURE_LIMIT) throw new RangeError("Invalid odds reconciliation limit.");
    const coverage = { complete: 0, "missing-odds": 0, "missing-market": 0, "missing-selection": 0, "stale-near-kickoff": 0 };
    const counts = { providerEmpty: 0, providerFailures: 0, catalogUnavailable: 0, deferred: 0, captured: 0 };
    const candidates: (Candidate & { checkedAt: number })[] = [], priceAges: number[] = [];
    if (externalIds.length === 0) return { candidates, coverage, ...counts, backlog: 0, priceAgeP95Ms: null };
    const today = getReportingDate(utcInstantFromEpochMilliseconds(now));
    const { endExclusive } = getReportingDayBounds(addReportingDays(today, PRE_MATCH_PROVIDER_LOOKAHEAD_DAYS));

    return database.transaction(async (tx) => {
      const fixtures = await tx.footballFixture.findMany({
        where: { provider: "api-football", status: "scheduled", kickoff: { gt: new Date(now), lt: new Date(endExclusive) },
          season: { competition: { providers: { some: { provider: "api-football", externalId: { in: externalIds } } } } } },
        select: { id: true, externalId: true, kickoff: true,
          oddsState: { select: { policyHash: true, lastRetrievedAt: true, withdrawnAt: true } } },
      });
      const hasCatalog = !!await tx.oddsImportBatch.findFirst({ where: { scopeKey: "bets", kind: "bets", status: "complete",
        receivedAt: { lte: new Date(now) } }, select: { id: true } });
      for (let index = 0; index < fixtures.length; index += 100) {
        const batch = fixtures.slice(index, index + 100).flatMap(fixture => {
          const fixtureId = Number(fixture.externalId), kickoffAt = fixture.kickoff?.getTime();
          if (!Number.isSafeInteger(fixtureId) || fixtureId < 1 || kickoffAt === undefined) return [];
          const date = getReportingDate(utcInstantFromEpochMilliseconds(kickoffAt));
          const scopeKey = oddsScopeKey({ kind: "prices", fixtureId, date, policy });
          return [{ ...fixture, fixtureId, kickoffAt, date, scopeKey }];
        });
        if (!batch.length) continue;
        const quotes = await storedCurrentBookmakerQuotes(tx, batch.map(({ id, kickoffAt }) => ({ fixtureId: id, kickoffAt })), now, marketIds);
        const cutoff = new Date(now - PROVIDER_UPDATE_MS);
        const checks = await tx.$queryRaw<(LastCheck & { scopeKey: string })[]>(Prisma.sql`
          SELECT scopeKey, receivedAt, status, providerEmpty, providerInvalid FROM (
            SELECT scopeKey, receivedAt, status,
              (JSON_LENGTH(body, '$.fixtures') = 0 OR JSON_UNQUOTE(JSON_EXTRACT(body, '$.fixtures[0].outcome')) = 'no-provider-odds') AS providerEmpty,
              JSON_UNQUOTE(JSON_EXTRACT(body, '$.fixtures[0].outcome')) = 'invalid-provider-odds' AS providerInvalid,
              ROW_NUMBER() OVER (PARTITION BY scopeKey ORDER BY receivedAt DESC, id DESC) AS checkOrder
            FROM OddsImportBatch WHERE scopeKey IN (${Prisma.join(batch.map(({ scopeKey }) => scopeKey))}) AND policyHash = ${policyHash}
              AND receivedAt BETWEEN ${cutoff} AND ${new Date(now)}
          ) recent WHERE checkOrder = 1`);
        const lastChecks = new Map(checks.map(check => [check.scopeKey, check]));
        const changes = await tx.$queryRaw<{ fixtureId: string; scheduleAt: Date }[]>(Prisma.sql`
          SELECT fixtureId, MAX(observedAt) AS scheduleAt FROM FootballFixtureAudit
          WHERE fixtureId IN (${Prisma.join(batch.map(({ id }) => id))}) AND observedAt >= ${cutoff}
            AND JSON_CONTAINS_PATH(changes, 'one', '$.kickoff', '$.status')
          GROUP BY fixtureId`);
        const scheduleChanges = new Map(changes.map(({ fixtureId, scheduleAt }) => [fixtureId, scheduleAt.getTime()]));
        for (const fixture of batch) {
          const { id, fixtureId, kickoffAt, date, scopeKey } = fixture;
          const stored = quotes.get(id), quote = stored?.policyHash === policyHash ? stored : undefined;
          const reason = preMatchOddsCoverage(quote, kickoffAt - now <= NEAR_KICKOFF_MS, now);
          coverage[reason]++;
          if (quote) {
            counts.captured++;
            for (const { offers } of quote.bookmakers) for (const { providerUpdatedAt, checkedAt } of offers) {
              if (checkedAt !== undefined) priceAges.push(now - (providerUpdatedAt ?? checkedAt));
            }
          }
          if (reason === "complete") continue;
          const scheduleAt = scheduleChanges.get(id) ?? -Infinity;
          const state = fixture.oddsState;
          const observedAt = state?.policyHash === policyHash && state.withdrawnAt === null && state.lastRetrievedAt.getTime() >= scheduleAt
            ? state.lastRetrievedAt.getTime() : null;
          const check = lastChecks.get(scopeKey);
          const lastCheck = check && check.receivedAt.getTime() >= scheduleAt ? check : undefined;
          if (lastCheck && lastCheck.receivedAt.getTime() >= (observedAt ?? -Infinity)) {
            if (lastCheck.status !== "complete" || Boolean(Number(lastCheck.providerInvalid))) counts.providerFailures++;
            else if (Boolean(Number(lastCheck.providerEmpty))) counts.providerEmpty++;
          }
          if (!hasCatalog && observedAt !== null) { counts.catalogUnavailable++; continue; }
          if (!oddsReconciliationDue(now, { kickoffAt, observedAt, ...(lastCheck && { lastCheck }) })) { counts.deferred++; continue; }
          candidates.push({ fixtureId, kickoffAt, date, reason,
            checkedAt: Math.max(lastCheck?.receivedAt.getTime() ?? 0, observedAt ?? 0) });
        }
      }
      candidates.sort((left, right) => {
        const leftNear = left.kickoffAt - now <= NEAR_KICKOFF_MS, rightNear = right.kickoffAt - now <= NEAR_KICKOFF_MS;
        return Number(rightNear) - Number(leftNear) || (leftNear ? left.kickoffAt - right.kickoffAt : left.checkedAt - right.checkedAt) ||
          left.kickoffAt - right.kickoffAt || left.fixtureId - right.fixtureId;
      });
      priceAges.sort((left, right) => left - right);
      return { candidates: candidates.slice(0, limit), coverage, ...counts, backlog: Math.max(0, candidates.length - limit),
        priceAgeP95Ms: priceAges[Math.ceil(priceAges.length * 0.95) - 1] ?? null };
    }, { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 30_000 });
  };
}

export type OddsReconciliationReport = Omit<CandidateSelection, "candidates"> & Readonly<{
  slot: number; selected: number; completed: number; empty: number; failed: number; requests: number; durationMs: number;
}>;

export function createOddsReconciliationJob(dependencies: Readonly<{
  enabled(): boolean; policy(): OddsPolicy; candidates(now: number, limit: number): Promise<CandidateSelection>;
  usage(): Promise<OddsQuotaUsage | null>; allowance: OddsQuotaAllowance; service: Pick<OddsImportService, "importFixture">;
  report?(report: OddsReconciliationReport): void; now?: () => number;
}>) {
  const now = dependencies.now ?? Date.now;
  return defineJob({ type: ODDS_RECONCILIATION_TYPE, handlerVersion: 1, payload, eligible: dependencies.enabled,
    async handle({ slot, intervalMs }, context) {
      const startingAt = now();
      await context.checkpoint();
      const { candidates, ...selection } = await dependencies.candidates(startingAt, ODDS_RECONCILIATION_FIXTURE_LIMIT);
      const policy = dependencies.policy(), requestSlot = utcInstantFromEpochMilliseconds(slot);
      const reconciliationDeadlineAt = utcInstantFromEpochMilliseconds(slot + intervalMs);
      const counts = { completed: 0, empty: 0, failed: 0, requests: 0 };
      let failure: JobOutcome | null = null;
      for (const { fixtureId, date, kickoffAt } of candidates) {
        await context.checkpoint();
        if (now() >= kickoffAt) continue;
        if (context.remainingMs() < ODDS_RECONCILIATION_REQUEST_TIMEOUT_MS + 10_000) {
          failure = { status: "failed", reason: "timeout", retryable: true }; break;
        }
        const usage = await dependencies.usage();
        if (!usage || !oddsQuotaAllows(usage, dependencies.allowance, 1)) {
          failure = { status: "failed", reason: "rate-limited", retryable: usage === null }; break;
        }
        const { jobId, attemptId } = context.lease;
        const id = evidenceFingerprint({ jobId, fixtureId });
        const startedAt = now();
        const recordUsage = (phase: "completed" | "uncertain", requests: number) => context.recordUsage({
          provider: "football", requestReference: evidenceFingerprint({ id, attemptId }), costReference: null, phase, requests,
          durationMs: Math.min(HOUR, Math.max(0, now() - startedAt)),
        });
        const summary = await dependencies.service.importFixture({ id, kind: "prices", slot: requestSlot, date, policy, fixtureId,
          reconciliationDeadlineAt }, context.signal, () => context.checkpoint()).catch(async (error: unknown) => {
          await recordUsage("uncertain", 0);
          counts.failed++;
          failure = { status: "failed", reason: "handler-failed", retryable: error instanceof OddsError && error.reason === "unavailable" };
          return null;
        });
        if (!summary) break;
        await recordUsage("completed", summary.requestsDispatched);
        counts.requests += summary.requestsDispatched;
        const outcome = summary.outcomes["invalid-provider-odds"] > 0
          ? { status: "failed", reason: "invalid-output", retryable: false } as const : oddsJobOutcome(summary);
        if (outcome.status === "succeeded") {
          counts.completed++;
          if (summary.providerEmpty) counts.empty++;
        } else {
          counts.failed++;
          failure = outcome;
          if (outcome.retryable || outcome.reason === "rate-limited" || outcome.reason === "eligibility-expired" || outcome.reason === "non-retryable") break;
        }
      }
      dependencies.report?.({ slot, selected: candidates.length, ...selection, ...counts, durationMs: Math.max(0, now() - startingAt) });
      await context.checkpoint();
      return failure ?? { status: "succeeded" };
    },
  });
}
