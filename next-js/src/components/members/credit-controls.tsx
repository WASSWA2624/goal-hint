"use client";

import { FloatingField } from "@/components/ui/floating-field";

import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import styled from "styled-components";
import { Button } from "@/components/ui/controls";
import { CriteriaDialog } from "@/components/ui/criteria-dialog";
import { formatShortDay } from "@/domain/subscription-expiry";
import { formatPeriodEnd } from "@/domain/subscription-period";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import type { CreditView } from "@/domain/wallet";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { AccountAction, AccountBlock, AccountBlockActions, AccountBlockText, AccountFine } from "./account-overview";
import { accountRequest } from "./account-request";
import { AccountError } from "./account-styles";
import { refreshMemberSession } from "./member-session";
import { richText } from "./rich-text";
import Link from "next/link";
import { Assent, ConfirmDetails, Note } from "./subscribe-styles";

const subscribeNothing = () => () => {};
const modalDialogs = () => typeof HTMLDialogElement !== "undefined" && typeof HTMLDialogElement.prototype.showModal === "function";
const serverReady = () => false;

const Box = styled.div`
  display: grid; gap: var(--gh-spacing-2); min-inline-size: 0; padding: var(--gh-spacing-2) var(--gh-spacing-2_5);
  border: 0; border-radius: ${({ theme }) => theme.radius.surface};
  background: ${({ theme }) => theme.color.surfaceMuted};
  > p { margin: 0; }
  strong { font-variant-numeric: tabular-nums; }
`;
const Line = styled.div`display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--gh-spacing-2); min-inline-size: 0;`;
/** Day, entry and change on phones; the balance after each entry joins them on desktop. */
const History = styled.ol`
  display: grid; gap: var(--gh-spacing-0_5); margin: var(--gh-spacing-1) 0 0; padding: 0; list-style: none;
  font-size: var(--gh-font-body); line-height: var(--gh-leading-relaxed); color: ${({ theme }) => theme.color.mutedText};
  li { display: grid; grid-template-columns: var(--gh-size-13) minmax(0, 1fr) auto; gap: 0 var(--gh-spacing-2); }
  li > strong { font-weight: ${({ theme }) => theme.typography.weight.bold}; color: ${({ theme }) => theme.color.text}; }
  li > strong[data-credit-change="in"] { color: ${({ theme }) => theme.color.outcome.correct.text}; }
  li > span:last-child { display: none; text-align: end; }
  ${media.desktop} {
    font-size: var(--gh-font-emphasis);
    li { grid-template-columns: var(--gh-size-16) minmax(0, 1fr) auto var(--gh-size-36); gap: 0 var(--gh-spacing-3); }
    li > span:last-child { display: block; }
  }
`;
const PlanPicker = styled(FloatingField)`max-inline-size: var(--gh-size-96);`;

async function postCredit(body: unknown) {
  const response = await fetch("/api/account/credit", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const answer = await response.json().catch(() => ({})) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, answer };
}

/**
 * Buys the chosen plan from credit at once, after a confirmation. One request key per confirmation, so a repeated tap or a
 * retry after a lost answer returns the first purchase instead of buying twice.
 */
export function CreditPurchase({ locale, credit, plan, acceptedTerms, accepted, disabled = false, onAccept, retryKey }: {
  locale: string; credit: CreditView; plan: SubscriptionPlanView; acceptedTerms: boolean; accepted: boolean; disabled?: boolean;
  onAccept?: (accepted: boolean) => void;
  retryKey?: Readonly<{ get: () => string; clear: () => void }>;
}) {
  const m = createMessages(locale), router = useRouter(), canConfirm = useSyncExternalStore(subscribeNothing, modalDialogs, serverReady);
  const [confirming, setConfirming] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  // One key until a purchase succeeds: a retry after a lost answer, even for another plan, can never buy twice.
  const requestKey = useRef<string | null>(null);
  const balance = credit.balanceUgx, enough = balance >= plan.priceUgx;
  if (balance === 0 && !message) return null;
  async function buy() {
    setConfirming(false);
    if (busy) return;
    const key = retryKey?.get() ?? (requestKey.current ??= crypto.randomUUID());
    setBusy(true); setMessage("");
    try {
      const { ok, status, answer } = await postCredit({ action: "purchase", planId: plan.id, requestKey: key, accepted: accepted || acceptedTerms });
      if (ok && typeof answer.endsAt === "string") {
        requestKey.current = null; retryKey?.clear();
        setMessage(m.text("credit.bought", { end: formatPeriodEnd(new Date(answer.endsAt)) }));
        void refreshMemberSession(); router.refresh();
      } else { setMessage(status === 409 ? m.text("credit.insufficient") : typeof answer.message === "string" ? answer.message : m.text("account.unavailable")); router.refresh(); }
    } catch { setMessage(m.text("account.unavailable")); router.refresh(); }
    finally { setBusy(false); }
  }
  const ready = acceptedTerms || accepted;
  return <Box data-credit-purchase aria-busy={busy}>
    <Line><strong>{m.text("credit.balance", { amount: m.number(balance) })}</strong>
      {enough && <Button type="button" variant="secondary" disabled={disabled || busy || !ready} onClick={() => canConfirm ? setConfirming(true) : void buy()} data-credit-pay>
        {m.text("credit.payWith", { amount: m.number(plan.priceUgx) })}</Button>}</Line>
    {balance < 0 ? <Note>{m.text("credit.negative")}</Note> : !enough && !message && <Note>{m.text("credit.notEnough")}</Note>}
    {enough && !acceptedTerms && (onAccept ? <TermsAssent locale={locale} checked={accepted} disabled={busy} onChange={onAccept} />
      : <Note>{m.text("subscribe.needAssent")}</Note>)}
    {message && <Note role="status">{message}</Note>}
    {canConfirm && <CriteriaDialog id="credit-purchase-confirm" title={m.text("credit.confirmTitle")} open={confirming} onCancel={() => setConfirming(false)} onApply={() => void buy()}
      applyLabel={m.text("credit.confirmPay")} cancelLabel={m.text("credit.cancel")} closeLabel={m.text("credit.cancel")}>
      <ConfirmDetails data-credit-confirmation>
        <div><dt>{m.text("subscribe.planLabel")}</dt><dd>{m.plural("paywall.days", plan.durationDays)} · UGX {m.number(plan.priceUgx)}</dd></div>
        <div><dt>{m.text("credit.after")}</dt><dd>UGX {m.number(balance - plan.priceUgx)}</dd></div>
      </ConfirmDetails>
      <Note>{m.text("credit.confirmLead")}</Note>
    </CriteriaDialog>}
  </Box>;
}

function TermsAssent({ locale, checked, onChange, disabled = false }: { locale: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  const m = createMessages(locale);
  return <Assent><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} data-credit-assent />
    <span>{m.text("subscribe.assent")}{" "}<Link href="/en/terms">{m.text("account.terms")}</Link>.</span></Assent>;
}

/** A member chooses a plan and consents before wallet funds can cover a renewal. */
export function WalletAutoRenewal({ locale, credit, plans, salesOpen, acceptedTerms, active }: {
  locale: string; credit: CreditView; plans: readonly SubscriptionPlanView[]; salesOpen: boolean; acceptedTerms: boolean; active: boolean;
}) {
  const m = createMessages(locale), router = useRouter(), inFlight = useRef(false);
  const [planId, setPlanId] = useState(credit.autoRenewPlanId ?? "");
  const [saving, setSaving] = useState(false), [refreshing, startRefresh] = useTransition();
  const [feedback, setFeedback] = useState<{ message: string; failed: boolean } | null>(null);
  const [accepted, setAccepted] = useState(false), [choosing, setChoosing] = useState(false);
  const busy = saving || refreshing;
  const on = credit.autoRenew, renewing = plans.find((plan) => plan.id === credit.autoRenewPlanId), ready = acceptedTerms || accepted;
  const hasCredit = credit.availableBalanceUgx > 0;
  const selectedPlanId = plans.find((plan) => plan.id === planId)?.id ?? renewing?.id ?? plans[0]?.id ?? "";
  const picking = salesOpen && !!selectedPlanId && (on || hasCredit) && (!on || !renewing || choosing);
  const canSave = picking && ready && (!on || selectedPlanId !== credit.autoRenewPlanId);
  const planLabel = (plan: SubscriptionPlanView) => m.text("credit.renewalPlanPrice", { plan: plan.name,
    days: m.plural("paywall.days", plan.durationDays), price: m.number(plan.priceUgx) });
  async function save(next: boolean) {
    if (busy || inFlight.current || (next ? !canSave : !on)) return;
    inFlight.current = true;
    setSaving(true); setFeedback(null);
    try {
      const answer = await accountRequest<{ status: string }>("credit", next
        ? { action: "auto-renew", on: true, planId: selectedPlanId, accepted: ready }
        : { action: "auto-renew", on: false });
      if (answer.status !== "saved") throw new Error(m.text("account.unavailable"));
      setChoosing(false);
      setFeedback({ message: m.text("credit.saved"), failed: false });
      await refreshMemberSession();
      startRefresh(() => router.refresh());
    } catch (failure) {
      setFeedback({ message: failure instanceof Error ? failure.message : m.text("account.unavailable"), failed: true });
      startRefresh(() => router.refresh());
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }
  const sentence = !on ? m.text(!salesOpen ? "account.autoRenewClosed" : !hasCredit ? "account.autoRenewNeedsCredit"
    : !selectedPlanId ? "account.autoRenewNoPlans" : "account.autoRenewOff")
    : !salesOpen ? m.text("account.autoRenewPaused") : !renewing ? m.text("account.autoRenewPlanGone")
    : richText(m.text(credit.availableBalanceUgx < renewing.priceUgx ? "account.autoRenewShort" : active ? "account.autoRenewOn" : "account.autoRenewAfterEnd"),
      { plan: <strong>{planLabel(renewing)}</strong> });
  return <AccountBlock data-credit-renewal aria-busy={busy}>
    <AccountBlockText>
      <p>{sentence}</p>
      {picking && <PlanPicker label={m.text("credit.autoRenewPlan")}><select value={selectedPlanId} disabled={busy} onChange={(event) => setPlanId(event.currentTarget.value)} data-credit-plan>
        {plans.map((plan) => <option key={plan.id} value={plan.id}>{planLabel(plan)}</option>)}</select></PlanPicker>}
      {picking && !acceptedTerms && <TermsAssent locale={locale} checked={accepted} disabled={busy} onChange={setAccepted} />}
      {feedback && (feedback.failed ? <AccountError role="alert">{feedback.message}</AccountError>
        : <AccountFine role="status">{feedback.message}</AccountFine>)}
    </AccountBlockText>
    <AccountBlockActions>
      {picking && <AccountAction type="button" disabled={busy || !canSave} onClick={() => void save(true)} data-credit-auto-renew="on">
        {m.text(on ? "credit.usePlan" : "credit.turnOn")}</AccountAction>}
      {on && <AccountAction type="button" disabled={busy} onClick={() => void save(false)} data-credit-auto-renew="off">{m.text("credit.turnOff")}</AccountAction>}
      {on && renewing && salesOpen && plans.length > 1 && (choosing
        ? <AccountAction type="button" disabled={busy} onClick={() => { setChoosing(false); setPlanId(renewing.id); }}>{m.text("credit.cancel")}</AccountAction>
        : <AccountAction type="button" disabled={busy} onClick={() => setChoosing(true)}>{m.text("account.changePlan")}</AccountAction>)}
    </AccountBlockActions>
  </AccountBlock>;
}

export function WalletHistory({ locale, credit }: { locale: string; credit: CreditView }) {
  const m = createMessages(locale);
  if (!credit.history.length) return <AccountFine>{m.text("credit.noHistory")}</AccountFine>;
  return <History aria-label={m.text("credit.history")} data-credit-history>{credit.history.map((entry) => {
    const at = new Date(entry.createdAt);
    return <li key={entry.id}>
      <time dateTime={entry.createdAt} title={formatPeriodEnd(at)}>{formatShortDay(at)}</time>
      <span>{[m.text(`credit.kind.${entry.kind}`), entry.payment, entry.note].filter(Boolean).join(" · ")}</span>
      <strong data-credit-change={entry.amountUgx < 0 ? "out" : "in"}>{entry.amountUgx < 0 ? "−" : "+"}{m.number(Math.abs(entry.amountUgx))}</strong>
      <span>{m.text("credit.balanceAfter", { amount: m.number(entry.balanceAfter) })}</span>
    </li>;
  })}</History>;
}
