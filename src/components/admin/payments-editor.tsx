"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/navigation/navigation-link";
import { TextInput } from "@/components/ui/controls";
import { CheckIcon, ChevronLeftIcon, GiftIcon, ResetIcon, SearchIcon } from "@/components/ui/icons";
import { formatPhone } from "@/domain/phone";
import { formatPeriodEnd } from "@/domain/subscription-period";
import { formatUgx, type SubscriptionPlanView } from "@/domain/subscription-plans";
import type { OwnerPayment, PaymentQueue } from "@/domain/owner-members";
import { ActionButton, ButtonRow } from "./admin-form";
import { ActionNotices, useCodeAction } from "./code-tools";
import { PaymentReview, type PaymentRecovery } from "./payment-review";
import { getPendingPaymentsSnapshot, getServerPendingPaymentsSnapshot, refreshPendingPayments, subscribePendingPayments } from "./pending-payments";
import { PaymentEmpty, PaymentFeedback, PaymentLayout, PaymentTabs, PaymentToolbar, PaymentWorkspace, QueueHeading, QueueItem, QueueList,
  QueueMeta, QueuePanel, ReviewBack, ReviewPanel, TrialPanel } from "./payment-styles";

const tabLabels = { pending: "Pending", approved: "Approved", rejected: "Rejected", superseded: "Replaced reports" };
const phoneLabel = (phone: string | null) => phone ? `+${formatPhone(phone)}` : "Erased account";
const searchText = (value: string) => value.toLowerCase().replace(/[\s()+.-]/gu, "");

/** Payment decisions share one queue; only the selected report mounts a review form. */
export function PaymentsEditor({ queue, plans, tab }: { queue: PaymentQueue; plans: readonly SubscriptionPlanView[]; tab: string }) {
  const router = useRouter(), action = useCodeAction();
  const liveCount = useSyncExternalStore(subscribePendingPayments, getPendingPaymentsSnapshot, getServerPendingPaymentsSnapshot);
  const [search, setSearch] = useState(""), [selectedId, setSelectedId] = useState(queue.payments[0]?.id ?? "");
  const [detailOpen, setDetailOpen] = useState(false), [completed, setCompleted] = useState<readonly string[]>([]);
  const [recoveries, setRecoveries] = useState<Record<string, PaymentRecovery>>({});
  const [actionReference, setActionReference] = useState("");
  const focusNext = useRef(false);
  const lastHash = useRef<string | null>(null);
  const query = searchText(search);
  const payments = queue.payments.filter(payment => !(completed.includes(payment.id) && ["pending", "superseded"].includes(payment.status)) && (!query || searchText([
    payment.reference, payment.accountPhone ?? "", payment.payerPhone ?? "", payment.transactionId, payment.final?.transactionId ?? "", payment.planName,
  ].join(" ")).includes(query)));
  const selected = payments.find(payment => payment.id === selectedId) ?? payments[0];
  const selectedKey = selected?.id;
  const pendingCount = Math.max(0, queue.pendingCount - queue.payments.filter(payment => payment.status === "pending" && completed.includes(payment.id)).length);
  const queueChanged = liveCount !== null && liveCount !== pendingCount;

  useEffect(() => {
    const readHash = () => {
      const id = window.location.hash.slice(1);
      if (lastHash.current === id) return;
      lastHash.current = id;
      if (queue.payments.some(payment => payment.id === id)) { setSelectedId(id); setDetailOpen(true); }
    };
    readHash(); window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, [queue.payments]);

  useEffect(() => {
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
    history.replaceState(history.state, "", `${location.pathname}${location.search}${id ? `#${id}` : ""}`);
  }

  function select(payment: OwnerPayment) {
    if (action.busy) return;
    focusNext.current = true; setSelectedId(payment.id); setDetailOpen(true);
    locationFor(payment.id);
  }
  function resolved(id: string) {
    setCompleted(shown => [...shown, id]); focusNext.current = false;
    const next = payments.find(payment => payment.id !== id);
    setSelectedId(next?.id ?? ""); setDetailOpen(!!next);
    locationFor(next?.id ?? "");
  }
  const feedback = { ...action, notice: action.notice && `${actionReference ? `${actionReference} · ` : ""}${action.notice}`,
    message: action.message && `${actionReference ? `${actionReference} · ` : ""}${action.message}` };

  return <PaymentLayout data-payments-editor data-analytics-ignore>
    <PaymentTabs aria-label="Payment status">{Object.entries(tabLabels).map(([value, label]) => <Link key={value} href={`/admin/payments?tab=${value}`}
      prefetch={false} aria-current={tab === value ? "page" : undefined} aria-disabled={action.busy || undefined}
      onClick={event => { if (action.busy) event.preventDefault(); else setDetailOpen(false); }}>{label}{value === "pending" && ` (${liveCount ?? pendingCount})`}</Link>)}</PaymentTabs>
    <PaymentToolbar $reviewing={detailOpen}><TextInput id="payment-search" type="search" label="Find a payment" placeholder="Phone, transaction ID or reference" leading={<SearchIcon />}
      value={search} maxLength={100} disabled={action.busy} autoComplete="off" onChange={event => setSearch(event.target.value)} />
      <QueueMeta><span data-payment-count>{payments.length} {tab === "pending" ? "waiting" : "reports"}</span><span>Up to 100 · {tab === "pending" ? "Oldest first" : "Newest first"}</span>
        {queueChanged && <span role="status" data-payment-queue-updated>Queue updated</span>}
        <ActionButton type="button" $variant={queueChanged ? "primary" : "secondary"} disabled={action.busy} onClick={() => { void refreshPendingPayments(true); router.refresh(); }}><ResetIcon />Refresh queue</ActionButton></QueueMeta>
    </PaymentToolbar>
    {(feedback.notice || feedback.message) && <PaymentFeedback id="payment-feedback" tabIndex={-1} aria-label="Payment result"><ActionNotices action={feedback} /></PaymentFeedback>}
    <PaymentWorkspace $detailOpen={detailOpen} data-payment-workspace>
      <QueuePanel aria-label="Payment queue"><QueueHeading><h2 id="payment-queue-title" tabIndex={-1}>{tabLabels[tab as keyof typeof tabLabels] ?? "Pending"}</h2><span>{payments.length}</span></QueueHeading>
        <QueueList>{payments.length ? payments.map(payment => <QueueItem key={payment.id} type="button" $selected={selected?.id === payment.id}
          disabled={action.busy} aria-pressed={selected?.id === payment.id} aria-controls="payment-review" onClick={() => select(payment)} data-payment-row={payment.id}>
          <header><strong>{payment.payerPhone ? phoneLabel(payment.payerPhone) : "Payer not provided"}</strong><strong>{formatUgx(payment.final?.amount ?? payment.amount)}</strong></header>
          <small>Transaction ID: {payment.final?.transactionId || payment.transactionId || "Not provided"}</small>
        </QueueItem>) : <PaymentEmpty data-payment-empty><CheckIcon /><p>{search ? "No matching payments" : tab === "pending" ? "No payments waiting" : "No payments here yet"}</p></PaymentEmpty>}</QueueList>
      </QueuePanel>
      <ReviewPanel id="payment-review" aria-label="Review payment" tabIndex={-1}>
        <ReviewBack type="button" disabled={action.busy} onClick={() => { setDetailOpen(false); locationFor(""); requestAnimationFrame(() => document.getElementById("payment-queue-title")?.focus()); }}><ChevronLeftIcon />All payments</ReviewBack>
        {selected ? <PaymentReview key={selected.id} payment={selected} plans={plans} action={action} recovery={recoveries[selected.id]}
          onStart={() => setActionReference(selected.reference)} onResolved={() => resolved(selected.id)}
          onRecovery={value => setRecoveries(shown => ({ ...shown, [selected.id]: value }))} />
          : <PaymentEmpty><CheckIcon /><p>{search ? "No matching payment" : "Queue complete"}</p></PaymentEmpty>}
      </ReviewPanel>
    </PaymentWorkspace>
    {tab === "pending" && queue.trials.length > 0 && <TrialPanel data-payment-trials><summary><GiftIcon />Free trial requests ({queue.trials.length})</summary><div>
      {queue.trials.map(trial => <div key={trial.id}><QueueHeading><strong>{phoneLabel(trial.phone)}</strong><span>{formatPeriodEnd(new Date(trial.trialRequestedAt))}</span></QueueHeading>
        <ButtonRow><ActionButton type="button" disabled={action.busy} onClick={() => { setActionReference("Free trial"); void action.send("/api/admin/codes", { action: "trial", id: trial.id }); }}>Grant free trial</ActionButton>
          <ActionButton type="button" disabled={action.busy} onClick={() => { setActionReference("Free trial"); void action.send("/api/admin/codes", { action: "dismiss-trial", id: trial.id }, "Trial request dismissed."); }}>Dismiss</ActionButton></ButtonRow></div>)}
    </div></TrialPanel>}
  </PaymentLayout>;
}
