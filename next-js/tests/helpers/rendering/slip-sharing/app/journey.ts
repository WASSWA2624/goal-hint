import type { MemberServices } from "@/server/members/member-http";
import { defaultSubscriptionSettings } from "@/domain/subscription-settings";
const member = { accountId: "00000000-0000-4000-8000-000000000101", tokenHash: "a".repeat(64), phone: "256700001101", blocked: false, administrator: false, codeEnteredAt: null };
export const fixturePlan = { id: "00000000-0000-4000-8000-000000000001", name: "Synthetic daily", durationDays: 1, priceUgx: 1000, sortOrder: 0, active: true, createdAt: "2026-10-31T00:00:00Z", updatedAt: "2026-10-31T00:00:00Z" };
export function journeyServices(viewer?: string): MemberServices {
  const signed = viewer === "member" || viewer === "eligible";
  return { config: { production: false, cookies: { secure: false, session: "synthetic-owner", exclude: "synthetic-exclude" } },
    settings: { source: "stored", settings: { ...defaultSubscriptionSettings, paywallMode: "test", mtnNumber: "256700000901", mtnName: "SYNTHETIC ONLY" } },
    sessions: { verify: async () => signed ? member : null },
    auth: { login: async (phone: string, password: string) => phone === member.phone && password === "SyntheticSharingPassword1!"
      ? { status: "authenticated", phone, token: "a".repeat(43) } : { status: "unauthorized", message: "Invalid synthetic credentials." } },
    codes: { subscriptionStatus: async () => ({ activeUntil: viewer === "eligible" ? new Date(Date.now() + 86400000).toISOString() : null, paymentPending: false, creditUgx: 0, autoRenew: false, autoRenewPlanId: null, renewsFromCredit: false }) },
    payments: { view: async () => null },
  } as unknown as MemberServices;
}
