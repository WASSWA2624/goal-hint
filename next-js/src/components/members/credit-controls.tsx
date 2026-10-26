"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import styled from "styled-components";
import { Button } from "@/components/ui/controls";
import { CriteriaDialog } from "@/components/ui/criteria-dialog";
import { formatShortDay } from "@/domain/subscription-expiry";
import { formatPeriodEnd } from "@/domain/subscription-period";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { formatCredit, type CreditView } from "@/domain/wallet";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { AccountAction, AccountActionLink, AccountBlock, AccountBlockActions, AccountBlockText, AccountFine } from "./account-overview";
import { refreshMemberSession } from "./member-session";
import { richText } from "./rich-text";
import Link from "next/link";
import { Assent, ConfirmDetails, Note } from "./subscribe-styles";

const subscribeNothing = () => () => {};
const modalDialogs = () => typeof HTMLDialogElement !== "undefined" && typeof HTMLDialogElement.prototype.showModal === "function";
const serverReady = () => false;

const Box = styled.div`
  display: grid; gap: 8px; min-inline-size: 0; padding: 8px 10px;
  border: 1px solid ${({ theme }) => theme.color.border}; border-radius: ${({ theme }) => theme.border.radius};
  background: ${({ theme }) => theme.color.surfaceMuted};
  > p { margin: 0; }
  strong { font-variant-numeric: tabular-nums; }
`;
const Line = styled.div`display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; min-inline-size: 0;`;
/** Day, entry and change on phones; the balance after each entry joins them on desktop. */
const History = styled.ol`
  display: grid; gap: 2px; margin: 4px 0 0; padding: 0; list-style: none;
  font-size: 0.8125rem; line-height: 1.55; color: ${({ theme }) => theme.color.mutedText};
  li { display: grid; grid-template-columns: 3.25rem minmax(0, 1fr) auto; gap: 0 8px; }
  li > strong { font-weight: ${({ theme }) => theme.typography.weight.bold}; color: ${({ theme }) => theme.color.text}; }
  li > strong[data-credit-change="in"] { color: ${({ theme }) => theme.color.outcome.correct.text}; }
  li > span:last-child { display: none; text-align: end; }
  ${media.desktop} {
    font-size: 0.875rem;
    li { grid-template-columns: 4rem minmax(0, 1fr) auto 9rem; gap: 0 12px; }
    li > span:last-child { display: block; }
  }
`;
const PlanPicker = styled.label`
  display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-size: 0.875rem;
  select { min-block-size: 44px; max-inline-size: 100%; padding-inline: 10px; font: inherit;
    color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surface};
    border: 1px solid ${({ theme }) => theme.color.controlBorder}; border-radius: ${({ theme }) => theme.border.radius}; }
`;

async function postCredit(body: unknown) {
  const response = await fetch("/api/account/credit", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const answer = await response.json().catch(() => ({})) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, answer };
}

/**
 * Buys the chosen plan from credit at once, after a confirmation. One request key per confirmation, so a repeated tap or a
 * retry after a lost answer returns the first purchase instead of buying twice.
 */
export function CreditPurchase({ locale, credit, plan, acceptedTerms, accepted, disabled = false, onAccept }: {
  locale: string; credit: CreditView; plan: SubscriptionPlanView; acceptedTerms: boolean; accepted: boolean; disabled?: boolean;
  onAccept?: (accepted: boolean) => void;
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
    requestKey.current ??= crypto.randomUUID();
    setBusy(true); setMessage("");
    try {
      const { ok, status, answer } = await postCredit({ action: "purchase", planId: plan.id, requestKey: requestKey.current, accepted: accepted || acceptedTerms });
      if (ok && typeof answer.endsAt === "string") {
        requestKey.current = null;
        setMessage(m.text("credit.bought", { end: formatPeriodEnd(new Date(answer.endsAt)) }));
        void refreshMemberSession(); router.refresh();
      } else { setMessage(status === 409 ? m.text("credit.insufficient") : typeof answer.message === "string" ? answer.message : m.text("account.unavailable")); router.refresh(); }
    } catch { setMessage(m.text("account.unavailable")); router.refresh(); }
    finally { setBusy(false); }
  }
  const ready = acceptedTerms || accepted;
  return <Box data-credit-purchase>
    <Line><strong>{m.text("credit.balance", { amount: m.number(balance) })}</strong>
      {enough && <Button type="button" variant="secondary" disabled={disabled || busy || !ready} onClick={() => canConfirm ? setConfirming(true) : void buy()} data-credit-pay>
        {m.text(busy ? "credit.paying" : "credit.payWith", { amount: m.number(plan.priceUgx) })}</Button>}</Line>
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

/**
 * The account page's auto-renewal and credit, as two sentences with their actions. Turning auto-renewal on needs open sales,
 * a plan and the current terms; turning it off always works. active says the account has access now.
 */
export function CreditSection({ locale, credit, plans, salesOpen, acceptedTerms, active }: {
  locale: string; credit: CreditView; plans: readonly SubscriptionPlanView[]; salesOpen: boolean; acceptedTerms: boolean; active: boolean;
}) {
  const m = createMessages(locale), router = useRouter();
  const [planId, setPlanId] = useState(() => plans.find((plan) => plan.id === credit.autoRenewPlanId)?.id ?? plans[0]?.id ?? "");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [accepted, setAccepted] = useState(false), [choosing, setChoosing] = useState(false);
  const on = credit.autoRenew, renewing = plans.find((plan) => plan.id === credit.autoRenewPlanId), ready = acceptedTerms || accepted;
  // A plan is picked to turn auto-renewal on, to replace a withdrawn plan, or after Change plan.
  const picking = salesOpen && plans.length > 0 && (!on || !renewing || choosing);
  const planLabel = (plan: SubscriptionPlanView) => m.text("account.planPrice", { days: m.plural("paywall.days", plan.durationDays), price: m.number(plan.priceUgx) });
  async function save(next: boolean) {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const { ok, answer } = await postCredit(next ? { action: "auto-renew", on: next, planId, accepted: ready } : { action: "auto-renew", on: next });
      setMessage(ok ? m.text("credit.saved") : typeof answer.message === "string" ? answer.message : m.text("account.unavailable"));
      if (ok) { setChoosing(false); void refreshMemberSession(); router.refresh(); }
    } catch { setMessage(m.text("account.unavailable")); }
    finally { setBusy(false); }
  }
  // Renewal runs only while the credit covers the plan; after access ends it waits for the member's next visit.
  const sentence = !on ? m.text("account.autoRenewOff") : !salesOpen ? m.text("account.autoRenewPaused") : !renewing ? m.text("account.autoRenewPlanGone")
    : richText(m.text(credit.balanceUgx < renewing.priceUgx ? "account.autoRenewShort" : active ? "account.autoRenewOn" : "account.autoRenewAfterEnd"),
      { plan: <strong>{planLabel(renewing)}</strong> });
  return <>
    {(salesOpen || on) && <AccountBlock data-credit-renewal>
      <AccountBlockText>
        <p>{sentence}</p>
        {picking && <PlanPicker>{m.text("credit.autoRenewPlan")}<select value={planId} disabled={busy} onChange={(event) => setPlanId(event.currentTarget.value)} data-credit-plan>
          {plans.map((plan) => <option key={plan.id} value={plan.id}>{planLabel(plan)}</option>)}</select></PlanPicker>}
        {picking && !acceptedTerms && <TermsAssent locale={locale} checked={accepted} disabled={busy} onChange={setAccepted} />}
        {message && <AccountFine role="status">{message}</AccountFine>}
      </AccountBlockText>
      <AccountBlockActions>
        {picking && <AccountAction disabled={busy || !ready || on && planId === credit.autoRenewPlanId} onClick={() => void save(true)} data-credit-auto-renew="on">
          {m.text(on ? "credit.usePlan" : "credit.turnOn")}</AccountAction>}
        {on && <AccountAction disabled={busy} onClick={() => void save(false)} data-credit-auto-renew="off">{m.text("credit.turnOff")}</AccountAction>}
        {on && renewing && salesOpen && plans.length > 1 && (choosing
          ? <AccountAction disabled={busy} onClick={() => { setChoosing(false); setPlanId(renewing.id); }}>{m.text("credit.cancel")}</AccountAction>
          : <AccountAction onClick={() => setChoosing(true)}>{m.text("account.changePlan")}</AccountAction>)}
      </AccountBlockActions>
    </AccountBlock>}
    <AccountBlock data-account-credit data-credit-section>
      <AccountBlockText>
        <p>{richText(m.text("account.creditIs"), { amount: <strong>{formatCredit(credit.balanceUgx)}</strong> })}{credit.balanceUgx < 0 && ` ${m.text("credit.negative")}`}</p>
        {credit.history.length ? <History aria-label={m.text("credit.history")} data-credit-history>{credit.history.map((entry) => {
          const at = new Date(entry.createdAt);
          return <li key={entry.id}>
            <time dateTime={entry.createdAt} title={formatPeriodEnd(at)}>{formatShortDay(at)}</time>
            <span>{[m.text(`credit.kind.${entry.kind}`), entry.payment, entry.note].filter(Boolean).join(" · ")}</span>
            <strong data-credit-change={entry.amountUgx < 0 ? "out" : "in"}>{entry.amountUgx < 0 ? "−" : "+"}{m.number(Math.abs(entry.amountUgx))}</strong>
            <span>{m.text("credit.balanceAfter", { amount: m.number(entry.balanceAfter) })}</span>
          </li>;
        })}</History> : <AccountFine>{m.text("credit.noHistory")}</AccountFine>}
      </AccountBlockText>
      {salesOpen && <AccountBlockActions><AccountActionLink href="/en/subscribe?add=credit#plans" prefetch={false} data-credit-add>{m.text("credit.add")}</AccountActionLink></AccountBlockActions>}
    </AccountBlock>
  </>;
}
