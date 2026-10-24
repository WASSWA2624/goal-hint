import { readJsonBody } from "@/server/admin/admin-http";
import { json } from "@/server/http/private-http";
import { normalizePhone } from "@/domain/phone";
import { remainingDays } from "@/domain/subscription-period";
import { fixtureAccountForPhone, fixtureState, grantFixtureAccess, recordFixtureAudit } from "./fixture";

/** Script the real admin response shapes while modifying only this acceptance process's synthetic records. */
export async function subscriberAction(request: Request) {
  const read = await readJsonBody(request);if ("refusal" in read) return read.refusal;
  const body = read.body, id = new URL(request.url).pathname.split("/").at(-1), state = fixtureState();
  const account = state.accounts.find(row => row.id === id), action = body.action;
  if (!account || account.erasedAt && action !== "delete") return json({ status: "refused", message: "This account is unavailable." }, 409);
  if (["change-number", "temporary-password", "erase", "delete"].includes(String(action)) && body.confirmed !== true)
    return json({ message: "Confirm the account action first." }, 400);
  switch (action) {
    case "note":
      if (typeof body.value !== "string" || body.value.length > 500) return json({ message: "Keep the note within 500 characters." }, 400);
      account.ownerNote = body.value.trim() || null;recordFixtureAudit("member_note_changed", account.id);break;
    case "block": case "unblock":
      if (typeof body.value !== "string" || !body.value.trim() || body.value.length > 200) return json({ message: "Provide a reason up to 200 characters." }, 400);
      account.blockedAt = action === "block" ? new Date() : null;account.blockedReason = action === "block" ? body.value.trim() : null;
      if (action === "block") state.devices = state.devices.filter(row => row.accountId !== account.id);
      recordFixtureAudit(action === "block" ? "member_blocked" : "member_unblocked", account.id);break;
    case "sign-out-all":
      state.devices = state.devices.filter(row => row.accountId !== account.id);recordFixtureAudit("member_signed_out_all", account.id);break;
    case "temporary-password": {
      if (account.blockedAt) return json({ status: "refused", message: "Unblock this account before setting a password." }, 409);
      const sessionsDeleted = state.devices.filter(row => row.accountId === account.id).length;
      state.devices = state.devices.filter(row => row.accountId !== account.id);account.passwordResetRequestedAt = null;
      recordFixtureAudit("password_reset", account.id);
      return json({ status: "reset", accountId: account.id, temporaryPassword: "testpass42", expiresAt: new Date(Date.now() + 900000).toISOString(), created: false, sessionsDeleted });
    }
    case "change-number": {
      const phone = normalizePhone(body.newPhone);
      if (!phone || phone === account.phone || !["old-number", "payment-details"].includes(String(body.verifiedBy))) return json({ message: "Choose another number and verify the request." }, 400);
      const existing = state.accounts.find(row => row.phone === phone);
      if (account.blockedAt || existing?.blockedAt || existing?.erasedAt) return json({ status: "refused", message: "Unblock the account before moving access." }, 409);
      const at = new Date(), codes = state.codes.filter(row => row.accountId === account.id && !row.revokedAt && row.endsAt > at), days = remainingDays(codes, at);
      if (days < 1 || days > 366) return json({ message: "This account has no remaining access to move." }, 400);
      const destination = fixtureAccountForPhone(phone), result = grantFixtureAccess(destination, days, "number-change", "Transferred access");
      for (const code of codes) code.revokedAt = at;
      for (const device of state.devices.filter(row => row.accountId === account.id)) device.unlocked = false;
      (state.movedAccountIds ??= []).push(account.id, destination.id);
      recordFixtureAudit("number_changed", destination.id);return json(result, 201);
    }
    case "erase": {
      const phone = account.phone;account.phone = null;account.ownerNote = null;account.blockedReason = null;account.erasedAt = new Date();account.passwordResetRequestedAt = null;
      state.devices = state.devices.filter(row => row.accountId !== account.id);
      for (const payment of state.payments.filter(row => row.accountId === account.id || row.payerPhone === phone)) payment.payerPhone = null;
      recordFixtureAudit("member_erased", account.id);break;
    }
    case "delete":
      if (state.movedAccountIds?.includes(account.id)) return json({ status: "refused", message: account.erasedAt
        ? "This account's access or credit moved between numbers, so its records stay for accounting and it can't be deleted."
        : "This account's access or credit moved between numbers, so it can't be deleted. Erase its personal data instead." }, 409);
      state.accounts = state.accounts.filter(row => row.id !== account.id);state.devices = state.devices.filter(row => row.accountId !== account.id);
      state.codes = state.codes.filter(row => row.accountId !== account.id);state.payments = state.payments.filter(row => row.accountId !== account.id);
      state.audits = state.audits.filter(row => row.accountId !== account.id);break;
    default: return json({ message: "Unknown subscriber action." }, 400);
  }
  return json({ status: "saved" });
}
