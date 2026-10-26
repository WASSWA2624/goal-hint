import "server-only";
import { normalizeTransactionId } from "../../domain/payment.ts";
import { createAccessCodes, type CodeOutcome } from "../members/access-codes.ts";
import { settingsServiceFor } from "../members/settings.ts";
import { json, privateHeaders } from "../http/private-http.ts";
import { readJsonBody, type AdminContext } from "./admin-http.ts";
import { createPaymentReview } from "./payment-review.ts";
import type { PaymentNotifications } from "../members/payment-notifications.ts";

export const storageUnavailable = () => json({ message: "Member storage is unavailable. Try again shortly." }, 503);
export const invalidAction = () => json({ message: "Check the action and values." }, 400);
export const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu.test(value);
/**
 * A new period answers 201 with access and payment SMS status, plus any credit the payment added; an approved top-up answers
 * 201 `credited` with the credit added and the new balance. Credentials and message bodies stay server-side.
 */
export function codeAnswer(outcome: CodeOutcome) {
  if (outcome.status === "created") { const { grant } = outcome;
    return json({ status: grant.payment ? "approved" : "granted", ...(grant.payment ? { reference: grant.payment } : {}), endsAt: grant.endsAt.toISOString(),
      devicesUnlocked: grant.devicesUnlocked, ...(grant.credit ? { creditAddedUgx: grant.credit.addedUgx, balanceUgx: grant.credit.balanceUgx } : {}),
      ...(outcome.notification ? { notification: outcome.notification } : {}) }, 201); }
  if (outcome.status === "credited") return json({ status: "credited", reference: outcome.payment, creditAddedUgx: outcome.credit.addedUgx,
    balanceUgx: outcome.credit.balanceUgx, ...(outcome.notification ? { notification: outcome.notification } : {}) }, 201);
  if (outcome.status === "saved") return json(outcome);
  return json(outcome, outcome.status === "duplicate" || outcome.status === "refused" || outcome.status === "insufficient" ? 409 : 400);
}
export function createCodesHandlers({ notifications }: { notifications?: PaymentNotifications } = {}) {
  return {
    async GET({ services }: AdminContext) {
      if (!services.database) return storageUnavailable();
      try { return json({ codes: await createPaymentReview(services.database).codes() }); } catch { return storageUnavailable(); }
    },
    async POST(context: AdminContext) {
      const { services, request, owner } = context;
      if (!services.database) return storageUnavailable();
      const read = await readJsonBody(request); if ("refusal" in read) return read.refusal;
      const b = read.body, codes = createAccessCodes({ database: services.database, config: services.config, ...(notifications ? { notifications } : {}) });
      try {
        if (b.action === "search") return typeof b.search === "string" && b.search.length <= 40 && typeof b.status === "string"
          ? json({ codes: await createPaymentReview(services.database).codes(b.search, b.status) }) : invalidAction();
        if (b.action === "manual") {
          if (typeof b.phone !== "string" || typeof b.note !== "string" || typeof b.amount !== "number" || b.planId !== undefined && !uuid(b.planId)
            || b.days !== undefined && typeof b.days !== "number" || b.network !== undefined && !["mtn", "airtel"].includes(String(b.network))
            || b.transactionId !== undefined && typeof b.transactionId !== "string") return invalidAction();
          return codeAnswer(await codes.manual({ phone: b.phone, note: b.note, amountReceivedUgx: b.amount, ...(b.planId ? { planId: b.planId as string } : {}),
            ...(typeof b.days === "number" ? { durationDays: b.days } : {}), ...(b.network ? { network: b.network as "mtn" | "airtel" } : {}), ...(b.transactionId ? { transactionRef: b.transactionId as string } : {}) }, owner.username));
        }
        if (!uuid(b.id)) return invalidAction();
        switch (b.action) {
          case "revoke": return typeof b.reason === "string" ? codeAnswer(await codes.revoke(b.id, b.reason, owner.username)) : invalidAction();
          case "extend": return typeof b.days === "number" ? codeAnswer(await codes.extend(b.id, b.days, owner.username)) : invalidAction();
          case "trial": { const settings = await settingsServiceFor(services.database).current(); return settings.settings ? codeAnswer(await codes.sendTrial(b.id, settings.settings.trialDays, owner.username)) : storageUnavailable(); }
          case "dismiss-trial": return codeAnswer(await codes.dismissTrial(b.id, owner.username));
          default: return invalidAction();
        }
      } catch { return storageUnavailable(); }
    },
  };
}
function paymentId(request: Request) { return new URL(request.url).pathname.match(/\/payments\/([^/]+)(?:\/screenshot)?$/u)?.[1]; }
export function createReviewHandlers({ notifications }: { notifications?: PaymentNotifications } = {}) {
  return {
    async GET({ services, request }: AdminContext) {
      if (!services.database) return storageUnavailable();
      try { if (new URL(request.url).searchParams.has("count")) return json({ pendingCount: await services.database.query(tx => tx.paymentSubmission.count({ where: { status: "pending" } })) });
        return json(await createPaymentReview(services.database).list(new URL(request.url).searchParams.get("tab") ?? "pending")); } catch { return storageUnavailable(); }
    },
    async screenshot({ services, request }: AdminContext) {
      const id = paymentId(request); if (!uuid(id)) return invalidAction();
      if (!services.database) return storageUnavailable();
      try {
        const row = await createPaymentReview(services.database).screenshot(id);
        return row ? new Response(new Uint8Array(row.data), { headers: { ...privateHeaders, "Content-Type": "image/jpeg", "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "sandbox; default-src 'none'", "Content-Disposition": "inline", "Cross-Origin-Resource-Policy": "same-origin" } }) : json({ message: "Image unavailable or purged." }, 404);
      } catch { return storageUnavailable(); }
    },
    async POST(context: AdminContext) {
      const { services, request, owner } = context, id = paymentId(request);
      if (!uuid(id)) return invalidAction();
      if (!services.database) return storageUnavailable();
      const read = await readJsonBody(request); if ("refusal" in read) return read.refusal;
      const b = read.body, codes = createAccessCodes({ database: services.database, config: services.config, ...(notifications ? { notifications } : {}) });
      try {
        if (b.action === "approve") {
          // A top-up report needs no plan: the stored report, never the request, decides that it is a top-up.
          if (!["mtn", "airtel"].includes(String(b.network)) || typeof b.transactionId !== "string" || b.planId !== undefined && !uuid(b.planId) || typeof b.amount !== "number") return invalidAction();
          return codeAnswer(await codes.approvePayment(id, { network: b.network as "mtn" | "airtel", transactionRef: normalizeTransactionId(b.transactionId), amountReceivedUgx: b.amount,
            ...(uuid(b.planId) ? { planId: b.planId } : {}) }, owner.username));
        }
        if (b.action === "reject") { const outcome = await createPaymentReview(services.database, Date.now, notifications ? { notifications } : {}).reject(id, b.reason, b.text ?? "", b.deleteImage === true, owner.username); return json(outcome, outcome.status === "saved" ? 200 : 400); }
        if (b.action === "reverse" && ["network-reversal", "wrong-account"].includes(String(b.reason))) return codeAnswer(await codes.reversePayment(id, b.reason as "network-reversal" | "wrong-account", owner.username));
        return invalidAction();
      } catch { return storageUnavailable(); }
    },
  };
}
