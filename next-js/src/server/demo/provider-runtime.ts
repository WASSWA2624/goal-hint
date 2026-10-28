import "server-only";

import { createHash } from "node:crypto";
import { isDevelopmentDemo } from "../../domain/development-demo.ts";
import { utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import { createQuotaGateway, type GatewayQuotaLimiter } from "../football/quota-gateway.ts";
import type { QuotaPermit } from "../football/quota-contract.ts";

export const demoFootballAccountId = createHash("sha256").update("goal-hint-development-demo").digest("hex");

export function authorizeDemoFootball(): void {
  if (!isDevelopmentDemo()) throw new Error("Synthetic football transport requires development demo mode.");
}

/** The adapter keeps its ordinary bounds and single-use dispatch discipline. Synthetic
 * requests never reserve a real provider account or use the durable paid quota. */
export function createDemoFootballGateway(clock: Clock) {
  authorizeDemoFootball();
  const permits = new Map<string, Readonly<{ permit: QuotaPermit; timeoutMs: number; claimed: boolean }>>();
  const limiter: GatewayQuotaLimiter = {
    async reserve(request) {
      authorizeDemoFootball();
      const now = clock.now();
      if (now >= request.deadlineAt) return { status: "denied", reason: "request-expired" };
      if (permits.has(request.requestId)) return { status: "denied", reason: "already-attempted" };
      const permit = { requestId: request.requestId, periodId: demoFootballAccountId,
        ownerToken: createHash("sha256").update(request.requestId).digest("hex"), dispatchedAt: now,
        launchBefore: utcInstantFromEpochMilliseconds(Math.min(request.deadlineAt, now + request.timeoutMs)) };
      permits.set(request.requestId, { permit, timeoutMs: request.timeoutMs, claimed: false });
      return { status: "reserved", permit };
    },
    async claimLaunch(permit) {
      authorizeDemoFootball();
      const state = permits.get(permit.requestId);
      if (!state || state.permit.ownerToken !== permit.ownerToken || state.claimed) return { status: "denied", reason: "already-attempted" };
      if (clock.now() >= permit.launchBefore) return { status: "denied", reason: "dispatch-expired" };
      permits.set(permit.requestId, { ...state, claimed: true });
      return { status: "claimed", timeoutMs: state.timeoutMs };
    },
    async complete(permit) {
      permits.delete(permit.requestId);
      return { status: "recorded" };
    },
  };
  return createQuotaGateway({ limiter, authorize: authorizeDemoFootball });
}
