"use client";

import { SearchBar } from "@/components/ui/search-bar";
import { AdvancedFilterDialog } from "@/components/ui/advanced-filter-dialog";
import { ShowMore } from "@/components/ui/show-more";
import { SelectMenu } from "@/components/ui/select-menu";
import { appendUniqueRecords, useAppendRequest } from "@/components/ui/use-append-request";
import { useDesktopLayout } from "@/components/ui/use-desktop-layout";
import { stopReviewSound } from "./payment-alert-sound";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, ChevronLeftIcon } from "@/components/ui/icons";
import { goHistoryBack } from "@/components/navigation/context-history";
import { checkoutOpenStatuses } from "@/domain/checkout";
import { formatPhone } from "@/domain/phone";
import { defaultPaymentFilters, maximumPaymentQueuePage, paymentProviderLabels, paymentQueueStatusLabels, paymentStatusLabels, type PaymentFilters } from "@/domain/payment-queue-filters";
import { formatUgx, type SubscriptionPlanView } from "@/domain/subscription-plans";
import type { OwnerPayment, PaymentQueue, PaymentQueueCursor } from "@/domain/owner-members";
import { createMessages } from "@/i18n/messages";
import { CheckField } from "./admin-form";
import { ActionNotices, useCodeAction } from "./code-tools";
import { NetworkChip } from "./network-chip";
import { PaymentReview, type PaymentRecovery } from "./payment-review";
import { getPendingPaymentsSnapshot, getServerPendingPaymentsSnapshot, refreshPendingPayments, subscribePendingPayments } from "./pending-payments";
import { useAdminRefresh } from "./use-admin-refresh";
import { paymentSortOptions, readPaymentSort, sortPayments, type PaymentSort } from "./payment-order";
import { CheckoutReview } from "./checkout-review";
import { PaymentFeedback, PaymentHead, PaymentLayout, QueueBar, QueueEmpty, QueueFilters, QueueFooter, QueuePanel, ReviewBack, ReviewSection,
  TicketItem, TicketTray } from "./payment-styles";
import { RecordItemTitle, RecordRowContent } from "./record-workspace";

const openStatuses: readonly string[] = checkoutOpenStatuses;
const messages = createMessages("en");
type PaymentAppend = Readonly<{ scope: string; page: number; payments: PaymentQueue["payments"];
  continuation: PaymentQueueCursor | null; nextPendingId: string | undefined }>;
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

function isPaymentBatch(value: unknown): value is PaymentQueue & { continuation: PaymentQueueCursor | null } {
  if (!value || typeof value !== "object") return false;
  const { payments, continuation, nextPendingId } = value as Partial<PaymentQueue>;
  return (continuation === null || typeof continuation?.id === "string" && typeof continuation.submittedAt === "string"
    && Number.isFinite(Date.parse(continuation.submittedAt)))
    && (nextPendingId === undefined || typeof nextPendingId === "string")
    && Array.isArray(payments) && payments.every(payment => typeof payment?.id === "string" && typeof payment.status === "string"
      && typeof payment.reference === "string" && Number.isFinite(Date.parse(payment.submittedAt)) && Array.isArray(payment.checks));
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
  (document.querySelector<HTMLElement>(`[data-payment-row="${CSS.escape(id ?? "")}"]`) ?? document.getElementById("payment-queue-title"))?.focus({ preventScroll: true });
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
  const [selectedId, setSelectedId] = useState<string | null>(initialPaymentId ?? queue.payments[0]?.id ?? "");
  const filtersId = useId(), [filtersOpen, setFiltersOpen] = useState(false);
  const [filterDraft, setFilterDraft] = useState(filters);
  const [detailOpen, setDetailOpen] = useState(!!initialPaymentId);
  const [completed, setCompleted] = useState<Record<string, { status: string; version: number }>>({});
  const [queueSnapshot, setQueueSnapshot] = useState({ queue, version: 0 });
  const version = queueSnapshot.version + Number(queueSnapshot.queue !== queue);
  if (queueSnapshot.queue !== queue) setQueueSnapshot({ queue, version });
  const [added, setAdded] = useState<PaymentAppend | null>(null);
  const [recoveries, setRecoveries] = useState<Record<string, PaymentRecovery>>({});
  const [actionReference, setActionReference] = useState(""), [opened, setOpened] = useState(!!initialPaymentId);
  const focusNext = useRef(false), backButton = useRef<HTMLButtonElement>(null);
  const [dirtyId, setDirtyId] = useState<string>();
  const [reviewFocused, setReviewFocused] = useState(false);
  const refreshedCount = useRef<number | null>(null);
  const lastHash = useRef<string | null>(null);
  const queueOrigin = useRef<{ url: string; id: string; scrollTop: number }>(null);
  const queueScroll = useRef<HTMLOListElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const [routeFocus, setRouteFocus] = useState(queue.focusId);
  if (queue.focusId !== routeFocus) {
    setRouteFocus(queue.focusId);
    if (queue.focusId) {
      setSelectedId(queue.focusId);
      setDetailOpen(true);
      setOpened(true);
    }
  }
  const page = queue.page ?? 1, previousPage = useRef(page);
  const scope = `${paymentQueueHref(filters, sort, queue.search, page)}:${initialPaymentId ?? ""}`;
  const append = useAppendRequest(scope);
  const tail = added?.scope === scope ? added : null;
  const continuation = tail ? tail.continuation : queue.continuation;
  const lastPage = tail?.page ?? page;
  const loaded = useMemo(() => appendUniqueRecords(sortPayments(queue.payments, sort), tail?.payments ?? [], payment => payment.id),
    [queue.payments, sort, tail]);
  const payments = useMemo(() => loaded.filter(payment => completed[payment.id]?.status !== payment.status), [loaded, completed]);
  const selected = selectedId === null ? undefined : payments.find(payment => payment.id === selectedId) ?? payments[0];
  const selectedKey = selected?.id, index = selected ? payments.indexOf(selected) : -1;
  const reviewing = detailOpen && !!selected;
  const nextPending = payments.slice(index + 1).find(payment => payment.status === "pending")
    ?? payments.slice(0, Math.max(0, index)).find(payment => payment.status === "pending");
  const following = tail ? tail.nextPendingId : queue.nextPendingId;
  const nextPagePending = !nextPending && following && following !== selectedKey && completed[following]?.status !== "pending" ? following : undefined;
  const pendingCount = useMemo(() => Math.max(0,
    queue.pendingCount - loaded.filter(payment => completed[payment.id]?.version === version
      && completed[payment.id]?.status === payment.status && openStatuses.includes(payment.status)).length),
  [queue.pendingCount, loaded, completed, version]);
  const queueChanged = liveCount !== null && liveCount !== pendingCount;
  const singleStatus = filters.statuses.length === 1 ? filters.statuses[0] : undefined;
  const showsPending = filters.statuses.includes("pending") || filters.statuses.includes("all");
  const filteredStatus = singleStatus !== "pending", filteredProvider = !filters.providers.includes("all");
  const showActivity = showsPending && queueChanged;
  const searchParams = paymentParams(filters, sort);

  useEffect(() => {
    if (previousPage.current === page) return;
    previousPage.current = page;
    if (!queueOrigin.current && queueScroll.current) queueScroll.current.scrollTop = 0;
  }, [page]);

  useEffect(() => {
    const origin = queueOrigin.current;
    if (reviewing || queue.focusId || !origin || window.location.href !== origin.url) return;
    const frame = requestAnimationFrame(() => {
      queueOrigin.current = null;
      if (queueScroll.current) queueScroll.current.scrollTop = origin.scrollTop;
      restoreQueueFocus(origin.id);
    });
    return () => cancelAnimationFrame(frame);
  }, [page, queue.focusId, reviewing]);

  useEffect(() => {
    const viewport = window.visualViewport, root = toolbar.current?.closest<HTMLElement>("[data-payments-editor]");
    if (desktop || reviewing || !viewport || !root) return;
    const resize = () => {
      if (viewport.scale === 1 && viewport.height < window.innerHeight)
        root.style.setProperty("--payment-viewport-height", `${viewport.height}px`);
      else root.style.removeProperty("--payment-viewport-height");
    };
    resize();
    viewport.addEventListener("resize", resize);
    return () => {
      viewport.removeEventListener("resize", resize);
      root.style.removeProperty("--payment-viewport-height");
    };
  }, [desktop, reviewing]);

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
      if (loaded.some(payment => payment.id === id)) { setSelectedId(id); setDetailOpen(true); setOpened(true); }
      else if (!id && previous) {
        setDetailOpen(false); setDirtyId(undefined);
        if (!queueOrigin.current) requestAnimationFrame(() => restoreQueueFocus(previous));
      }
    };
    readHash(); window.addEventListener("hashchange", readHash);
    window.addEventListener("popstate", readHash);
    return () => {
      window.removeEventListener("hashchange", readHash);
      window.removeEventListener("popstate", readHash);
    };
  }, [loaded]);

  useEffect(() => {
    if (!focusNext.current || !desktop && action.busy) return;
    focusNext.current = false;
    const target = !desktop && detailOpen && backButton.current
      ? backButton.current : document.getElementById(selectedKey ? "payment-review" : "payment-queue-title");
    target?.focus({ preventScroll: true });
    if (!desktop) target?.scrollIntoView({ block: "start" });
  }, [selectedKey, detailOpen, desktop, action.busy]);

  useEffect(() => {
    if (!action.notice && !action.message) return;
    const result = document.getElementById("payment-feedback");
    result?.focus({ preventScroll: true });
    if (!desktop) result?.scrollIntoView({ block: "start" });
  }, [action.notice, action.message, desktop]);

  function locationFor(id: string, push = false) {
    lastHash.current = id;
    const url = new URL(window.location.href);
    if (url.searchParams.has("focus")) url.search = paymentParams(filters, sort, queue.search, page).toString();
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
    if (push) {
      queueOrigin.current = { url: window.location.href, id: payment.id, scrollTop: queueScroll.current?.scrollTop ?? 0 };
    }
    stopReviewSound();
    focusNext.current = !desktop; setSelectedId(payment.id); setDetailOpen(true); setOpened(true);
    locationFor(payment.id, push);
  }
  function back() {
    if (queueOrigin.current) { goHistoryBack(); return; }
    setDetailOpen(false); setDirtyId(undefined); locationFor("");
    requestAnimationFrame(() => restoreQueueFocus(selectedKey));
  }
  function resolved(id: string, approved = false) {
    stopReviewSound();
    setDirtyId(undefined);
    if (selected) setCompleted(shown => ({ ...shown, [id]: { status: selected.status, version } }));
    const next = approved ? nextPending : payments.find(payment => payment.id !== id);
    if (approved && nextPagePending) {
      const params = paymentParams(filters, sort, queue.search, page);
      params.set("focus", nextPagePending);
      void refreshPendingPayments(true);
      if (desktop) startNavigation(() => router.push(`/admin/payments?${params}`, { scroll: false }));
      else {
        focusNext.current = true;
        // Replace the review entry so Back still returns to the queue the reviewer opened.
        startNavigation(() => router.replace(`/admin/payments?${params}#${nextPagePending}`, { scroll: false }));
      }
      return true;
    }
    if (!next && !desktop && queueOrigin.current) { back(); return; }
    focusNext.current = true;
    setSelectedId(next?.id ?? (approved ? null : "")); setDetailOpen(!!next);
    locationFor(next?.id ?? "");
  }
  function navigate(nextFilters: PaymentFilters, nextSort: PaymentSort, search = queue.search, page?: number) {
    const href = paymentQueueHref(nextFilters, nextSort, search, page);
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` === href) return;
    append.cancel();
    setAdded(null);
    queueOrigin.current = null;
    if (queueScroll.current) queueScroll.current.scrollTop = 0;
    setSelectedId(current => current ?? "");
    setDetailOpen(false); setDirtyId(undefined); setRefreshMessage("");
    startNavigation(() => router.push(href, { scroll: false }));
  }
  function appendQueue() {
    if (!continuation || lastPage >= maximumPaymentQueuePage || action.busy) return;
    const next = lastPage + 1, params = paymentParams(filters, sort, queue.search, next);
    params.set("afterId", continuation.id);
    params.set("afterAt", continuation.submittedAt);
    void append.append(async signal => {
      const response = await fetch(`/api/admin/payments?${params}`, { signal, cache: "no-store", headers: { Accept: "application/json" } });
      if (signal.aborted) return;
      if (response.status === 401) {
        router.refresh();
        throw new Error();
      }
      if (!response.ok) throw new Error();
      const batch: unknown = await response.json();
      if (signal.aborted) return;
      if (!isPaymentBatch(batch) || (batch.continuation?.id === continuation.id && batch.continuation.submittedAt === continuation.submittedAt)) throw new Error();
      setAdded(current => ({
        scope, page: next, continuation: batch.continuation, nextPendingId: batch.nextPendingId,
        payments: appendUniqueRecords(current?.scope === scope ? current.payments : [], sortPayments(batch.payments, sort), payment => payment.id),
      }));
    });
  }
  const feedback = { ...action, notice: action.notice && `${actionReference ? `${actionReference} · ` : ""}${action.notice}`,
    message: refreshMessage || (action.message && `${actionReference ? `${actionReference} · ` : ""}${action.message}`) };

  return <PaymentLayout aria-busy={action.busy || undefined} data-payments-editor data-payment-mobile-queue={!reviewing || undefined} data-layout="balanced" data-analytics-ignore>
    <PaymentHead $reviewing={reviewing}>
      <h1>Payments</h1>
      {reviewing && <ReviewBack ref={backButton} type="button" disabled={action.busy} onClick={back} data-review-back>
        <ChevronLeftIcon />Back to payments
      </ReviewBack>}
      <QueueBar ref={toolbar} data-admin-toolbar>
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
      {payments.length ? <TicketTray ref={queueScroll} $opened={opened} data-payment-queue-scroll tabIndex={0} aria-label="Payment list">{payments.map(payment => {
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
        </TicketItem></li>;
      })}
        {continuation && lastPage < maximumPaymentQueuePage && <li><ShowMore hasMore disabled={action.busy}
          messages={messages} loading={append.loading} failed={append.failed} onShowMore={appendQueue} /></li>}
      </TicketTray> : <QueueEmpty data-payment-empty><CheckIcon /><strong>{queue.search || filteredProvider ? "No matching payments" : singleStatus === "pending" ? "No payments waiting" : "No payments here yet"}</strong>
      </QueueEmpty>}
      {showActivity && <QueueFooter data-payment-queue-footer>
        <span role="status" data-payment-queue-updated>New queue activity</span>
      </QueueFooter>}
    </QueuePanel>
    <ReviewSection id="payment-review" aria-label="Review payment" tabIndex={-1} $reviewing={reviewing}
      onFocusCapture={event => setReviewFocused(event.target !== event.currentTarget)}
      onBlurCapture={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setReviewFocused(false); }}
      onChangeCapture={() => setDirtyId(selectedKey)}>
      {selected?.workflowVersion === 2 ? <CheckoutReview key={desktop ? "checkout" : selected.id} payment={selected} hasNext={!!(nextPending || nextPagePending)} busy={action.busy} onBusyChange={setCheckoutBusy}
        onResolved={approved => { if (!resolved(selected.id, approved)) refreshAdmin(); }} /> : selected ? <PaymentReview key={desktop ? "legacy" : selected.id} payment={selected} plans={plans} action={action} recovery={recoveries[selected.id]}
        hasNext={!!(nextPending || nextPagePending)} nextAcrossPages={!!nextPagePending}
        onStart={() => { setRefreshMessage(""); setActionReference(selected.reference); }} onResolved={approved => resolved(selected.id, approved)}
        onRecovery={value => setRecoveries(shown => ({ ...shown, [selected.id]: value }))} /> : <QueueEmpty data-payment-review-empty><CheckIcon /><strong>No payment selected</strong><span>Choose another status or clear the filters.</span></QueueEmpty>}
    </ReviewSection>
  </PaymentLayout>;
}
