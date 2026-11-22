"use client";

import { RecordRowContent } from "@/components/admin/record-workspace";
import { CardIcon, ClockIcon, GiftIcon, ShieldIcon } from "@/components/ui/icons";
import type { AccountActivity as Activity, AccountDashboard } from "@/domain/account-dashboard";
import { createMessages } from "@/i18n/messages";
import { formatSubscriptionExpiry } from "@/domain/subscription-expiry";
import { AccountFine } from "./account-overview";
import { AccountRecords } from "./account-records";

export function AccountActivity({ locale, dashboard }: { locale: string; dashboard: AccountDashboard | null }) {
  const m = createMessages(locale);
  const date = (value: string) => formatSubscriptionExpiry(new Date(value));
  const subject = (entry: Activity) => entry.kind === "payment" && entry.purpose === "topup"
    ? m.text("account.activityCredit") : entry.kind === "referral" ? m.plural("paywall.days", 1) : entry.planName;
  return <div data-account-activity><AccountRecords title={m.text("account.activity")} locale={locale} items={dashboard?.activity ?? []}
    empty={<AccountFine role={dashboard ? undefined : "status"}>{m.text(dashboard ? "account.activityEmpty" : "account.activityUnavailable")}</AccountFine>}
    row={entry => {
      const Icon = entry.kind === "payment" ? CardIcon : entry.kind === "referral" ? GiftIcon : entry.status === "added" ? ShieldIcon : ClockIcon;
      return <RecordRowContent icon={<Icon />} primary={m.text(`account.activity.${entry.status}`)} secondary={<>{subject(entry)} · <time dateTime={entry.at}>{date(entry.at)}</time></>} />;
    }}
    detail={entry => <>
        <h3>{m.text(`account.activity.${entry.status}`)}</h3>
        <p>{subject(entry)}{entry.kind === "payment" && <> · {entry.reference}</>}</p>
        {(entry.kind !== "access" || entry.status !== "added" || entry.at !== entry.startsAt) && <AccountFine><time dateTime={entry.at}>{date(entry.at)}</time></AccountFine>}
        {entry.kind === "access" && entry.status === "added" && <AccountFine>{m.text("account.activityPeriod", { start: date(entry.startsAt), end: date(entry.endsAt) })}</AccountFine>}
    </>} />
  </div>;
}
