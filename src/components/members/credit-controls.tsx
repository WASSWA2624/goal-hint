"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import styled from "styled-components";
import { Button, ButtonLink } from "@/components/ui/controls";
import { CriteriaDialog } from "@/components/ui/criteria-dialog";
import { formatPeriodEnd } from "@/domain/subscription-period";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import type { CreditView } from "@/domain/wallet";
import { createMessages } from "@/i18n/messages";
import { refreshMemberSession } from "./member-session";
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
const History = styled.ol`
  display: grid; gap: 6px; margin: 0; padding: 0; list-style: none;
  li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0 8px; font-size: 13px; line-height: 18px; }
  li > span:nth-child(2) { font-variant-numeric: tabular-nums; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  small { grid-column: 1 / -1; color: ${({ theme }) => theme.color.mutedText}; }
`;
const Select = styled.select`min-block-size: 44px; max-inline-size: 100%; font: inherit;`;

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
 * The account page's credit: balance, auto-renewal and recent history. Turning auto-renewal on needs open sales, a plan and
 * the current terms; turning it off always works.
 */
export function CreditSection({ locale, credit, plans, salesOpen, acceptedTerms }: {
  locale: string; credit: CreditView; plans: readonly SubscriptionPlanView[]; salesOpen: boolean; acceptedTerms: boolean;
}) {
  const m = createMessages(locale), router = useRouter();
  const [planId, setPlanId] = useState(() => plans.find((plan) => plan.id === credit.autoRenewPlanId)?.id ?? plans[0]?.id ?? "");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [accepted, setAccepted] = useState(false);
  const renewing = plans.find((plan) => plan.id === credit.autoRenewPlanId), ready = acceptedTerms || accepted;
  async function save(on: boolean) {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const { ok, answer } = await postCredit(on ? { action: "auto-renew", on, planId, accepted: ready } : { action: "auto-renew", on });
      setMessage(ok ? m.text("credit.saved") : typeof answer.message === "string" ? answer.message : m.text("account.unavailable"));
      if (ok) { void refreshMemberSession(); router.refresh(); }
    } catch { setMessage(m.text("account.unavailable")); }
    finally { setBusy(false); }
  }
  return <Box data-credit-section>
    <Line><strong>{m.text("credit.balance", { amount: m.number(credit.balanceUgx) })}</strong>
      {salesOpen && <ButtonLink href="/en/subscribe?add=credit#plans" variant="secondary" prefetch={false} data-credit-add>{m.text("credit.add")}</ButtonLink>}</Line>
    {credit.balanceUgx < 0 && <Note>{m.text("credit.negative")}</Note>}
    {(salesOpen || credit.autoRenew) && <>
      <h3>{m.text("credit.autoRenew")}</h3>
      <Note>{credit.autoRenew && !salesOpen ? m.text("credit.autoRenewPaused") : credit.autoRenew && !renewing ? m.text("credit.autoRenewPlanGone")
        : `${credit.autoRenew ? m.text("credit.autoRenewOn", { plan: renewing ? m.plural("paywall.days", renewing.durationDays) : "—" }) : m.text("credit.autoRenewOff")} ${m.text("credit.autoRenewLead")}`}</Note>
      <Line>
        {salesOpen && plans.length > 0 && <label>{m.text("credit.autoRenewPlan")}{" "}<Select value={planId} disabled={busy} onChange={(event) => setPlanId(event.currentTarget.value)} data-credit-plan>
          {plans.map((plan) => <option key={plan.id} value={plan.id}>{m.plural("paywall.days", plan.durationDays)} · UGX {m.number(plan.priceUgx)}</option>)}</Select></label>}
        {credit.autoRenew
          ? <span>{salesOpen && planId !== credit.autoRenewPlanId && <Button type="button" variant="secondary" disabled={busy || !ready} onClick={() => void save(true)}>{m.text("credit.usePlan")}</Button>}{" "}
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void save(false)} data-credit-auto-renew="off">{m.text("credit.turnOff")}</Button></span>
          : salesOpen && plans.length > 0 && <Button type="button" disabled={busy || !ready} onClick={() => void save(true)} data-credit-auto-renew="on">{m.text("credit.turnOn")}</Button>}
      </Line>
      {salesOpen && plans.length > 0 && !acceptedTerms && <TermsAssent locale={locale} checked={accepted} disabled={busy} onChange={setAccepted} />}
    </>}
    {message && <Note role="status">{message}</Note>}
    <h3>{m.text("credit.history")}</h3>
    {credit.history.length ? <History data-credit-history>{credit.history.map((entry) => <li key={entry.id}>
      <span>{m.text(`credit.kind.${entry.kind}`)}{entry.payment ? ` · ${entry.payment}` : ""}</span>
      <span>{entry.amountUgx < 0 ? "−" : "+"}UGX {m.number(Math.abs(entry.amountUgx))}</span>
      <small>{formatPeriodEnd(new Date(entry.createdAt))} · {m.text("credit.balanceAfter", { amount: m.number(entry.balanceAfter) })}{entry.note ? ` · ${entry.note}` : ""}</small>
    </li>)}</History> : <Note>{m.text("credit.noHistory")}</Note>}
  </Box>;
}
