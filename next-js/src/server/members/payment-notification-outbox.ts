import "server-only";

import { randomUUID } from "node:crypto";
import { defaultMessageTemplates, renderMessageTemplate, resolveMessageTemplates, type MessageTemplateSettings, type MessageValues } from "../../domain/message-templates.ts";
import { formatPaymentReference } from "../../domain/payment.ts";
import { supportedMessageChannels } from "../../domain/member-verification.ts";
import { paymentNoticeRules } from "../../domain/payment-notification.ts";
import { writeOwnerAudit } from "../admin/audit.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { PaymentNotificationOutbox, Prisma } from "../generated/prisma/client.ts";
import { lockMemberAccount } from "./access-codes.ts";
import { notificationEvent, type PaymentNotificationEvent, type PaymentNotifications } from "./payment-notifications.ts";
import { createYoolaMessaging, type SmsMessaging } from "./yoola-messaging.ts";
import { eventSnapshots, readMessageSnapshot, sharedMessageValues, type MessageSnapshot, type MessagingSettingsReader } from "./message-content.ts";
import { settingsServiceFor } from "./settings.ts";

export const paymentOutboxRules = Object.freeze({ maximumBatch: 100, defaultBatch: 25, interruptedAfterMs: paymentNoticeRules.interruptedAfterMs });
const transactionOptions = { isolationLevel: "ReadCommitted", timeout: 15_000 } as const;
type TerminalStatus = "sent" | "failed" | "uncertain" | "unsupported" | "unavailable" | "cancelled" | "skipped";
type ClaimedIntent = Readonly<{ status: "dispatching"; row: PaymentNotificationOutbox; attemptId: string; phone: string; balance: number }>
  | Readonly<{ status: "uncertain" | "unsupported" | "unavailable" | "cancelled" | "skipped" }>;

/** Template sources are snapshotted before commit; numbers, codes and rendered account details are never persisted here. */
export async function enqueueMemberMessage(tx: Prisma.TransactionClient, event: PaymentNotificationEvent, configuration?: MessageTemplateSettings): Promise<void> {
  const templates = configuration ?? resolveMessageTemplates((await tx.subscriptionSettings.findUnique({ where: { id: 1 } }))?.messageTemplates);
  for (const snapshot of eventSnapshots(templates, notificationEvent(event.decision))) {
    const { at, ...intent } = event;
    if (event.decision === "welcome" && await tx.paymentNotificationOutbox.findFirst({ where: { ...intent, channel: snapshot.channel } })) continue;
    await tx.paymentNotificationOutbox.create({ data: { ...intent, createdAt: at, id: randomUUID(), status: "queued",
      channel: snapshot.channel, templateSnapshot: snapshot } });
  }
}

/** The decision and its minimal intent commit together. No provider I/O occurs in this producer. */
export function createQueuedPaymentNotifications(database?: DatabaseRuntime): PaymentNotifications {
  async function status(targetId: string, decision: PaymentNotificationEvent["decision"]) {
    if (!database) return "queued" as const;
    const count = await database.query(tx => tx.paymentNotificationOutbox.count({ where: { targetId, decision } }));
    return count ? "queued" as const : "skipped" as const;
  }
  return Object.freeze({
    async enqueue(tx: Prisma.TransactionClient, event: PaymentNotificationEvent) {
      await enqueueMemberMessage(tx, event);
    },
    async approved(payment) { return status(payment.paymentId, "approved"); },
    async rejected(payment) { return status(payment.paymentId, "rejected"); },
    async credited(payment) { return status(payment.paymentId, "credited"); },
    async renewed(renewal) { return status(renewal.accessCodeId, "renewed"); },
  });
}

/** One automatic attempt per intent. Unknown delivery must be reconciled, never guessed or automatically resent. */
export function createPaymentOutboxWorker({ database, now = Date.now, delivery = createYoolaMessaging(),
  settings = () => settingsServiceFor(database).current().then(state => state.settings) }: {
  database: DatabaseRuntime; now?: () => number; delivery?: SmsMessaging; settings?: MessagingSettingsReader;
}) {
  async function audit(tx: Prisma.TransactionClient, row: PaymentNotificationOutbox, status: TerminalStatus, at: Date) {
    await writeOwnerAudit(tx, { at, actor: "system:payment-sms", action: "payment_sms_attempted", accountId: row.accountId,
      targetType: row.targetType as "payment" | "access-code" | "member", targetId: row.targetId, details: { decision: row.decision, channel: row.channel ?? "sms", status } });
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
      const channel = row.channel === "whatsapp" ? "whatsapp" : "sms";
      const status = !account || account.erasedAt || account.blockedAt ? "cancelled" : !account.phone || !account.phoneVerifiedAt ? "unavailable"
        : !supportedMessageChannels(account.phone).includes(channel) ? "unsupported"
        : channel === "whatsapp" && !account.whatsappNotificationsAt ? "skipped" : null;
      if (status) {
        await tx.paymentNotificationOutbox.update({ where: { id }, data: { status, finishedAt: at } });
        if (account && !account.erasedAt) await audit(tx, row, status, at);
        return { status };
      }
      // Missing worker credentials must leave an intent queued rather than consume its only automatic attempt.
      if (delivery.configured?.() === false) return null;
      if (channel === "whatsapp" && !delivery.sendWhatsApp) return null;
      const attemptId = randomUUID();
      await tx.paymentNotificationOutbox.update({ where: { id }, data: { status: "dispatching", startedAt: at, attemptId } });
      return { status: "dispatching" as const, row, attemptId, phone: account!.phone!, balance: account!.creditUgx };
    }, transactionOptions);
  }
  async function messageValues(claimed: Extract<ClaimedIntent, { status: "dispatching" }>, snapshot: MessageSnapshot): Promise<MessageValues> {
    const sources = snapshot.channel === "sms" ? snapshot.source : snapshot.parameters.join(" ");
    const needsSettings = /\{\{(?:support_phone|support_whatsapp|trial_days)\}\}/u.test(sources);
    const configured = needsSettings ? await settings() : null;
    if (needsSettings && !configured) throw new RangeError("Message settings are unavailable.");
    const values: MessageValues = { ...sharedMessageValues(configured, claimed.phone), balance: money(claimed.balance) };
    if (!/\{\{(?:plan_name|amount|payment_reference|expiry_date|rejection_reason)\}\}/u.test(sources)) return values;
    return database.query(async tx => {
      if (claimed.row.targetType === "payment") {
        const payment = await tx.paymentSubmission.findUnique({ where: { id: claimed.row.targetId }, include: { code: true } });
        if (!payment || payment.accountId !== claimed.row.accountId) throw new RangeError("Payment message context is unavailable.");
        const reason = ({ unreadable: "Payment details could not be read", "amount-mismatch": "Payment amount does not match", "not-received": "Payment not received",
          duplicate: "Transaction already used", "wrong-number": "Payment sent to a different number", other: "Contact support for details" } as Record<string, string>)[payment.rejectReason ?? "other"] ?? "Contact support for details";
        return { ...values, plan_name: payment.planName, amount: money(payment.amountReceivedUgx ?? payment.claimedAmountUgx),
          payment_reference: formatPaymentReference(payment.reference), rejection_reason: reason,
          ...(payment.code ? { expiry_date: expiry(payment.code.endsAt) } : {}) };
      }
      if (claimed.row.targetType === "access-code") {
        const period = await tx.accessCode.findUnique({ where: { id: claimed.row.targetId } });
        if (!period || period.accountId !== claimed.row.accountId) throw new RangeError("Access message context is unavailable.");
        return { ...values, plan_name: period.planName, expiry_date: expiry(period.endsAt) };
      }
      return values;
    });
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
        try {
          const snapshot = claimed.row.templateSnapshot ? readMessageSnapshot(claimed.row.templateSnapshot)
            : eventSnapshots(defaultMessageTemplates, notificationEvent(claimed.row.decision as PaymentNotificationEvent["decision"]))[0];
          if (!snapshot || snapshot.channel !== (claimed.row.channel ?? "sms")) throw new RangeError("Message configuration is unavailable.");
          const values = await messageValues(claimed, snapshot);
          if (snapshot.channel === "whatsapp") await delivery.sendWhatsApp!({ phone: claimed.phone, templateName: snapshot.templateName,
            parameters: snapshot.parameters.map(source => renderMessageTemplate(snapshot.event, source, values)), consent: true });
          else await delivery.sendSms({ phone: claimed.phone, message: renderMessageTemplate(snapshot.event, snapshot.source, values) });
          status = "sent";
        }
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
const money = (amount: number) => `UGX ${new Intl.NumberFormat("en-UG").format(amount)}`;
const expiry = (at: Date) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Kampala" }).format(at) + " EAT";
