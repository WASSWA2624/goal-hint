"use client";

import { SearchBar } from "@/components/ui/search-bar";
import { AdvancedFilterDialog } from "@/components/ui/advanced-filter-dialog";
import { SelectMenu } from "@/components/ui/select-menu";
import { useDesktopLayout } from "@/components/ui/use-desktop-layout";
import { stopReviewSound } from "./payment-alert-sound";
import { useEffect, useId, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/navigation/navigation-link";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { checkoutOpenStatuses } from "@/domain/checkout";
import { formatPhone } from "@/domain/phone";
import { defaultPaymentFilters, paymentProviderLabels, paymentQueueStatusLabels, paymentStatusLabels, type PaymentFilters } from "@/domain/payment-queue-filters";
import { formatUgx, type SubscriptionPlanView } from "@/domain/subscription-plans";
import type { OwnerPayment, PaymentQueue } from "@/domain/owner-members";
import { CheckField } from "./admin-form";
import { ActionNotices, useCodeAction } from "./code-tools";
import { NetworkChip } from "./network-chip";
import { PaymentReview, type PaymentRecovery } from "./payment-review";
import { getPendingPaymentsSnapshot, getServerPendingPaymentsSnapshot, subscribePendingPayments } from "./pending-payments";
import { useAdminRefresh } from "./use-admin-refresh";
import { paymentSortOptions, readPaymentSort, sortPayments, type PaymentSort } from "./payment-order";
import { CheckoutReview } from "./checkout-review";
import { PaymentFeedback, PaymentHead, PaymentLayout, QueueBar, QueueEmpty, QueueFilters, QueuePanel, QueueSummary, ReviewBack, ReviewNav, ReviewSection,
  Stepper, TicketItem, TicketTray } from "./payment-styles";
import { RecordItemTitle, RecordRowContent } from "./record-workspace";

const openStatuses: readonly string[] = checkoutOpenStatuses;
const ticketDate = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kampala", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** Day and time only: the review header carries the full EAT timestamp. */
function ticketTime(instant: string) {
  const parts = Object.fromEntries(ticketDate.formatToParts(new Date(instant)).map(({ type, value }) => [type, value]));
  return `${parts.day} ${parts.month}, ${parts.hour}:${parts.minute}`;
}

function paymentParams(filters: PaymentFilters, sort: PaymentSort, search = "", page = 1) {
  const params = new URLSearchParams();
  if (filters.statuses.join(",") !== "pending") params.set("status", filters.statuses.join(","));
  if (filters.providers.join(",") !== "all") params.set("provider", filters.providers.join(","));
  if (sort !== "queue") params.set("sort", sort);
  if (search.trim()) params.set("search", search.trim());
  if (page > 1) params.set("page", String(page));
  return params;
}

function paymentQueueHref(filters: PaymentFilters, sort: PaymentSort, search?: string, page?: number) {
  const params = paymentParams(filters, sort, search, page);
  return `/admin/payments${params.size ? `?${params}` : ""}`;
}

function FilterChoices<T extends string>({ label, options, selected, onChange }: {
  label: string; options: Partial<Record<T, string>>; selected: readonly (T | "all")[]; onChange: (values: (T | "all")[]) => void;
}) {
  return <fieldset><legend>{label}</legend>
    <CheckField><input type="checkbox" checked={selected.includes("all")} onChange={event => onChange(event.target.checked ? ["all"] : [])} />All</CheckField>
    {(Object.entries(options) as [T, string][]).map(([value, name]) => <CheckField key={value}>
      <input type="checkbox" checked={selected.includes(value)} onChange={event => onChange(event.target.checked
        ? [...selected.filter(choice => choice !== "all"), value] : selected.filter(choice => choice !== value))} />{name}
    </CheckField>)}
  </fieldset>;
}

function restoreQueueFocus(id?: string) {
  (document.querySelector<HTMLElement>(`[data-payment-row="${CSS.escape(id ?? "")}"]`) ?? document.getElementById("payment-queue-title"))?.focus();
}

/** Payment decisions share one queue; only the selected report mounts a review form. */
export function PaymentsEditor({ queue, plans, filters, sort, initialPaymentId }: {
  queue: PaymentQueue; plans: readonly SubscriptionPlanView[]; filters: PaymentFilters; sort: PaymentSort; initialPaymentId?: string;
}) {
  const router = useRouter(), [navigating, startNavigation] = useTransition();
  const mutation = useCodeAction(), [refreshMessage, setRefreshMessage] = useState("");
  const { refreshing, refresh: refreshAdmin } = useAdminRefresh(setRefreshMessage);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const action = { ...mutation, busy: mutation.busy || checkoutBusy || refreshing || navigating };
  const liveCount = useSyncExternalStore(subscribePendingPayments, getPendingPaymentsSnapshot, getServerPendingPaymentsSnapshot);
  const desktop = useDesktopLayout();
  const [selectedId, setSelectedId] = useState(initialPaymentId ?? queue.payments[0]?.id ?? "");
  const filtersId = useId(), [filtersOpen, setFiltersOpen] = useState(false);
  const [filterDraft, setFilterDraft] = useState(filters);
  const [detailOpen, setDetailOpen] = useState(!!initialPaymentId), [completed, setCompleted] = useState<Record<string, string>>({});
  const [recoveries, setRecoveries] = useState<Record<string, PaymentRecovery>>({});
  const [actionReference, setActionReference] = useState(""), [opened, setOpened] = useState(!!initialPaymentId);
  const focusNext = useRef(false), stepFocus = useRef<"previous" | "next" | null>(null);
  const [dirtyId, setDirtyId] = useState<string>();
  const [reviewFocused, setReviewFocused] = useState(false);
  const refreshedCount = useRef<number | null>(null);
  const lastHash = useRef<string | null>(null);
  const openedFromQueue = useRef(false);
  const completedRows = queue.payments.filter(payment => completed[payment.id] === payment.status);
  const payments = sortPayments(queue.payments.filter(payment => completed[payment.id] !== payment.status), sort);
  const selected = payments.find(payment => payment.id === selectedId) ?? payments[0];
  const selectedKey = selected?.id, index = selected ? payments.indexOf(selected) : -1;
  const reviewing = detailOpen && !!selected;
  const pendingCount = Math.max(0, queue.pendingCount - completedRows.filter(payment => openStatuses.includes(payment.status)).length);
  const queueChanged = liveCount !== null && liveCount !== pendingCount;
  const singleStatus = filters.statuses.length === 1 ? filters.statuses[0] : undefined;
  const showsPending = filters.statuses.includes("pending") || filters.statuses.includes("all");
  const filteredStatus = singleStatus !== "pending", filteredProvider = !filters.providers.includes("all");
  const total = Math.max(payments.length, (queue.total ?? queue.payments.length) - completedRows.length);
  const searchParams = paymentParams(filters, sort);

  useEffect(() => {
    if (!queueChanged) { refreshedCount.current = null; return; }
    if (!showsPending || action.busy || !desktop && reviewing || reviewFocused || filtersOpen || dirtyId && dirtyId === selectedKey
      || refreshedCount.current === liveCount) return;
    refreshedCount.current = liveCount;
    refreshAdmin();
  }, [action.busy, desktop, dirtyId, filtersOpen, liveCount, queueChanged, refreshAdmin, reviewFocused, reviewing, selectedKey, showsPending]);

  useEffect(() => {
    const readHash = () => {
      const id = window.location.hash.slice(1);
      if (lastHash.current === id) return;
      const previous = lastHash.current;
      lastHash.current = id;
      if (queue.payments.some(payment => payment.id === id)) { setSelectedId(id); setDetailOpen(true); setOpened(true); }
      else if (!id && previous) {
        setDetailOpen(false); setDirtyId(undefined);
        requestAnimationFrame(() => restoreQueueFocus(previous));
      }
    };
    readHash(); window.addEventListener("hashchange", readHash);
    window.addEventListener("popstate", readHash);
    return () => {
      window.removeEventListener("hashchange", readHash);
      window.removeEventListener("popstate", readHash);
    };
  }, [queue.payments]);

  useEffect(() => {
    // Keep keyboard focus on the same step button, or the other one at the end of the queue.
    if (stepFocus.current) {
      const direction = stepFocus.current; stepFocus.current = null;
      const target = document.querySelector<HTMLButtonElement>(`[data-payment-step="${direction}"]:not(:disabled)`) ?? document.querySelector<HTMLButtonElement>("[data-payment-step]:not(:disabled)");
      (target ?? document.getElementById("payment-review"))?.focus({ preventScroll: true });
      return;
    }
    if (!focusNext.current) return;
    focusNext.current = false;
    const target = document.getElementById(selectedKey ? "payment-review" : "payment-queue-title");
    target?.focus({ preventScroll: true });
    if (!desktop) target?.scrollIntoView({ block: "start" });
  }, [selectedKey, detailOpen, desktop]);

  useEffect(() => {
    if (!action.notice && !action.message) return;
    const result = document.getElementById("payment-feedback");
    result?.focus({ preventScroll: true });
    if (!desktop) result?.scrollIntoView({ block: "start" });
  }, [action.notice, action.message, desktop]);

  function locationFor(id: string, push = false) {
    lastHash.current = id;
    const url = new URL(window.location.href);
    if (url.searchParams.has("paymentId")) {
      if (id) url.searchParams.set("paymentId", id);
      else url.search = paymentParams(filters, sort, queue.search, queue.page).toString();
    }
    url.hash = id;
    // Next preserves its own history fields and synchronizes the router URL for native History API updates.
    const path = `${url.pathname}${url.search}${url.hash}`;
    if (push) history.pushState(null, "", path);
    else history.replaceState(null, "", path);
  }
  function select(payment: OwnerPayment) {
    if (action.busy) return;
    const push = !desktop && !reviewing;
    if (push) openedFromQueue.current = true;
    stopReviewSound();
    focusNext.current = !desktop; setSelectedId(payment.id); setDetailOpen(true); setOpened(true);
    locationFor(payment.id, push);
  }
  function step(direction: "previous" | "next") {
    const target = payments[index + (direction === "next" ? 1 : -1)];
    if (action.busy || !target) return;
    stepFocus.current = direction; setSelectedId(target.id); setDetailOpen(true);
    locationFor(target.id);
  }
  function back() {
    if (openedFromQueue.current) { history.back(); return; }
    setDetailOpen(false); setDirtyId(undefined); locationFor("");
    requestAnimationFrame(() => restoreQueueFocus(selectedKey));
  }
  function resolved(id: string) {
    stopReviewSound();
    setDirtyId(undefined);
    if (selected) setCompleted(shown => ({ ...shown, [id]: selected.status }));
    const next = payments.find(payment => payment.id !== id);
    if (!next && !desktop && openedFromQueue.current) { back(); return; }
    focusNext.current = true;
    setSelectedId(next?.id ?? ""); setDetailOpen(!!next);
    locationFor(next?.id ?? "");
  }
  function navigate(nextFilters: PaymentFilters, nextSort: PaymentSort, search = queue.search, page?: number) {
    const href = paymentQueueHref(nextFilters, nextSort, search, page);
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` === href) return;
    openedFromQueue.current = false;
    setDetailOpen(false); setDirtyId(undefined); setRefreshMessage("");
    startNavigation(() => router.push(href, { scroll: false }));
  }
  const feedback = { ...action, notice: action.notice && `${actionReference ? `${actionReference} · ` : ""}${action.notice}`,
    message: refreshMessage || (action.message && `${actionReference ? `${actionReference} · ` : ""}${action.message}`) };
  const stepper = selected && payments.length > 1 && <Stepper role="group" aria-label={`Report ${index + 1} of ${payments.length}`}>
    <button type="button" aria-label={index > 0 ? `Previous report, ${payments[index - 1]!.reference}` : "Previous report"} disabled={action.busy || index <= 0}
      onClick={() => step("previous")} data-payment-step="previous"><ChevronLeftIcon /></button>
    <span aria-hidden="true">{index + 1} of {payments.length}</span>
    <button type="button" aria-label={index < payments.length - 1 ? `Next report, ${payments[index + 1]!.reference}` : "Next report"} disabled={action.busy || index >= payments.length - 1}
      onClick={() => step("next")} data-payment-step="next"><ChevronRightIcon /></button>
  </Stepper>;
  const nav = !desktop && selected && <ReviewNav>
    <ReviewBack type="button" disabled={action.busy} onClick={back} data-review-back><ChevronLeftIcon />All payments</ReviewBack>
    {stepper}
  </ReviewNav>;

  return <PaymentLayout data-payments-editor data-layout="balanced" data-analytics-ignore>
    <PaymentHead $reviewing={reviewing}>
      <h1>Payments</h1>
      <QueueBar data-admin-toolbar>
        <form action="/admin/payments" method="get" onSubmit={event => {
          event.preventDefault();
          if (!action.busy) navigate(filters, sort, String(new FormData(event.currentTarget).get("search") ?? ""));
        }}>
          {[...searchParams].map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
          <SearchBar key={queue.search} id="payment-search" name="search" label="Find a payment" submitLabel="Search"
            defaultValue={queue.search} maxLength={100} disabled={action.busy} autoComplete="off"
            filters={{ label: "Advanced filters", dialogId: filtersId, open: filtersOpen,
              count: Number(filteredStatus) + Number(filteredProvider),
              onOpen: () => { setFilterDraft(filters); setFiltersOpen(true); } }} />
          <SelectMenu label="Sort by" value={sort} options={paymentSortOptions} disabled={action.busy}
            onValueChange={value => navigate(filters, readPaymentSort(value), queue.search, queue.page)} />
        </form>
        {filtersOpen && <AdvancedFilterDialog id={filtersId} open onCancel={() => setFiltersOpen(false)} closeLabel="Close payment filters"
          applyDisabled={action.busy || !filterDraft.statuses.length || !filterDraft.providers.length}
          onApply={() => {
            if (action.busy || !filterDraft.statuses.length || !filterDraft.providers.length) return;
            setFiltersOpen(false); navigate(filterDraft, sort);
          }}
          onReset={() => setFilterDraft(defaultPaymentFilters)}>
          <QueueFilters>
            <FilterChoices label="Payment status" options={filters.statuses.some(status => status !== "all" && !Object.hasOwn(paymentStatusLabels, status)) ? paymentQueueStatusLabels : paymentStatusLabels}
              selected={filterDraft.statuses} onChange={statuses => setFilterDraft(current => ({ ...current, statuses }))} />
            <FilterChoices label="Payment providers" options={paymentProviderLabels}
              selected={filterDraft.providers} onChange={providers => setFilterDraft(current => ({ ...current, providers }))} />
          </QueueFilters>
        </AdvancedFilterDialog>}
      </QueueBar>
    </PaymentHead>
    {(feedback.notice || feedback.message) && <PaymentFeedback id="payment-feedback" tabIndex={-1} aria-label="Payment result"><ActionNotices action={feedback} /></PaymentFeedback>}
    <QueuePanel aria-labelledby="payment-queue-title" $reviewing={reviewing}>
      <h2 id="payment-queue-title" tabIndex={-1}>{singleStatus && singleStatus !== "all" ? `${paymentQueueStatusLabels[singleStatus]} queue` : "Payment queue"}</h2>
      <QueueSummary><span data-payment-count>{payments.length} of {total} requests</span><span>{sort !== "queue" ? paymentSortOptions.find(option => option.value === sort)?.label : singleStatus && openStatuses.includes(singleStatus) ? "Oldest first" : "Newest first"}</span>
        {queue.page && <nav aria-label="Payment pages">{queue.page > 1 && <Link href={paymentQueueHref(filters, sort, queue.search, queue.page - 1)}>Previous page</Link>}{" "}
          Page {queue.page}{" "}{queue.page * (queue.pageSize ?? 30) < (queue.total ?? 0) && <Link href={paymentQueueHref(filters, sort, queue.search, queue.page + 1)}>Next page</Link>}</nav>}
        {showsPending && queueChanged && <span role="status" data-payment-queue-updated>New queue activity</span>}</QueueSummary>
      {payments.length ? <TicketTray $opened={opened} data-payment-queue-scroll tabIndex={0} aria-label="Payment list">{payments.map(payment => {
        const network = payment.final?.network || payment.network;
        const payer = payment.receiptSummary?.payerPhone ?? payment.payerPhone;
        const phone = payer ? `+${formatPhone(payer)}` : "Payer not provided";
        const amount = payment.receiptSummary ? payment.receiptSummary.amount : payment.final?.amount ?? payment.amount;
        const amountText = amount === null ? "—" : formatUgx(amount);
        const packageName = payment.purpose === "topup" ? "Credit top-up" : payment.planName;
        const paidAt = payment.receiptSummary?.paidAt;
        const date = `${paidAt ? "" : "Submitted "}${ticketTime(paidAt ?? payment.submittedAt)} EAT`;
        return <li key={payment.id}><TicketItem type="button" aria-current={selected?.id === payment.id ? "true" : undefined} aria-controls="payment-review"
          disabled={action.busy} onClick={() => select(payment)} data-payment-row={payment.id}>
          <RecordRowContent icon={<NetworkChip network={network} labelled />}
            primary={<><RecordItemTitle title={payment.reference} data-ticket-ref>{payment.reference}</RecordItemTitle>
              <span title={phone} data-ticket-phone>{phone}</span>
              <strong data-ticket-amount title={amount === null ? "No receipt amount" : amountText}>{amountText}</strong></>}
            secondary={<span data-ticket-meta><span title={packageName} data-ticket-plan>{packageName}</span>
              <time dateTime={paidAt ?? payment.submittedAt} title={date} data-ticket-time>{date}</time></span>} />
          <ChevronRightIcon aria-hidden="true" data-ticket-chevron />
        </TicketItem></li>;
      })}</TicketTray> : <QueueEmpty data-payment-empty><CheckIcon /><strong>{queue.search || filteredProvider ? "No matching payments" : singleStatus === "pending" ? "No payments waiting" : "No payments here yet"}</strong>
      </QueueEmpty>}
    </QueuePanel>
    <ReviewSection id="payment-review" aria-label="Review payment" tabIndex={-1} $reviewing={reviewing}
      onFocusCapture={event => setReviewFocused(event.target !== event.currentTarget)}
      onBlurCapture={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setReviewFocused(false); }}
      onChangeCapture={() => setDirtyId(selectedKey)}>
      {selected?.workflowVersion === 2 ? <CheckoutReview key={selected.id} payment={selected} nav={nav} busy={action.busy} onBusyChange={setCheckoutBusy}
        onResolved={() => { resolved(selected.id); refreshAdmin(); }} /> : selected ? <PaymentReview key={selected.id} payment={selected} plans={plans} action={action} recovery={recoveries[selected.id]} nav={nav}
        onStart={() => { setRefreshMessage(""); setActionReference(selected.reference); }} onResolved={() => resolved(selected.id)}
        onRecovery={value => setRecoveries(shown => ({ ...shown, [selected.id]: value }))} /> : <QueueEmpty data-payment-review-empty><CheckIcon /><strong>No payment selected</strong><span>Choose another status or clear the filters.</span></QueueEmpty>}
    </ReviewSection>
  </PaymentLayout>;
}
