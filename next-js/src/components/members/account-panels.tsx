import type { AccountDashboard } from "@/domain/account-dashboard";
import type { SubscriptionStatus } from "@/domain/subscription-summary";
import { formatSubscriptionExpiry } from "@/domain/subscription-expiry";
import { createMessages } from "@/i18n/messages";
import { Button, ButtonLink } from "@/components/ui/controls";
import { AccountDeviceList, AccountFacts, AccountPanel, AccountSectionActions, AccountStatus } from "./account-workspace";
import { AccountFine } from "./account-overview";
import { FreeTrialControl } from "./free-trial-control";

export function AccountSubscriptionPanel({ locale, subscription, dashboard, lastEnd, trialDays = 0, showTitle = true, action, salesAvailable }: {
  locale: string; subscription: SubscriptionStatus | null; dashboard: AccountDashboard | null; lastEnd?: Date; trialDays?: number;
  showTitle?: boolean; action: { href: string; label: string } | null; salesAvailable: boolean;
}) {
  const m = createMessages(locale), active = !!subscription?.activeUntil;
  const trial = subscription?.trial, trialActive = trial?.state === "active";
  const endsAt = trialActive ? new Date(trial.endsAt) : subscription?.activeUntil ? new Date(subscription.activeUntil) : lastEnd;
  const plan = active ? dashboard?.activePlanName ?? (trialActive ? m.text("freeTrial.label") : m.text("account.unknownLabel")) : m.text("account.noneLabel");
  return <AccountPanel title={showTitle ? m.text("account.section.subscription") : undefined} data-subscription-summary={!subscription ? "unavailable" : active ? "active" : "inactive"}
    data-free-trial={trialActive ? "active" : undefined}>
    {subscription ? <>
      <AccountFacts $columns={3}>
        <div><dt>{m.text("account.packageLabel")}</dt><dd data-active-package={active && (dashboard?.activePlanName || trialActive) ? "" : undefined}>{plan}</dd></div>
        <div><dt>{m.text("account.accessStatus")}</dt><dd><AccountStatus $active={active}>
          {m.text(active ? "account.activeLabel" : subscription.expired || lastEnd ? "account.expiredLabel" : "account.inactiveLabel")}
        </AccountStatus></dd></div>
        {endsAt && <div><dt>{m.text(trialActive ? "account.trialEndLabel" : active ? "account.expiryLabel" : "account.endedLabel")}</dt>
          <dd><time dateTime={endsAt.toISOString()}>{formatSubscriptionExpiry(endsAt)}</time></dd></div>}
      </AccountFacts>
      {trial && !trialActive && <FreeTrialControl locale={locale} trial={trial} days={trialDays} showHistory={active} />}
      {subscription.renewsFromCredit && <AccountFine>{m.text("account.renewsFromCredit")}</AccountFine>}
      {subscription.paymentPending && <AccountFine role="status">{m.text("account.paymentPending")}</AccountFine>}
    </> : <AccountFine role="status">{m.text("account.subscriptionUnavailable")}</AccountFine>}
    {action ? <AccountSectionActions><ButtonLink href={action.href} prefetch={false}>{action.label}</ButtonLink></AccountSectionActions>
      : subscription && !salesAvailable && <AccountFine role="status">{m.text("subscribe.salesPaused")}</AccountFine>}
  </AccountPanel>;
}

export function AccountDevices({ locale, devices }: { locale: string; devices: readonly { at: string; current: boolean }[] | null }) {
  const m = createMessages(locale);
  return <AccountPanel narrow data-account-devices>
    {devices === null ? <AccountFine role="status">{m.text("account.devicesUnavailable")}</AccountFine>
      : devices.length ? <>
        <AccountDeviceList aria-label={m.text("account.signedInDevices")}>{devices.map((device, index) => <li key={device.current ? "current" : index}>
          <strong>{m.text(device.current ? "account.currentDevice" : "account.deviceLabel", { number: m.number(index + 1) })}</strong>
          <time dateTime={device.at}>{m.text("account.deviceLastUsed", { time: formatSubscriptionExpiry(new Date(device.at)) })}</time>
        </li>)}</AccountDeviceList>
        {devices.some(device => !device.current) && <form method="post" action="/api/account/devices" data-analytics-ignore>
          <Button type="submit" variant="secondary">{m.text("account.signOutOthers")}</Button>
        </form>}
      </> : <AccountFine>{m.text("account.noSignedInDevices")}</AccountFine>}
  </AccountPanel>;
}
