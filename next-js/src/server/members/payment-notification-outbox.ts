import "server-only";

import { paymentNoticeRules } from "../../domain/payment-notification.ts";
import { writeOwnerAudit } from "../admin/audit.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { lockMemberAccount } from "./access-codes.ts";

export const paymentOutboxRules = Object.freeze({ maximumBatch: 100, defaultBatch: 25, interruptedAfterMs: paymentNoticeRules.interruptedAfterMs });

/** Settle retired member-message intents without accessing a delivery provider. */
export function createPaymentOutboxWorker({ database, now = Date.now }: { database: DatabaseRuntime; now?: () => number }) {
  async function retire(id: string): Promise<"cancelled" | "uncertain" | "skipped"> {
    return database.transaction(async tx => {
      const initial = await tx.paymentNotificationOutbox.findUnique({ where: { id } });
      if (!initial) return "skipped";
      const account = await lockMemberAccount(tx, initial.accountId);
      const row = await tx.paymentNotificationOutbox.findUnique({ where: { id } });
      if (!row) return "skipped";
      const at = new Date(now());
      const interrupted = row.status === "dispatching" && row.startedAt && +row.startedAt <= +at - paymentOutboxRules.interruptedAfterMs;
      const status = row.status === "queued" ? "cancelled" : interrupted ? "uncertain" : null;
      if (!status) return "skipped";
      const changed = await tx.paymentNotificationOutbox.updateMany({ where: { id, status: row.status, attemptId: row.attemptId },
        data: { status, finishedAt: at } });
      if (!changed.count) return "skipped";
      if (account && !account.erasedAt) await writeOwnerAudit(tx, { at, actor: "system:payment-sms", action: "payment_sms_attempted", accountId: row.accountId,
        targetType: row.targetType as "payment" | "access-code" | "member", targetId: row.targetId,
        details: { decision: row.decision, channel: row.channel ?? "sms", status } });
      return status;
    }, { isolationLevel: "ReadCommitted", timeout: 15_000 });
  }
  return Object.freeze({
    async run(limit: number = paymentOutboxRules.defaultBatch) {
      if (!Number.isInteger(limit) || limit < 1 || limit > paymentOutboxRules.maximumBatch) throw new RangeError("Payment message cleanup batch must be 1–100.");
      const interruptedBefore = new Date(now() - paymentOutboxRules.interruptedAfterMs);
      const rows = await database.query(tx => tx.paymentNotificationOutbox.findMany({ where: { OR: [{ status: "queued" },
        { status: "dispatching", startedAt: { lte: interruptedBefore } }] }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: limit, select: { id: true } }));
      const result = { examined: rows.length, sent: 0, failed: 0, uncertain: 0, unsupported: 0, unavailable: 0, cancelled: 0, skipped: 0 };
      for (const row of rows) result[await retire(row.id)]++;
      return result;
    },
    async status() {
      const groups = await database.query(tx => tx.paymentNotificationOutbox.groupBy({ by: ["status"], _count: { _all: true } }));
      return Object.fromEntries(groups.map(group => [group.status, group._count._all]));
    },
  });
}
