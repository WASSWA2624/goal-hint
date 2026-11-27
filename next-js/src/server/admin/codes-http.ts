import "server-only";
import { reviewAlertFeed, reviewSessionHash } from "./payment-alerts.ts";
import { normalizeTransactionId } from "../../domain/payment.ts";
import { createAccessCodes, type CodeOutcome, type ManualGrant } from "../members/access-codes.ts";
import { json, privateHeaders } from "../http/private-http.ts";
import { readJsonBody, type AdminContext } from "./admin-http.ts";
import { createPaymentReview } from "./payment-review.ts";
import type { PaymentNotifications } from "../members/payment-notifications.ts";
import { createCheckoutReview } from "./checkout-review.ts";
import { checkoutOpenStatuses } from "../../domain/checkout.ts";
import { readPaymentReversal } from "../../domain/payment-reversal.ts";
import { readPaymentFilters } from "../../domain/payment-queue-filters.ts";
import { auditTextErrors } from "./audit.ts";

export const storageUnavailable = () => json({ message: "Member storage is unavailable. Try again shortly." }, 503);
export const invalidAction = () => json({ message: "Check the action and values." }, 400);
export const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu.test(value);
export function readManualGrant(body: Record<string, unknown>): ManualGrant | null {
  const { note, amount, planId, days, network, transactionId } = body;
  if (typeof note !== "string" || typeof amount !== "number" || planId !== undefined && !uuid(planId)
    || days !== undefined && typeof days !== "number" || network !== undefined && network !== "mtn" && network !== "airtel"
    || transactionId !== undefined && typeof transactionId !== "string") return null;
  return { note, amountReceivedUgx: amount, ...(typeof planId === "string" ? { planId } : {}),
    ...(typeof days === "number" ? { durationDays: days } : {}),
    ...(network ? { network } : {}), ...(transactionId ? { transactionRef: transactionId } : {}) };
}
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
          const grant = readManualGrant(b);
          if (typeof b.phone !== "string" || !grant) return invalidAction();
          return codeAnswer(await codes.manual({ phone: b.phone, ...grant }, owner.username));
        }
        if (!uuid(b.id)) return invalidAction();
        switch (b.action) {
          case "revoke": return typeof b.reason === "string" ? codeAnswer(await codes.revoke(b.id, b.reason, owner.username)) : invalidAction();
          case "extend": return typeof b.days === "number" ? codeAnswer(await codes.extend(b.id, b.days, owner.username)) : invalidAction();
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
      try { if (new URL(request.url).searchParams.has("count")) return json({ pendingCount: await services.database.query(tx => tx.paymentSubmission.count({ where: { status: { in: [...checkoutOpenStatuses] } } })),
        reviewAlerts: await reviewAlertFeed(services.database, reviewSessionHash(request, services.config), services.config) });
        const id = paymentId(request);
        if (id && uuid(id)) return json(await createCheckoutReview(services.database).detail(id, new URL(request.url).searchParams.get("view") !== "compact"));
        const params = new URL(request.url).searchParams;
        if (params.has("afterId") || params.has("afterAt")) {
          const id = params.get("afterId"), at = params.get("afterAt");
          if (!uuid(id) || at?.length !== 24 || !Number.isFinite(Date.parse(at))) return invalidAction();
          const submittedAt = new Date(at);
          if (submittedAt.toISOString() !== at) return invalidAction();
          return json(await createPaymentReview(services.database).list(undefined, undefined, {
            filters: readPaymentFilters(params.get("status"), params.get("provider")),
            page: Number(params.get("page") ?? 1), search: params.get("search") ?? "",
            after: { id: id.toLowerCase(), submittedAt }, appendable: true,
          }));
        }
        return json(await createPaymentReview(services.database).list(params.get("tab") ?? "pending", undefined,
          { page: Number(params.get("page") ?? 1), search: params.get("search") ?? "" })); } catch { return storageUnavailable(); }
    },
    async screenshot({ services, request }: AdminContext) {
      const id = paymentId(request); if (!uuid(id)) return invalidAction();
      if (!services.database) return storageUnavailable();
      try {
        const evidenceId = new URL(request.url).searchParams.get("evidenceId");
        if (uuid(evidenceId)) {
          const evidence = await createCheckoutReview(services.database).evidence(id, evidenceId);
          return evidence?.image ? new Response(new Uint8Array(evidence.image), { headers: { ...privateHeaders, "Content-Type": "image/jpeg",
            "Content-Security-Policy": "sandbox; default-src 'none'", "Cross-Origin-Resource-Policy": "same-origin" } }) : json({ message: "Evidence unavailable." }, 404);
        }
        const claimId = new URL(request.url).searchParams.get("claimId");
        if (uuid(claimId)) {
          const claim = await createCheckoutReview(services.database).image(id, claimId);
          return claim?.image ? new Response(new Uint8Array(claim.image), { headers: { ...privateHeaders, "Content-Type": "image/jpeg",
            "Content-Security-Policy": "sandbox; default-src 'none'", "Cross-Origin-Resource-Policy": "same-origin" } }) : json({ message: "Evidence unavailable." }, 404);
        }
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
        if (["verify-receipt", "approve-checkout", "review-evidence", "reject-checkout", "request-correction", "mark-disputed", "resolve-dispute"].includes(String(b.action))) {
          const outcome = await createCheckoutReview(services.database).act(id, b, owner.username);
          return json(outcome, outcome.ok ? 200 : 409);
        }
        if (b.action === "approve") {
          if (b.verified !== true) return json({ message: "Verify the actual incoming transfer before approval." }, 400);
          // A top-up report needs no plan: the stored report, never the request, decides that it is a top-up.
          if (!["mtn", "airtel"].includes(String(b.network)) || typeof b.transactionId !== "string" || b.planId !== undefined && !uuid(b.planId) || typeof b.amount !== "number") return invalidAction();
          return codeAnswer(await codes.approvePayment(id, { network: b.network as "mtn" | "airtel", transactionRef: normalizeTransactionId(b.transactionId), amountReceivedUgx: b.amount,
            ...(uuid(b.planId) ? { planId: b.planId } : {}) }, owner.username));
        }
        if (b.action === "reject") { const outcome = await createPaymentReview(services.database, Date.now, notifications ? { notifications } : {}).reject(id, b.reason, b.text ?? "", b.deleteImage === true, owner.username); return json(outcome, outcome.status === "saved" ? 200 : 400); }
        if (b.action === "reverse") {
          const reversal = readPaymentReversal(b);
          if (!reversal) return invalidAction();
          const errors = auditTextErrors({ note: reversal.details?.note });
          if (errors?.note) return json({ message: errors.note }, 400);
          return codeAnswer(await codes.reversePayment(id, reversal.reason, owner.username, reversal.details));
        }
        return invalidAction();
      } catch { return storageUnavailable(); }
    },
  };
}
