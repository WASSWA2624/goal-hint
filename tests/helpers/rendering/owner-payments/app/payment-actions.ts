import { readJsonBody } from "@/server/admin/admin-http";
import { json } from "@/server/http/private-http";
import { formatPaymentReference, normalizeTransactionId, transactionKey } from "@/domain/payment";
import { rejectionReasons } from "@/server/admin/payment-review";
import { chainPeriods } from "@/domain/subscription-period";
import { fixturePaymentPlans, fixtureState, grantFixtureAccess, recordFixtureAudit } from "./fixture";

/** In-memory decisions preserve the production response contract without contacting a wallet or SMS service. */
export async function paymentAction(request: Request) {
  const read = await readJsonBody(request);
  if ("refusal" in read) return read.refusal;
  const body = read.body, state = fixtureState(), id = new URL(request.url).pathname.split("/").at(-1);
  const payment = state.payments.find(row => row.id === id);
  if (!payment) return json({ status: "refused", message: "This payment is unavailable." }, 409);
  if (body.action === "reverse") {
    if (payment.status !== "approved" || !["network-reversal", "wrong-account"].includes(String(body.reason)))
      return json({ status: "refused", message: "This payment cannot be reversed." }, 409);
    payment.status = "reversed";
    const now = new Date(), codes = state.codes.filter(row => row.accountId === payment.accountId);
    for (const code of codes.filter(row => row.paymentSubmissionId === payment.id)) code.revokedAt = now;
    for (const period of chainPeriods(codes, now)) {
      const stored = codes.find(row => row.id === period.id)!;stored.startsAt = period.startsAt;stored.endsAt = period.endsAt;
    }
    if (!codes.some(row => !row.revokedAt && row.startsAt <= now && row.endsAt > now))
      for (const device of state.devices.filter(row => row.accountId === payment.accountId)) device.unlocked = false;
    recordFixtureAudit("payment_reversed", payment.accountId, "payment", payment.id);
    return json({ status: "saved", carriedOtherDays: false });
  }
  if (!["pending", "superseded"].includes(payment.status)) return json({ status: "refused", message: "This payment was already reviewed." }, 409);
  if (body.action === "reject") {
    if (!rejectionReasons.includes(body.reason as typeof rejectionReasons[number]) || typeof body.text !== "string" || body.text.length > 200)
      return json({ status: "invalid", message: "Choose a rejection reason and keep text within 200 characters." }, 400);
    payment.status = "rejected";payment.rejectReason = String(body.reason);payment.rejectText = body.text.trim() || null;
    if (body.deleteImage === true) payment.screenshot = null;
    recordFixtureAudit("payment_rejected", payment.accountId, "payment", payment.id);
    return json({ status: "saved", notification: "sent" });
  }
  if (body.action !== "approve") return json({ status: "invalid", message: "Choose a payment action." }, 400);
  const plan = fixturePaymentPlans.find(row => row.id === body.planId), account = state.accounts.find(row => row.id === payment.accountId);
  const transactionId = typeof body.transactionId === "string" ? normalizeTransactionId(body.transactionId) : "", key = transactionKey(transactionId);
  if (!plan || !["mtn", "airtel"].includes(String(body.network)) || !/^[A-Z0-9.-]{4,40}$/u.test(transactionId)
    || !key || typeof body.amount !== "number" || !Number.isInteger(body.amount) || body.amount < 0 || body.amount > 4294967295)
    return json({ status: "invalid", message: "Check the network, transaction ID, amount and plan." }, 400);
  const duplicate = state.payments.find(row => row.approvedTxnKey?.split(":")[1] === key);
  if (duplicate) return json({ status: "duplicate", message: "This transaction ID was already approved.", submissionId: duplicate.id }, 409);
  if (!account?.phone || account.blockedAt || account.erasedAt) return json({ status: "refused", message: "This account is unavailable." }, 409);
  if (payment.planId !== plan.id) {
    payment.planId = plan.id;payment.planName = plan.name;payment.durationDays = plan.durationDays;payment.priceUgx = plan.priceUgx;
  }
  payment.status = "approved";payment.network = String(body.network);payment.transactionRef = transactionId;
  payment.approvedTxnKey = `${payment.network}:${key}`;payment.amountReceivedUgx = body.amount;
  const grant = grantFixtureAccess(account, payment.durationDays, "payment", payment.planName, payment.id);
  recordFixtureAudit("payment_approved", payment.accountId, "payment", payment.id);
  return json({ ...grant, status: "approved", reference: formatPaymentReference(payment.reference), notification: "sent" }, 201);
}
