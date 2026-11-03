import "server-only";

import { randomUUID } from "node:crypto";
import { retryDelay, reviewAlertRules } from "../../domain/payment-alerts.ts";
import type { AnalyticsConfig } from "../analytics/analytics-config.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { reviewEventWhere, reviewerSessionValid } from "./payment-alerts.ts";
import { createReviewTransports, type ReviewTransports } from "./payment-alert-transports.ts";

/** Lease/CAS claims allow several workers; retries reuse one event ID for endpoint-side deduplication. */
export function createReviewAlertWorker({ database, config, now = Date.now, transports = createReviewTransports() }: {
  database: DatabaseRuntime; config: Pick<AnalyticsConfig, "key">; now?: () => number; transports?: ReviewTransports;
}) {
  return {
    async run(limit = 25) {
      if (!Number.isInteger(limit) || limit < 1 || limit > reviewAlertRules.maximumBatch) throw new RangeError("Choose a batch of 1–50.");
      const at = new Date(now()), result = { events: 0, accepted: 0, cleared: 0, retried: 0, cancelled: 0, failed: 0, unconfigured: 0 };
      const enabled = await database.query(tx => tx.subscriptionSettings.findFirst({ where: { id: 1, paymentAlertsEnabled: true } }));
      // Remove revoked sessions/roles before fan-out. Session deletion also cascades instantly on logout/eviction.
      const endpoints = await database.query(tx => tx.paymentAlertEndpoint.findMany({ include: { session: { include: { account: true } } } }));
      for (const endpoint of endpoints) if (!reviewerSessionValid(endpoint.session, config, at)) {
        await database.query(tx => tx.paymentAlertEndpoint.deleteMany({ where: { id: endpoint.id } }));
      }
      await database.query(tx => tx.paymentReviewEvent.deleteMany({ where: { createdAt: { lt: new Date(+at - 90 * reviewAlertRules.lifetimeMs) } } }));
      if (!enabled) return result;
      const events = await database.query(tx => tx.paymentReviewEvent.findMany({ where: { ...reviewEventWhere(at), fannedAt: null },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit }));
      for (const event of events) {
        await database.transaction(async tx => {
          const changed = await tx.paymentReviewEvent.updateMany({ where: { id: event.id, fannedAt: null, resolvedAt: null }, data: { fannedAt: at } });
          if (!changed.count) return;
          const targets = await tx.paymentAlertEndpoint.findMany({ where: { enabled: true, createdAt: { lte: event.createdAt },
            ...(event.testEndpointId ? { id: event.testEndpointId } : {}) }, select: { id: true } });
          if (targets.length) await tx.paymentAlertDelivery.createMany({ skipDuplicates: true, data: targets.map(endpoint => ({ id: randomUUID(), eventId: event.id,
            endpointId: endpoint.id, nextAttemptAt: at })) });
          result.events++;
        });
      }
      const rows = await database.query(tx => tx.paymentAlertDelivery.findMany({ where: { attempts: { lt: reviewAlertRules.maximumAttempts }, nextAttemptAt: { lte: at },
        endpoint: { transport: { in: ["web", "fcm"].filter(transport => transports.configured(transport)) } }, OR: [{ status: "queued" }, { status: "sending", leaseUntil: { lte: at } }] },
        orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }], take: limit, include: { endpoint: true } }));
      for (const candidate of rows) {
        if (!transports.configured(candidate.endpoint.transport)) { result.unconfigured++; continue; }
        const attemptId = randomUUID(), started = new Date(now());
        const claimed = await database.query(tx => tx.paymentAlertDelivery.updateMany({ where: { id: candidate.id, attempts: { lt: reviewAlertRules.maximumAttempts },
          OR: [{ status: "queued" }, { status: "sending", leaseUntil: { lte: started } }] },
          data: { status: "sending", attemptId, attempts: { increment: 1 }, leaseUntil: new Date(+started + reviewAlertRules.leaseMs) } }));
        if (!claimed.count) continue;
        const row = await database.query(tx => tx.paymentAlertDelivery.findUnique({ where: { id: candidate.id },
          include: { event: { include: { payment: { select: { status: true } } } }, endpoint: { include: { session: { include: { account: true } } } } } }));
        if (!row) continue;
        const active = await database.query(tx => tx.subscriptionSettings.findFirst({ where: { id: 1, paymentAlertsEnabled: true } }));
        // Reconnecting an endpoint must not audibly replay a backlog. Its latest
        // outstanding report opens the queue; every older payment remains there.
        const supersededBacklog = row.event.paymentId && +row.event.createdAt < +started - 60_000 && await database.query(tx => tx.paymentReviewEvent.findFirst({
          where: { ...reviewEventWhere(started), testEndpointId: null, createdAt: { gte: row.endpoint.createdAt },
            AND: [{ OR: [{ createdAt: { gt: row.event.createdAt } }, { createdAt: row.event.createdAt, id: { gt: row.eventId } }] }] }, select: { id: true } }));
        const valid = active && !supersededBacklog && row.endpoint.enabled && reviewerSessionValid(row.endpoint.session, config, started) && !row.event.resolvedAt
          && +row.event.createdAt > +started - reviewAlertRules.lifetimeMs && (!row.event.payment || ["pending", "disputed"].includes(row.event.payment.status));
        const outcome = valid ? await transports.send(row.endpoint.transport, row.endpoint.subscription, { eventId: row.eventId, paymentId: row.event.paymentId,
          endpointId: row.endpointId, createdAt: row.event.createdAt.toISOString() }) : "cancelled";
        const finished = new Date(now()), retry = outcome === "retry" && row.attempts < reviewAlertRules.maximumAttempts;
        await database.query(tx => tx.paymentAlertDelivery.updateMany({ where: { id: row.id, attemptId, status: "sending" }, data: {
          status: outcome === "accepted" ? "accepted" : retry || outcome === "unconfigured" ? "queued" : outcome === "cancelled" || outcome === "invalid" ? "cancelled" : "failed",
          leaseUntil: null, acceptedAt: outcome === "accepted" ? finished : null, lastError: outcome === "accepted" ? null : outcome,
          nextAttemptAt: new Date(+finished + retryDelay(row.attempts)),
        } }));
        if (outcome === "invalid") await database.query(tx => tx.paymentAlertEndpoint.deleteMany({ where: { id: row.endpointId, fingerprint: row.endpoint.fingerprint } }));
        if (outcome === "accepted") result.accepted++;
        else if (retry) result.retried++;
        else if (outcome === "cancelled" || outcome === "invalid") result.cancelled++;
        else if (outcome === "unconfigured") result.unconfigured++;
        else result.failed++;
      }
      // Terminalise abandoned final leases rather than leave a permanent “sending” state.
      await database.query(tx => tx.paymentAlertDelivery.updateMany({ where: { status: "sending", attempts: { gte: reviewAlertRules.maximumAttempts }, leaseUntil: { lte: new Date(now()) } },
        data: { status: "failed", leaseUntil: null, lastError: "interrupted" } }));
      // Resolution is durable too. Clear OS notifications on supported transports;
      // offline clients also reconcile the same event list when they resume.
      const clears = await database.query(tx => tx.paymentAlertDelivery.findMany({ where: {
        clearAttempts: { lt: reviewAlertRules.maximumAttempts }, endpoint: { transport: { in: ["web", "fcm"].filter(transport => transports.configured(transport)) } },
        AND: [{ OR: [{ clearNextAttemptAt: null }, { clearNextAttemptAt: { lte: at } }] },
          { OR: [{ status: "accepted" }, { status: "clearing", leaseUntil: { lte: at } }] }],
        event: { OR: [{ resolvedAt: { not: null } }, { createdAt: { lte: new Date(+at - reviewAlertRules.lifetimeMs) } },
          { payment: { status: { notIn: ["pending", "disputed"] } } }] },
      }, orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }], take: limit }));
      for (const candidate of clears) {
        const attemptId = randomUUID(), started = new Date(now());
        const claim = await database.query(tx => tx.paymentAlertDelivery.updateMany({ where: { id: candidate.id, clearAttempts: { lt: reviewAlertRules.maximumAttempts },
          OR: [{ status: "accepted" }, { status: "clearing", leaseUntil: { lte: started } }] },
          data: { status: "clearing", attemptId, clearAttempts: { increment: 1 }, leaseUntil: new Date(+started + reviewAlertRules.leaseMs) } }));
        if (!claim.count) continue;
        const row = await database.query(tx => tx.paymentAlertDelivery.findUnique({ where: { id: candidate.id },
          include: { event: true, endpoint: { include: { session: { include: { account: true } } } } } }));
        if (!row) continue;
        const enabled = await database.query(tx => tx.subscriptionSettings.findFirst({ where: { id: 1, paymentAlertsEnabled: true } }));
        const valid = enabled && row.endpoint.enabled && reviewerSessionValid(row.endpoint.session, config, started);
        const outcome = valid ? await transports.send(row.endpoint.transport, row.endpoint.subscription, {
          eventId: row.eventId, paymentId: row.event.paymentId, endpointId: row.endpointId, createdAt: started.toISOString(), resolved: true,
        }) : "cancelled";
        const retry = ["retry", "unconfigured"].includes(outcome) && row.clearAttempts < reviewAlertRules.maximumAttempts;
        await database.query(tx => tx.paymentAlertDelivery.updateMany({ where: { id: row.id, attemptId, status: "clearing" }, data: {
          status: outcome === "accepted" ? "cleared" : retry ? "accepted" : outcome === "cancelled" || outcome === "invalid" ? "cancelled" : "clear-failed",
          clearedAt: outcome === "accepted" ? new Date(now()) : null, leaseUntil: null, lastError: outcome === "accepted" ? null : `clear-${outcome}`,
          clearNextAttemptAt: new Date(now() + retryDelay(row.clearAttempts)),
        } }));
        if (outcome === "invalid") await database.query(tx => tx.paymentAlertEndpoint.deleteMany({ where: { id: row.endpointId, fingerprint: row.endpoint.fingerprint } }));
        if (outcome === "accepted") result.cleared++;
        else if (retry) result.retried++;
        else result.failed++;
      }
      await database.query(tx => tx.paymentAlertDelivery.updateMany({ where: { status: "clearing", clearAttempts: { gte: reviewAlertRules.maximumAttempts }, leaseUntil: { lte: new Date(now()) } },
        data: { status: "clear-failed", leaseUntil: null, lastError: "clear-interrupted" } }));
      return result;
    },
  };
}
