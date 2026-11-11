import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { MemberNavigationRecovery } from "@/components/members/member-controls";
import { SubscribeFlow, SubscribeIntro, SubscribeLayout } from "@/components/members/subscribe-controls";
import { ApprovalRefresh, PaymentStatusCard } from "@/components/members/payment-status";
import { SubscriptionSummaryCard } from "@/components/members/subscription-summary-card";
import { FreeTrialControl } from "@/components/members/free-trial-control";
import { ButtonLink } from "@/components/ui/controls";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { accountSectionHref } from "@/domain/account-navigation";
import { memberAuthPath, memberReturnPath, sharedSlipReturnPath } from "@/domain/member-navigation";
import { adminLandingPath } from "@/domain/admin-navigation";
import { checkoutOpenStatuses } from "@/domain/checkout";
import type { PaymentView } from "@/domain/payment";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { offeredTrialDays, type SubscriptionStatus } from "@/domain/subscription-summary";
import { publicSubscriptionSettings, publicSupportContactSettings } from "@/domain/public-subscription-settings";
import { createMessages } from "@/i18n/messages";
import { getAnalyticsServices } from "@/server/analytics/analytics-http";
import { getMemberServices, type MemberServicesSource } from "@/server/members/member-http";
import { memberCookieName, memberTokenHash } from "@/server/members/member-sessions";
import { createPlansService } from "@/server/members/plans";
import { readMemberPageSession } from "@/server/members/member-page-session";
import { subscriptionCheckoutPublished } from "@/server/members/sales-readiness";
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
    const salesOpen = subscriptionCheckoutPublished(settings, resolved.config.production);
    const parameters = await searchParams, returnTo = memberReturnPath(parameters.return), topUp = parameters.add === "credit";
    const userAgent = (await headers()).get("user-agent") ?? "";
    const session = await readMemberPageSession(resolved, (await cookies()).get(memberCookieName(resolved.config.production))?.value);
    // Authentication always has its own URL, before pricing or checkout reads can fail.
    if (session.kind === "guest") redirect(memberAuthPath("login", returnTo));
    if (session.kind === "verification") redirect(memberAuthPath("verify", returnTo));
    if (session.kind === "reset") redirect(memberAuthPath("new-password", returnTo));
    const member = session.kind === "member" ? session.member : null;
    const eligible = member && !member.blocked && !member.administrator ? member : null;
    // Payment history and the current access period remain available when new sales are paused.
    const [status, availablePlans, payment, checkout] = await Promise.allSettled([
      eligible ? resolved.codes?.subscriptionStatus(eligible) ?? null : null,
      eligible && salesOpen && (!topUp || !resolved.checkout) ? plans() : [],
      eligible ? resolved.payments?.view(eligible) ?? null : null,
      eligible ? resolved.checkout?.read(eligible) ?? null : null,
    ]);
    const subscription: SubscriptionStatus | null = status.status === "fulfilled" ? status.value : null;
    const offers = availablePlans.status === "fulfilled" ? availablePlans.value.filter(plan => plan.active) : [];
    const checkoutView = checkout.status === "fulfilled" ? checkout.value : null;
    const paymentView = payment.status === "fulfilled" ? payment.value : null;
    const view: PaymentView | null = checkoutView ? { ...paymentView, acceptedTerms: paymentView?.acceptedTerms ?? false,
      status: paymentView?.status ?? null, checkout: checkoutView } : paymentView;
    const unavailable = !settings || session.kind === "unavailable" || !!eligible && salesOpen &&
      (!subscription || availablePlans.status === "rejected" || payment.status === "rejected" || !!resolved.checkout && !checkoutView);
    const activeUntil = subscription?.activeUntil ?? null;
    const trial = subscription?.trial;
    const administrator = !!member && !member.blocked && member.administrator;
    const draftScope = member ? memberTokenHash(`purchase-progress:${member.tokenHash}`) : "signed-out";
    const referralsOpen = settings?.paywallMode === "on";
    const newCheckoutAvailable = salesOpen && !unavailable && (topUp || offers.length > 0);
    const checkoutAvailable = !!eligible && !!settings && !!checkoutView && (newCheckoutAvailable ||
      checkoutView.requests.some(request => (request.purpose === "topup") === topUp) || referralsOpen && !topUp && checkoutView.availableReferralDays > 0);
    const showFlow = checkoutAvailable || !!eligible && !resolved.checkout && salesOpen && !unavailable;
    const reports = [paymentView?.status, paymentView?.otherStatus].filter(report => report != null);
    const waiting = !showFlow && (subscription?.paymentPending || reports.some(report => [...checkoutOpenStatuses, "superseded"].some(state => state === report.status)));
    const contact = { ...publicSupportContactSettings(settings), reviewTime: settings?.reviewTime ?? null };
    const trialNotice = trial && !topUp
      ? <FreeTrialControl key={member?.accountId} locale={locale} trial={trial} days={offeredTrialDays(settings)} /> : null;
    return <PublicShell locale={locale} showAccount><SubscribeLayout>
      {topUp ? <VisuallyHidden as="h1">{m.text("account.section.wallet")}</VisuallyHidden> : <SubscribeIntro locale={locale} />}
      <MemberNavigationRecovery {...(member ? { expectedPhone: member.blocked ? null : member.phone, expectedAdministrator: !!administrator } : {})} />
      {topUp && member && !member.blocked && !administrator
        ? <div><ButtonLink href={accountSectionHref(locale, "wallet", returnTo)} variant="quiet" prefetch={false}>{m.text("wallet.back")}</ButtonLink></div>
        : sharedSlipReturnPath(returnTo) && <div><ButtonLink href={returnTo!} prefetch={false}>{m.text("slipShare.return")}</ButtonLink></div>}
      <ApprovalRefresh waiting={waiting} refreshAt={trial?.state === "active" ? trial.endsAt : activeUntil} />
      {!checkoutAvailable && trialNotice}
      {eligible && !showFlow && reports.length > 0 && <div id="report">
        {reports.map(report => <PaymentStatusCard key={report.reference} locale={locale} status={report} settings={contact} phone={eligible.phone} />)}
      </div>}
      {eligible && !salesOpen && activeUntil && <SubscriptionSummaryCard locale={locale} subscription={subscription} canSubscribe={false} returnTo={returnTo} />}
      {administrator ? <><p>{m.text("account.noSubscriptionNeeded")}</p><div><ButtonLink href={adminLandingPath} prefetch={false}>{m.text("account.dashboard")}</ButtonLink></div></>
        : member?.blocked ? <p role="status">{m.text("account.refused")}</p>
          : unavailable ? <p role="status">{m.text("account.unavailable")}</p>
            : !salesOpen ? <><p role="status">{m.text(settings?.paywallMode === "off" ? "account.closed" : "subscribe.salesPaused")}</p>
              <div><ButtonLink href={accountSectionHref(locale, "overview", returnTo)} prefetch={false}>{m.text("account.title")}</ButtonLink></div></>
              : resolved.checkout && !newCheckoutAvailable && <p role="status">{m.text("subscribe.noPlans")}</p>}
      {showFlow && settings && eligible && <SubscribeFlow key={`${draftScope}:${topUp ? "credit" : "plans"}`} locale={locale} settings={publicSubscriptionSettings(settings)} plans={offers}
        account={{ id: eligible.accountId, phone: eligible.phone, draftScope }} view={view} returnTo={returnTo} userAgent={userAgent}
        startWithTopUp={topUp} salesOpen={newCheckoutAvailable} referralsOpen={referralsOpen} noticeBeforeCheckout={trialNotice} />}
    </SubscribeLayout></PublicShell>;
  };
}
export const SubscribeRoute = createSubscribeRoute();
