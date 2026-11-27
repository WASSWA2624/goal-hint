import "server-only";

import { utcInstantFromEpochMilliseconds, type UtcInstant } from "../../domain/calendar.ts";
import { isPlayedFinalStatus, type SettlementStatus } from "../../domain/market-settlement.ts";

// Keep the public freshness window independent of the worker's faster retry target.
const liveStatusStaleAfterMs = 60_000;

type StatusFreshnessInput = Readonly<{
  status: SettlementStatus; providerStatus: string | null; kickoffAt: number | null; asOf: UtcInstant;
  canonicalRetrievedAt: number | null; lastVerifiedAt: number | null; nextCheckAt: number | null;
  hasVerifiedRegulation: boolean; delayed: boolean;
}>;

function clock(value: number | null): UtcInstant | null {
  return value !== null && Number.isSafeInteger(value) && value > 0 && value <= 253_402_300_799_999
    ? utcInstantFromEpochMilliseconds(value) : null;
}

/** Provider status is supplied by the canonical record. Advancing the read clock
 * or recording a failed attempt only changes the freshness projection. */
export function projectFixtureStatusFreshness(input: StatusFreshnessInput) {
  const { status, asOf, kickoffAt, delayed, hasVerifiedRegulation } = input;
  const providerStatus = input.providerStatus !== null && /^[A-Z0-9_-]{1,32}$/u.test(input.providerStatus) ? input.providerStatus : null;
  const canonical = providerStatus === null || status === "unknown" ? null : clock(input.canonicalRetrievedAt);
  const lastVerifiedAt = [canonical, clock(input.lastVerifiedAt)].reduce<UtcInstant | null>((latest, at) =>
    at !== null && at <= asOf && (latest === null || latest < at) ? at : latest, null);
  const nextCheckAt = clock(input.nextCheckAt);
  const overdue = kickoffAt !== null && kickoffAt <= asOf;
  const scheduleUnconfirmed = status === "scheduled" && (providerStatus === "TBD" || overdue) || status === "unknown" && overdue;
  const liveStale = status === "live" && lastVerifiedAt !== null && asOf - lastVerifiedAt > liveStatusStaleAfterMs;
  const missingResult = isPlayedFinalStatus(status) && !hasVerifiedRegulation;
  const state = delayed || scheduleUnconfirmed || liveStale || missingResult ? "awaiting-update"
    : lastVerifiedAt === null || status === "unknown" ? "unverified" : "current";
  return Object.freeze({ state, providerStatus, lastVerifiedAt, nextCheckAt } as const);
}
