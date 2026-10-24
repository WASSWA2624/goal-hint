import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MemberForm, MemberNavigationRecovery, MemberPanel, MemberSignOut } from "@/components/members/member-controls";
import { AccountAuthForm, type AccountAuthView } from "@/components/members/account-auth-form";
import { AccountSettings, ResetPasswordForm } from "@/components/members/account-security";
import { AccountVerificationForm } from "@/components/members/account-verification";
import { AccountCard, AccountCardBody, AccountCardHeading, AccountSection } from "@/components/members/account-styles";
import { CreditSection } from "@/components/members/credit-controls";
import { ApprovalRefresh, PaymentStatusCard, TrialStatusCard } from "@/components/members/payment-status";
import { TrialRequest } from "@/components/members/subscribe-controls";
import { SubscriptionSummaryCard } from "@/components/members/subscription-summary-card";
import { Button } from "@/components/ui/controls";
import { Stack } from "@/components/ui/layout";
import { ChevronDownIcon, SignOutIcon, UserIcon } from "@/components/ui/icons";
import { memberReturnPath } from "@/domain/member-navigation";
import { adminLandingPath } from "@/domain/admin-navigation";
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
    const contact = { contactPhone: settings?.contactPhone ?? null, whatsappPhone: settings?.whatsappPhone ?? null, reviewTime: settings?.reviewTime ?? null };
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
    const [view, paymentView, subscription] = member && !member.blocked ? await Promise.all([
      member.codeEnteredAt ? resolved.codes?.accountView(member).catch(() => null) ?? null : null,
      settings ? resolved.payments?.view(member, settings).catch(() => null) ?? null : null,
      resolved.codes?.subscriptionStatus(member).catch(() => null) ?? null,
    ]) : [null, null, null];
    const queued = view?.codes.filter((code) => codeStatus(code, now) === "queued") ?? [];
    const last = view?.codes.filter((code) => codeStatus(code, now) === "expired").at(-1);
    const status = paymentView?.status ?? null;
    const activeUntil = subscription?.activeUntil ?? null;
    const waiting = (subscription?.paymentPending ?? (!!status && ["pending", "superseded"].includes(status.status)))
      || ["pending", "superseded"].includes(paymentView?.otherStatus?.status ?? "");
    const salesOpen = !!settings && mode !== "off";
    // Plans are read only for an account with credit or auto-renewal to manage.
    const credit = paymentView?.credit ?? null;
    const offers = credit && salesOpen && (credit.balanceUgx !== 0 || credit.autoRenew || credit.history.length) ? await plans().catch(() => []) : [];
    // A granted trial unlocks the account's devices; a dismissed one stops waiting.
    const trialPending = !!paymentView?.trialPending && !activeUntil;
    return <PublicShell locale={locale} showAccount><Stack $gap="md">
      <MemberNavigationRecovery />
      {unavailable && <p role="status">{messages.text("account.unavailable")}</p>}
      {!member ? <>
        {parameters.status === "signed-out" && <p role="status">{messages.text("account.signedOut")}</p>}
        <AccountAuthForm key={authView} locale={locale} view={authView} returnTo={returnTo} contact={contact} />
      </> : member.blocked ? <MemberPanel><p role="status">{messages.text("account.refused")}</p><MemberSignOut><SignOutIcon />{messages.text("account.logOut")}</MemberSignOut></MemberPanel> : <AccountCard data-account-details>
        <AccountCardHeading><UserIcon /><h1>{messages.text("account.title")}</h1></AccountCardHeading>
        <AccountCardBody>
          {parameters.status === "phone-changed" && <p role="status">{messages.text("account.phoneChanged")}</p>}
          {parameters.status === "password-changed" && <p role="status">{messages.text("account.passwordChanged")}</p>}
          <ApprovalRefresh waiting={waiting || trialPending} refreshAt={activeUntil} />
          <SubscriptionSummaryCard locale={locale} subscription={subscription} canSubscribe={salesOpen} returnTo={returnTo} paymentNeedsAttention={[status, paymentView?.otherStatus].some((report) => report?.status === "rejected" || report?.status === "reversed")} />
          {trialPending && <TrialStatusCard locale={locale} settings={contact} phone={member.phone} heading="h2" />}
          <PaymentStatusCard locale={locale} status={status} settings={contact} phone={member.phone} heading="h2" />
          {paymentView?.otherStatus && <PaymentStatusCard locale={locale} status={paymentView.otherStatus} settings={contact} phone={member.phone} heading="h2" />}
          {credit && (credit.balanceUgx !== 0 || credit.autoRenew || credit.history.length > 0) && <AccountSection open data-account-credit>
            <summary>{messages.text("credit.title")}<ChevronDownIcon /></summary><div>
              <CreditSection locale={locale} credit={credit} plans={offers} salesOpen={salesOpen} acceptedTerms={!!paymentView?.acceptedTerms} /></div></AccountSection>}
          <AccountSettings locale={locale} phone={member.phone} contact={contact} returnTo={returnTo} />
          {(view || salesOpen && paymentView?.trialEligible) && <AccountSection>
            <summary>{messages.text("account.accessSettings")}<ChevronDownIcon /></summary><div>
            {view && <>
              {!activeUntil && last && <p>{messages.text("account.accessEnded", { end: formatPeriodEnd(last.endsAt) })}</p>}
              {queued.map((code) => <p key={code.id}>{messages.text("account.queued", { plan: code.planName, start: formatPeriodEnd(code.startsAt), end: formatPeriodEnd(code.endsAt) })}</p>)}
            </>}
            {salesOpen && paymentView?.trialEligible && <TrialRequest locale={locale} days={settings!.trialDays} />}
            {view && <><h2>{messages.text("account.devices")}</h2>
              {view.devices.map((device, index) => <p key={index}>{messages.text("account.deviceLastUsed", { number: String(index + 1), at: formatPeriodEnd(device.lastSeenAt) })}</p>)}
              <MemberForm method="post" action="/api/account/devices" data-analytics-ignore><Button type="submit" variant="secondary">{messages.text("account.signOutOthers")}</Button></MemberForm>
            </>}
          </div></AccountSection>}
          <MemberSignOut><SignOutIcon />{messages.text("account.logOut")}</MemberSignOut>
        </AccountCardBody>
      </AccountCard>}
    </Stack></PublicShell>;
  };
}

export const AccountRoute = createAccountRoute();
