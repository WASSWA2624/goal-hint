"use client";

import { useId, useState } from "react";
import { TextAction } from "@/components/admin/desk-styles";
import { RecordRowContent } from "@/components/admin/record-workspace";
import { AdvancedFilterDialog } from "@/components/ui/advanced-filter-dialog";
import { CardIcon } from "@/components/ui/icons";
import { SearchBar } from "@/components/ui/search-bar";
import { SelectMenu } from "@/components/ui/select-menu";
import type { AccountDashboard } from "@/domain/account-dashboard";
import { checkoutLabels, checkoutOpenStatuses } from "@/domain/checkout";
import type { PaymentStatus } from "@/domain/payment";
import { formatSubscriptionExpiry } from "@/domain/subscription-expiry";
import { createMessages } from "@/i18n/messages";
import { AccountFine } from "./account-overview";
import { AccountRecords } from "./account-records";
import { PaymentNotice, type StatusSettings } from "./payment-status";

export function AccountPayments({ locale, reports, dashboard, contact, phone, returnTo }: {
  locale: string; reports: readonly (PaymentStatus | null | undefined)[]; dashboard: AccountDashboard | null;
  contact: StatusSettings; phone: string; returnTo: string | null;
}) {
  const m = createMessages(locale), id = useId();
  const [searchText, setSearchText] = useState(""), [query, setQuery] = useState(""), [status, setStatus] = useState("all");
  const [draft, setDraft] = useState("all"), [filtersOpen, setFiltersOpen] = useState(false);
  const history = (dashboard?.activity ?? []).filter(entry => entry.kind === "payment");
  const current = reports.filter((report): report is PaymentStatus =>
    !!report && ([...checkoutOpenStatuses, "superseded", "rejected", "reversed", "cancelled"] as readonly string[]).includes(report.status));
  const displayPlan = (payment: { purpose?: string; planName: string }) => payment.purpose === "topup" ? m.text("account.activityCredit") : payment.planName;
  const records = [
    ...current.map(report => ({
      id: report.reference, status: report.status, label: report.status === "reversed" ? m.text("account.activity.reversed") : checkoutLabels[report.status]!,
      plan: displayPlan(report), at: history.find(entry => entry.reference === report.reference)?.at ?? report.submittedAt, report,
    })),
    ...history.filter(entry => !current.some(report => report.reference === entry.reference)).map(entry => ({
      id: entry.reference, status: entry.status, label: m.text(`account.activity.${entry.status}`),
      plan: displayPlan(entry), at: entry.at, report: null,
    })),
  ];
  const options = [{ value: "all", label: m.text("account.paymentAllStatuses") },
    ...Array.from(new Map(records.map(record => [record.status, record.label])), ([value, label]) => ({ value, label }))];
  const items = records.filter(record => (status === "all" || status === record.status)
    && `${record.id} ${record.label} ${record.plan}`.toLocaleLowerCase(locale).includes(query));
  const filtered = status !== "all" || query !== "";
  const notice = { locale, settings: contact, phone, returnTo };
  const date = (value: string) => formatSubscriptionExpiry(new Date(value));

  return <div data-account-payments>
    <AccountRecords title={m.text("account.recentPayments")} locale={locale} items={items} toolbar={(records.length > 1 || filtered) ? <>
      <form onSubmit={event => {
        event.preventDefault();
        setQuery(searchText.trim().toLocaleLowerCase(locale));
      }}>
        <SearchBar id={`${id}-search`} name="search" label={m.text("account.searchRecentPayments")}
          value={searchText} onChange={event => setSearchText(event.currentTarget.value)}
          submitLabel={m.text("account.searchPayments")} maxLength={100} autoComplete="off"
          filters={{ label: m.text("feed.filters.dialogTitle"), dialogId: `${id}-filters`, open: filtersOpen,
            count: Number(status !== "all"), onOpen: () => { setDraft(status); setFiltersOpen(true); } }} />
      </form>
      {filtersOpen && <AdvancedFilterDialog id={`${id}-filters`} locale={locale} open closeLabel={m.text("account.closePaymentFilters")}
        onCancel={() => setFiltersOpen(false)} onReset={() => setDraft("all")}
        onApply={() => { setStatus(draft); setFiltersOpen(false); }}>
        <SelectMenu label={m.text("account.paymentStatus")} value={draft} options={options} onValueChange={setDraft} />
      </AdvancedFilterDialog>}
    </> : null}
    empty={<>
      <AccountFine role="status">{m.text(filtered ? "account.noMatchingPayments" : dashboard ? "account.noPayments" : "account.paymentsUnavailable")}</AccountFine>
      {filtered && <TextAction type="button" onClick={() => { setSearchText(""); setQuery(""); setStatus("all"); }}>
        {m.text("feed.filters.resetFilters")}
      </TextAction>}
    </>}
    row={entry => <RecordRowContent icon={<CardIcon />} primary={entry.id} secondary={`${entry.label} · ${entry.plan}`} />}
    detail={entry => <>
      <h3>{entry.id}</h3>
      <p>{entry.label} · {entry.plan}</p>
      <AccountFine><time dateTime={entry.at}>{date(entry.at)}</time></AccountFine>
      {entry.report && <PaymentNotice {...notice} status={entry.report} part="summary" />}
    </>}
    actions={entry => entry.report && <PaymentNotice {...notice} status={entry.report} part="actions" />} />
  </div>;
}
