import "server-only";

import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MemberNavigationRecovery, MemberPanel, MemberSignOut } from "@/components/members/member-controls";
import { AccountAuthForm, type AccountAuthView } from "@/components/members/account-auth-form";
import { AccountActionLink, AccountFine, AccountFlash } from "@/components/members/account-overview";
import { AccountSecurityForm, ResetPasswordForm } from "@/components/members/account-security";
import { AccountFacts, AccountFormPanel, AccountPanel, AccountSectionActions, AccountWorkspace } from "@/components/members/account-workspace";
import { AccountWallet } from "@/components/members/account-wallet";
import { AccountDevices, AccountSubscriptionPanel } from "@/components/members/account-panels";
import { AccountPayments } from "@/components/members/account-payments";
import { AccountNotifications } from "@/components/members/account-notifications";
import { AccountActivity } from "@/components/members/account-activity";
import { AccountReferrals, AccountReferralSummary } from "@/components/members/account-referrals";
import { AccountReferralReviews } from "@/components/members/account-referral-reviews";
import { AccountVerificationForm, LegacyPasswordCodeForm } from "@/components/members/account-verification";
import { ApprovalRefresh } from "@/components/members/payment-status";
import { Stack } from "@/components/ui/layout";
import { DocumentButtonLink } from "@/components/ui/controls";
import { SignOutIcon } from "@/components/ui/icons";
import { AppLoading } from "@/components/navigation/navigation-progress";
import { logoutUnconfirmedStatus, memberLandingPath, memberNextPath, memberReturnPath, passwordResetSuccessStatus, subscriptionReturnPath } from "@/domain/member-navigation";
import { publicSupportContactSettings } from "@/domain/public-subscription-settings";
import { hasManualPaymentProvider } from "@/domain/subscription-settings";
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
import { resolveLocale } from "@/i18n/locales";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { getAnalyticsServices } from "@/server/analytics/analytics-http";
import { getMemberAuthServices, getMemberServices, type MemberAuthServicesSource, type MemberServices, type MemberServicesSource } from "@/server/members/member-http";
import { createPlansService } from "@/server/members/plans";
import { memberCookieName } from "@/server/members/member-sessions";
import { readMemberPageSession } from "@/server/members/member-page-session";
import { flutterwaveCheckoutPublished, payableCheckoutPlans, subscriptionCheckoutPublished } from "@/server/members/sales-readiness";
import { ServerThemeUntilHydrated } from "@/styles/provider";
import { PublicShell } from "./public-shell";

async function readPlans() {
  const { database } = await getAnalyticsServices();
  return database ? (await createPlansService(database).list()).filter((plan) => plan.active) : [];
}

const identityDeadlineMs = 10_000;

async function accountIdentity(read: () => Promise<Awaited<ReturnType<MemberAuthServicesSource>> | null>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const resolved = await read();
        if (!resolved) return { kind: "unavailable" } as const;
        const token = (await cookies()).get(memberCookieName(resolved.config.production))?.value;
        return readMemberPageSession(resolved, token);
      })(),
      new Promise<{ kind: "unavailable" }>(resolve => { timer = setTimeout(() => resolve({ kind: "unavailable" }), identityDeadlineMs); }),
    ]);
  } catch { return { kind: "unavailable" } as const; }
  finally { clearTimeout(timer); }
}

function contactFor(settings: MemberServices["settings"]["settings"] | undefined) {
  return { ...publicSupportContactSettings(settings), reviewTime: settings?.reviewTime ?? null };
}

export function createAccountRoute({ services = getMemberServices, plans = readPlans,
  auth = services === getMemberServices ? getMemberAuthServices : services }: {
  services?: MemberServicesSource; plans?: () => Promise<readonly SubscriptionPlanView[]>; auth?: MemberAuthServicesSource;
} = {}) {
  return async function AccountRoute({ locale, searchParams }: {
    locale: string; searchParams: Promise<Record<string, string | string[] | undefined>>;
  }) {
    const messages = createMessages(locale), parameters = await searchParams;
    const logoutWarning = parameters.status === logoutUnconfirmedStatus
      ? <AccountFlash role="alert">{messages.text("account.logoutUnconfirmed")}</AccountFlash> : null;
    let servicesRead: Promise<MemberServices | null> | undefined;
    const readServices = () => servicesRead ??= services().catch(() => null);
    const readContact = () => readServices().then(resolved => contactFor(resolved?.settings.settings));
    const retryQuery = new URLSearchParams();
    for (const [name, value] of Object.entries(parameters)) {
      for (const field of Array.isArray(value) ? value : value === undefined ? [] : [value]) retryQuery.append(name, field);
    }
    const retryHref = `/${resolveLocale(locale)}/account${retryQuery.size ? `?${retryQuery}` : ""}`;
    const unavailablePanel = <MemberPanel data-account-unavailable><Stack $gap="sm">
      <p role="alert">{messages.text("account.unavailable")}</p>
      <DocumentButtonLink href={retryHref} variant="secondary">{messages.text("feed.retry")}</DocumentButtonLink>
    </Stack></MemberPanel>;
    const checkout = parameters.checkout === "1";
    const returnTo = checkout ? subscriptionReturnPath(parameters.return) : memberReturnPath(parameters.return);
    const section = accountSection(parameters.section), summarySection = section === "overview" || section === "subscription";
    const walletSection = section === "wallet";
    // Older Forgot password URLs still open the recovery dialog.
    const authView: AccountAuthView = parameters.view === "register" ? "register" : parameters.view === "forgot" || parameters.view === "reset" ? "forgot" : "login";
    const session = await accountIdentity(auth === services ? readServices : auth);
    if (session.kind === "unavailable") return <PublicShell locale={locale} showAccount><Stack $gap="md">
      <MemberNavigationRecovery />{logoutWarning}{unavailablePanel}
    </Stack></PublicShell>;
    const member = session.kind === "member" ? session.member : null;
    // Administrator sign-in is independent of subscription settings and every account subview.
    if (member && !member.blocked && member.administrator) redirect(memberLandingPath(true, returnTo, checkout));
    if (session.kind === "reset") return <PublicShell locale={locale} showAccount><MemberNavigationRecovery expectedPhone={null} />
      <Suspense fallback={<AppLoading />}><ServerThemeUntilHydrated><ResetForm phone={session.phone} /></ServerThemeUntilHydrated></Suspense>
    </PublicShell>;
    async function ResetForm({ phone }: { phone: string }) {
      return <ResetPasswordForm locale={locale} phone={phone} returnTo={returnTo} checkout={checkout} contact={await readContact()} />;
    }
    if (parameters.view === "reset-code" && !member) return <PublicShell locale={locale} showAccount>
      <MemberNavigationRecovery expectedPhone={null} />
      <Suspense fallback={<AppLoading />}><ServerThemeUntilHydrated><CodeForm {...(session.kind === "verification" ? { phone: session.phone } : {})} /></ServerThemeUntilHydrated></Suspense>
    </PublicShell>;
    async function CodeForm({ phone }: { phone?: string }) {
      return <LegacyPasswordCodeForm locale={locale} {...(phone ? { phone } : {})}
        returnTo={returnTo} checkout={checkout} contact={await readContact()} />;
    }
    if (session.kind === "verification") return <PublicShell locale={locale} showAccount>
      <MemberNavigationRecovery expectedPhone={null} />
      <Suspense fallback={<AppLoading />}><ServerThemeUntilHydrated><VerificationForm phone={session.phone} /></ServerThemeUntilHydrated></Suspense>
    </PublicShell>;
    async function VerificationForm({ phone }: { phone: string }) {
      return <AccountVerificationForm key={authView} locale={locale} phone={phone} returnTo={returnTo} checkout={checkout} contact={await readContact()}
        openRecovery={authView === "forgot"} />;
    }
    if (authView === "forgot" && member && !member.blocked) redirect(accountSectionHref(locale, "password", returnTo));
    if (authView === "forgot" && !member) return <PublicShell locale={locale} showAccount><MemberNavigationRecovery expectedPhone={null} />
      <AccountAuthForm locale={locale} view="forgot" returnTo={returnTo} checkout={checkout} contact={readContact()} />
    </PublicShell>;
    if (member && !member.blocked && typeof parameters.view === "string" && ["login", "register", "verify", "new-password", "reset-code"].includes(parameters.view))
      redirect(memberLandingPath(false, returnTo, checkout));
    if (member && !member.blocked) {
      const verified = member;
      async function WorkspaceData() {
        const member = verified, resolved = await readServices();
        if (!resolved) return unavailablePanel;
        const settings = resolved.settings.settings;
        const mode = settings?.paywallMode, unavailable = mode === undefined;
        const canReadReferrals = member.phoneVerified === true, contact = contactFor(settings);
        const now = new Date();
        const [view, paymentView, subscription, dashboard, referrals, notifications, referralReviews] = await Promise.all([
          summarySection || section === "devices" ? resolved.codes?.accountView(member).catch(() => null) ?? null : null,
          (walletSection || settings && (summarySection || section === "payments")) ? resolved.payments?.view(member).catch(() => null) ?? null : null,
          summarySection || section === "payments" || walletSection ? resolved.codes?.subscriptionStatus(member).catch(() => null) ?? null : null,
          summarySection || section === "payments" || section === "activity" ? resolved.dashboard?.read(member).catch(() => null) ?? null : null,
          canReadReferrals && (section === "overview" || section === "referrals") ? resolved.referrals?.read(member).catch(() => null) ?? null : null,
          section === "notifications" ? resolved.notifications?.read(member, parameters.before).catch(() => null) ?? null : null,
          canReadReferrals && section === "referrals" ? resolved.referralReviews?.member(member, referralReviewCursor(parameters.reviewBefore) ? parameters.reviewBefore as string : undefined).catch(() => null) ?? null : null,
        ]);
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
        const flutterwavePublished = !!resolved.checkout?.flutterwaveReady
          && flutterwaveCheckoutPublished(settings, resolved.config.production && resolved.checkout.flutterwaveMode !== "sandbox");
        const topUpOpen = checkoutPublished && hasManualPaymentProvider(settings);
        const credit = paymentView?.credit ?? null;
        // Existing plan reports remain accessible through closed sales. Top-ups keep their own notice in Wallet.
        const viewPayment = paymentView
          ? [status, paymentView.otherStatus].some(report => report && report.purpose !== "topup" &&
            [...checkoutOpenStatuses, "provider-pending", "superseded", "rejected", "reversed"].some(state => state === report.status))
          : !!subscription?.paymentPending;
        const canReadOffers = !!member && !member.blocked && (summarySection && !!subscription && (checkoutPublished || flutterwavePublished) && !viewPayment
          || walletSection && salesOpen && !!credit && (credit.availableBalanceUgx > 0 || credit.autoRenew));
        const offers = canReadOffers ? await plans().catch(() => []) : [];
        const canPurchase = summarySection && (checkoutPublished || flutterwavePublished)
          && payableCheckoutPlans(offers, checkoutPublished ? settings : null, checkoutPublished ? credit?.availableBalanceUgx ?? 0 : 0, flutterwavePublished).length > 0;
        const subscriptionAction = viewPayment || canPurchase ? {
          href: `${memberNextPath("subscribe", returnTo)}#${viewPayment ? "report" : "plans"}`,
          label: messages.text(viewPayment ? "account.viewPayment" : activeUntil ? "account.extend"
            : subscription?.expired || last ? "account.renewLabel" : "account.subscribe"),
        } : null;
        return <>
          <ApprovalRefresh waiting={waiting || !!dashboard?.activity.some(entry => entry.kind === "payment" && entry.status === "pending")} refreshAt={refreshAt} />
            {unavailable && <AccountFine role="status">{messages.text("account.unavailable")}</AccountFine>}
            {parameters.status === "phone-changed" && <AccountFlash role="status">{messages.text("account.phoneChanged")}</AccountFlash>}
            {parameters.status === "password-changed" && <AccountFlash role="status">{messages.text("account.passwordChanged")}</AccountFlash>}
            {parameters.status === "devices-signed-out" && <AccountFlash role="status">{messages.text("account.devicesSignedOut")}</AccountFlash>}
            {summarySection && <AccountSubscriptionPanel key={member.accountId} locale={locale} subscription={subscription} dashboard={dashboard}
              trialDays={offeredTrialDays(settings)} showTitle={section === "overview"} action={subscriptionAction}
              salesAvailable={canPurchase} {...(last ? { lastEnd: last.endsAt } : {})} />}
            {section === "overview" && canReadReferrals && <AccountReferralSummary locale={locale} summary={referrals} returnTo={returnTo} />}
            {section === "referrals" && (canReadReferrals
              ? <><AccountReferrals locale={locale} summary={referrals} returnTo={returnTo} redemptionOpen={salesOpen} /><AccountReferralReviews initial={referralReviews} locale={locale} returnTo={returnTo} older={!!referralReviewCursor(parameters.reviewBefore)} /></>
              : <AccountFine>{messages.text("referrals.phoneEligibility")}</AccountFine>)}
            {section === "overview" && <>
              <AccountPanel title={messages.text("account.signInDetails")} data-account-sign-in>
                <AccountFacts $columns={3}>
                  <div><dt>{messages.text("account.phoneLabel")}</dt><dd>+{formatPhone(member.phone)}</dd></div>
                  <div><dt>{messages.text("account.signedInDevices")}</dt><dd>{view ? messages.plural("account.deviceCount", view.devices.length) : messages.text("account.unknownLabel")}</dd></div>
                  <div><dt>{messages.text("account.creditLabel")}</dt><dd>{credit ? formatCredit(credit.balanceUgx) : subscription ? formatCredit(subscription.creditUgx) : messages.text("account.unknownLabel")}</dd></div>
                </AccountFacts>
                <AccountSectionActions>
                  <AccountActionLink href={accountSectionHref(locale, "phone", returnTo)} prefetch={false}>{messages.text("account.changePhone")}</AccountActionLink>
                  <AccountActionLink href={accountSectionHref(locale, "password", returnTo)} prefetch={false}>{messages.text("account.changePassword")}</AccountActionLink>
                  <AccountActionLink href={accountSectionHref(locale, "devices", returnTo)} prefetch={false}>{messages.text("account.manageDevices")}</AccountActionLink>
                </AccountSectionActions>
              </AccountPanel>
            </>}
            {section === "subscription" && queued.length > 0 && <AccountPanel title={messages.text("account.nextPackages")}>
              {queued.map(code => <AccountFacts key={code.id} $columns={3}>
                <div><dt>{messages.text("account.packageLabel")}</dt><dd>{code.planName}</dd></div>
                <div><dt>{messages.text("account.startsLabel")}</dt><dd>{formatSubscriptionExpiry(code.startsAt)}</dd></div>
                <div><dt>{messages.text("account.expiryLabel")}</dt><dd>{formatSubscriptionExpiry(code.endsAt)}</dd></div>
              </AccountFacts>)}
            </AccountPanel>}
            {walletSection && <AccountWallet locale={locale} credit={credit} topUpStatus={topUpStatus} contact={contact}
              phone={member.phone} returnTo={returnTo} topUpOpen={topUpOpen} salesOpen={salesOpen} plans={offers}
              acceptedTerms={paymentView?.acceptedTerms === true} active={!!activeUntil} />}
            {section === "payments" && <AccountPayments locale={locale} dashboard={dashboard} reports={[status, paymentView?.otherStatus]}
              contact={contact} phone={member.phone} returnTo={returnTo} />}
            {(section === "phone" || section === "password") && <AccountFormPanel>
              {section === "phone" && <AccountFacts>
                <div><dt>{messages.text("account.phoneLabel")}</dt><dd>+{formatPhone(member.phone)}</dd></div>
              </AccountFacts>}
              <AccountSecurityForm key={section} task={section} locale={locale} contact={contact} cancelHref={accountSectionHref(locale, "overview", returnTo)} />
            </AccountFormPanel>}
            {section === "devices" && <AccountDevices locale={locale} devices={view?.devices.map(device => ({ at: device.lastSeenAt.toISOString(), current: device.tokenHash === member.tokenHash })) ?? null} />}
            {section === "notifications" && <AccountNotifications locale={locale} page={notifications} returnTo={returnTo} older={!!notificationCursor(parameters.before)} />}
            {section === "activity" && <AccountActivity locale={locale} dashboard={dashboard} />}
        </>;
      }
      return <PublicShell locale={locale} showAccount workspace>
        <MemberNavigationRecovery expectedPhone={member.phone} expectedAdministrator={false} />
        <AccountWorkspace locale={locale} current={section} phone={member.phone} returnTo={returnTo}>
          <Suspense fallback={<AppLoading />}><ServerThemeUntilHydrated><WorkspaceData /></ServerThemeUntilHydrated></Suspense>
        </AccountWorkspace>
      </PublicShell>;
    }
    return <PublicShell locale={locale} showAccount><Stack $gap="md">
      <MemberNavigationRecovery expectedPhone={null} />
      {!member ? <>
        {logoutWarning}
        {parameters.status === "signed-out" && <p role="status">{messages.text("account.signedOut")}</p>}
        {parameters.status === passwordResetSuccessStatus && <AccountFlash role="status">{messages.text("account.recoveryCompleted")}</AccountFlash>}
        <AccountAuthForm key={authView} locale={locale} view={authView} returnTo={returnTo} checkout={checkout} contact={readContact()} />
      </> : <MemberPanel><p role="status">{messages.text("account.refused")}</p><MemberSignOut><SignOutIcon />{messages.text("auth.signOut")}</MemberSignOut></MemberPanel>}
    </Stack></PublicShell>;
  };
}

export const AccountRoute = createAccountRoute();
