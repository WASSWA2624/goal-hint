import type { AccountDashboard } from "@/domain/account-dashboard";
import { createMessages } from "@/i18n/messages";
import { formatSubscriptionExpiry } from "@/domain/subscription-expiry";
import { AccountActivityList, AccountFine } from "./account-overview";
import { AccountPanel } from "./account-workspace";

export function AccountActivity({ locale, dashboard, title = "account.activity" }: { locale: string; dashboard: AccountDashboard | null; title?: "account.activity" | "account.recentPayments" }) {
  const m = createMessages(locale);
  const date = (value: string) => formatSubscriptionExpiry(new Date(value));
  return <AccountPanel title={m.text(title)} data-account-activity>
    {!dashboard ? <AccountFine role="status">{m.text("account.activityUnavailable")}</AccountFine>
      : !dashboard.activity.length ? <AccountFine>{m.text("account.activityEmpty")}</AccountFine>
      : <AccountActivityList>{dashboard.activity.map(entry => <li key={entry.id}>
        <p><strong>{m.text(`account.activity.${entry.status}`)}</strong> · {entry.kind === "payment" && entry.purpose === "topup"
          ? m.text("account.activityCredit") : entry.planName}{entry.kind === "payment" && <> · {entry.reference}</>}</p>
        <time dateTime={entry.at}>{date(entry.at)}</time>
        {entry.kind === "access" && entry.status === "added" && <AccountFine>{m.text("account.activityPeriod", { start: date(entry.startsAt), end: date(entry.endsAt) })}</AccountFine>}
      </li>)}</AccountActivityList>}
  </AccountPanel>;
}
