import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MemberNavigationRecovery, MemberPanel, MemberSignOut } from "@/components/members/member-controls";
import { AccountAuthForm, type AccountAuthView } from "@/components/members/account-auth-form";
import { AccountActionLink, AccountFine, AccountFlash } from "@/components/members/account-overview";
import { AccountSecurityForm, ResetPasswordForm } from "@/components/members/account-security";
import { AccountFacts, AccountPageHead, AccountPanel, AccountWorkspace } from "@/components/members/account-workspace";
import { AccountWallet } from "@/components/members/account-wallet";
import { AccountDevices, AccountPaymentHistory, AccountQuickActions, AccountSubscriptionPanel } from "@/components/members/account-panels";
import { AccountNotificationPreferences } from "@/components/members/account-notification-preferences";
import { AccountNotifications } from "@/components/members/account-notifications";
import { AccountActivity } from "@/components/members/account-activity";
import { AccountReferrals, AccountReferralSummary } from "@/components/members/account-referrals";
import { AccountReferralReviews } from "@/components/members/account-referral-reviews";
import { AccountVerificationForm } from "@/components/members/account-verification";
import { ApprovalRefresh, PaymentNotice } from "@/components/members/payment-status";
import { ButtonLink } from "@/components/ui/controls";
import { Stack } from "@/components/ui/layout";
import { SignOutIcon } from "@/components/ui/icons";
import { memberLandingPath, memberNextPath, memberReturnPath } from "@/domain/member-navigation";
import { publicSupportContactSettings } from "@/domain/public-subscription-settings";
import { manualPaymentProvider } from "@/domain/subscription-settings";
import { checkoutOpenStatuses } from "@/domain/checkout";
import { formatSubscriptionExpiry } from "@/domain/subscription-expiry";
import { accountSection, accountSectionHref } from "@/domain/account-navigation";
import { notificationCursor } from "@/domain/account-notifications";
import { referralReviewCursor } from "@/domain/referral-reviews";
import { formatPhone } from "@/domain/phone";
import { formatCredit } from "@/domain/wallet";
import { codeStatus } from "@/domain/subscription-period";
import { offeredTrialDays } from "@/domain/subscription-summary";
import { createMessages } from "@/i18n/messages";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { getAnalyticsServices } from "@/server/analytics/analytics-http";
import { getMemberServices, type MemberServicesSource } from "@/server/members/member-http";
import { createPlansService } from "@/server/members/plans";
import { memberCookieName } from "@/server/members/member-sessions";
import { readMemberPageSession } from "@/server/members/member-page-session";
import { subscriptionCheckoutPublished } from "@/server/members/sales-readiness";
import { PublicShell } from "./public-shell";

async function readPlans() {
  const { database } = await getAnalyticsServices();
  return database ? (await createPlansService(database).list()).filter((plan) => plan.active) : [];
}
export function createAccountRoute({ services = getMemberServices, plans = readPlans }: {
  services?: MemberServicesSource; plans?: () => Promise<readonly SubscriptionPlanView[]>;
} = {}) {
  return async function AccountRoute({ locale, searchParams }: {
    locale: string; searchParams: Promise<Record<string, string | string[] | undefined>>;
  }) {
    const messages = createMessages(locale), parameters = await searchParams;
    const resolved = await services().catch(() => null);
    if (!resolved) return <PublicShell locale={locale} showAccount><Stack $gap="md">
      <MemberNavigationRecovery /><p role="status">{messages.text("account.unavailable")}</p>
    </Stack></PublicShell>;
    const settings = resolved.settings.settings;
    const token = (await cookies()).get(memberCookieName(resolved.config.production))?.value;
    const returnTo = memberReturnPath(parameters.return);
    const section = accountSection(parameters.section), summarySection = section === "overview" || section === "subscription";
    const walletSection = section === "wallet";
    const contact = { ...publicSupportContactSettings(settings), reviewTime: settings?.reviewTime ?? null };
    // Old reset links enter the same code-based recovery flow.
    const authView: AccountAuthView = parameters.view === "register" ? "register" : parameters.view === "forgot" || parameters.view === "reset" ? "forgot" : "login";
    const mode = settings?.paywallMode;
    const session = await readMemberPageSession(resolved, token);
    if (session.kind === "unavailable") return <PublicShell locale={locale} showAccount><Stack $gap="md">
      <MemberNavigationRecovery /><p role="status">{messages.text("account.unavailable")}</p>
    </Stack></PublicShell>;
    const member = session.kind === "member" ? session.member : null;
    const unavailable = mode === undefined;
    // Administrator sign-in is independent of subscription settings and every account subview.
    if (member && !member.blocked && member.administrator) redirect(memberLandingPath(true, returnTo));
    if (session.kind === "reset") return <PublicShell locale={locale} showAccount><MemberNavigationRecovery expectedPhone={null} /><ResetPasswordForm locale={locale} phone={session.phone} returnTo={returnTo} contact={contact} /></PublicShell>;
    if (session.kind === "verification") return <PublicShell locale={locale} showAccount><MemberNavigationRecovery expectedPhone={null} /><AccountVerificationForm locale={locale} phone={session.phone} returnTo={returnTo} contact={contact} /></PublicShell>;
    if (authView === "forgot" && member && !member.blocked) redirect(accountSectionHref(locale, "password", returnTo));
    if (authView === "forgot" && !member) return <PublicShell locale={locale} showAccount><MemberNavigationRecovery expectedPhone={null} /><AccountAuthForm locale={locale} view="forgot" returnTo={returnTo} contact={contact} /></PublicShell>;
    if (member && !member.blocked && typeof parameters.view === "string" && ["login", "register", "verify", "new-password"].includes(parameters.view))
      redirect(memberLandingPath(false, returnTo));
    const now = new Date();
    const [view, paymentView, subscription, dashboard, referrals, notifications, referralReviews] = member && !member.blocked ? await Promise.all([
      summarySection || section === "devices" ? resolved.codes?.accountView(member).catch(() => null) ?? null : null,
      (walletSection || settings && (summarySection || section === "payments")) ? resolved.payments?.view(member).catch(() => null) ?? null : null,
      summarySection || section === "payments" || walletSection ? resolved.codes?.subscriptionStatus(member).catch(() => null) ?? null : null,
      summarySection || section === "payments" || section === "activity" ? resolved.dashboard?.read(member).catch(() => null) ?? null : null,
      summarySection || section === "referrals" ? resolved.referrals?.read(member).catch(() => null) ?? null : null,
      section === "notifications" ? resolved.notifications?.read(member, parameters.before).catch(() => null) ?? null : null,
      section === "referrals" ? resolved.referralReviews?.member(member, referralReviewCursor(parameters.reviewBefore) ? parameters.reviewBefore as string : undefined).catch(() => null) ?? null : null,
    ]) : [null, null, null, null, null, null, null];
    const queued = view?.codes.filter((code) => codeStatus(code, now) === "queued") ?? [];
    const last = view?.codes.filter((code) => codeStatus(code, now) === "expired").at(-1);
    const status = paymentView?.status ?? null;
    const topUpStatus = paymentView?.topUpStatus ?? [status, paymentView?.otherStatus].find((report) => report?.purpose === "topup") ?? null;
    const activeUntil = subscription?.activeUntil ?? null;
    const refreshAt = subscription?.trial?.state === "active" ? subscription.trial.endsAt : activeUntil;
    const waiting = (subscription?.paymentPending ?? (!!status && ["pending", "superseded"].includes(status.status)))
      || ["pending", "superseded"].includes(paymentView?.otherStatus?.status ?? "")
      || (walletSection && [...checkoutOpenStatuses, "superseded"].some(state => state === topUpStatus?.status));
    const salesOpen = mode === "on";
    const checkoutPublished = subscriptionCheckoutPublished(settings, resolved.config.production);
    const topUpOpen = checkoutPublished && settings !== null &&
      (manualPaymentProvider(settings, "mtn").reason === null || manualPaymentProvider(settings, "airtel").reason === null);
    // Plans are read only for an account with credit or auto-renewal to manage.
    const credit = paymentView?.credit ?? null;
    const offers = walletSection && salesOpen && credit && (credit.availableBalanceUgx > 0 || credit.autoRenew)
      ? await plans().catch(() => []) : [];
    // A waiting, refused or reversed plan report sends the member back to it instead of to a second payment; a top-up has
    // its own notice and leaves Renew in place.
    const reports = paymentView ? [status, paymentView.otherStatus ?? null].filter((report) => report && report.purpose !== "topup") : null;
    const viewPayment = reports ? reports.some((report) => ["pending", "superseded", "rejected", "reversed"].includes(report!.status)) : !!subscription?.paymentPending;
    if (member && !member.blocked) return <PublicShell locale={locale} showAccount workspace>
      <MemberNavigationRecovery expectedPhone={member.phone} expectedAdministrator={false} />
      <ApprovalRefresh waiting={waiting || !!dashboard?.activity.some(entry => entry.kind === "payment" && entry.status === "pending")} refreshAt={refreshAt} />
      <AccountWorkspace locale={locale} current={section} phone={member.phone} returnTo={returnTo}>
        <AccountPageHead><h1>{messages.text(section === "overview" ? "account.title" : `account.section.${section}`)}</h1>
          {summarySection && subscription && (checkoutPublished || viewPayment) && <ButtonLink href={`${memberNextPath("subscribe", returnTo)}#${viewPayment ? "report" : "plans"}`} prefetch={false}>
            {messages.text(viewPayment ? "account.viewPayment" : activeUntil ? "account.renewLabel" : "account.subscribe")}
          </ButtonLink>}
        </AccountPageHead>
        {unavailable && <AccountFine role="status">{messages.text("account.unavailable")}</AccountFine>}
        {parameters.status === "phone-changed" && <AccountFlash role="status">{messages.text("account.phoneChanged")}</AccountFlash>}
        {parameters.status === "password-changed" && <AccountFlash role="status">{messages.text("account.passwordChanged")}</AccountFlash>}
        {parameters.status === "devices-signed-out" && <AccountFlash role="status">{messages.text("account.devicesSignedOut")}</AccountFlash>}
        {summarySection && <AccountSubscriptionPanel key={member.accountId} locale={locale} subscription={subscription} dashboard={dashboard} now={now.getTime()} trialDays={offeredTrialDays(settings)} {...(last ? { lastEnd: last.endsAt } : {})} />}
        {summarySection && <AccountReferralSummary locale={locale} summary={referrals} returnTo={returnTo} />}
        {section === "referrals" && <><AccountReferrals locale={locale} summary={referrals} /><AccountReferralReviews initial={referralReviews} locale={locale} older={!!referralReviewCursor(parameters.reviewBefore)} /></>}
        {section === "overview" && <>
          <AccountPanel title={messages.text("account.signInDetails")} data-account-sign-in
            actions={<AccountActionLink href={accountSectionHref(locale, "phone", returnTo)} prefetch={false}>{messages.text("account.editPhone")}</AccountActionLink>}>
            <AccountFacts $columns={4}>
              <div><dt>{messages.text("account.phoneLabel")}</dt><dd>+{formatPhone(member.phone)}</dd></div>
              <div><dt>{messages.text("account.signedInDevices")}</dt><dd>{view ? messages.plural("account.deviceCount", view.devices.length) : messages.text("account.unknownLabel")}</dd></div>
              <div><dt>{messages.text("account.notificationsLabel")}</dt><dd>{messages.text(member.whatsappNotificationsAt ? "account.enabledLabel" : "account.disabledLabel")}</dd></div>
              <div><dt>{messages.text("account.creditLabel")}</dt><dd>{credit ? formatCredit(credit.balanceUgx) : subscription ? formatCredit(subscription.creditUgx) : messages.text("account.unknownLabel")}</dd></div>
            </AccountFacts>
          </AccountPanel>
          <AccountQuickActions locale={locale} returnTo={returnTo} />
        </>}
        {section === "subscription" && queued.length > 0 && <AccountPanel title={messages.text("account.nextPackages")}>
          {queued.map(code => <AccountFacts key={code.id} style={{ marginBlockEnd: "var(--gh-spacing-5)" }} $columns={3}>
            <div><dt>{messages.text("account.packageLabel")}</dt><dd>{code.planName}</dd></div>
            <div><dt>{messages.text("account.startsLabel")}</dt><dd>{formatSubscriptionExpiry(code.startsAt)}</dd></div>
            <div><dt>{messages.text("account.expiryLabel")}</dt><dd>{formatSubscriptionExpiry(code.endsAt)}</dd></div>
          </AccountFacts>)}
        </AccountPanel>}
        {walletSection && <AccountWallet locale={locale} credit={credit} topUpStatus={topUpStatus} contact={contact}
          phone={member.phone} returnTo={returnTo} topUpOpen={topUpOpen} salesOpen={salesOpen} plans={offers}
          acceptedTerms={paymentView?.acceptedTerms === true} active={!!activeUntil} />}
        {section === "payments" && <>
          <PaymentNotice locale={locale} status={status} settings={contact} phone={member.phone} />
          {paymentView?.otherStatus && <PaymentNotice locale={locale} status={paymentView.otherStatus} settings={contact} phone={member.phone} />}
          <AccountPaymentHistory locale={locale} dashboard={dashboard} />
        </>}
        {(section === "phone" || section === "password") && <AccountPanel narrow title={messages.text(section === "phone" ? "account.phonePanel" : "account.passwordPanel")}>
          {section === "phone" && <AccountFine style={{ marginBlockEnd: "var(--gh-spacing-4)" }}>+{formatPhone(member.phone)}</AccountFine>}
          <AccountSecurityForm key={section} task={section} locale={locale} contact={contact} cancelHref={accountSectionHref(locale, "overview", returnTo)} />
        </AccountPanel>}
        {section === "devices" && <AccountDevices locale={locale} devices={view?.devices.map(device => ({ at: device.lastSeenAt.toISOString(), current: device.tokenHash === member.tokenHash })) ?? null} />}
        {section === "notifications" && <>
          <AccountNotifications locale={locale} page={notifications} older={!!notificationCursor(parameters.before)} />
          <AccountPanel narrow title={messages.text("notifications.whatsappPreferences")}><AccountNotificationPreferences locale={locale} phone={member.phone} whatsappNotificationsAt={member.whatsappNotificationsAt?.toISOString() ?? null} /></AccountPanel>
        </>}
        {section === "activity" && <AccountActivity locale={locale} dashboard={dashboard} />}
      </AccountWorkspace>
    </PublicShell>;
    return <PublicShell locale={locale} showAccount><Stack $gap="md">
      <MemberNavigationRecovery expectedPhone={null} />
      {!member ? <>
        {parameters.status === "signed-out" && <p role="status">{messages.text("account.signedOut")}</p>}
        <AccountAuthForm key={authView} locale={locale} view={authView} returnTo={returnTo} contact={contact} />
      </> : <MemberPanel><p role="status">{messages.text("account.refused")}</p><MemberSignOut><SignOutIcon />{messages.text("auth.signOut")}</MemberSignOut></MemberPanel>}
    </Stack></PublicShell>;
  };
}

export const AccountRoute = createAccountRoute();
