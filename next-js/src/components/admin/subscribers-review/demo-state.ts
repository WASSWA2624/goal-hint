"use client";

import { useCallback, useRef, useState } from "react";
import type { OwnerAccount, OwnerCode, OwnerSubscriber } from "@/domain/owner-members";
import { normalizePhone, type MobileNetwork } from "@/domain/phone";
import { chainPeriods, codeStatus, remainingDays, subscriptionDayMs } from "@/domain/subscription-period";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { walletRules } from "@/domain/wallet";
import type { AdminReply, postAdmin } from "../admin-form";

export type SubscriberReviewRecord = OwnerAccount & Readonly<{ network: MobileNetwork | null; detail: OwnerSubscriber }>;
export const reviewNow = Date.parse("2026-10-29T09:00:00.000Z");
const stamp = new Date(reviewNow).toISOString();
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const instant = (offset: number) => new Date(reviewNow + offset).toISOString();

export const samplePlans: readonly SubscriptionPlanView[] = [
  { id: id(1), name: "Weekly", durationDays: 7, priceUgx: 5000, active: true, sortOrder: 0, createdAt: stamp, updatedAt: stamp },
  { id: id(2), name: "Daily", durationDays: 1, priceUgx: 1000, active: true, sortOrder: 1, createdAt: stamp, updatedAt: stamp },
  { id: id(3), name: "Monthly", durationDays: 30, priceUgx: 15000, active: true, sortOrder: 2, createdAt: stamp, updatedAt: stamp },
];

function withDetail(record: SubscriberReviewRecord, detail: OwnerSubscriber, network = record.network): SubscriberReviewRecord {
  return { id: detail.id, phone: detail.phone, status: detail.erasedAt ? "erased" : detail.blockedAt ? "blocked" : "open",
    lastSignInAt: detail.lastSignInAt, network: detail.erasedAt ? null : network, detail };
}

function emptyAccount(accountId: string, phone: string): SubscriberReviewRecord {
  const detail: OwnerSubscriber = { id: accountId, phone, blockedAt: null, blockedReason: null, ownerNote: null, erasedAt: null,
    lastSignInAt: stamp, codes: [], submissions: [], devices: [], unlocks: 0, creditUgx: 0, autoRenew: false, autoRenewPlanName: null, wallet: [] };
  return { id: accountId, phone, status: "open", lastSignInAt: stamp, network: null, detail };
}

function refreshCode(code: OwnerCode): OwnerCode {
  const period = { startsAt: new Date(code.startsAt), endsAt: new Date(code.endsAt), revokedAt: code.status === "revoked" ? new Date(reviewNow) : null };
  const status = codeStatus(period, new Date(reviewNow));
  return { ...code, status, daysLeft: status === "active" || status === "queued"
    ? Math.max(0, Math.ceil((+period.endsAt - Math.max(reviewNow, +period.startsAt)) / subscriptionDayMs)) : 0 };
}

function seedSubscribers(): SubscriberReviewRecord[] {
  const hoursSinceSignIn = [0.2, 1, 4, 9, 18, 28, 40, 64, 90, 120, 180, 240];
  const carriers: readonly (MobileNetwork | null)[] = ["mtn", "airtel", null];
  return Array.from({ length: 24 }, (_, index) => {
    const erased = index === 11 || index === 23, blocked = index === 6 || index === 15 || index === 20;
    const phone = erased ? null : `256700000${String(101 + index)}`;
    const plan = samplePlans[index % samplePlans.length]!, accountId = id(100 + index), state = index % 5;
    const starts = state === 2 ? subscriptionDayMs : state === 3 || erased ? -(plan.durationDays + 2) * subscriptionDayMs
      : -Math.min(2, plan.durationDays / 4) * subscriptionDayMs;
    const code = refreshCode({ id: id(300 + index), accountId, reference: `C-SAMPLE${String(index + 1).padStart(2, "0")}`, phone,
      planName: plan.name, source: index % 4 ? "payment" : "manual", startsAt: instant(starts),
      endsAt: instant(starts + plan.durationDays * subscriptionDayMs), status: "active", daysLeft: 0 });
    const codes = state === 4 && !erased ? [] : [code];
    const lastSignInAt = instant(-hoursSinceSignIn[index % hoursSinceSignIn.length]! * 3_600_000 - Math.floor(index / 12) * 4 * subscriptionDayMs);
    const deviceCount = !erased && !blocked && code.status === "active" && codes.length ? index % 3 + 1 : 0;
    const creditUgx = erased ? 0 : index % 7 === 4 ? -2000 : index % 4 === 0 ? 5000 : index % 5 === 0 ? 1500 : 0;
    const detail: OwnerSubscriber = { id: accountId, phone, blockedAt: blocked ? instant(-subscriptionDayMs) : null,
      blockedReason: blocked ? "Fictional account review" : null, ownerNote: !erased && index % 3 === 0 ? "Fictional account for subscriber interface review." : null,
      erasedAt: erased ? instant(-subscriptionDayMs) : null, lastSignInAt, codes,
      submissions: index % 4 !== 3 ? [{ id: id(500 + index), reference: `P-SAMPLE${String(index + 1).padStart(2, "0")}`,
        status: state === 4 ? "pending" : "approved", purpose: "plan", planName: plan.name, claimedAmountUgx: plan.priceUgx,
        amountReceivedUgx: state === 4 ? null : plan.priceUgx, submittedAt: instant(-2 * subscriptionDayMs) }] : [],
      devices: Array.from({ length: deviceCount }, (_, device) => ({ createdAt: instant(-(device + 3) * subscriptionDayMs),
        lastSeenAt: lastSignInAt, expiresAt: instant(60 * subscriptionDayMs) })), unlocks: deviceCount + index % 6,
      creditUgx, autoRenew: !erased && !blocked && index % 4 === 0, autoRenewPlanName: !erased && !blocked && index % 4 === 0 ? plan.name : null,
      wallet: creditUgx ? [{ id: id(700 + index), kind: creditUgx < 0 ? "reversal" : "topup", amountUgx: creditUgx, balanceAfter: creditUgx,
        createdAt: instant(-subscriptionDayMs), actor: "admin", note: creditUgx < 0 ? "Reversed sample payment" : "Fictional credit top-up", payment: null, period: null }] : [] };
    // The sample carrier is explicit artwork metadata, never a phone-prefix or payment-network inference.
    return { id: accountId, phone, status: erased ? "erased" : blocked ? "blocked" : "open", lastSignInAt,
      network: erased ? null : carriers[index % carriers.length]!, detail };
  });
}

const answer = (body: AdminReply["body"], status = 200): AdminReply => ({ ok: status < 400, status, body });
const invalid = (message: string) => answer({ status: "invalid", message }, 400);
const refused = (message = "This sample account is unavailable.") => answer({ status: "refused", message }, 409);
const payloadRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const shortReason = (value: unknown): value is string => typeof value === "string" && !!value.trim() && value.trim().length <= 200;
const asPeriod = (code: OwnerCode) => ({ id: code.id, startsAt: new Date(code.startsAt), endsAt: new Date(code.endsAt),
  revokedAt: code.status === "revoked" ? new Date(reviewNow) : null, durationDays: Math.ceil((Date.parse(code.endsAt) - Date.parse(code.startsAt)) / subscriptionDayMs), extensionDays: 0 });

/** Fictional review state only: requests never use fetch, browser storage, private data or messaging. */
export function useSubscriberDemo() {
  const [subscribers, setSubscribers] = useState<readonly SubscriberReviewRecord[]>(seedSubscribers);
  const records = useRef(subscribers), sequence = useRef(1000), movedAccounts = useRef(new Set<string>()), transactionIds = useRef(new Set<string>());
  const replace = useCallback((next: readonly SubscriberReviewRecord[]) => { records.current = next; setSubscribers(next); }, []);
  const update = useCallback((accountId: string, detail: OwnerSubscriber) => {
    replace(records.current.map(record => record.id === accountId ? withDetail(record, detail) : record));
  }, [replace]);
  const reset = useCallback(() => {
    sequence.current = 1000; movedAccounts.current.clear(); transactionIds.current.clear(); replace(seedSubscribers());
  }, [replace]);

  const request = useCallback<typeof postAdmin>(async (path, payload) => {
    const body = payloadRecord(payload);
    if (path === "/api/admin/subscribers") {
      const query = String(body.search ?? "").trim().toLowerCase(), digits = normalizePhone(query) ?? query.replace(/[\s+()-]/gu, "");
      return answer({ accounts: records.current.filter(record => !query || record.phone?.includes(digits) || record.id.includes(query)
        || record.status.includes(query)).map(({ id, phone, status, lastSignInAt }) => ({ id, phone, status, lastSignInAt })) });
    }
    if (path === "/api/admin/codes") {
      if (body.action === "manual") {
        const phone = normalizePhone(body.phone), plan = samplePlans.find(item => item.id === body.planId), days = plan?.durationDays ?? body.days;
        const network = typeof body.network === "string" ? body.network : "", transactionId = typeof body.transactionId === "string" ? body.transactionId.trim() : "";
        if (!phone || !shortReason(body.note) || !Number.isInteger(days) || Number(days) < 1 || Number(days) > 366
          || !Number.isInteger(body.amount) || Number(body.amount) < 0 || Number(body.amount) > 4294967295 || body.planId && !plan
          || !!network !== !!transactionId || network && !["mtn", "airtel"].includes(network) || transactionId && (!plan || transactionId.length > 40)) {
          return invalid("Enter a valid number, duration, amount and reason. Payment provider and transaction ID must be supplied together for a plan.");
        }
        const existing = records.current.find(record => record.phone === phone);
        if (existing?.status === "blocked" || existing?.status === "erased") return refused();
        const account = existing ?? emptyAccount(id(sequence.current++), phone), transactionKey = `${network}:${transactionId.toUpperCase()}`;
        if (transactionId && transactionIds.current.has(transactionKey)) return refused("That sample transaction ID has already been used.");
        if (transactionId && plan && Number(body.amount) < plan.priceUgx) return invalid("The amount received must cover the selected sample plan.");
        const starts = Math.max(reviewNow, ...account.detail.codes.filter(code => code.status !== "revoked").map(code => Date.parse(code.endsAt)));
        const number = sequence.current++, endsAt = new Date(starts + Number(days) * subscriptionDayMs).toISOString();
        const code = refreshCode({ id: id(number), accountId: account.id, reference: `C-DEMO${number}`, phone, planName: plan?.name ?? "Manual",
          source: transactionId ? "payment" : "manual", startsAt: new Date(starts).toISOString(), endsAt, status: "active", daysLeft: Number(days) });
        const excess = transactionId && plan ? Number(body.amount) - plan.priceUgx : 0;
        if (excess > walletRules.excessMaxUgx) return invalid("Reduce the sample overpayment to UGX 500,000 or less.");
        const detail: OwnerSubscriber = { ...account.detail, codes: [code, ...account.detail.codes], creditUgx: account.detail.creditUgx + excess,
          submissions: transactionId && plan ? [{ id: id(sequence.current++), reference: `P-DEMO${number}`, status: "approved", purpose: "plan", planName: plan.name,
            claimedAmountUgx: Number(body.amount), amountReceivedUgx: Number(body.amount), submittedAt: stamp }, ...account.detail.submissions] : account.detail.submissions,
          wallet: excess ? [{ id: id(sequence.current++), kind: "overpayment", amountUgx: excess, balanceAfter: account.detail.creditUgx + excess,
            createdAt: stamp, actor: "admin", note: "Extra paid on a sample plan", payment: `P-DEMO${number}`, period: null }, ...account.detail.wallet] : account.detail.wallet };
        if (transactionId) transactionIds.current.add(transactionKey);
        replace(existing ? records.current.map(record => record.id === account.id ? withDetail(record, detail) : record)
          : [withDetail(account, detail), ...records.current]);
        return answer({ status: transactionId ? "approved" : "granted", accountId: account.id, endsAt, devicesUnlocked: account.detail.devices.length,
          ...(excess ? { creditAddedUgx: excess, balanceUgx: detail.creditUgx } : {}) }, 201);
      }
      const owner = records.current.find(record => record.detail.codes.some(code => code.id === body.id));
      const code = owner?.detail.codes.find(item => item.id === body.id);
      if (!owner || !code || owner.status === "erased" || code.status === "revoked") return refused("Select an available sample access period.");
      if (body.action === "revoke") {
        const changed = owner.detail.codes.map(item => item.id === code.id ? { ...item, status: "revoked" as const, daysLeft: 0 } : item);
        const chained = new Map(chainPeriods(changed.map(asPeriod), new Date(reviewNow)).map(period => [period.id, period]));
        const codes = changed.map(item => { const period = chained.get(item.id)!;
          return refreshCode({ ...item, startsAt: period.startsAt.toISOString(), endsAt: period.endsAt.toISOString() }); });
        update(owner.id, { ...owner.detail, codes, devices: codes.some(item => item.status === "active") ? owner.detail.devices : [] });
        return answer({ status: "saved" });
      }
      if (body.action === "extend") {
        if (!Number.isInteger(body.days) || Number(body.days) < 1 || Number(body.days) > 60) return invalid("Extend by a whole number from 1 to 60 days.");
        const extra = Number(body.days) * subscriptionDayMs;
        const codes = owner.detail.codes.map(item => refreshCode(item.id === code.id ? { ...item, endsAt: new Date(Date.parse(item.endsAt) + extra).toISOString() }
          : item.status !== "revoked" && Date.parse(item.startsAt) >= Date.parse(code.endsAt)
            ? { ...item, startsAt: new Date(Date.parse(item.startsAt) + extra).toISOString(), endsAt: new Date(Date.parse(item.endsAt) + extra).toISOString() } : item));
        update(owner.id, { ...owner.detail, codes }); return answer({ status: "saved" });
      }
      return invalid("Choose a supported sample access action.");
    }

    const match = /^\/api\/admin\/subscribers\/([^/]+)$/u.exec(path);
    const account = records.current.find(record => record.id === match?.[1]);
    if (!match || !account) return invalid("Select an existing sample subscriber.");
    const detail = account.detail;
    if (body.action === "delete") {
      if (body.confirmed !== true) return invalid("Confirm the sample deletion first.");
      if (movedAccounts.current.has(account.id)) return refused("This sample account has a number transfer. Erase its personal data instead.");
      replace(records.current.filter(record => record.id !== account.id)); return answer({ status: "saved" });
    }
    if (detail.erasedAt) return refused();
    if (body.action === "erase") {
      if (body.confirmed !== true) return invalid("Confirm the sample erasure first.");
      update(account.id, { ...detail, phone: null, erasedAt: stamp, blockedReason: null, ownerNote: null, devices: [], autoRenew: false,
        autoRenewPlanName: null, creditUgx: Math.min(0, detail.creditUgx), codes: detail.codes.map(code => ({ ...code, phone: null })),
        wallet: detail.creditUgx > 0 ? [{ id: id(sequence.current++), kind: "adjustment", amountUgx: -detail.creditUgx, balanceAfter: 0,
          createdAt: stamp, actor: "admin", note: "Forfeited when the sample account was erased", payment: null, period: null }, ...detail.wallet] : detail.wallet });
      return answer({ status: "saved" });
    }
    if (body.action === "note") {
      if (typeof body.value !== "string" || body.value.length > 500) return invalid("Use an account note of at most 500 characters.");
      update(account.id, { ...detail, ownerNote: body.value.trim() || null }); return answer({ status: "saved" });
    }
    if (body.action === "block" || body.action === "unblock") {
      if (!shortReason(body.value)) return invalid("Provide a reason of at most 200 characters.");
      update(account.id, { ...detail, blockedAt: body.action === "block" ? stamp : null,
        blockedReason: body.action === "block" ? body.value.trim() : null, devices: body.action === "block" ? [] : detail.devices });
      return answer({ status: "saved" });
    }
    if (body.action === "sign-out-all") {
      update(account.id, { ...detail, devices: [] }); return answer({ status: "saved", sessionsDeleted: detail.devices.length });
    }
    if (body.action === "auto-renew-off") {
      update(account.id, { ...detail, autoRenew: false, autoRenewPlanName: null }); return answer({ status: "saved" });
    }
    if (body.action === "credit-adjust") {
      if (body.confirmed !== true || !Number.isSafeInteger(body.amount) || body.amount === 0 || Math.abs(Number(body.amount)) > walletRules.adjustmentMaxUgx
        || !shortReason(body.note)) return invalid("Confirm a whole credit correction up to UGX 500,000 with a short reason.");
      const balance = detail.creditUgx + Number(body.amount);
      if (balance < 0 && Number(body.amount) < 0) return refused("This correction would leave a negative sample balance.");
      update(account.id, { ...detail, creditUgx: balance, wallet: [{ id: id(sequence.current++), kind: "adjustment", amountUgx: Number(body.amount),
        balanceAfter: balance, createdAt: stamp, actor: "admin", note: body.note.trim(), payment: null, period: null }, ...detail.wallet] });
      return answer({ status: "saved" });
    }
    if (body.action === "change-number") {
      const phone = normalizePhone(body.newPhone);
      if (body.confirmed !== true || !phone || !["old-number", "payment-details"].includes(String(body.verifiedBy))) return invalid("Enter and verify the new sample number.");
      if (detail.blockedAt) return refused("Unblock this sample account before moving its access.");
      if (phone === detail.phone) return invalid("Enter a different sample number.");
      const existing = records.current.find(record => record.phone === phone);
      if (existing && existing.status !== "open") return refused("The destination sample account is unavailable.");
      const days = remainingDays(detail.codes.map(asPeriod), new Date(reviewNow));
      if (!days && !detail.creditUgx) return invalid("This sample account has no remaining access or credit to move.");
      const destination = existing ?? emptyAccount(id(sequence.current++), phone);
      const targetCodes = [...destination.detail.codes];
      if (days) {
        const number = sequence.current++, starts = Math.max(reviewNow, ...targetCodes.filter(code => code.status !== "revoked").map(code => Date.parse(code.endsAt)));
        targetCodes.unshift(refreshCode({ id: id(number), accountId: destination.id, reference: `C-DEMO${number}`, phone, planName: "Transferred access",
          source: "number-change", startsAt: new Date(starts).toISOString(), endsAt: new Date(starts + days * subscriptionDayMs).toISOString(), status: "active", daysLeft: days }));
      }
      const old = withDetail(account, { ...detail, creditUgx: 0, autoRenew: false, autoRenewPlanName: null, devices: [],
        wallet: detail.creditUgx ? [{ id: id(sequence.current++), kind: "transfer", amountUgx: -detail.creditUgx, balanceAfter: 0,
          createdAt: stamp, actor: "admin", note: "Moved to the new sample number", payment: null, period: null }, ...detail.wallet] : detail.wallet,
        codes: detail.codes.map(code =>
        code.status === "active" || code.status === "queued" ? { ...code, status: "revoked", daysLeft: 0 } : code) });
      const target = withDetail(destination, { ...destination.detail, codes: targetCodes, creditUgx: destination.detail.creditUgx + detail.creditUgx,
        wallet: detail.creditUgx ? [{ id: id(sequence.current++), kind: "transfer", amountUgx: detail.creditUgx, balanceAfter: destination.detail.creditUgx + detail.creditUgx,
          createdAt: stamp, actor: "admin", note: "Moved from the old sample number", payment: null, period: null }, ...destination.detail.wallet] : destination.detail.wallet,
        autoRenew: destination.detail.autoRenew || detail.autoRenew, autoRenewPlanName: detail.autoRenew ? detail.autoRenewPlanName : destination.detail.autoRenewPlanName });
      movedAccounts.current.add(account.id); movedAccounts.current.add(destination.id);
      replace(existing ? records.current.map(record => record.id === old.id ? old : record.id === target.id ? target : record)
        : [target, ...records.current.map(record => record.id === old.id ? old : record)]);
      return answer({ status: "saved", accountId: target.id });
    }
    return invalid("Choose a supported sample subscriber action.");
  }, [replace, update]);
  return { subscribers, request, reset };
}
