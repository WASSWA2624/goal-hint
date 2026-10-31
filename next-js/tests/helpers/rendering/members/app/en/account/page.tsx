import { createAccountRoute } from "@/app/_components/account-route";
import { defaultSubscriptionSettings } from "@/domain/subscription-settings";
import { pageMetadata } from "@/server/seo/metadata";
import type { MemberServices } from "@/server/members/member-http";
import { RefreshProbe } from "./refresh-probe";
import { cookies } from "next/headers";
import { fixtureTokens } from "../../fixture-auth";
import { fixtureAdminPhone } from "../../fixture-identity";
import { fixtureSubscriptionPeriods, fixtureSubscriptionStatus, subscriptionScenarios } from "../../fixture-subscription";
import { fixtureDashboard } from "../../fixture-dashboard";
import { fixtureNotifications } from "../../fixture-notifications";

export const dynamic = "force-dynamic";
export const metadata = pageMetadata({ title: "Account", description: "Isolated member acceptance fixture." });

function fixtureServices(state: string) {
  const scenario = state === "ended" ? "expired" : state === "signed-in" ? "free"
    : ["queued", "dashboard-unavailable", "subscription-unavailable", "referral-empty", "referral-unavailable", "notifications-empty", "notifications-unavailable"].includes(state) ? "active" : state;
  const unlocked = ["active", "manual", "trial", "pending-renewal", "expired", "off-active", "registration-trial"].includes(scenario), at = Date.now();
  return async () => {
    const consent = (await cookies()).get("member-fixture-whatsapp")?.value;
    return { config: { production: false },
    settings: { settings: state === "unavailable" ? null : { ...defaultSubscriptionSettings, paywallMode: scenario.startsWith("off") ? "off" : "test" } },
    sessions: { async verify() { return [...subscriptionScenarios.filter(value => value !== "off"), "blocked", "administrator", "history"].includes(scenario)
      ? { accountId: "00000000-0000-4000-8000-000000000101", tokenHash: "synthetic", phone: state === "administrator" ? fixtureAdminPhone : "256700000101", administrator: state === "administrator", blocked: state === "blocked", codeEnteredAt: unlocked ? new Date(at) : null, whatsappNotificationsAt: consent === "on" ? new Date(at) : null } : null; } },
    auth: { async passwordResetSession() { return state === "password-reset" ? { phone: "256700000101" } : null; },
      async verificationSession() { return ["unverified", "sms-only", "unsupported"].includes(state) ? { phone: state === "unsupported" ? "5511999999999" : state === "sms-only" ? "447700900123" : "256700000101" } : null; } },
    codes: { async subscriptionStatus() { if (state === "subscription-unavailable") throw new Error("Synthetic unavailable subscription"); return fixtureSubscriptionStatus(scenario); },
      async accountView() { const codes = fixtureSubscriptionPeriods(scenario);
        if (state === "queued") codes.push({ ...codes[0]!, id: "synthetic-queued", planName: "Next package", startsAt: codes[0]!.endsAt, endsAt: new Date(+codes[0]!.endsAt + 7 * 86_400_000) });
        return { codes, devices: [{ tokenHash: "synthetic", lastSeenAt: new Date(at) }] }; } },
    dashboard: { async read() { if (state === "dashboard-unavailable") throw new Error("Synthetic unavailable history"); return fixtureDashboard(scenario); } },
    notifications: fixtureNotifications(state),
    referrals: { async read() {
      if (state === "referral-unavailable") throw new Error("Synthetic unavailable referrals");
      const empty = state === "referral-empty";
      return { code: "a".repeat(32), verified: empty ? 0 : 3, earnedDays: empty ? 0 : 3, remainingMs: empty ? 0 : 2 * 86_400_000 + 5 * 3_600_000,
        history: empty ? [] : Array.from({ length: 4 }, (_, index) => ({ id: `synthetic-referral-${index}`, registeredAt: new Date(at - (index + 1) * 86_400_000).toISOString(),
          rewardedAt: index === 0 ? null : new Date(at - index * 86_400_000).toISOString(), status: index === 0 ? "pending" : "rewarded" })) };
    } },
    payments: { async view() { return { acceptedTerms: unlocked,
      status: fixtureSubscriptionStatus(scenario).paymentPending ? { reference: "PFAKE", status: "pending", planName: "Weekly", priceUgx: 5000,
        submittedAt: new Date(at).toISOString(), endsAt: null, rejectText: null, rejectReason: null } : null }; } },
  } as unknown as MemberServices;
  };
}
const accountRoutes = Object.fromEntries(["signed-out", "signed-in", "unavailable", "ended", "blocked", "administrator", "unverified", "sms-only", "unsupported", "password-reset", "queued", "history", "dashboard-unavailable", "subscription-unavailable", "referral-empty", "referral-unavailable", "notifications-empty", "notifications-unavailable", ...subscriptionScenarios].map((state) =>
  [state, createAccountRoute({ services: fixtureServices(state) })]));

/** Synthetic scenarios are confined to this isolated acceptance app; no owner setting or developer DB is changed. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const parameters = await searchParams;
  const jar = await cookies(), token = jar.get("goal-hint-member")?.value;
  const subscriptionState = jar.get("member-fixture-subscription")?.value;
  const cookieState = token === fixtureTokens.reset ? "password-reset" : token === fixtureTokens.pending ? "unverified"
    : token === fixtureTokens.administrator ? "administrator" : token === fixtureTokens.authenticated ? subscriptionState ?? "signed-in" : "signed-out";
  const Account = accountRoutes[typeof parameters.state === "string" ? parameters.state : parameters.status === "code-accepted" ? "active" : cookieState] ?? accountRoutes["signed-out"]!;
  return <><Account locale="en" searchParams={searchParams} /><RefreshProbe initialScenario={typeof parameters.scenario === "string" ? parameters.scenario : jar.get("member-fixture-scenario")?.value ?? "success"} /></>;
}
