import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MemberNavigationRecovery, MemberPanel, MemberSignOut } from "@/components/members/member-controls";
import { AccountAuthForm, type AccountAuthView } from "@/components/members/account-auth-form";
import { AccountBlock, AccountBlockActions, AccountBlockText, AccountFlash, AccountLogOut, AccountSheet } from "@/components/members/account-overview";
import { AccountSettings, ResetPasswordForm } from "@/components/members/account-security";
import { AccountNotificationPreferences } from "@/components/members/account-notification-preferences";
import { AccountActivity } from "@/components/members/account-activity";
import { AccountVerificationForm } from "@/components/members/account-verification";
import { AccountCard, AccountCardBody } from "@/components/members/account-styles";
import { CreditSection } from "@/components/members/credit-controls";
import { ApprovalRefresh, PaymentNotice } from "@/components/members/payment-status";
import { richText } from "@/components/members/rich-text";
import { ButtonLink } from "@/components/ui/controls";
import { Stack } from "@/components/ui/layout";
import { SignOutIcon } from "@/components/ui/icons";
import { memberNextPath, memberReturnPath } from "@/domain/member-navigation";
import { adminLandingPath } from "@/domain/admin-navigation";
import { publicSupportContactSettings } from "@/domain/public-subscription-settings";
import { formatSubscriptionExpiry, subscriptionTimeLeft } from "@/domain/subscription-expiry";
import { codeStatus, formatPeriodEnd } from "@/domain/subscription-period";
import { createMessages } from "@/i18n/messages";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { getAnalyticsServices } from "@/server/analytics/analytics-http";
import { getMemberServices, type MemberServicesSource } from "@/server/members/member-http";
import { createPlansService } from "@/server/members/plans";
import { memberCookieName, type MemberIdentity } from "@/server/members/member-sessions";
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
    const resolved = await services(), settings = resolved.settings.settings;
    const token = (await cookies()).get(memberCookieName(resolved.config.production))?.value;
    const returnTo = memberReturnPath(parameters.return);
    const contact = { ...publicSupportContactSettings(settings), reviewTime: settings?.reviewTime ?? null };
    // Old reset links enter the same code-based recovery flow.
    const authView: AccountAuthView = parameters.view === "register" ? "register" : parameters.view === "forgot" || parameters.view === "reset" ? "forgot" : "login";
    const mode = settings?.paywallMode;
    let currentMember: MemberIdentity | null = null, unavailable = mode === undefined || !resolved.sessions;
    if (resolved.sessions) {
      try { currentMember = await resolved.sessions.verify(token); }
      catch { unavailable = true; }
    }
    // Administrator sign-in is independent of subscription settings and every account subview.
    const administrator = !!currentMember && !currentMember.blocked && !!currentMember.administrator;
    if (administrator) redirect(adminLandingPath);
    const member = currentMember;
    const reset = await resolved.auth?.passwordResetSession(token).catch(() => null);
    if (reset) return <PublicShell locale={locale} showAccount><AccountCard><AccountCardBody><ResetPasswordForm locale={locale} phone={reset.phone} returnTo={returnTo} contact={contact} /></AccountCardBody></AccountCard></PublicShell>;
    if (authView === "forgot") return <PublicShell locale={locale} showAccount><AccountAuthForm locale={locale} view="forgot" returnTo={returnTo} contact={contact} /></PublicShell>;
    const verification = await resolved.auth?.verificationSession(token).catch(() => null);
    if (verification) return <PublicShell locale={locale} showAccount><AccountVerificationForm locale={locale} phone={verification.phone} returnTo={returnTo} contact={contact} /></PublicShell>;
    const now = new Date();
    const [view, paymentView, subscription, dashboard] = member && !member.blocked ? await Promise.all([
      member.codeEnteredAt ? resolved.codes?.accountView(member).catch(() => null) ?? null : null,
      settings ? resolved.payments?.view(member).catch(() => null) ?? null : null,
      resolved.codes?.subscriptionStatus(member).catch(() => null) ?? null,
      resolved.dashboard?.read(member).catch(() => null) ?? null,
    ]) : [null, null, null, null];
    const queued = view?.codes.filter((code) => codeStatus(code, now) === "queued") ?? [];
    const last = view?.codes.filter((code) => codeStatus(code, now) === "expired").at(-1);
    const status = paymentView?.status ?? null;
    const activeUntil = subscription?.activeUntil ?? null;
    const waiting = (subscription?.paymentPending ?? (!!status && ["pending", "superseded"].includes(status.status)))
      || ["pending", "superseded"].includes(paymentView?.otherStatus?.status ?? "");
    const salesOpen = !!settings && mode !== "off";
    // Plans are read only for an account with credit or auto-renewal to manage.
    const credit = paymentView?.credit ?? null;
    const hasCredit = !!credit && (credit.balanceUgx !== 0 || credit.autoRenew || credit.history.length > 0);
    const offers = hasCredit && salesOpen ? await plans().catch(() => []) : [];
    // A waiting, refused or reversed plan report sends the member back to it instead of to a second payment; a top-up has
    // its own notice and leaves Renew in place.
    const reports = paymentView ? [status, paymentView.otherStatus ?? null].filter((report) => report && report.purpose !== "topup") : null;
    const viewPayment = reports ? reports.some((report) => ["pending", "superseded", "rejected", "reversed"].includes(report!.status)) : !!subscription?.paymentPending;
    const accessEnd = activeUntil ? new Date(activeUntil) : null, left = accessEnd && subscriptionTimeLeft(accessEnd, now.getTime());
    const until = accessEnd && <strong><time dateTime={activeUntil!}>{formatSubscriptionExpiry(accessEnd)}</time></strong>;
    const access = !subscription ? messages.text("account.subscriptionUnavailable")
      : left ? richText(messages.text("account.accessUntilLeft"), { until, left: left.unit === "day" ? messages.plural("account.daysFromNow", left.count)
        : left.count ? messages.plural("account.hoursFromNow", left.count) : messages.text("account.underAnHourFromNow") })
      : accessEnd ? richText(messages.text("account.accessUntilSentence"), { until })
      : last ? richText(messages.text("account.accessEnded"), { end: <strong>{formatPeriodEnd(last.endsAt)}</strong> }) : messages.text("account.noAccess");
    return <PublicShell locale={locale} showAccount><Stack $gap="md">
      <MemberNavigationRecovery />
      {unavailable && <p role="status">{messages.text("account.unavailable")}</p>}
      {!member ? <>
        {parameters.status === "signed-out" && <p role="status">{messages.text("account.signedOut")}</p>}
        <AccountAuthForm key={authView} locale={locale} view={authView} returnTo={returnTo} contact={contact} />
      </> : member.blocked ? <MemberPanel><p role="status">{messages.text("account.refused")}</p><MemberSignOut><SignOutIcon />{messages.text("auth.signOut")}</MemberSignOut></MemberPanel> : <AccountSheet data-account-details>
        <h1>{messages.text("account.yourAccount")}</h1>
        {parameters.status === "phone-changed" && <AccountFlash role="status">{messages.text("account.phoneChanged")}</AccountFlash>}
        {parameters.status === "password-changed" && <AccountFlash role="status">{messages.text("account.passwordChanged")}</AccountFlash>}
        <ApprovalRefresh waiting={waiting} refreshAt={activeUntil} />
        <AccountBlock data-subscription-summary={!subscription ? "unavailable" : activeUntil ? "active" : "inactive"}>
          <AccountBlockText>
            {activeUntil && dashboard?.activePlanName && <p data-active-package>{richText(messages.text("account.currentPackage"), { plan: <strong>{dashboard.activePlanName}</strong> })}</p>}
            <p>{access}</p>
            {queued.map((code) => <p key={code.id}>{messages.text("account.queued", { plan: code.planName, start: formatPeriodEnd(code.startsAt), end: formatPeriodEnd(code.endsAt) })}</p>)}
          </AccountBlockText>
          {subscription && salesOpen && <AccountBlockActions>
            {subscription && salesOpen && <ButtonLink href={`${memberNextPath("subscribe", returnTo)}#${viewPayment ? "report" : "plans"}`} prefetch={false}>
              {messages.text(viewPayment ? "account.viewPayment" : activeUntil ? "account.extend" : "account.subscribe")}</ButtonLink>}
          </AccountBlockActions>}
        </AccountBlock>
        <PaymentNotice locale={locale} status={status} settings={contact} phone={member.phone} />
        {paymentView?.otherStatus && <PaymentNotice locale={locale} status={paymentView.otherStatus} settings={contact} phone={member.phone} />}
        {credit && hasCredit && <CreditSection locale={locale} credit={credit} plans={offers} salesOpen={salesOpen} acceptedTerms={!!paymentView?.acceptedTerms} active={!!activeUntil} />}
        <AccountActivity locale={locale} dashboard={dashboard} />
        <AccountSettings locale={locale} phone={member.phone} contact={contact} returnTo={returnTo} devices={view ? view.devices.map((device) => formatPeriodEnd(device.lastSeenAt)) : null} />
        <AccountNotificationPreferences locale={locale} phone={member.phone} whatsappNotificationsAt={member.whatsappNotificationsAt?.toISOString() ?? null} />
        <AccountLogOut locale={locale} />
      </AccountSheet>}
    </Stack></PublicShell>;
  };
}

export const AccountRoute = createAccountRoute();
