"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent } from "react";
import Link from "@/components/navigation/navigation-link";
import { closeDetails, useOutsideDismiss } from "@/components/ui/use-outside-dismiss";
import { AlertIcon, CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, GiftIcon, ResetIcon, SearchIcon } from "@/components/ui/icons";
import { formatPhone } from "@/domain/phone";
import { formatPeriodEnd } from "@/domain/subscription-period";
import { formatUgx, type SubscriptionPlanView } from "@/domain/subscription-plans";
import type { OwnerPayment, PaymentQueue } from "@/domain/owner-members";
import { ActionButton } from "./admin-form";
import { ActionNotices, useCodeAction, type CodeAction } from "./code-tools";
import { NetworkChip } from "./network-chip";
import { paymentWarnings, PaymentReview, type PaymentRecovery } from "./payment-review";
import { getPendingPaymentsSnapshot, getServerPendingPaymentsSnapshot, refreshPendingPayments, subscribePendingPayments } from "./pending-payments";
import { useAdminRefresh } from "./use-admin-refresh";
import { HeadEnd, PaymentFeedback, PaymentHead, PaymentLayout, QueueBar, QueueEmpty, QueuePanel, QueueSummary, RefreshSquare, ReviewBack, ReviewNav, ReviewSection,
  SearchField, StatusTabs, Stepper, Ticket, TicketAmount, TicketMeta, TicketRef, TicketTime, TicketTray, TicketWarn, TrialDrawer, TrialList, TrialPopover } from "./payment-styles";

const tabLabels = { pending: "Pending", approved: "Approved", rejected: "Rejected", superseded: "Replaced reports" };
const phoneLabel = (phone: string | null) => phone ? `+${formatPhone(phone)}` : "Erased account";
const searchText = (value: string) => value.toLowerCase().replace(/[\s()+.-]/gu, "");
const ticketDate = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kampala", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** Day and time only: the review header carries the full EAT timestamp. */
function ticketTime(instant: string) {
  const parts = Object.fromEntries(ticketDate.formatToParts(new Date(instant)).map(({ type, value }) => [type, value]));
  return `${parts.day} ${parts.month}, ${parts.hour}:${parts.minute}`;
}

type Trial = PaymentQueue["trials"][number];
function TrialRequests({ trials, action, onStart }: { trials: readonly Trial[]; action: CodeAction; onStart: () => void }) {
  return <TrialList>{trials.map(trial => <li key={trial.id}><span><strong>{phoneLabel(trial.phone)}</strong><small>Requested {formatPeriodEnd(new Date(trial.trialRequestedAt))}</small></span>
    <div><ActionButton type="button" $variant="primary" disabled={action.busy} onClick={() => { onStart(); void action.send("/api/admin/codes", { action: "trial", id: trial.id }); }}>Grant free trial</ActionButton>
      <ActionButton type="button" disabled={action.busy} onClick={() => { onStart(); void action.send("/api/admin/codes", { action: "dismiss-trial", id: trial.id }, "Trial request dismissed."); }}>Dismiss</ActionButton></div></li>)}</TrialList>;
}

/** Payment decisions share one queue; only the selected report mounts a review form. */
export function PaymentsEditor({ queue, plans, tab }: { queue: PaymentQueue; plans: readonly SubscriptionPlanView[]; tab: string }) {
  const mutation = useCodeAction(), [refreshMessage, setRefreshMessage] = useState("");
  const { refreshing, refresh: refreshAdmin } = useAdminRefresh(setRefreshMessage);
  const action = { ...mutation, busy: mutation.busy || refreshing };
  const liveCount = useSyncExternalStore(subscribePendingPayments, getPendingPaymentsSnapshot, getServerPendingPaymentsSnapshot);
  const [search, setSearch] = useState(""), [selectedId, setSelectedId] = useState(queue.payments[0]?.id ?? "");
  const [detailOpen, setDetailOpen] = useState(false), [completed, setCompleted] = useState<readonly string[]>([]);
  const [recoveries, setRecoveries] = useState<Record<string, PaymentRecovery>>({});
  const [actionReference, setActionReference] = useState(""), [trialsOpen, setTrialsOpen] = useState(false), [opened, setOpened] = useState(false);
  const focusNext = useRef(false), stepFocus = useRef<"previous" | "next" | null>(null);
  const refreshFocus = useRef<HTMLButtonElement | null>(null);
  const lastHash = useRef<string | null>(null), trialMenu = useRef<HTMLDetailsElement>(null);
  const query = searchText(search);
  const payments = queue.payments.filter(payment => !(completed.includes(payment.id) && ["pending", "superseded"].includes(payment.status)) && (!query || searchText([
    payment.reference, payment.accountPhone ?? "", payment.payerPhone ?? "", payment.transactionId, payment.final?.transactionId ?? "", payment.planName,
  ].join(" ")).includes(query)));
  const selected = payments.find(payment => payment.id === selectedId) ?? payments[0];
  const selectedKey = selected?.id, index = selected ? payments.indexOf(selected) : -1;
  const reviewing = detailOpen && !!selected;
  const pendingCount = Math.max(0, queue.pendingCount - queue.payments.filter(payment => payment.status === "pending" && completed.includes(payment.id)).length);
  const queueChanged = liveCount !== null && liveCount !== pendingCount;
  const closeTrials = useCallback(() => closeDetails(trialMenu.current, () => setTrialsOpen(false)), []);
  useOutsideDismiss({ enabled: trialsOpen, root: trialMenu, onDismiss: closeTrials });

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
    // The stepper remounts with the review, so focus returns to the same step button (or the other one at the end of the queue).
    if (stepFocus.current) {
      const direction = stepFocus.current; stepFocus.current = null;
      const target = document.querySelector<HTMLButtonElement>(`[data-payment-step="${direction}"]:not(:disabled)`) ?? document.querySelector<HTMLButtonElement>("[data-payment-step]:not(:disabled)");
      (target ?? document.getElementById("payment-review"))?.focus({ preventScroll: true });
      return;
    }
    if (!focusNext.current) return;
    focusNext.current = false;
    const target = document.getElementById(selectedKey ? "payment-review" : "payment-queue-title");
    target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: "start" });
  }, [selectedKey, detailOpen]);

  useEffect(() => {
    if (!action.notice && !action.message) return;
    const result = document.getElementById("payment-feedback");
    result?.focus({ preventScroll: true }); result?.scrollIntoView({ block: "start" });
  }, [action.notice, action.message]);

  function locationFor(id: string) {
    lastHash.current = id;
    // Next preserves its own history fields and synchronizes the router URL for native History API updates.
    history.replaceState(null, "", `${location.pathname}${location.search}${id ? `#${id}` : ""}`);
  }
  function select(payment: OwnerPayment) {
    if (action.busy) return;
    focusNext.current = true; setSelectedId(payment.id); setDetailOpen(true); setOpened(true);
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
    setCompleted(shown => [...shown, id]); focusNext.current = false;
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
  const trialStart = () => { setRefreshMessage(""); setActionReference("Free trial"); closeTrials(); };
  const feedback = { ...action, notice: action.notice && `${actionReference ? `${actionReference} · ` : ""}${action.notice}`,
    message: refreshMessage || (action.message && `${actionReference ? `${actionReference} · ` : ""}${action.message}`) };
  const showTrials = tab === "pending" && queue.trials.length > 0;
  const trialsLabel = `Free trial requests (${queue.trials.length})`;
  const nav = selected && <ReviewNav>
    <ReviewBack type="button" disabled={action.busy} onClick={back} data-review-back><ChevronLeftIcon />All payments</ReviewBack>
    {payments.length > 1 && <Stepper role="group" aria-label={`Report ${index + 1} of ${payments.length}`}>
      <button type="button" aria-label={index > 0 ? `Previous report, ${payments[index - 1]!.reference}` : "Previous report"} disabled={action.busy || index <= 0}
        onClick={() => step("previous")} data-payment-step="previous"><ChevronLeftIcon /></button>
      <span aria-hidden="true">{index + 1} of {payments.length}</span>
      <button type="button" aria-label={index < payments.length - 1 ? `Next report, ${payments[index + 1]!.reference}` : "Next report"} disabled={action.busy || index >= payments.length - 1}
        onClick={() => step("next")} data-payment-step="next"><ChevronRightIcon /></button>
    </Stepper>}
  </ReviewNav>;

  return <PaymentLayout data-payments-editor data-analytics-ignore>
    <PaymentHead $reviewing={reviewing}>
      <h1>Payments</h1>
      <StatusTabs as="nav" aria-label="Payment status">{Object.entries(tabLabels).map(([value, label]) => <Link key={value} href={`/admin/payments?tab=${value}`}
        prefetch={false} aria-current={tab === value ? "page" : undefined} aria-disabled={action.busy || undefined}
        onClick={event => { if (action.busy) event.preventDefault(); else { setDetailOpen(false); setRefreshMessage(""); } }}>{label}{value === "pending" && ` (${liveCount ?? pendingCount})`}</Link>)}</StatusTabs>
      <HeadEnd>
        <RefreshSquare type="button" $changed={queueChanged} aria-label="Refresh queue" title="Refresh queue" disabled={action.busy} onClick={refresh}><ResetIcon /></RefreshSquare>
        {showTrials && <TrialPopover ref={trialMenu} onToggle={event => setTrialsOpen(event.currentTarget.open)} data-payment-trials
          onKeyDown={(event: KeyboardEvent<HTMLDetailsElement>) => { if (event.key === "Escape" && trialsOpen) { event.preventDefault(); closeTrials(); trialMenu.current?.querySelector("summary")?.focus(); } }}>
          <summary><GiftIcon />{trialsLabel}<ChevronDownIcon /></summary>
          <div><TrialRequests trials={queue.trials} action={action} onStart={trialStart} /></div>
        </TrialPopover>}
      </HeadEnd>
    </PaymentHead>
    {(feedback.notice || feedback.message) && <PaymentFeedback id="payment-feedback" tabIndex={-1} aria-label="Payment result"><ActionNotices action={feedback} /></PaymentFeedback>}
    <QueuePanel aria-labelledby="payment-queue-title" $reviewing={reviewing}>
      <h2 id="payment-queue-title" tabIndex={-1}>{tabLabels[tab as keyof typeof tabLabels] ?? "Pending"} queue</h2>
      <QueueBar>
        <SearchField><label htmlFor="payment-search">Find a payment</label><SearchIcon aria-hidden="true" />
          <input id="payment-search" type="search" placeholder="Phone, transaction ID or reference" value={search} maxLength={100} disabled={action.busy} autoComplete="off"
            onChange={event => setSearch(event.target.value)} /></SearchField>
        <QueueSummary><span data-payment-count>{payments.length} {tab === "pending" ? "waiting" : payments.length === 1 ? "report" : "reports"}</span><span>Up to 100</span><span>{tab === "pending" ? "Oldest first" : "Newest first"}</span>
          {queueChanged && <span role="status" data-payment-queue-updated>Queue updated</span>}</QueueSummary>
        <ActionButton type="button" {...(queueChanged ? { $variant: "primary" as const } : {})} disabled={action.busy} onClick={refresh}><ResetIcon />Refresh queue</ActionButton>
      </QueueBar>
      {payments.length ? <TicketTray $opened={opened}>{payments.map(payment => {
        const warnings = paymentWarnings(payment).length, network = payment.final?.network || payment.network;
        return <li key={payment.id}><Ticket type="button" aria-current={selected?.id === payment.id ? "true" : undefined} aria-controls="payment-review"
          disabled={action.busy} onClick={() => select(payment)} data-payment-row={payment.id}>
          <TicketRef>{payment.reference}<NetworkChip network={network} labelled /></TicketRef>
          <TicketAmount>{formatUgx(payment.final?.amount ?? payment.amount)}</TicketAmount>
          <TicketMeta>{payment.payerPhone ? phoneLabel(payment.payerPhone) : "Payer not provided"} · {payment.purpose === "topup" ? "Credit top-up" : payment.planName}</TicketMeta>
          <TicketTime>{ticketTime(payment.submittedAt)}</TicketTime>
          {warnings > 0 && <TicketWarn><AlertIcon />{warnings} warning{warnings === 1 ? "" : "s"}</TicketWarn>}
        </Ticket></li>;
      })}</TicketTray> : <QueueEmpty data-payment-empty><CheckIcon /><strong>{search ? "No matching payments" : tab === "pending" ? "No payments waiting" : "No payments here yet"}</strong></QueueEmpty>}
    </QueuePanel>
    {showTrials && <TrialDrawer $reviewing={reviewing} data-payment-trials><summary><GiftIcon />{trialsLabel}<ChevronDownIcon /></summary>
      <div><TrialRequests trials={queue.trials} action={action} onStart={() => { setRefreshMessage(""); setActionReference("Free trial"); }} /></div></TrialDrawer>}
    {selected && <ReviewSection id="payment-review" aria-label="Review payment" tabIndex={-1} $reviewing={reviewing}>
      <PaymentReview key={selected.id} payment={selected} plans={plans} action={action} recovery={recoveries[selected.id]} nav={nav}
        onStart={() => { setRefreshMessage(""); setActionReference(selected.reference); }} onResolved={() => resolved(selected.id)}
        onRecovery={value => setRecoveries(shown => ({ ...shown, [selected.id]: value }))} />
    </ReviewSection>}
  </PaymentLayout>;
}
