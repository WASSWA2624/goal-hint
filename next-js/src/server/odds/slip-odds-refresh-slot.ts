import "server-only";

import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import { bestSlipPublicationHour, bestSlipPublicationIntervalMs } from "../../domain/best-slip-publication-hour.ts";
import type { JobEnvelope } from "../jobs/job-contract.ts";
import { durableJobId, jobFingerprint, jobInstant, parseJobEnvelope } from "../jobs/job-input.ts";

const MINUTE = 60_000;
const LEAD_MS = 5 * MINUTE;
export const SLIP_ODDS_REFRESH_WAIT_MS = 5 * MINUTE;
const POLL_MS = 5_000;

export const SLIP_ODDS_REFRESH_TYPE = "odds.slips-refresh";
export const SLIP_ODDS_REFRESH_HANDLER_VERSION = 1;
export const slipOddsRefreshPayload = z.strictObject({
  publicationSlot: jobInstant.refine(slot => slot % bestSlipPublicationIntervalMs === 0),
});

/** The :25/:55 tick can be recovered until five minutes into the associated publication slot. */
export function dueSlipOddsRefreshSlot(now: number): number | null {
  const { hourAt } = bestSlipPublicationHour(now + LEAD_MS);
  return now < hourAt + SLIP_ODDS_REFRESH_WAIT_MS ? hourAt : null;
}

export function slipOddsRefreshEnvelope(publicationSlot: number): JobEnvelope {
  const payload = slipOddsRefreshPayload.parse({ publicationSlot });
  return parseJobEnvelope({ version: 1, type: SLIP_ODDS_REFRESH_TYPE, handlerVersion: SLIP_ODDS_REFRESH_HANDLER_VERSION,
    idempotencyKey: jobFingerprint({ type: SLIP_ODDS_REFRESH_TYPE, ...payload }), payload, refresh: null,
    notBefore: publicationSlot - LEAD_MS, expiresAt: publicationSlot + SLIP_ODDS_REFRESH_WAIT_MS, priority: 9,
    maxAttempts: 1, timeoutMs: 9 * MINUTE, leaseMs: 30_000, fallbackReserveMs: 0,
    backoff: { baseMs: 15_000, maxMs: 60_000 } });
}

export type SlipOddsRefreshStatus = "succeeded" | "failed" | "expired" | "timed-out" | "unavailable" | "aborted";

/** Only a succeeded durable job for this exact slot releases its publisher. */
export async function waitForSlipOddsRefresh(publicationSlot: number, readState: (id: string) => Promise<string | null>,
  signal: AbortSignal, { now = Date.now, wait = (duration: number, stop: AbortSignal) => sleep(duration, undefined, { signal: stop }) } = {}): Promise<SlipOddsRefreshStatus> {
  const envelope = slipOddsRefreshEnvelope(publicationSlot);
  const remaining = envelope.expiresAt - now();
  if (signal.aborted) return "aborted";
  if (remaining <= 0) return "timed-out";

  const stop = AbortSignal.any([signal, AbortSignal.timeout(remaining)]);
  let onAbort!: () => void;
  const cancelled = new Promise<"aborted">(resolve => {
    onAbort = () => resolve("aborted");
    stop.addEventListener("abort", onAbort, { once: true });
  });
  const id = durableJobId(envelope);
  try {
    while (!stop.aborted && now() < envelope.expiresAt) {
      const state = await Promise.race([readState(id), cancelled]);
      if (stop.aborted || now() >= envelope.expiresAt) break;
      if (state === "succeeded" || state === "failed" || state === "expired") return state;
      await wait(Math.min(POLL_MS, envelope.expiresAt - now()), stop);
    }
  } catch {
    if (!stop.aborted) return "unavailable";
  } finally {
    stop.removeEventListener("abort", onAbort);
  }
  return signal.aborted ? "aborted" : "timed-out";
}
