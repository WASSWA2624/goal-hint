import "server-only";
import { defaultSubscriptionSettings } from "@/domain/subscription-settings";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import type { PaymentFields, PaymentStatus } from "@/domain/payment";
import { activeSubscriptionUntil } from "@/domain/subscription-summary";
import type { MemberServices } from "@/server/members/member-http";
import type { MemberIdentity } from "@/server/members/member-sessions";

const state = globalThis as typeof globalThis & { syntheticPayment?: PaymentStatus; syntheticTrial?: boolean };
export const settings = { ...defaultSubscriptionSettings, paywallMode: "test" as const, mtnNumber: "256700000901", mtnName: "TEST MTN PAYEE",
  airtelNumber: "256700000902", airtelName: "TEST AIRTEL PAYEE", contactPhone: "256700000903", whatsappPhone: "256700000904",
  mtnMenuShortcut: "*000*{amount}#", airtelMenuShortcut: "*001*{amount}#", reviewTime: "a synthetic review interval", paymentNote: "Synthetic fixture: never send money." };
export const plans: SubscriptionPlanView[] = [1, 7, 30].map((days, index) => ({ id: `00000000-0000-4000-8000-00000000000${index}`,
  name: ["Daily", "Weekly", "Monthly"][index]!, durationDays: days, priceUgx: [1000, 5000, 20000][index]!, active: true,
  sortOrder: index, createdAt: "2026-10-19T00:00:00Z", updatedAt: "2026-10-19T00:00:00Z" }));
export function fixtureServices(scenario = "default"): MemberServices {
  const now = new Date();
  const periods = ["active", "approved"].includes(scenario) ? [{ id: "synthetic", planName: "Weekly", durationDays: 7, extensionDays: 0,
    revokedAt: null, startsAt: new Date(+now - 86_400_000), endsAt: new Date(+now + 7 * 86_400_000) }] : [];
  const paymentStatus = (): PaymentStatus | null => ["pending", "approved", "rejected"].includes(scenario) ? {
    reference: "PFAKE", status: scenario as PaymentStatus["status"], rejectText: "Synthetic rejection reason", rejectReason: scenario === "rejected" ? "other" : null,
    submittedAt: now.toISOString(), planName: "Weekly", priceUgx: 5000, endsAt: scenario === "approved" ? periods[0]!.endsAt.toISOString() : null,
  } : state.syntheticPayment ?? null;
  return { config: { production: false, cookies: { secure: false } }, settings: { settings: { ...settings, paywallMode: scenario === "off" ? "off" : "test" }, source: "stored" },
    sessions: {
      async verify(token?: string) { return scenario === "signed-out" || !token && !["signed-in", "active", "blocked", "pending", "approved", "rejected"].includes(scenario) ? null
        : { accountId: "00000000-0000-4000-8000-000000000100", tokenHash: "synthetic", phone: "256700000101", blocked: scenario === "blocked",
          codeEnteredAt: scenario === "active" ? new Date() : null, accessCodeId: null, expiresAt: new Date(Date.now() + 86_400_000) }; },
      async signIn() { return { status: "signed-in", token: "p".repeat(43) }; }, async signOut() {},
    },
    codes: {
      async accountView() { return { codes: periods, devices: [] }; },
      async subscriptionStatus() { return { activeUntil: activeSubscriptionUntil(periods, new Date()),
        paymentPending: ["pending", "superseded"].includes(paymentStatus()?.status ?? "") }; },
    },
    payments: { async begin() { return true; }, async submit(_member: MemberIdentity, fields: PaymentFields) {
      if (fields.transactionId === "TESTFAIL") return { status: "duplicate" };
      const plan = plans.find((row) => row.id === fields.planId)!;
      state.syntheticPayment = { reference: "PTEST", status: "pending", rejectText: null, rejectReason: null, submittedAt: new Date().toISOString(), planName: plan.name, priceUgx: plan.priceUgx, endsAt: null };
      return { status: "saved", reference: "PTEST" };
    }, async trial() { state.syntheticTrial = true; return "saved"; },
    async view() { return { acceptedTerms: scenario === "active", trialEligible: !periods.length && !state.syntheticTrial, trialRequested: !!state.syntheticTrial,
      trialPending: !!state.syntheticTrial && !periods.length, status: paymentStatus() }; } },
  } as unknown as MemberServices;
}
