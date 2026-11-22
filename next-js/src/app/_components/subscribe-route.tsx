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
import { matchReturnPath, memberAuthPath, memberNextPath, memberReturnPath, sharedSlipReturnPath, subscriptionReturnPath } from "@/domain/member-navigation";
import { adminLandingPath } from "@/domain/admin-navigation";
import { checkoutOpenStatuses } from "@/domain/checkout";
import type { PaymentView } from "@/domain/payment";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { offeredTrialDays, type SubscriptionStatus } from "@/domain/subscription-summary";
import { publicSubscriptionSettings, publicSupportContactSettings } from "@/domain/public-subscription-settings";
import { hasManualPaymentProvider } from "@/domain/subscription-settings";
import { createMessages } from "@/i18n/messages";
import { getAnalyticsServices } from "@/server/analytics/analytics-http";
import { getMemberServices, type MemberServicesSource } from "@/server/members/member-http";
import { memberCookieName, memberTokenHash } from "@/server/members/member-sessions";
import { createPlansService } from "@/server/members/plans";
import { readMemberPageSession } from "@/server/members/member-page-session";
import { flutterwaveReference } from "@/server/members/flutterwave";
import { flutterwaveCheckoutPublished, payableCheckoutPlans, subscriptionCheckoutPublished } from "@/server/members/sales-readiness";
import { allowsContentWithoutSubscription } from "@/server/members/viewer-access";
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
    const m = createMessages(locale);
    const [resolved, parameters] = await Promise.all([services().catch(() => null), searchParams]);
    const topUp = parameters.add === "credit";
    const requestedPayment = flutterwaveReference.safeParse(parameters.payment);
    const paymentId = !topUp && requestedPayment.success ? requestedPayment.data : undefined;
    const checkoutReturn = !topUp && parameters.checkout === "1" ? subscriptionReturnPath(parameters.return) : null;
    const returnTo = !topUp && parameters.checkout === "1" ? checkoutReturn : memberReturnPath(parameters.return);
    const returnMatch = matchReturnPath(returnTo);
    const returnLabel = returnMatch ? "subscribe.returnToMatch" : sharedSlipReturnPath(returnTo) ? "slipShare.return"
      : returnTo === "/en/slips" ? "subscribe.returnToBuilder" : returnTo === "/en/best-slips" ? "subscribe.returnToSlips"
        : returnTo?.startsWith("/en/best-slips/") ? "slipShare.return" : "subscribe.returnToMatches";
    const back = returnTo && (returnMatch || sharedSlipReturnPath(returnTo) || checkoutReturn) &&
      <div><ButtonLink href={returnTo} variant="quiet" prefetch={false} contextBack>{m.text(returnLabel)}</ButtonLink></div>;
    if (!resolved) return <PublicShell locale={locale} showAccount><SubscribeLayout>
      <SubscribeIntro locale={locale} />{back}<MemberNavigationRecovery /><p role="status">{m.text("account.unavailable")}</p>
    </SubscribeLayout></PublicShell>;
    const settings = resolved.settings.settings;
    const salesOpen = subscriptionCheckoutPublished(settings, resolved.config.production);
    const hostedSalesOpen = !topUp && !!resolved.checkout?.flutterwaveReady
      && flutterwaveCheckoutPublished(settings, resolved.config.production && resolved.checkout.flutterwaveMode !== "sandbox");
    const checkoutPublished = salesOpen || hostedSalesOpen;
    if (checkoutReturn && !paymentId && allowsContentWithoutSubscription(resolved.settings, false)) redirect(checkoutReturn);
    const session = await readMemberPageSession(resolved, (await cookies()).get(memberCookieName(resolved.config.production))?.value);
    // Authentication always has its own URL, before pricing or checkout reads can fail.
    if (session.kind === "guest") redirect(memberAuthPath("login", returnTo, !!checkoutReturn));
    if (session.kind === "verification") redirect(memberAuthPath("verify", returnTo, !!checkoutReturn));
    if (session.kind === "reset") redirect(memberAuthPath("new-password", returnTo, !!checkoutReturn));
    const member = session.kind === "member" ? session.member : null;
    const administrator = !!member && !member.blocked && member.administrator;
    const eligible = member && !member.blocked && !member.administrator ? member : null;
    const alreadyAllowed = administrator || eligible && allowsContentWithoutSubscription(resolved.settings, eligible.phoneVerified === true);
    if (checkoutReturn && !paymentId && alreadyAllowed) redirect(checkoutReturn);
    const status = eligible ? resolved.codes?.subscriptionStatus(eligible).catch(() => null) ?? null : null;
    if (checkoutReturn && !paymentId && settings) {
      const activeUntil = (await status)?.activeUntil;
      if (activeUntil && Date.parse(activeUntil) > Date.now()) redirect(checkoutReturn);
    }
    // Payment history and the current access period remain available when new sales are paused.
    const [subscription, availablePlans, payment, checkout, requestHeaders] = await Promise.allSettled([
      status,
      eligible && checkoutPublished && (!topUp || !resolved.checkout) ? plans() : [],
      eligible ? resolved.payments?.view(eligible) ?? null : null,
      eligible ? resolved.checkout?.read(eligible, paymentId) ?? null : null,
      headers(),
    ]);
    const subscriptionStatus: SubscriptionStatus | null = subscription.status === "fulfilled" ? subscription.value : null;
    const plansForSale = availablePlans.status === "fulfilled" ? availablePlans.value.filter(plan => plan.active) : [];
    const checkoutView = checkout.status === "fulfilled" ? checkout.value : null;
    const currentPayment = paymentId ? checkoutView?.requests.find(request => request.id === paymentId && request.method === "flw") : null;
    const offers = payableCheckoutPlans(plansForSale, salesOpen ? settings : null, salesOpen ? checkoutView?.availableWalletUgx ?? 0 : 0,
      hostedSalesOpen && checkoutView?.flutterwaveAvailable === true);
    const paymentView = payment.status === "fulfilled" ? payment.value : null;
    const view: PaymentView | null = checkoutView ? { ...paymentView, acceptedTerms: paymentView?.acceptedTerms ?? false,
      status: paymentView?.status ?? null, checkout: checkoutView } : paymentView;
    const unavailable = !settings || session.kind === "unavailable" || !!eligible && checkoutPublished &&
      (!subscriptionStatus || availablePlans.status === "rejected" || payment.status === "rejected" || !!resolved.checkout && !checkoutView);
    const activeUntil = subscriptionStatus?.activeUntil ?? null;
    const confirmedAccess = alreadyAllowed || !!settings && !!activeUntil && Date.parse(activeUntil) > Date.now();
    if (checkoutReturn && paymentId && confirmedAccess && (!currentPayment || currentPayment.status === "approved")) redirect(checkoutReturn);
    const trial = subscriptionStatus?.trial;
    const draftScope = member ? memberTokenHash(`purchase-progress:${member.tokenHash}`) : "signed-out";
    const referralsOpen = settings?.paywallMode === "on";
    const newCheckoutAvailable = checkoutPublished && !unavailable && (topUp ? hasManualPaymentProvider(settings) : offers.length > 0);
    const checkoutAvailable = !!eligible && !!settings && !!checkoutView && (newCheckoutAvailable ||
      checkoutView.requests.some(request => (request.purpose === "topup") === topUp) || referralsOpen && !topUp && checkoutView.availableReferralDays > 0);
    const showFlow = checkoutAvailable || !!eligible && !resolved.checkout && newCheckoutAvailable;
    const reports = [paymentView?.status, paymentView?.otherStatus].filter(report => report != null);
    const waiting = !showFlow && (subscriptionStatus?.paymentPending || reports.some(report => [...checkoutOpenStatuses, "superseded"].some(state => state === report.status)));
    const userAgent = requestHeaders.status === "fulfilled" ? requestHeaders.value.get("user-agent") ?? "" : "";
    const contact = { ...publicSupportContactSettings(settings), reviewTime: settings?.reviewTime ?? null };
    const trialNotice = trial && !topUp
      ? <FreeTrialControl key={member?.accountId} locale={locale} trial={trial} days={offeredTrialDays(settings)}
        activatedHref={currentPayment && checkoutReturn ? memberNextPath("subscribe", checkoutReturn, undefined, true) : undefined} /> : null;
    return <PublicShell locale={locale} showAccount><SubscribeLayout>
      {topUp ? <VisuallyHidden as="h1">{m.text("account.section.wallet")}</VisuallyHidden> : <SubscribeIntro locale={locale} />}
      <MemberNavigationRecovery {...(member ? { expectedPhone: member.blocked ? null : member.phone, expectedAdministrator: !!administrator } : {})} />
      {topUp && member && !member.blocked && !administrator
        ? <div><ButtonLink href={accountSectionHref(locale, "wallet", returnTo)} variant="quiet" prefetch={false}>{m.text("wallet.back")}</ButtonLink></div>
        : !checkoutReturn && back}
      <ApprovalRefresh waiting={waiting} refreshAt={trial?.state === "active" ? trial.endsAt : activeUntil} />
      {!checkoutAvailable && trialNotice}
      {eligible && !showFlow && reports.length > 0 && <div id="report">
        {reports.map(report => <PaymentStatusCard key={report.reference} locale={locale} status={report} settings={contact} phone={eligible.phone}
          returnTo={returnTo} direct={!!checkoutReturn} />)}
      </div>}
      {eligible && !checkoutPublished && activeUntil && <SubscriptionSummaryCard locale={locale} subscription={subscriptionStatus} canSubscribe={false} returnTo={returnTo} />}
      {administrator ? <><p>{m.text("account.noSubscriptionNeeded")}</p><div><ButtonLink href={adminLandingPath} prefetch={false}>{m.text("account.dashboard")}</ButtonLink></div></>
        : member?.blocked ? <p role="status">{m.text("account.refused")}</p>
          : unavailable ? <p role="status">{m.text("account.unavailable")}</p>
            : !checkoutPublished ? <><p role="status">{m.text(settings?.paywallMode === "off" ? "account.closed" : "subscribe.salesPaused")}</p>
              <div><ButtonLink href={accountSectionHref(locale, "overview", returnTo)} prefetch={false}>{m.text("account.title")}</ButtonLink></div></>
              : eligible && !newCheckoutAvailable && <p role="status">
                {m.text(!topUp && !plansForSale.length ? "subscribe.noPlans" : "subscribe.noPaymentMethods")}
              </p>}
      {showFlow && settings && eligible && <SubscribeFlow key={`${draftScope}:${topUp ? "credit" : "plans"}`} locale={locale} settings={publicSubscriptionSettings(settings)} plans={offers}
        account={{ id: eligible.accountId, phone: eligible.phone, draftScope }} view={view} returnTo={returnTo} userAgent={userAgent}
        startWithTopUp={topUp} salesOpen={newCheckoutAvailable} ordinarySalesOpen={salesOpen} referralsOpen={referralsOpen} noticeBeforeCheckout={trialNotice}
        direct={!!checkoutReturn} paymentId={currentPayment?.id ?? null}
        paymentCancelled={currentPayment?.status === "provider-pending" && parameters.paymentStatus === "cancelled"} />}
      {checkoutReturn && back}
    </SubscribeLayout></PublicShell>;
  };
}
export const SubscribeRoute = createSubscribeRoute();
