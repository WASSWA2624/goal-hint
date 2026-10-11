import "server-only";

import { z } from "zod";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import type { JobEnvelope } from "../jobs/job-contract.ts";
import { jobInstant, parseJobEnvelope } from "../jobs/job-input.ts";
import { defineJob, type JobDefinition, type JobOutcome } from "../jobs/job-registry.ts";
import { oddsQuotaAllows, type OddsQuotaAllowance, type OddsQuotaUsage } from "../odds/odds-jobs.ts";
import type { TeamCodeService, TeamCodeSweepSummary } from "./team-code-service.ts";

const HOUR = 3_600_000;
export const TEAM_CODES_TYPE = "teams.codes";
export const TEAM_CODES_HANDLER_VERSION = 1;
/** One sweep per UTC-aligned hour. Envelopes carry only the slot, so a restart or plan rebuild re-enqueues the same row. */
export const TEAM_CODES_SLOT_MS = HOUR;
/** Competition-seasons requested per slot, nearest kickoff first. */
export const TEAM_CODES_SEASONS_PER_SLOT = 4;
/** Dispatch ceiling of one /teams?league&season import: one page plus one retry. */
export const TEAM_CODES_REQUESTS_PER_SEASON = 2;
/** The slot's whole dispatch ceiling; the quota gate requires all of it to fit under the spare before any call. */
export const TEAM_CODES_MAX_REQUESTS = TEAM_CODES_SEASONS_PER_SLOT * TEAM_CODES_REQUESTS_PER_SEASON;
export const TEAM_CODES_JOB_TIMEOUT_MS = 600_000;
/** Below every odds job (catalog 8, sweeps 7 to 1) on the shared enrichment worker: odds claim first. */
export const TEAM_CODES_PRIORITY = 0;
export const teamCodesPayload = z.strictObject({ slot: jobInstant });
const envelopeBounds = Object.freeze({ maxAttempts: 4, timeoutMs: TEAM_CODES_JOB_TIMEOUT_MS, leaseMs: 30_000, fallbackReserveMs: 0,
  backoff: Object.freeze({ baseMs: 60_000, maxMs: 600_000 }) });

/** The latest slot start at or before now. */
export function latestTeamCodesSlot(now: number): number { return Math.floor(now / TEAM_CODES_SLOT_MS) * TEAM_CODES_SLOT_MS; }
/** One team-code sweep per hourly slot; it expires when the slot ends. */
export function teamCodesEnvelope(slot: number): JobEnvelope {
  if (!Number.isSafeInteger(slot) || slot % TEAM_CODES_SLOT_MS !== 0) throw new RangeError("Invalid team-code slot.");
  const payload = teamCodesPayload.parse({ slot });
  return parseJobEnvelope({ ...envelopeBounds, version: 1, type: TEAM_CODES_TYPE, handlerVersion: TEAM_CODES_HANDLER_VERSION,
    idempotencyKey: evidenceFingerprint({ type: TEAM_CODES_TYPE, slot }), payload, refresh: null,
    notBefore: slot, expiresAt: slot + TEAM_CODES_SLOT_MS, priority: TEAM_CODES_PRIORITY });
}

export type TeamCodeJobDependencies = Readonly<{
  service: Pick<TeamCodeService, "sweep">;
  /** False on plans without spare ordinary quota (Free, slow), or when the owner turns imports off. */
  enabled: () => boolean;
  /** Counters of the open provider day, or null while the UTC rollover is settling. `oddsUsed` counts every
   * enrichment dispatch of the day: odds and team codes share one spare. */
  usage: () => Promise<OddsQuotaUsage | null>;
  allowance: OddsQuotaAllowance;
  now?: () => number;
}>;
/** Expired, not failed: the next slot sweeps again, and the failed-jobs alert stays for real faults. */
const EXPIRED: JobOutcome = Object.freeze({ status: "failed", reason: "eligibility-expired", retryable: false });
/** The job outcome for a sweep. Failed receipts and time-outs keep what was stored and leave the rest to the next slot;
 * storage unavailability retries in the slot; a refused import (authorization, retention, an invalid result) fails so
 * the failed-jobs alert fires. */
export function teamCodeJobOutcome(summary: Pick<TeamCodeSweepSummary, "stopped">): JobOutcome {
  if (summary.stopped === "unavailable") return { status: "failed", reason: "handler-failed", retryable: true };
  if (summary.stopped === "refused") return { status: "failed", reason: "non-retryable", retryable: false };
  return { status: "succeeded" };
}

/** Registered on the shared enrichment worker beside odds; never on the refresh or cutoff workers. */
export function createTeamCodeJobDefinitions(dependencies: TeamCodeJobDependencies): readonly JobDefinition[] {
  const now = dependencies.now ?? Date.now;
  const definition = defineJob({ type: TEAM_CODES_TYPE, handlerVersion: TEAM_CODES_HANDLER_VERSION, payload: teamCodesPayload,
    // Disabled definitions stay registered, so queued jobs expire at their first checkpoint instead of stalling.
    eligible: () => dependencies.enabled(),
    async handle(payload, context) {
      const slotEnd = payload.slot + TEAM_CODES_SLOT_MS;
      await context.checkpoint();
      if (!dependencies.enabled() || now() >= slotEnd) return EXPIRED;
      const usage = await dependencies.usage();
      if (usage === null) return { status: "failed", reason: "rate-limited", retryable: true };
      // The same gate as odds, with this slot's whole ceiling: within a provider day its slack never grows, so a refused
      // slot expires without a provider call and the next slot checks again.
      if (!oddsQuotaAllows(usage, dependencies.allowance, TEAM_CODES_MAX_REQUESTS)) return EXPIRED;
      const started = now();
      let summary: TeamCodeSweepSummary;
      try {
        summary = await dependencies.service.sweep({ now: started, maxSeasons: TEAM_CODES_SEASONS_PER_SLOT, signal: context.signal,
          remainingMs: () => Math.min(context.remainingMs(), slotEnd - now()) });
      } catch {
        // Only the selection reads run before the first provider call, and every later failure is summarized instead.
        return { status: "failed", reason: "handler-failed", retryable: true };
      }
      if (summary.seasons.length > 0 || summary.uncertain) {
        await context.recordUsage({ provider: "football", costReference: null, phase: summary.uncertain ? "uncertain" : "completed",
          requestReference: evidenceFingerprint({ jobId: context.lease.jobId, attemptId: context.lease.attemptId, phase: "team-codes", version: 1 }),
          requests: summary.requestsDispatched, durationMs: Math.min(3_600_000, Math.max(0, now() - started)) });
      }
      await context.checkpoint();
      return teamCodeJobOutcome(summary);
    } });
  return Object.freeze([definition]);
}
