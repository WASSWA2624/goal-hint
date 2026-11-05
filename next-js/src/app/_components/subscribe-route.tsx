import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { MemberNavigationRecovery } from "@/components/members/member-controls";
import { SubscribeFlow, SubscribeIntro, SubscribeLayout } from "@/components/members/subscribe-controls";
import { ApprovalRefresh } from "@/components/members/payment-status";
import { SubscriptionSummaryCard } from "@/components/members/subscription-summary-card";
import { FreeTrialControl } from "@/components/members/free-trial-control";
import { ButtonLink } from "@/components/ui/controls";
import { memberAuthPath, memberReturnPath, sharedSlipReturnPath } from "@/domain/member-navigation";
import { adminLandingPath } from "@/domain/admin-navigation";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import type { SubscriptionStatus } from "@/domain/subscription-summary";
import { publicSubscriptionSettings } from "@/domain/public-subscription-settings";
import { createMessages } from "@/i18n/messages";
import { getAnalyticsServices } from "@/server/analytics/analytics-http";
import { getMemberServices, type MemberServicesSource } from "@/server/members/member-http";
import { memberCookieName, memberTokenHash } from "@/server/members/member-sessions";
import { createPlansService } from "@/server/members/plans";
import { readMemberPageSession } from "@/server/members/member-page-session";
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
    const m = createMessages(locale), resolved = await services().catch(() => null);
    if (!resolved) return <PublicShell locale={locale} showAccount><SubscribeLayout>
      <SubscribeIntro locale={locale} /><MemberNavigationRecovery /><p role="status">{m.text("account.unavailable")}</p>
    </SubscribeLayout></PublicShell>;
    const settings = resolved.settings.settings;
    const parameters = await searchParams, returnTo = memberReturnPath(parameters.return);
    const userAgent = (await headers()).get("user-agent") ?? "";
    const session = await readMemberPageSession(resolved, (await cookies()).get(memberCookieName(resolved.config.production))?.value);
    // Authentication always has its own URL, before pricing or checkout reads can fail.
    if (session.kind === "guest") redirect(memberAuthPath("login", returnTo));
    if (session.kind === "verification") redirect(memberAuthPath("verify", returnTo));
    if (session.kind === "reset") redirect(memberAuthPath("new-password", returnTo));
    const member = session.kind === "member" ? session.member : null;
    let view = null, subscription: SubscriptionStatus | null = null, offers: readonly SubscriptionPlanView[] = [], unavailable = !settings || session.kind === "unavailable";
    if (member) {
      try {
        const subscriptionMember = member && !member.blocked && !member.administrator ? member : null;
        const salesOpen = settings && settings.paywallMode !== "off" && !(member && !member.blocked && member.administrator);
        // These stored reads are independent once identity is verified. Settle all three before
        // rendering, retaining a known subscription even when pricing or payment history fails.
        const [status, availablePlans, payment] = await Promise.allSettled([
          subscriptionMember ? resolved.codes?.subscriptionStatus(subscriptionMember) ?? null : null,
          salesOpen ? plans() : [],
          salesOpen && member && !member.blocked ? Promise.all([resolved.payments?.view(member) ?? null, resolved.checkout?.read(member) ?? null])
            .then(([payment, checkout]) => {
              if (resolved.checkout && !checkout) throw new Error("Checkout unavailable.");
              return payment ? { ...payment, ...(checkout ? { checkout } : {}) } : null;
            }) : null,
        ]);
        subscription = status.status === "fulfilled" ? status.value : null;
        offers = availablePlans.status === "fulfilled" ? availablePlans.value.filter((plan) => plan.active) : [];
        view = payment.status === "fulfilled" ? payment.value : null;
        if (status.status === "rejected" || availablePlans.status === "rejected" || payment.status === "rejected"
          || subscriptionMember && !subscription) unavailable = true;
      } catch { unavailable = true; }
    }
    const activeUntil = subscription?.activeUntil ?? null;
    const trial = subscription?.trial;
    const administrator = !!member && !member.blocked && member.administrator;
    const draftScope = member ? memberTokenHash(`purchase-progress:${member.tokenHash}`) : "signed-out";
    const checkoutAvailable = member && !member.blocked && !administrator && !unavailable && settings?.paywallMode !== "off" && view?.checkout;
    const trialNotice = trial && parameters.add !== "credit"
      ? <FreeTrialControl key={member?.accountId} locale={locale} trial={trial} days={settings?.trialDays ?? 0} /> : null;
    return <PublicShell locale={locale} showAccount><SubscribeLayout>
      <SubscribeIntro locale={locale} /><MemberNavigationRecovery {...(member ? { expectedPhone: member.blocked ? null : member.phone, expectedAdministrator: !!administrator } : {})} />
      {sharedSlipReturnPath(returnTo) && <div><ButtonLink href={returnTo!} prefetch={false}>{m.text("slipShare.return")}</ButtonLink></div>}<ApprovalRefresh waiting={false} refreshAt={trial?.state === "active" ? trial.endsAt : activeUntil} />
      {!checkoutAvailable && trialNotice}
      {administrator ? <><p>{m.text("account.noSubscriptionNeeded")}</p><div><ButtonLink href={adminLandingPath} prefetch={false}>{m.text("account.dashboard")}</ButtonLink></div></>
        : settings?.paywallMode === "off" ? <>{activeUntil && <SubscriptionSummaryCard locale={locale} subscription={subscription} canSubscribe={false} returnTo={returnTo} />}<p>{m.text("account.closed")}</p><div><ButtonLink href="/en/account" prefetch={false}>{m.text("account.title")}</ButtonLink></div></>
        : unavailable ? <p role="status">{m.text("account.unavailable")}</p>
          : member?.blocked ? <p role="status">{m.text("account.refused")}</p>
            // Use a separate, noncredential storage scope for each verified browser session.
            : <SubscribeFlow key={`${draftScope}:${parameters.add === "credit" ? "credit" : "plans"}`} locale={locale} settings={publicSubscriptionSettings(settings!)} plans={offers}
              account={member ? { id: member.accountId, phone: member.phone, draftScope } : null} view={view} returnTo={returnTo} userAgent={userAgent}
              startWithTopUp={parameters.add === "credit"} noticeBeforeCheckout={trialNotice} />}
    </SubscribeLayout></PublicShell>;
  };
}
export const SubscribeRoute = createSubscribeRoute();
