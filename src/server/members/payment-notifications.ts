import "server-only";

import { randomInt, randomUUID } from "node:crypto";
import type { OwnerNotice } from "../../domain/owner-members.ts";
import { formatPaymentReference } from "../../domain/payment.ts";
import { noticeRetryDelay, noticeTargetType, paymentNoticeRules, type PaymentNoticeError, type PaymentNoticeKind, type PaymentNoticeState,
  type PaymentNotificationStatus } from "../../domain/payment-notification.ts";
import { supportedMessageChannels } from "../../domain/member-verification.ts";
import { writeOwnerAudit } from "../admin/audit.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { lockMemberAccount } from "./access-codes.ts";
import { createYoolaMessaging, YoolaMessagingError, type SmsMessaging } from "./yoola-messaging.ts";

/** Decisions inject only delivery; enqueueing is a direct call in their own transaction, so a fake can never disable it. */
export type PaymentNotifications = Readonly<{ deliver(id: string): Promise<PaymentNotificationStatus> }>;
export type PaymentNoticeRunResult = Readonly<{ recovered: number; expired: number; accepted: number; retrying: number; failed: number; uncertain: number;
  skipped: number; configured: boolean }>;
export type PaymentNoticeAction = Readonly<{ status: "saved"; notification?: PaymentNotificationStatus }> | Readonly<{ status: "refused"; message: string }>;
// The gateway and lock-screen previews can expose message contents. Keep financial and subscription details in the app.
const accountUpdateMessage = "Goal Hint: Your account has been updated. Sign in to view the details or contact admin for help.";
const options = { isolationLevel: "ReadCommitted", timeout: 15_000 } as const;
const refused = (): PaymentNoticeAction => ({ status: "refused", message: "This SMS notice can no longer be changed. Refresh to see its status." });
type NoticeRow = Readonly<{ id: string; accountId: string; kind: string; targetId: string; state: string; attempts: number; lastError: string | null;
  leaseUntil: Date | null }>;
type Claim = Readonly<{ id: string; owner: string; accountId: string; kind: PaymentNoticeKind; targetId: string; attempts: number; phone: string }>;
type Settled = Readonly<{ status: PaymentNotificationStatus; changed: boolean }>;
type Outcome = Readonly<{ state: PaymentNoticeState; lastError: PaymentNoticeError | null; status: PaymentNotificationStatus; availableAt?: Date }>;

/**
 * Writes one pending notice inside the decision's transaction and returns its id for the post-commit `deliver`. A plain create:
 * `skipDuplicates` or INSERT IGNORE would turn a CHECK failure into a warning. Decisions are never reopened, so one decision
 * per target keeps (targetId, kind) unique.
 */
export async function enqueuePaymentNotice(tx: Prisma.TransactionClient, { accountId, kind, targetId, at }: {
  accountId: string; kind: PaymentNoticeKind; targetId: string; at: Date;
}): Promise<string> {
  const id = randomUUID();
  await tx.paymentNotice.create({ data: { id, accountId, kind, targetId, state: "pending", attempts: 0, availableAt: at,
    expiresAt: new Date(+at + paymentNoticeRules.sendWithinMs), createdAt: at } });
  return id;
}

function statusOf(row: Pick<NoticeRow, "state" | "lastError">): PaymentNotificationStatus {
  switch (row.state) {
    case "accepted": return "sent";
    case "failed": return "failed";
    case "uncertain": return "uncertain";
    case "skipped": return row.lastError === "unsupported" ? "unsupported" : "unavailable";
    default: return "queued";
  }
}

/** Only a definite refusal is retried; anything that may have been accepted closes as uncertain and is never resent. */
function classify(error: unknown, attempts: number, at: number): Outcome {
  if (error instanceof YoolaMessagingError) {
    if (error.code === "unsupported-country") return { state: "skipped", lastError: "unsupported", status: "unsupported" };
    if (error.code === "invalid-message") return { state: "failed", lastError: "invalid", status: "failed" };
    if (error.dispatch === "rejected" || error.code === "configuration") {
      const lastError = error.code === "configuration" ? "configuration" : "rejected";
      return attempts < paymentNoticeRules.maxAttempts
        ? { state: "pending", lastError, status: "queued", availableAt: new Date(at + noticeRetryDelay(attempts, randomInt(0, 1_000_000) / 1_000_000)) }
        : { state: "failed", lastError, status: "failed" };
    }
  }
  return { state: "uncertain", lastError: "uncertain", status: "uncertain" };
}

/**
 * The account-update SMS outbox (B04). `deliver` claims one pending notice under a fenced lease, sends the fixed notice outside
 * any transaction and records the gateway's answer; `run` (the members worker and owner page loads) also recovers expired leases
 * as uncertain and expires notices not sent within a day. Locks are always the account, then the notice, as in decisions,
 * erasure and deletion. Nothing here holds or returns a phone number or the message text, except `attention`, which shows the
 * owner the account number already shown on Payments.
 */
export function createPaymentNotifications({ database, now = Date.now, delivery = createYoolaMessaging() }: {
  database: DatabaseRuntime; now?: () => number; delivery?: SmsMessaging;
}) {
  const configured = () => delivery.configured?.() !== false;
  const audit = (tx: Prisma.TransactionClient, row: Pick<NoticeRow, "accountId" | "kind" | "targetId">, at: Date, details: Record<string, unknown>,
    action: "payment_sms_attempted" | "payment_sms_resent" | "payment_sms_dismissed" = "payment_sms_attempted", actor = "system:payment-sms") =>
    writeOwnerAudit(tx, { at, actor, action, accountId: row.accountId, targetType: noticeTargetType(row.kind as PaymentNoticeKind), targetId: row.targetId,
      details: { decision: row.kind, ...details } });

  /** Closes a row the dispatcher may not send, conditional on its state; audits only an open account's change. */
  async function close(tx: Prisma.TransactionClient, row: NoticeRow, account: { erasedAt: Date | null } | null, from: Prisma.PaymentNoticeWhereInput,
    data: Readonly<{ state: PaymentNoticeState; lastError: PaymentNoticeError }>, at: Date) {
    const closed = await tx.paymentNotice.updateMany({ where: { id: row.id, ...from },
      data: { ...data, leaseUntil: null, closedAt: at } });
    if (closed.count === 1 && account && !account.erasedAt) await audit(tx, row, at, { status: statusOf(data) });
    return closed.count === 1;
  }

  /** `changed` is false when this call only observed the row (closed or claimed elsewhere, or not yet due). */
  async function claim(id: string): Promise<Claim | Settled> {
    const peek = await database.query(tx => tx.paymentNotice.findUnique({ where: { id }, select: { accountId: true } }));
    if (!peek) return { status: "unavailable", changed: false };
    return database.transaction(async (tx): Promise<Claim | Settled> => {
      const at = new Date(now());
      const account = await lockMemberAccount(tx, peek.accountId);
      const row = await tx.paymentNotice.findUnique({ where: { id } });
      if (!row) return { status: "unavailable", changed: false };
      if (row.state !== "pending") return { status: statusOf(row), changed: false };
      const closing = row.expiresAt <= at ? { state: "failed", lastError: "expired" } as const
        : !account || account.erasedAt || !account.phone ? { state: "skipped", lastError: "unavailable" } as const
        : !supportedMessageChannels(account.phone).includes("sms") ? { state: "skipped", lastError: "unsupported" } as const : null;
      if (closing) return { status: statusOf(closing), changed: await close(tx, row, account, { state: "pending" }, closing, at) };
      // The worker's environment may lack the Yoola key while the web's has it: an unconfigured process consumes no attempt.
      if (!configured() || !account?.phone) return { status: "queued", changed: false };
      const owner = randomUUID();
      const claimed = await tx.paymentNotice.updateMany({ where: { id, state: "pending", availableAt: { lte: at } },
        data: { state: "sending", attempts: { increment: 1 }, leaseOwner: owner, leaseUntil: new Date(+at + paymentNoticeRules.leaseMs), attemptedAt: at } });
      if (claimed.count !== 1) return { status: "queued", changed: false };
      // Blocked accounts are still told, as before; the number stays in memory only.
      return { id, owner, accountId: row.accountId, kind: row.kind as PaymentNoticeKind, targetId: row.targetId, attempts: row.attempts + 1, phone: account.phone };
    }, options);
  }

  /** Never throws: a decision already committed, and its notice row survives every failure here. */
  async function dispatch(id: string): Promise<Settled> {
    let claimed: Claim | Settled;
    try { claimed = await claim(id); } catch { return { status: "queued", changed: false }; }
    if ("status" in claimed) return claimed;
    const sending = claimed;
    let outcome: Outcome;
    try {
      await delivery.sendSms({ phone: sending.phone, message: accountUpdateMessage });
      outcome = { state: "accepted", lastError: null, status: "sent" };
    } catch (error) { outcome = classify(error, sending.attempts, now()); }
    try {
      await database.transaction(async tx => {
        const at = new Date(now());
        // Deletion may finish while the provider is responding; sharing its account lock keeps an answer from recreating data.
        const account = await lockMemberAccount(tx, sending.accountId);
        // Fenced by the lease owner. A late answer may replace the uncertain state lease recovery gave it with the real one;
        // a resend clears the owner, so an earlier attempt can never overwrite a later one.
        const done = await tx.paymentNotice.updateMany({ where: { id, leaseOwner: sending.owner, state: { in: ["sending", "uncertain"] } },
          data: { state: outcome.state, lastError: outcome.lastError, leaseUntil: null, closedAt: outcome.state === "pending" ? null : at,
            ...(outcome.availableAt ? { availableAt: outcome.availableAt } : {}) } });
        if (done.count === 1 && account && !account.erasedAt) await audit(tx, sending, at, { status: outcome.status });
      }, options);
    } catch { /* The lease expires and recovery records the notice as uncertain, never as a resend. */ }
    return { status: outcome.status, changed: true };
  }
  const deliver = async (id: string): Promise<PaymentNotificationStatus> => (await dispatch(id)).status;

  /** Recovers or expires rows one at a time, each under its account lock. */
  async function closeEach(where: Prisma.PaymentNoticeWhereInput, data: Readonly<{ state: PaymentNoticeState; lastError: PaymentNoticeError }>, at: Date) {
    const rows = await database.query(tx => tx.paymentNotice.findMany({ where, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 100,
      select: { id: true, accountId: true } }));
    let total = 0;
    for (const { id, accountId } of rows) {
      try {
        if (await database.transaction(async tx => {
          const account = await lockMemberAccount(tx, accountId);
          const row = await tx.paymentNotice.findUnique({ where: { id } });
          return row ? close(tx, row, account, where, data, at) : false;
        }, options)) total++;
      } catch { /* The next run retries it. */ }
    }
    return total;
  }

  async function run(): Promise<PaymentNoticeRunResult> {
    const started = now(), at = new Date(started);
    const result = { recovered: 0, expired: 0, accepted: 0, retrying: 0, failed: 0, uncertain: 0, skipped: 0, configured: configured() };
    // An expired lease may have been accepted: it closes as uncertain and keeps its owner, so only that attempt's answer may land.
    result.recovered = await closeEach({ state: "sending", leaseUntil: { lte: at } }, { state: "uncertain", lastError: "uncertain" }, at);
    // Stranded rows close even without a configured dispatcher.
    result.expired = await closeEach({ state: "pending", expiresAt: { lte: at } }, { state: "failed", lastError: "expired" }, at);
    if (!result.configured) return result;
    const seen = new Set<string>();
    while (seen.size < paymentNoticeRules.runLimit && now() - started < paymentNoticeRules.runBudgetMs) {
      const due = await database.query(tx => tx.paymentNotice.findMany({
        where: { state: "pending", availableAt: { lte: new Date(now()) }, ...(seen.size ? { id: { notIn: [...seen] } } : {}) },
        orderBy: [{ availableAt: "asc" }, { id: "asc" }], take: paymentNoticeRules.batch, select: { id: true } }));
      for (const { id } of due) {
        if (seen.size >= paymentNoticeRules.runLimit || now() - started >= paymentNoticeRules.runBudgetMs) break;
        seen.add(id);
        // Only what this run did is counted: a row another dispatcher closed or holds is left to it.
        const { status, changed } = await dispatch(id);
        if (!changed) continue;
        if (status === "sent") result.accepted++;
        else if (status === "queued") result.retrying++;
        else if (status === "failed") result.failed++;
        else if (status === "uncertain") result.uncertain++;
        else result.skipped++;
      }
      if (due.length < paymentNoticeRules.batch) break;
    }
    return result;
  }

  /** What the owner should look at: undelivered, refused, unsupported, stuck and unconfirmed notices, newest first. */
  async function attention(): Promise<readonly OwnerNotice[]> {
    const at = new Date(now());
    return database.query(async tx => {
      const rows = await tx.paymentNotice.findMany({ where: { OR: [
        { state: { in: ["failed", "uncertain"] } }, { state: "skipped", lastError: "unsupported" }, { state: "pending", attempts: { gt: 0 } },
        { state: "pending", createdAt: { lte: new Date(+at - paymentNoticeRules.stuckAfterMs) } }, { state: "sending", leaseUntil: { lte: at } },
      ] }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50,
      select: { id: true, accountId: true, kind: true, targetId: true, state: true, lastError: true, attempts: true, createdAt: true, attemptedAt: true,
        account: { select: { phone: true } } } });
      const paymentIds = rows.filter(row => row.kind !== "renewed").map(row => row.targetId), codeIds = rows.filter(row => row.kind === "renewed").map(row => row.targetId);
      const [payments, codes] = await Promise.all([
        paymentIds.length ? tx.paymentSubmission.findMany({ where: { id: { in: paymentIds } }, select: { id: true, reference: true } }) : [],
        codeIds.length ? tx.accessCode.findMany({ where: { id: { in: codeIds } }, select: { id: true, reference: true } }) : [],
      ]);
      return rows.map(row => {
        const reference = row.kind === "renewed" ? codes.find(code => code.id === row.targetId)?.reference
          : payments.find(payment => payment.id === row.targetId)?.reference;
        // A lease past its end may already have been accepted: it reads as unconfirmed until recovery records that.
        const stale = row.state === "sending";
        return { id: row.id, accountId: row.accountId, phone: row.account.phone, kind: row.kind,
          reference: reference ? row.kind === "renewed" ? `C-${reference}` : formatPaymentReference(reference) : null,
          state: stale ? "uncertain" : row.state, lastError: stale ? "uncertain" : row.lastError, attempts: row.attempts,
          createdAt: row.createdAt.toISOString(), attemptedAt: row.attemptedAt?.toISOString() ?? null };
      });
    });
  }

  /** Failed and unconfirmed rows, and a lease past its end, which may already be in flight and so counts as unconfirmed. */
  const undelivered = (row: NoticeRow, at: Date) => ["failed", "uncertain"].includes(row.state) || row.state === "sending" && !!row.leaseUntil && row.leaseUntil <= at;

  /** Owner-only changes, under the account lock, never on an erased account. */
  async function owned(id: string, change: (tx: Prisma.TransactionClient, row: NoticeRow, at: Date) => Promise<boolean>) {
    const peek = await database.query(tx => tx.paymentNotice.findUnique({ where: { id }, select: { accountId: true } }));
    if (!peek) return false;
    return database.transaction(async tx => {
      const at = new Date(now());
      const account = await lockMemberAccount(tx, peek.accountId);
      const row = await tx.paymentNotice.findUnique({ where: { id } });
      return !!row && !!account && !account.erasedAt && change(tx, row, at);
    }, options);
  }

  let pending: Promise<unknown> | null = null, checkedAt = -Infinity;
  return Object.freeze({
    deliver, run, attention,

    /** Throttled background dispatch for owner page loads; errors are swallowed and the cron slot covers the rest. */
    maybeDispatch() {
      if (pending || now() - checkedAt < paymentNoticeRules.slotMs) return;
      checkedAt = now();
      pending = run().catch(() => null).finally(() => { pending = null; });
    },

    /** Sends a failed or unconfirmed notice again with fresh attempts; the member may receive it twice. Audited. */
    async resend(id: string, actor: string): Promise<PaymentNoticeAction> {
      const reset = await owned(id, async (tx, row, at) => {
        if (!undelivered(row, at)) return false;
        const changed = await tx.paymentNotice.updateMany({ where: { id, state: row.state }, data: { state: "pending", attempts: 0, availableAt: at,
          expiresAt: new Date(+at + paymentNoticeRules.sendWithinMs), leaseOwner: null, leaseUntil: null, closedAt: null, lastError: null } });
        if (changed.count !== 1) return false;
        await audit(tx, row, at, {}, "payment_sms_resent", actor);
        return true;
      });
      return reset ? { status: "saved", notification: await deliver(id) } : refused();
    },

    /** Removes a closed notice the owner has dealt with; pending, sending and accepted rows stay. Audited. */
    async dismiss(id: string, actor: string): Promise<PaymentNoticeAction> {
      const removed = await owned(id, async (tx, row, at) => {
        if (!undelivered(row, at) && row.state !== "skipped") return false;
        if ((await tx.paymentNotice.deleteMany({ where: { id, state: row.state } })).count !== 1) return false;
        await audit(tx, row, at, {}, "payment_sms_dismissed", actor);
        return true;
      });
      return removed ? { status: "saved" } : refused();
    },
  });
}
export type PaymentNoticeService = ReturnType<typeof createPaymentNotifications>;

const services = new WeakMap<DatabaseRuntime, PaymentNoticeService>();
export function paymentNotificationsFor(database: DatabaseRuntime) {
  let service = services.get(database);
  if (!service) { service = createPaymentNotifications({ database }); services.set(database, service); }
  return service;
}
