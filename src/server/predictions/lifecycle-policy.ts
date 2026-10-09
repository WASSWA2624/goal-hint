import "server-only";

import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { statusShowsPlay } from "./publication-eligibility.ts";
import { isPlayedFinalStatus, type SettlementStatus } from "../../domain/market-settlement.ts";
import type { LifecycleObservation, LifecyclePolicy } from "./lifecycle-contract.ts";

export function lifecycleContentHash(value: LifecycleObservation): string {
  return evidenceFingerprint(Object.fromEntries(Object.entries(value).filter(([key]) =>
    !["retrievedAt", "providerUpdatedAt", "endpoint", "actor", "evidenceRef"].includes(key))));
}
export function lifecycleDecision(value: LifecycleObservation, policy: LifecyclePolicy, previous: Readonly<{
  retrievedAt: number; providerUpdatedAt: number | null; contentHash: string | null; status: string; hasPlayed: boolean; kickoffAt?: number | null;
}>) {
  const hash = lifecycleContentHash(value);
  if (value.retrievedAt < previous.retrievedAt || value.providerUpdatedAt !== null && previous.providerUpdatedAt !== null &&
    value.providerUpdatedAt < previous.providerUpdatedAt) return { outcome: "stale", reason: "older-observation" } as const;
  if (value.retrievedAt === previous.retrievedAt && value.providerUpdatedAt === previous.providerUpdatedAt &&
    (previous.contentHash !== null ? previous.contentHash !== hash : value.status !== previous.status ||
      previous.kickoffAt !== undefined && value.kickoffAt !== null && previous.kickoffAt !== value.kickoffAt))
    return { outcome: "conflict", reason: "same-time-conflicting-evidence" } as const;
  if (!policy.mappings.some((entry) => entry.providerStatus === value.providerStatus && entry.status === value.status) || value.status === "unknown")
    return { outcome: "conflict", reason: "unresolved-status-mapping" } as const;
  if (value.providerUpdatedAt === null && policy.unknownUpdate === "hold") return { outcome: "conflict", reason: "unknown-provider-update" } as const;
  if (value.status === "scheduled" && value.kickoffAt === null) return { outcome: "conflict", reason: "unknown-scheduled-kickoff" } as const;
  if ((previous.hasPlayed || statusShowsPlay(previous.status)) && (value.status === "scheduled" || value.status === "postponed"))
    return { outcome: "conflict", reason: "status-regressed-after-play" } as const;
  if (isPlayedFinalStatus(previous.status as SettlementStatus) && value.status === "live")
    return { outcome: "conflict", reason: "status-regressed-after-final" } as const;
  if (["canceled", "abandoned", "awarded"].includes(previous.status) && value.status !== previous.status && !statusShowsPlay(value.status))
    return { outcome: "conflict", reason: "terminal-status-conflict" } as const;
  if (value.status === "postponed" && value.actualStartedAt !== null) return { outcome: "conflict", reason: "postponement-after-play" } as const;
  return { outcome: hash === previous.contentHash ? "unchanged" : "accepted", reason: "verified-observation" } as const;
}
