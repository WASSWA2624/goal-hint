import { readJsonBody } from "@/server/admin/admin-http";
import { readManualGrant } from "@/server/admin/codes-http";
import { userDeviceId } from "@/server/admin/users";
import { json } from "@/server/http/private-http";
import { normalizePhone } from "@/domain/phone";
import { userDirectoryPageSize } from "@/domain/user-directory";
import { remainingDays } from "@/domain/subscription-period";
import { authCopy } from "@/i18n/messages/auth";
import { fixtureAccountForPhone, fixtureState, grantFixtureAccess, recordFixtureAudit } from "./fixture";

/** Script the real admin response shapes while modifying only this acceptance process's synthetic records. */
export async function userAction(request: Request) {
  const read = await readJsonBody(request);if ("refusal" in read) return read.refusal;
  const body = read.body, id = new URL(request.url).pathname.split("/").at(-1), state = fixtureState();
  const account = state.accounts.find(row => row.id === id), action = body.action;
  if (!account || account.erasedAt && action !== "delete") return json({ status: "refused", message: "This account is unavailable." }, 409);
  if (["change-number", "erase", "delete"].includes(String(action)) && body.confirmed !== true)
    return json({ message: "Confirm the account action first." }, 400);
  switch (action) {
    case "grant": {
      const input = readManualGrant(body);
      const plan = input?.planId ? state.plans.find(row => row.id === input.planId) : null;
      const days = plan?.durationDays ?? input?.durationDays;
      if (!input || !days || input.planId && !plan) return json({ message: "Choose a valid grant period." }, 400);
      return json(grantFixtureAccess(account, days, "manual", plan?.name ?? "Manual"), 201);
    }
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
    case "sign-out-selected": {
      if (!Array.isArray(body.value) || !body.value.length) return json({ message: authCopy.selectLoggedInDevices }, 400);
      const ids = new Set(body.value);
      const selected = state.devices.filter(row => row.accountId === account.id && row.expiresAt > new Date() && ids.has(userDeviceId(row.tokenHash)));
      if (selected.length !== ids.size) return json({ message: authCopy.deviceSelectionChanged }, 409);
      state.devices = state.devices.filter(row => !selected.includes(row));
      recordFixtureAudit("member_signed_out_devices", account.id);
      break;
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
      const phone = account.phone;account.phone = null;account.ownerNote = null;account.blockedReason = null;account.erasedAt = new Date();
      state.devices = state.devices.filter(row => row.accountId !== account.id);
      for (const payment of state.payments.filter(row => row.accountId === account.id || row.payerPhone === phone)) payment.payerPhone = null;
      recordFixtureAudit("member_erased", account.id);break;
    }
    case "delete":
      if (state.movedAccountIds?.includes(account.id)) return json({ status: "refused", message: account.erasedAt
        ? "This account's access or credit moved between numbers, so its records stay for accounting and it can't be deleted."
        : "This account's access or credit moved between numbers, so it can't be deleted. Erase its personal data instead." }, 409);
      if (state.payments.some(row => row.accountId === account.id)) return json({ status: "refused", message: "Payment records must be retained for this account." }, 409);
      state.accounts = state.accounts.filter(row => row.id !== account.id);state.devices = state.devices.filter(row => row.accountId !== account.id);
      state.codes = state.codes.filter(row => row.accountId !== account.id);state.payments = state.payments.filter(row => row.accountId !== account.id);
      state.audits = state.audits.filter(row => row.accountId !== account.id);break;
    default: return json({ message: "Unknown user action." }, 400);
  }
  return json({ status: "saved" });
}

export async function userBulkAction(request: Request) {
  const read = await readJsonBody(request);
  if ("refusal" in read) return read.refusal;
  const { action, accountIds, confirmed, count, value, planId, days, note } = read.body;
  if (!Array.isArray(accountIds) || !accountIds.length || accountIds.length > userDirectoryPageSize || accountIds.length !== count
    || accountIds.some(id => typeof id !== "string") || new Set(accountIds).size !== count || confirmed !== true
    || !["grant", "block", "unblock", "sign-out-all", "erase", "delete"].includes(String(action))) return json({ message: "Check the account selection." }, 400);
  const results = [];
  for (const accountId of accountIds) {
    const response = await userAction(new Request(new URL(`/api/admin/users/${accountId}`, request.url), {
      method: "POST", headers: request.headers,
      body: JSON.stringify({ action, confirmed, value, planId, days, note, amount: 0 }),
    }));
    const reply: { message?: string } = await response.json();
    results.push(response.ok ? { accountId, status: "saved" } : { accountId, status: "failed", message: reply.message });
  }
  const succeeded = results.filter(row => row.status === "saved").length;
  return json({ status: "completed", results, succeeded, failed: results.length - succeeded });
}
