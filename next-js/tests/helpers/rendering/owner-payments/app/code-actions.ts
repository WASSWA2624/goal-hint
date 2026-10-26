import { readJsonBody } from "@/server/admin/admin-http";
import { json } from "@/server/http/private-http";
import { normalizePhone } from "@/domain/phone";
import { chainPeriods, extendPeriods } from "@/domain/subscription-period";
import { fixtureAccountForPhone, fixtureCodes, fixturePaymentPlans, fixtureState, grantFixtureAccess, recordFixtureAudit } from "./fixture";

export async function codeAction(request: Request) {
  const read = await readJsonBody(request);if ("refusal" in read) return read.refusal;
  const body = read.body, state = fixtureState(), action = body.action;
  if (action === "search") return typeof body.search === "string" && typeof body.status === "string"
    ? json({ codes: fixtureCodes(body.search, body.status) }) : json({ message: "Enter a code search." }, 400);
  if (action === "manual") {
    const phone = normalizePhone(body.phone), plan = fixturePaymentPlans.find(row => row.id === body.planId), days = plan?.durationDays ?? body.days;
    if (!phone || typeof body.note !== "string" || !body.note.trim() || body.note.length > 200
      || typeof days !== "number" || !Number.isInteger(days) || days < 1 || days > 366
      || typeof body.amount !== "number" || !Number.isInteger(body.amount) || body.amount < 0 || body.amount > 4294967295)
      return json({ message: "Check the account, days, amount and required note." }, 400);
    const existing = state.accounts.find(row => row.phone === phone);
    if (existing?.blockedAt || existing?.erasedAt) return json({ status: "refused", message: "This account is unavailable." }, 409);
    const account = fixtureAccountForPhone(phone);
    return json(grantFixtureAccess(account, days, "manual", plan?.name ?? "Manual"), 201);
  }
  if (action === "trial" || action === "dismiss-trial") {
    const account = state.accounts.find(row => row.id === body.id);
    if (!account || account.blockedAt || account.erasedAt) return json({ status: "refused", message: "This account is unavailable." }, 409);
    if (action === "dismiss-trial") { account.trialDismissedAt = new Date();return json({ status: "saved" }); }
    return json(grantFixtureAccess(account, 2, "trial", "Free trial"), 201);
  }
  const code = state.codes.find(row => row.id === body.id);
  if (!code || code.revokedAt) return json({ status: "refused", message: "This access period is unavailable." }, 409);
  if (action === "revoke") {
    if (typeof body.reason !== "string" || !body.reason.trim()) return json({ message: "Provide a reason." }, 400);
    code.revokedAt = new Date();recordFixtureAudit("code_revoked", code.accountId, "access-code", code.id);
    for (const period of chainPeriods(state.codes.filter(row => row.accountId === code.accountId), new Date())) {
      const stored = state.codes.find(row => row.id === period.id)!;stored.startsAt = period.startsAt;stored.endsAt = period.endsAt;
    }
    const active = state.codes.some(row => row.accountId === code.accountId && !row.revokedAt && row.startsAt <= new Date() && row.endsAt > new Date());
    if (!active) for (const device of state.devices.filter(row => row.accountId === code.accountId)) device.unlocked = false;
    return json({ status: "saved" });
  }
  if (action === "extend") {
    if (typeof body.days !== "number" || !Number.isInteger(body.days) || body.days < 1 || body.days > 60) return json({ message: "Extend by 1 to 60 days." }, 400);
    for (const period of extendPeriods(state.codes.filter(row => row.accountId === code.accountId && !row.revokedAt), code.id, body.days)) {
      const stored = state.codes.find(row => row.id === period.id)!;stored.startsAt = period.startsAt;stored.endsAt = period.endsAt;stored.extensionDays = period.extensionDays;
    }
    recordFixtureAudit("code_extended", code.accountId, "access-code", code.id);return json({ status: "saved" });
  }
  return json({ message: "Unknown access action." }, 400);
}
