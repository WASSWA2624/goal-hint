import "server-only";

import { utcInstantFromEpochMilliseconds, type ReportingDate } from "../../domain/calendar.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { defineJob } from "../jobs/job-registry.ts";
import type { OddsPolicy } from "./odds-contract.ts";
import { oddsQuotaAllows, type OddsQuotaAllowance, type OddsQuotaUsage } from "./odds-jobs.ts";
import type { OddsImportService } from "./odds-service.ts";
import { SLIP_ODDS_REFRESH_HANDLER_VERSION, SLIP_ODDS_REFRESH_TYPE, slipOddsRefreshPayload } from "./slip-odds-refresh-slot.ts";

export const slipOddsRefreshFixtureLimit = 12;
export const slipOddsRefreshRequestTimeoutMs = 8_000;
const writeReserveMs = 10_000;

type Dependencies = Readonly<{
  enabled(): boolean;
  policy(): OddsPolicy;
  candidates(publicationSlot: number, limit: number): Promise<readonly Readonly<{ fixtureId: number; date: ReportingDate }>[]>;
  usage(): Promise<OddsQuotaUsage | null>;
  allowance: OddsQuotaAllowance;
  service: Pick<OddsImportService, "importFixture">;
  now?: () => number;
}>;

/** One call per fixture, serialized with the other odds work on the shared enrichment worker. */
export function createSlipOddsRefreshJob(dependencies: Dependencies) {
  const now = dependencies.now ?? Date.now;
  return defineJob({
    type: SLIP_ODDS_REFRESH_TYPE, handlerVersion: SLIP_ODDS_REFRESH_HANDLER_VERSION,
    payload: slipOddsRefreshPayload, eligible: dependencies.enabled,
    async handle({ publicationSlot }, context) {
      await context.checkpoint();
      const candidates = await dependencies.candidates(publicationSlot, slipOddsRefreshFixtureLimit);
      const policy = dependencies.policy(), slot = utcInstantFromEpochMilliseconds(publicationSlot);
      for (const { fixtureId, date } of candidates.slice(0, slipOddsRefreshFixtureLimit)) {
        await context.checkpoint();
        if (context.remainingMs() < slipOddsRefreshRequestTimeoutMs + writeReserveMs) {
          return { status: "failed", reason: "timeout", retryable: false };
        }
        const usage = await dependencies.usage();
        if (!usage || !oddsQuotaAllows(usage, dependencies.allowance, 1)) {
          return { status: "failed", reason: "rate-limited", retryable: false };
        }

        const { jobId, attemptId } = context.lease;
        const id = evidenceFingerprint({ jobId, fixtureId });
        const requestReference = evidenceFingerprint({ id, attemptId });
        const startedAt = now();
        const recordUsage = (phase: "completed" | "uncertain", requests: number) => context.recordUsage({
          provider: "football", requestReference, costReference: null, phase, requests,
          durationMs: Math.max(0, now() - startedAt),
        });
        const summary = await dependencies.service.importFixture({ id, kind: "prices", slot, date, policy, fixtureId },
          context.signal, () => context.checkpoint()).catch(async () => {
          await recordUsage("uncertain", 0);
          return null;
        });
        if (!summary) return { status: "failed", reason: "handler-failed", retryable: false };
        await recordUsage("completed", summary.requestsDispatched);
        if (summary.status !== "complete") {
          const reason = summary.error?.reason;
          return { status: "failed", reason: reason === "quota-denied" || reason === "rate-limited" ? "rate-limited" : "handler-failed",
            retryable: false };
        }
      }
      await context.checkpoint();
      return { status: "succeeded" };
    },
  });
}
