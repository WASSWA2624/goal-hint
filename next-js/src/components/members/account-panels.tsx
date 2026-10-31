import type { AccountDashboard } from "@/domain/account-dashboard";
import type { SubscriptionStatus } from "@/domain/subscription-summary";
import { accountSectionHref } from "@/domain/account-navigation";
import { formatSubscriptionExpiry, subscriptionTimeLeft } from "@/domain/subscription-expiry";
import { createMessages } from "@/i18n/messages";
import { Button, ButtonLink } from "@/components/ui/controls";
import { AccountFacts, AccountPanel, AccountSectionActions, AccountStatus } from "./account-workspace";
import { AccountActionLink, AccountFine } from "./account-overview";
import { AccountActivity } from "./account-activity";

export function AccountSubscriptionPanel({ locale, subscription, dashboard, now, lastEnd }: {
  locale: string; subscription: SubscriptionStatus | null; dashboard: AccountDashboard | null; now: number; lastEnd?: Date;
}) {
  const m = createMessages(locale), active = !!subscription?.activeUntil;
  const endsAt = subscription?.activeUntil ? new Date(subscription.activeUntil) : lastEnd;
  const left = active && endsAt ? subscriptionTimeLeft(endsAt, now) : null;
  const remaining = !subscription ? m.text("account.unknownLabel") : !left ? "—" : left.unit === "day"
    ? m.plural("paywall.days", left.count) : left.count ? m.plural("account.hoursRemaining", left.count) : m.text("account.underHourRemaining");
  return <AccountPanel title={m.text("account.section.subscription")} data-subscription-summary={!subscription ? "unavailable" : active ? "active" : "inactive"}
    actions={<AccountStatus $active={active}>
      {m.text(!subscription ? "account.unknownLabel" : active ? "account.activeLabel" : subscription.expired || lastEnd ? "account.expiredLabel" : "account.inactiveLabel")}
    </AccountStatus>}>
    {!subscription && <AccountFine role="status">{m.text("account.subscriptionUnavailable")}</AccountFine>}
    <AccountFacts $columns={3}>
      <div><dt>{m.text("account.packageLabel")}</dt><dd {...(active && dashboard?.activePlanName ? { "data-active-package": "" } : {})}>
        {active ? dashboard?.activePlanName ?? m.text("account.unknownLabel") : subscription ? m.text("account.noneLabel") : m.text("account.unknownLabel")}
      </dd></div>
      <div><dt>{m.text(!active && lastEnd ? "account.endedLabel" : "account.expiryLabel")}</dt><dd>
        {endsAt ? <time dateTime={endsAt.toISOString()}>{formatSubscriptionExpiry(endsAt)}</time> : subscription ? "—" : m.text("account.unknownLabel")}
      </dd></div>
      <div><dt>{m.text("account.remainingLabel")}</dt><dd>{remaining}</dd></div>
    </AccountFacts>
  </AccountPanel>;
}

export function AccountPaymentHistory({ locale, dashboard }: { locale: string; dashboard: AccountDashboard | null }) {
  const m = createMessages(locale);
  if (!dashboard) return <AccountPanel title={m.text("account.recentPayments")}><AccountFine role="status">{m.text("account.paymentsUnavailable")}</AccountFine></AccountPanel>;
  const activity = dashboard.activity.filter(entry => entry.kind === "payment");
  return activity.length ? <AccountActivity locale={locale} dashboard={{ ...dashboard, activity }} title="account.recentPayments" />
    : <AccountPanel title={m.text("account.recentPayments")}><AccountFine>{m.text("account.noPayments")}</AccountFine></AccountPanel>;
}

export function AccountDevices({ locale, devices }: { locale: string; devices: readonly { at: string; current: boolean }[] | null }) {
  const m = createMessages(locale);
  return <AccountPanel narrow title={m.text("account.unlockedDevices")} data-account-devices>
    {devices === null ? <AccountFine role="status">{m.text("account.devicesUnavailable")}</AccountFine>
      : devices.length ? <>
        {devices.map((device, index) => <AccountFacts key={`${device.at}:${index}`} style={{ marginBlockEnd: 20 }}>
          <div><dt>{m.text("account.deviceColumn")}</dt><dd>{m.text(device.current ? "account.currentDevice" : "account.deviceLabel", { number: m.number(index + 1) })}</dd></div>
          <div><dt>{m.text("account.lastUsed")}</dt><dd><time dateTime={device.at}>{formatSubscriptionExpiry(new Date(device.at))}</time></dd></div>
        </AccountFacts>)}
        <form method="post" action="/api/account/devices" data-analytics-ignore><Button type="submit" variant="secondary">{m.text("account.signOutOthers")}</Button></form>
      </> : <AccountFine>{m.text("account.noUnlockedDevices")}</AccountFine>}
  </AccountPanel>;
}

export function AccountQuickActions({ locale, returnTo }: { locale: string; returnTo: string | null }) {
  const m = createMessages(locale);
  return <AccountSectionActions style={{ paddingInline: 16 }}>
    <ButtonLink href={accountSectionHref(locale, "phone", returnTo)} prefetch={false} variant="secondary">{m.text("account.changePhone")}</ButtonLink>
    <ButtonLink href={accountSectionHref(locale, "password", returnTo)} prefetch={false} variant="secondary">{m.text("account.changePassword")}</ButtonLink>
    <AccountActionLink href={accountSectionHref(locale, "activity", returnTo)} prefetch={false}>{m.text("account.section.activity")}</AccountActionLink>
  </AccountSectionActions>;
}
