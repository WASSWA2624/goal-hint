import "server-only";

import { cookies, headers } from "next/headers";
import { MemberNavigationRecovery } from "@/components/members/member-controls";
import { SubscribeFlow, SubscribeIntro, SubscribeLayout } from "@/components/members/subscribe-controls";
import { ApprovalRefresh } from "@/components/members/payment-status";
import { SubscriptionSummaryCard } from "@/components/members/subscription-summary-card";
import { ButtonLink } from "@/components/ui/controls";
import { memberReturnPath } from "@/domain/member-navigation";
import { adminLandingPath } from "@/domain/admin-navigation";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import type { SubscriptionStatus } from "@/domain/subscription-summary";
import { publicSubscriptionSettings } from "@/domain/public-subscription-settings";
import { createMessages } from "@/i18n/messages";
import { getAnalyticsServices } from "@/server/analytics/analytics-http";
import { getMemberServices, type MemberServicesSource } from "@/server/members/member-http";
import { memberCookieName } from "@/server/members/member-sessions";
import { createPlansService } from "@/server/members/plans";
import { PublicShell } from "./public-shell";

async function readPlans() {
  const { database } = await getAnalyticsServices();
  return database ? (await createPlansService(database).list()).filter((plan) => plan.active) : [];
}
export function createSubscribeRoute({ services = getMemberServices, plans = readPlans }: {
  services?: MemberServicesSource; plans?: () => Promise<readonly SubscriptionPlanView[]>;
} = {}) {
  return async function SubscribeRoute({ locale, searchParams }: {
    locale: string; searchParams: Promise<Record<string, string | string[] | undefined>>;
  }) {
    const m = createMessages(locale), resolved = await services(), settings = resolved.settings.settings;
    const parameters = await searchParams, returnTo = memberReturnPath(parameters.return);
    const userAgent = (await headers()).get("user-agent") ?? "";
    let member = null, view = null, subscription: SubscriptionStatus | null = null, offers: readonly SubscriptionPlanView[] = [], unavailable = !settings || !resolved.sessions;
    if (resolved.sessions) {
      try {
        member = await resolved.sessions.verify((await cookies()).get(memberCookieName(resolved.config.production))?.value);
        const subscriptionMember = member && !member.blocked && !member.administrator ? member : null;
        const salesOpen = settings && settings.paywallMode !== "off" && !(member && !member.blocked && member.administrator);
        // These stored reads are independent once identity is verified. Settle all three before
        // rendering, retaining a known subscription even when pricing or payment history fails.
        const [status, availablePlans, payment] = await Promise.allSettled([
          subscriptionMember ? resolved.codes?.subscriptionStatus(subscriptionMember) ?? null : null,
          salesOpen ? plans() : [],
          salesOpen && member && !member.blocked ? resolved.payments?.view(member) ?? null : null,
        ]);
        subscription = status.status === "fulfilled" ? status.value : null;
        offers = availablePlans.status === "fulfilled" ? availablePlans.value.filter((plan) => plan.active) : [];
        view = payment.status === "fulfilled" ? payment.value : null;
        if (status.status === "rejected" || availablePlans.status === "rejected" || payment.status === "rejected"
          || subscriptionMember && !subscription) unavailable = true;
      } catch { unavailable = true; }
    }
    const activeUntil = subscription?.activeUntil ?? null;
    const administrator = !!member && !member.blocked && member.administrator;
    return <PublicShell locale={locale} showAccount><SubscribeLayout>
      <SubscribeIntro locale={locale} /><MemberNavigationRecovery /><ApprovalRefresh waiting={false} refreshAt={activeUntil} />
      {administrator ? <><p>{m.text("account.noSubscriptionNeeded")}</p><div><ButtonLink href={adminLandingPath} prefetch={false}>{m.text("account.dashboard")}</ButtonLink></div></>
        : settings?.paywallMode === "off" ? <>{activeUntil && <SubscriptionSummaryCard locale={locale} subscription={subscription} canSubscribe={false} returnTo={returnTo} />}<p>{m.text("account.closed")}</p><div><ButtonLink href="/en/account" prefetch={false}>{m.text("account.title")}</ButtonLink></div></>
        : unavailable ? <p role="status">{m.text("account.unavailable")}</p>
          : member?.blocked ? <p role="status">{m.text("account.refused")}</p>
            // The URL decides plans or Add credit: moving between them starts the flow afresh (its draft is saved per account).
            : <SubscribeFlow key={`${member?.tokenHash ?? "signed-out"}:${parameters.add === "credit" ? "credit" : "plans"}`} locale={locale} settings={publicSubscriptionSettings(settings!)} plans={offers}
              account={member ? { id: member.accountId, phone: member.phone } : null} view={view} returnTo={returnTo} userAgent={userAgent}
              startWithTopUp={parameters.add === "credit"} />}
    </SubscribeLayout></PublicShell>;
  };
}
export const SubscribeRoute = createSubscribeRoute();
