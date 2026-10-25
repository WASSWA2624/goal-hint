import "server-only";

import { randomUUID } from "node:crypto";
import { supportedMessageChannels } from "../../domain/member-verification.ts";
import { paymentNoticeRules } from "../../domain/payment-notification.ts";
import { writeOwnerAudit } from "../admin/audit.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { PaymentNotificationOutbox, Prisma } from "../generated/prisma/client.ts";
import { lockMemberAccount } from "./access-codes.ts";
import { accountUpdateMessage, type PaymentNotificationEvent, type PaymentNotifications } from "./payment-notifications.ts";
import { createYoolaMessaging, type SmsMessaging } from "./yoola-messaging.ts";

export const paymentOutboxRules = Object.freeze({ maximumBatch: 100, defaultBatch: 25, interruptedAfterMs: paymentNoticeRules.interruptedAfterMs });
const transactionOptions = { isolationLevel: "ReadCommitted", timeout: 15_000 } as const;
type TerminalStatus = "sent" | "failed" | "uncertain" | "unsupported" | "unavailable" | "cancelled";
type ClaimedIntent = Readonly<{ status: "dispatching"; row: PaymentNotificationOutbox; attemptId: string; phone: string }>
  | Readonly<{ status: "uncertain" | "unsupported" | "unavailable" | "cancelled" }>;

/** The decision and its minimal intent commit together. No provider I/O occurs in this producer. */
export function createQueuedPaymentNotifications(): PaymentNotifications {
  return Object.freeze({
    async enqueue(tx: Prisma.TransactionClient, event: PaymentNotificationEvent) {
      const { at, ...intent } = event;
      await tx.paymentNotificationOutbox.create({ data: { ...intent, createdAt: at, id: randomUUID(), status: "queued" } });
    },
    async approved() { return "queued"; },
    async rejected() { return "queued"; },
    async credited() { return "queued"; },
    async renewed() { return "queued"; },
  });
}

/** One automatic attempt per intent. Unknown delivery must be reconciled, never guessed or automatically resent. */
export function createPaymentOutboxWorker({ database, now = Date.now, delivery = createYoolaMessaging() }: {
  database: DatabaseRuntime; now?: () => number; delivery?: SmsMessaging;
}) {
  async function audit(tx: Prisma.TransactionClient, row: PaymentNotificationOutbox, status: TerminalStatus, at: Date) {
    await writeOwnerAudit(tx, { at, actor: "system:payment-sms", action: "payment_sms_attempted", accountId: row.accountId,
      targetType: row.targetType as "payment" | "access-code", targetId: row.targetId, details: { decision: row.decision, status } });
  }
  async function claim(id: string): Promise<ClaimedIntent | null> {
    return database.transaction<ClaimedIntent | null>(async tx => {
      const initial = await tx.paymentNotificationOutbox.findUnique({ where: { id } });
      if (!initial) return null;
      // Every member change, decision and erasure shares this lock. Re-read the intent after acquiring it.
      const account = await lockMemberAccount(tx, initial.accountId);
      const row = await tx.paymentNotificationOutbox.findUnique({ where: { id } });
      if (!row) return null;
      const at = new Date(now());
      if (row.status === "dispatching" && row.startedAt && +row.startedAt <= +at - paymentOutboxRules.interruptedAfterMs) {
        await tx.paymentNotificationOutbox.update({ where: { id }, data: { status: "uncertain", finishedAt: at } });
        if (account && !account.erasedAt) await audit(tx, row, "uncertain", at);
        return { status: "uncertain" as const };
      }
      if (row.status !== "queued") return null;
      const status = !account || account.erasedAt || account.blockedAt ? "cancelled" : !account.phone ? "unavailable"
        : !supportedMessageChannels(account.phone).includes("sms") ? "unsupported" : null;
      if (status) {
        await tx.paymentNotificationOutbox.update({ where: { id }, data: { status, finishedAt: at } });
        if (account && !account.erasedAt) await audit(tx, row, status, at);
        return { status };
      }
      // Missing worker credentials must leave an intent queued rather than consume its only automatic attempt.
      if (delivery.configured?.() === false) return null;
      const attemptId = randomUUID();
      await tx.paymentNotificationOutbox.update({ where: { id }, data: { status: "dispatching", startedAt: at, attemptId } });
      return { status: "dispatching" as const, row, attemptId, phone: account!.phone! };
    }, transactionOptions);
  }
  async function finish(row: PaymentNotificationOutbox, attemptId: string, status: "sent" | "failed") {
    await database.transaction(async tx => {
      const account = await lockMemberAccount(tx, row.accountId);
      const changed = await tx.paymentNotificationOutbox.updateMany({ where: { id: row.id, attemptId, status: { in: ["dispatching", "uncertain"] } },
        data: { status, finishedAt: new Date(now()) } });
      if (changed.count && account && !account.erasedAt) await audit(tx, row, status, new Date(now()));
    }, transactionOptions);
  }
  return Object.freeze({
    async run(limit: number = paymentOutboxRules.defaultBatch) {
      if (!Number.isInteger(limit) || limit < 1 || limit > paymentOutboxRules.maximumBatch) throw new RangeError("Payment SMS batch must be 1–100.");
      const interruptedBefore = new Date(now() - paymentOutboxRules.interruptedAfterMs);
      const rows = await database.query(tx => tx.paymentNotificationOutbox.findMany({ where: { OR: [{ status: "queued" },
        { status: "dispatching", startedAt: { lte: interruptedBefore } }] }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: limit, select: { id: true } }));
      const result = { examined: rows.length, sent: 0, failed: 0, uncertain: 0, unsupported: 0, unavailable: 0, cancelled: 0, skipped: 0 };
      for (const candidate of rows) {
        const claimed = await claim(candidate.id);
        if (!claimed) { result.skipped++; continue; }
        if (claimed.status !== "dispatching") { result[claimed.status]++; continue; }
        let status: "sent" | "failed";
        try { await delivery.sendSms({ phone: claimed.phone, message: accountUpdateMessage }); status = "sent"; }
        catch { status = "failed"; }
        // A failed final commit leaves dispatching visible; recovery marks it uncertain and never sends again.
        await finish(claimed.row, claimed.attemptId, status);
        result[status]++;
      }
      return result;
    },
    async status() {
      const groups = await database.query(tx => tx.paymentNotificationOutbox.groupBy({ by: ["status"], _count: { _all: true } }));
      return Object.fromEntries(groups.map(group => [group.status, group._count._all]));
    },
  });
}
