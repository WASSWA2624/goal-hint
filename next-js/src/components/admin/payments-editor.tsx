"use client";

import { SearchBar } from "@/components/ui/search-bar";
import { CriteriaDialog } from "@/components/ui/criteria-dialog";
import { media } from "@/styles/theme";
import { stopReviewSound } from "./payment-alert-sound";

import { FloatingField } from "@/components/ui/floating-field";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type MouseEvent } from "react";
import Link from "@/components/navigation/navigation-link";
import { AlertIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, ResetIcon } from "@/components/ui/icons";
import { formatPhone } from "@/domain/phone";
import { formatPlanLength, formatUgx, type SubscriptionPlanView } from "@/domain/subscription-plans";
import type { OwnerPayment, PaymentQueue } from "@/domain/owner-members";
import { ActionButton } from "./admin-form";
import { ActionNotices, useCodeAction } from "./code-tools";
import { NetworkChip } from "./network-chip";
import { paymentWarnings, PaymentReview, type PaymentRecovery } from "./payment-review";
import { getPendingPaymentsSnapshot, getServerPendingPaymentsSnapshot, refreshPendingPayments, subscribePendingPayments } from "./pending-payments";
import { useAdminRefresh } from "./use-admin-refresh";
import { paymentSortOptions, sortPayments, type PaymentSort } from "./payment-order";
import { CheckoutReview } from "./checkout-review";
import { HeadEnd, PaymentFeedback, PaymentHead, PaymentLayout, QueueBar, QueueEmpty, QueueFilters, QueuePanel, QueueSummary, RefreshSquare, ReviewBack, ReviewNav, ReviewSection,
  StatusTabs, Stepper, Ticket, TicketAmount, TicketMeta, TicketPhone, TicketPlan, TicketProvider, TicketRef, TicketTime, TicketTray, TicketWarn } from "./payment-styles";

const tabLabels = { pending: "Pending", remaining: "Part-paid", disputed: "Disputed", approved: "Approved", rejected: "Rejected", cancelled: "Cancelled", reconciliation: "Unallocated funds" };
const phoneLabel = (phone: string | null) => phone ? `+${formatPhone(phone)}` : "Erased account";
const searchText = (value: string) => value.toLowerCase().replace(/[\s()+.-]/gu, "");
const desktopQuery = media.desktop.replace("@media ", "");
const desktopSnapshot = () => window.matchMedia(desktopQuery).matches;
const serverDesktopSnapshot = () => false;
function subscribeDesktop(listener: () => void) {
  const query = window.matchMedia(desktopQuery);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
const ticketDate = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kampala", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** Day and time only: the review header carries the full EAT timestamp. */
function ticketTime(instant: string) {
  const parts = Object.fromEntries(ticketDate.formatToParts(new Date(instant)).map(({ type, value }) => [type, value]));
  return `${parts.day} ${parts.month}, ${parts.hour}:${parts.minute}`;
}

/** Payment decisions share one queue; only the selected report mounts a review form. */
export function PaymentsEditor({ queue, plans, tab, initialPaymentId }: { queue: PaymentQueue; plans: readonly SubscriptionPlanView[]; tab: string; initialPaymentId?: string }) {
  const mutation = useCodeAction(), [refreshMessage, setRefreshMessage] = useState("");
  const { refreshing, refresh: refreshAdmin } = useAdminRefresh(setRefreshMessage);
  const action = { ...mutation, busy: mutation.busy || refreshing };
  const liveCount = useSyncExternalStore(subscribePendingPayments, getPendingPaymentsSnapshot, getServerPendingPaymentsSnapshot);
  const desktop = useSyncExternalStore(subscribeDesktop, desktopSnapshot, serverDesktopSnapshot);
  const [search, setSearch] = useState(queue.search ?? ""), [selectedId, setSelectedId] = useState(initialPaymentId ?? queue.payments[0]?.id ?? "");
  const filtersId = useId(), [filtersOpen, setFiltersOpen] = useState(false);
  const [filterDraft, setFilterDraft] = useState({ provider: "all", sort: "queue" as PaymentSort });
  const [provider, setProvider] = useState("all"), [sort, setSort] = useState<PaymentSort>("queue");
  const [detailOpen, setDetailOpen] = useState(!!initialPaymentId), [completed, setCompleted] = useState<readonly string[]>([]);
  const [recoveries, setRecoveries] = useState<Record<string, PaymentRecovery>>({});
  const [actionReference, setActionReference] = useState(""), [opened, setOpened] = useState(!!initialPaymentId);
  const focusNext = useRef(false), stepFocus = useRef<"previous" | "next" | null>(null);
  const refreshFocus = useRef<HTMLButtonElement | null>(null);
  const lastHash = useRef<string | null>(null);
  const query = queue.total === undefined ? searchText(search) : "";
  const payments = sortPayments(queue.payments.filter(payment => !completed.includes(payment.id)
    && (provider === "all" || (payment.final?.network || payment.network) === provider) && (!query || searchText([
    payment.reference, payment.accountPhone ?? "", payment.payerPhone ?? "", payment.transactionId, payment.final?.transactionId ?? "", payment.planName,
  ].join(" ")).includes(query))), sort);
  const selected = payments.find(payment => payment.id === selectedId) ?? payments[0];
  const selectedKey = selected?.id, index = selected ? payments.indexOf(selected) : -1;
  const reviewing = detailOpen && !!selected;
  const pendingCount = Math.max(0, queue.pendingCount - queue.payments.filter(payment => payment.status === "pending" && completed.includes(payment.id)).length);
  const queueChanged = liveCount !== null && liveCount !== pendingCount;

  useEffect(() => {
    if (action.busy || !refreshFocus.current) return;
    const button = refreshFocus.current; refreshFocus.current = null;
    // Disabling a focused button can leave focus on body; respect any new focus chosen during the request.
    if (button.isConnected && document.activeElement === document.body) button.focus({ preventScroll: true });
  }, [action.busy]);

  useEffect(() => {
    const readHash = () => {
      const id = window.location.hash.slice(1);
      if (lastHash.current === id) return;
      lastHash.current = id;
      if (queue.payments.some(payment => payment.id === id)) { setSelectedId(id); setDetailOpen(true); setOpened(true); }
    };
    readHash(); window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
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

  function locationFor(id: string) {
    lastHash.current = id;
    const url = new URL(window.location.href);
    if (url.searchParams.has("paymentId")) {
      if (id) url.searchParams.set("paymentId", id);
      else url.searchParams.delete("paymentId");
    }
    url.hash = id;
    // Next preserves its own history fields and synchronizes the router URL for native History API updates.
    history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }
  function select(payment: OwnerPayment) {
    if (action.busy) return;
    stopReviewSound();
    focusNext.current = !desktop; setSelectedId(payment.id); setDetailOpen(true); setOpened(true);
    locationFor(payment.id);
  }
  function step(direction: "previous" | "next") {
    const target = payments[index + (direction === "next" ? 1 : -1)];
    if (action.busy || !target) return;
    stepFocus.current = direction; setSelectedId(target.id); setDetailOpen(true);
    locationFor(target.id);
  }
  function back() {
    const id = selected?.id;
    setDetailOpen(false); locationFor("");
    requestAnimationFrame(() => (document.querySelector<HTMLElement>(`[data-payment-row="${id}"]`) ?? document.getElementById("payment-queue-title"))?.focus());
  }
  function resolved(id: string) {
    stopReviewSound();
    setCompleted(shown => [...shown, id]); focusNext.current = true;
    const next = payments.find(payment => payment.id !== id);
    setSelectedId(next?.id ?? ""); setDetailOpen(!!next);
    locationFor(next?.id ?? "");
  }
  const refresh = (event: MouseEvent<HTMLButtonElement>) => {
    if (action.busy) return;
    refreshFocus.current = document.activeElement === event.currentTarget ? event.currentTarget : null;
    setRefreshMessage("");
    void refreshPendingPayments(true);
    refreshAdmin();
  };
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
      <StatusTabs as="nav" aria-label="Payment status">{Object.entries(tabLabels).map(([value, label]) => <Link key={value} href={`/admin/payments?tab=${value}`}
        prefetch={false} aria-current={tab === value ? "page" : undefined} aria-disabled={action.busy || undefined}
        onClick={event => { if (action.busy) event.preventDefault(); else { setDetailOpen(false); setRefreshMessage(""); } }}>{label}{value === "pending" && ` (${liveCount ?? pendingCount})`}</Link>)}</StatusTabs>
      <HeadEnd>
        {desktop && stepper}
        <RefreshSquare type="button" $changed={queueChanged} aria-label="Refresh queue" title="Refresh queue" disabled={action.busy} onClick={refresh}><ResetIcon /></RefreshSquare>
      </HeadEnd>
    </PaymentHead>
    {(feedback.notice || feedback.message) && <PaymentFeedback id="payment-feedback" tabIndex={-1} aria-label="Payment result"><ActionNotices action={feedback} /></PaymentFeedback>}
    <QueuePanel aria-labelledby="payment-queue-title" $reviewing={reviewing}>
      <h2 id="payment-queue-title" tabIndex={-1}>{tabLabels[tab as keyof typeof tabLabels] ?? "Pending"} queue</h2>
      <QueueBar>
        <form action="/admin/payments" method="get"><input type="hidden" name="tab" value={tab} />
          <SearchBar id="payment-search" name="search" label="Find a payment" submitLabel="Search all requests"
            value={search} maxLength={100} disabled={action.busy} autoComplete="off" onChange={event => setSearch(event.target.value)}
            filters={{ label: "Advanced filters", dialogId: filtersId, open: filtersOpen,
              count: Number(provider !== "all") + Number(sort !== "queue"),
              onOpen: () => { setFilterDraft({ provider, sort }); setFiltersOpen(true); } }} />
        </form>
        {filtersOpen && <CriteriaDialog id={filtersId} title="Payment filters" open onCancel={() => setFiltersOpen(false)} closeLabel="Close payment filters"
          onApply={() => { setProvider(filterDraft.provider); setSort(filterDraft.sort); setFiltersOpen(false); }} applyLabel="Apply filters" cancelLabel="Cancel"
          onReset={() => setFilterDraft({ provider: "all", sort: "queue" })} resetLabel="Reset">
          <QueueFilters>
            <FloatingField label="Payment provider"><select aria-label="Payment provider" value={filterDraft.provider} onChange={event => setFilterDraft(current => ({ ...current, provider: event.target.value }))}><option value="all">All providers</option><option value="mtn">MTN MoMo</option><option value="airtel">Airtel Money</option></select></FloatingField>
            <FloatingField label="Sort payments"><select aria-label="Sort payments" value={filterDraft.sort} onChange={event => setFilterDraft(current => ({ ...current, sort: event.target.value as PaymentSort }))}>{paymentSortOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></FloatingField>
          </QueueFilters>
        </CriteriaDialog>}
      </QueueBar>
      <QueueSummary><span data-payment-count>{payments.length} of {queue.total ?? payments.length} requests</span><span>{sort !== "queue" ? paymentSortOptions.find(option => option.value === sort)?.label : tab === "pending" ? "Oldest first" : "Newest first"}</span>
        {queue.page && <nav aria-label="Payment pages">{queue.page > 1 && <Link href={`/admin/payments?tab=${tab}&page=${queue.page - 1}&search=${encodeURIComponent(queue.search ?? "")}`}>Previous page</Link>}{" "}
          Page {queue.page}{" "}{queue.page * (queue.pageSize ?? 30) < (queue.total ?? 0) && <Link href={`/admin/payments?tab=${tab}&page=${queue.page + 1}&search=${encodeURIComponent(queue.search ?? "")}`}>Next page</Link>}</nav>}
        {queueChanged && <span role="status" data-payment-queue-updated>Queue updated</span>}</QueueSummary>
      {payments.length ? <TicketTray $opened={opened} data-payment-queue-scroll tabIndex={0} aria-label="Payment list">{payments.map(payment => {
        const warnings = paymentWarnings(payment).length, network = payment.final?.network || payment.network;
        return <li key={payment.id}><Ticket type="button" aria-current={selected?.id === payment.id ? "true" : undefined} aria-controls="payment-review"
          disabled={action.busy} onClick={() => select(payment)} data-payment-row={payment.id}>
          <TicketProvider><NetworkChip network={network} labelled /></TicketProvider>
          <TicketRef data-ticket-ref title={payment.reference}>{payment.reference}<span data-ticket-inline-network><NetworkChip network={network} labelled /></span></TicketRef>
          <TicketAmount data-ticket-amount>{formatUgx(payment.final?.amount ?? payment.amount)}</TicketAmount>
          <TicketMeta><TicketPhone data-ticket-phone>{payment.payerPhone ? phoneLabel(payment.payerPhone) : "Payer not provided"}</TicketPhone><span data-ticket-separator> · </span><TicketPlan data-ticket-plan title={payment.purpose === "topup" ? "Credit top-up" : `${payment.planName}${payment.durationDays !== null ? ` · ${formatPlanLength(payment.durationDays)}` : ""}`}>{payment.purpose === "topup" ? "Credit top-up" : payment.planName}<span data-ticket-duration>{payment.purpose !== "topup" && payment.durationDays !== null ? ` · ${formatPlanLength(payment.durationDays)}` : ""}</span></TicketPlan></TicketMeta>
          <TicketTime data-ticket-time>{ticketTime(payment.submittedAt)}<span data-ticket-timezone> EAT</span></TicketTime>
          {warnings > 0 && <TicketWarn><AlertIcon />{warnings} warning{warnings === 1 ? "" : "s"}</TicketWarn>}
        </Ticket></li>;
      })}</TicketTray> : <QueueEmpty data-payment-empty><CheckIcon /><strong>{search || provider !== "all" ? "No matching payments" : tab === "pending" ? "No payments waiting" : "No payments here yet"}</strong>
        {(search || provider !== "all") && <ActionButton type="button" disabled={action.busy} onClick={() => { setSearch(""); setProvider("all"); }}>Clear filters</ActionButton>}</QueueEmpty>}
    </QueuePanel>
    <ReviewSection id="payment-review" aria-label="Review payment" tabIndex={-1} $reviewing={reviewing}>
      {selected?.workflowVersion === 2 ? <CheckoutReview key={selected.id} payment={selected} nav={nav} onResolved={() => { resolved(selected.id); refreshAdmin(); }} /> : selected ? <PaymentReview key={selected.id} payment={selected} plans={plans} action={action} recovery={recoveries[selected.id]} nav={nav}
        onStart={() => { setRefreshMessage(""); setActionReference(selected.reference); }} onResolved={() => resolved(selected.id)}
        onRecovery={value => setRecoveries(shown => ({ ...shown, [selected.id]: value }))} /> : <QueueEmpty data-payment-review-empty><CheckIcon /><strong>No payment selected</strong><span>Choose another status or clear the filters.</span></QueueEmpty>}
    </ReviewSection>
  </PaymentLayout>;
}
