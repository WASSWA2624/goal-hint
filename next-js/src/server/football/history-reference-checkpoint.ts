import "server-only";

import type { Prisma } from "../generated/prisma/client.ts";
import { apiFootballRequestKey } from "./api-football-adapter.ts";
import type { ApiFootballFailure } from "./api-football-contract.ts";
import type { FootballHistoryReferenceCheckpoint, FootballHistoryReferencePage } from "./history-reference.ts";
import type { createMysqlProviderCoverageStore } from "./provider-coverage-store.ts";

const NORMALIZATION_LEASE_MS = 90_000;
const RETRY_MS = 60 * 60_000;
const accessReasons = new Set(["operation-not-authorized", "authentication-error", "invalid-credential", "credential-failure", "subscription-expired"]);

function failure(error: ApiFootballFailure | null, at: number) {
  const reason = error?.quotaReason ?? error?.reason ?? "reference-response-incomplete";
  if (accessReasons.has(reason)) return { status: "blocked_by_access", reason } as const;
  if (reason === "invalid-request") return { status: "not_applicable", reason } as const;
  const providerRetryAt = Math.max(error?.retryAt ?? 0, at + (error?.retryAfterMs ?? 0));
  if (error?.reason === "rate-limited" || error?.reason === "quota-denied") {
    return { status: "blocked_by_quota", reason, nextRetryAt: providerRetryAt > at ? providerRetryAt : at + RETRY_MS } as const;
  }
  return { status: "retryable_failure", reason, nextRetryAt: Math.max(at + RETRY_MS, providerRetryAt) } as const;
}

/** Both the scoped projection and its checkpoint commit only after the exact transport receipt was archived. */
export function createHistoricalReferenceCheckpoint({ store, accountKey, save, now }: Readonly<{
  store: ReturnType<typeof createMysqlProviderCoverageStore>;
  accountKey: string;
  save(page: FootballHistoryReferencePage, tx: Prisma.TransactionClient): Promise<unknown>;
  now(): number;
}>): FootballHistoryReferenceCheckpoint {
  return {
    async begin({ endpoint, parameters }) {
      const target = { endpoint, parameters, page: 1, section: "reference", resource: "historical-reference",
        scope: { context: "historical", accountKey } } as const;
      const ticket = await store.begin(target, { leaseMs: NORMALIZATION_LEASE_MS });
      if (!ticket) return null;
      const requestKey = apiFootballRequestKey(accountKey, endpoint, parameters);
      return {
        async save(page, remaining) {
          const outcome = remaining === 0 ? { status: "complete" } as const
            : { status: "partial", reason: "provider-omitted-subjects", remaining, nextRetryAt: now() + RETRY_MS } as const;
          let completed;
          try {
            completed = await store.completeArchived(ticket, { requestKey, observedAt: page.retrievedAt }, outcome, (tx) => save(page, tx));
          } catch {
            await store.fail(ticket, { status: "retryable_failure", reason: "reference-normalization-failed", nextRetryAt: now() + RETRY_MS });
            return false;
          }
          if (!completed) {
            await store.fail(ticket, { status: "retryable_failure", reason: "reference-receipt-not-committed", nextRetryAt: now() + RETRY_MS });
          }
          return completed !== null;
        },
        fail(error) {
          return store.fail(ticket, failure(error, now()));
        },
      };
    },
  };
}
