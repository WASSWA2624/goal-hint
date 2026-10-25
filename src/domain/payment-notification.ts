/**
 * What a payment decision's account-update SMS did, for the administrator's response. `sent` is gateway acceptance, never
 * handset receipt; `queued` waits in the outbox for a dispatcher; `uncertain` may have arrived and is never resent automatically.
 */
export type PaymentNotificationStatus = "sent" | "queued" | "uncertain" | "failed" | "unsupported" | "unavailable";
/** approved and rejected decide a payment report, credited approves a top-up, renewed buys a period from credit. */
export type PaymentNoticeKind = "approved" | "rejected" | "credited" | "renewed";
export type PaymentNoticeState = "pending" | "sending" | "accepted" | "failed" | "uncertain" | "skipped";
/** An enumerated class of why a notice closed or waits; never provider text. */
export type PaymentNoticeError = "configuration" | "rejected" | "uncertain" | "unavailable" | "unsupported" | "invalid" | "expired";

const notices: Readonly<Record<PaymentNotificationStatus, string>> = Object.freeze({
  sent: "SMS accepted for delivery.",
  queued: "SMS queued; Goal Hint will send or retry it automatically.",
  uncertain: "SMS delivery could not be confirmed and will not be resent automatically. Contact the member.",
  failed: "SMS could not be sent. Contact the member.",
  unsupported: "SMS is not supported for this account's country. Contact the member.",
  unavailable: "SMS was not sent because the account has no registered phone number. Contact the member.",
});

/** Only payment responses carry this status; unrelated or unknown response fields add no notice. */
export function paymentNotificationNotice(status: unknown): string | null {
  return typeof status === "string" && Object.hasOwn(notices, status) ? notices[status as PaymentNotificationStatus] : null;
}

/** A renewal notice names its access period; every other kind names the payment report it decided. */
export function noticeTargetType(kind: PaymentNoticeKind): "access-code" | "payment" {
  return kind === "renewed" ? "access-code" : "payment";
}

export function paymentNoticeKindLabel(kind: string): string {
  return kind === "credited" ? "Credit" : kind === "renewed" ? "Renewal" : "Payment decision";
}

/**
 * The outbox's timing. The 5-minute backoff base matches the cron slot (a 60 s base would spend every attempt within about
 * 15 minutes); the 60 s lease outlasts the adapter's 10 s timeout plus database time, and a run ends well inside the cron's 60 s.
 */
export const paymentNoticeRules = Object.freeze({
  maxAttempts: 4, backoff: Object.freeze({ baseMs: 5 * 60_000, maxMs: 60 * 60_000 }), leaseMs: 60_000, sendWithinMs: 24 * 3_600_000,
  batch: 20, runLimit: 100, runBudgetMs: 40_000, slotMs: 60_000, stuckAfterMs: 15 * 60_000, keepAcceptedDays: 7, keepUndeliveredDays: 30,
});

/** Equal jitter after the given attempt (1-based): at least half the capped exponential delay, never immediate. */
export function noticeRetryDelay(attempt: number, sample: number): number {
  const { baseMs, maxMs } = paymentNoticeRules.backoff;
  const ceiling = Math.min(maxMs, baseMs * 2 ** (Math.max(1, Math.min(16, Math.trunc(attempt) || 1)) - 1));
  const unit = Number.isFinite(sample) ? Math.min(Math.max(sample, 0), 0.999_999) : 0;
  return Math.max(1, Math.floor(ceiling / 2 + unit * ceiling / 2));
}

export type PaymentNoticeRow = Readonly<{ state: string; lastError: string | null; attempts: number; createdAt: string | Date }>;
/** How the owner's notice list describes a row; gateway acceptance is never presented as receipt. */
export function paymentNoticeLabel({ state, lastError, attempts, createdAt }: PaymentNoticeRow, now: number): string {
  switch (state) {
    case "accepted": return "Accepted by the SMS gateway (not proof of receipt)";
    case "pending":
      if (attempts > 0) return "Refused by the gateway · retrying automatically";
      return now - +new Date(createdAt) > paymentNoticeRules.stuckAfterMs ? "Waiting · check SMS settings and the members worker" : "Waiting to send";
    case "sending": return "Sending";
    case "uncertain": return "Not confirmed · not resent automatically";
    case "failed": return lastError === "rejected" ? "Refused by the SMS gateway" : lastError === "expired" ? "Not sent within a day" : "Not sent";
    case "skipped": return lastError === "unsupported" ? "Country not supported" : "No registered number";
    default: return "Not sent";
  }
}
