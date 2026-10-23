"use client";

import { useState, type FormEvent } from "react";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import { ButtonLink } from "@/components/ui/controls";
import { CheckIcon, ChevronDownIcon, CopyIcon, ImageIcon, ShieldIcon } from "@/components/ui/icons";
import { normalizeTransactionId, transactionKey } from "@/domain/payment";
import { parsePaymentSms, type PaymentSms } from "@/domain/payment-sms";
import { formatPhone } from "@/domain/phone";
import { formatPeriodEnd } from "@/domain/subscription-period";
import { formatPlanLength, formatUgx, type SubscriptionPlanView } from "@/domain/subscription-plans";
import type { OwnerPayment } from "@/domain/owner-members";
import { ActionButton, DangerButton, FieldBlock, FieldRow, FormStack, Hint } from "./admin-form";
import { ManualCodeForm, type CodeAction } from "./code-tools";
import { ApprovalFooter, CheckDetails, PaymentBadge, PaymentCard, PaymentEvidence, PaymentFacts, PaymentHighlight, PaymentWarnings, ReceiptPreview, ReviewHeader } from "./payment-styles";

export type PaymentRecovery = Readonly<{ reversed: boolean; recovery: boolean; carried: boolean }>;
const reasonLabels = { unreadable: "Unreadable receipt", "amount-mismatch": "Wrong amount", "not-received": "Payment not received", duplicate: "Duplicate payment", "wrong-number": "Wrong recipient", other: "Other" };
const phoneLabel = (phone: string | null) => phone ? `+${formatPhone(phone)}` : "Erased account";

/** Wallet confirmation stays separate from the subscriber's report and screenshot. */
export function PaymentReview({ payment: p, plans, action, recovery, onStart, onResolved, onRecovery }: {
  payment: OwnerPayment; plans: readonly SubscriptionPlanView[]; action: CodeAction; recovery: PaymentRecovery | undefined;
  onStart: () => void; onResolved: () => void; onRecovery: (value: PaymentRecovery) => void;
}) {
  const [network, setNetwork] = useState(p.network), [id, setId] = useState(""), [amount, setAmount] = useState("");
  const [planId, setPlanId] = useState(p.planId), [confirmed, setConfirmed] = useState(false);
  const [sms, setSms] = useState<PaymentSms>({}), [hasSms, setHasSms] = useState(false);
  const [attachmentOpen, setAttachmentOpen] = useState(false), [copied, setCopied] = useState(false);
  const pending = ["pending", "superseded"].includes(p.status), reversed = recovery?.reversed || p.status === "reversed";
  const warnings = p.checks.filter(check => check.tone === "warning");
  const changedPlan = planId === p.planId ? undefined : plans.find(plan => plan.id === planId);
  const validAmount = amount.trim() !== "" && /^\d+$/u.test(amount) && Number.isSafeInteger(Number(amount)) && Number(amount) <= 4_294_967_295;
  const canApprove = !!p.accountPhone && /^[A-Z0-9.-]{4,40}$/u.test(id) && !!transactionKey(id) && validAmount && confirmed;

  function parse(text: string) {
    const parsed = parsePaymentSms(text, {});
    setHasSms(!!text.trim()); setSms(parsed); setAmount(parsed.amount === undefined ? "" : String(parsed.amount));
    setId(parsed.transactionId ?? ""); setNetwork(parsed.network ?? p.network); setConfirmed(false);
  }
  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (action.busy || !canApprove) return;
    onStart();
    const reply = await action.send(`/api/admin/payments/${p.id}`, { action: "approve", network, transactionId: id, amount: Number(amount), planId });
    if (reply.ok) onResolved();
  }

  return <PaymentCard id={p.id} data-payment-review={p.id}>
    <ReviewHeader><div><h2 id="payment-review-title" tabIndex={-1}>{phoneLabel(p.accountPhone)}</h2><p>{p.reference} · {formatPeriodEnd(new Date(p.submittedAt))}</p></div>
      <PaymentBadge $status={reversed ? "reversed" : p.status}>{reversed ? "Reversed" : p.status === "superseded" ? "Replaced report" : p.status.charAt(0).toUpperCase() + p.status.slice(1)}</PaymentBadge></ReviewHeader>
    <PaymentHighlight><div><span>{p.final ? "Amount received" : "Reported amount"}</span><div><strong>{formatUgx(p.final?.amount ?? p.amount)}</strong></div></div>
      <div><span>{p.planName}</span><div><strong>{formatPlanLength(p.durationDays)}</strong></div></div></PaymentHighlight>
    <PaymentFacts>
      <div><dt>{p.final ? "Confirmed transaction ID" : "Reported transaction ID"}</dt><dd data-payment-transaction>{p.final?.transactionId || p.transactionId || "Not provided"}</dd>
        {(p.final?.transactionId || p.transactionId) && <ActionButton type="button" onClick={() => { void navigator.clipboard?.writeText(p.final?.transactionId || p.transactionId).then(() => setCopied(true), () => setCopied(false)); }}><CopyIcon />{copied ? "Copied" : "Copy ID"}</ActionButton>}</div>
      <div><dt>Network</dt><dd>{(p.final?.network || p.network).toUpperCase()}</dd></div>
      <div><dt>Paid from</dt><dd>{p.payerPhone ? phoneLabel(p.payerPhone) : "Not provided"}</dd></div>
      <div><dt>Plan price</dt><dd>{formatUgx(p.price)}</dd></div>
    </PaymentFacts>
    <PaymentEvidence>
      <ButtonLink href={`/admin/subscribers?accountId=${encodeURIComponent(p.accountId)}`} variant="quiet" prefetch={false}>View subscriber</ButtonLink>
      {p.hasImage ? <details open={attachmentOpen} onToggle={event => setAttachmentOpen(event.currentTarget.open)} data-payment-attachment>
        <summary><ImageIcon />View screenshot<ChevronDownIcon /></summary>
        {attachmentOpen && <a href={`/api/admin/payments/${p.id}/screenshot`} target="_blank" rel="noopener noreferrer" aria-label={`Open full screenshot ${p.reference}`}>
          <ReceiptPreview src={`/api/admin/payments/${p.id}/screenshot`} alt={`Payment screenshot ${p.reference}`} loading="lazy" /></a>}
      </details> : <Hint>No screenshot available</Hint>}
      <CheckDetails><summary><ShieldIcon />Checks{warnings.length ? ` · ${warnings.length} to review` : ""}<ChevronDownIcon /></summary>
        <ul aria-label="Automatic checks">{p.checks.map((check, index) => <li key={index}>{check.text}</li>)}</ul></CheckDetails>
    </PaymentEvidence>
    {warnings.length > 0 && <PaymentWarnings role="note">{warnings.map(check => <p key={check.text}>{check.text}</p>)}</PaymentWarnings>}
    {pending && <>
      <form method="post" action={`/api/admin/payments/${p.id}`} onSubmit={approve} data-payment-approval><FormStack>
        <h3>Confirm payment</h3>
        <details><summary>Paste wallet SMS<ChevronDownIcon /></summary><FieldBlock>Message from your wallet<textarea maxLength={12000} disabled={action.busy} rows={3} onChange={event => parse(event.target.value)} /></FieldBlock></details>
        {hasSms && <Hint role="status">{sms.transactionId && sms.amount !== undefined ? "Wallet details filled below." : "Enter any missing wallet details below."}
          {sms.counterparty && ` Sender: ${phoneLabel(sms.counterparty)}${sms.counterparty === p.payerPhone ? " · matches payer" : " · check payer"}.`}</Hint>}
        <FieldRow><FieldBlock>Transaction ID<input id="payment-confirmed-id" name="transactionId" required maxLength={40} pattern="[A-Z0-9.\-]{4,40}" autoComplete="off" spellCheck={false}
          placeholder="From your wallet" value={id} disabled={action.busy} onChange={event => { setId(normalizeTransactionId(event.target.value)); setConfirmed(false); }} /></FieldBlock>
          <FieldBlock>Amount received · UGX<input id="payment-confirmed-amount" name="amount" type="number" min={0} max={4294967295} step={1} required value={amount} disabled={action.busy}
            onChange={event => { setAmount(event.target.value); setConfirmed(false); }} /></FieldBlock></FieldRow>
        <details><summary>{network === "mtn" ? "MTN" : "Airtel"} · {changedPlan?.name ?? p.planName} · {formatPlanLength(changedPlan?.durationDays ?? p.durationDays)} · Edit<ChevronDownIcon /></summary><FieldRow><FieldBlock>Network<select name="network" value={network} disabled={action.busy} onChange={event => { setNetwork(event.target.value); setConfirmed(false); }}><option value="mtn">MTN MoMo</option><option value="airtel">Airtel Money</option></select></FieldBlock>
          <FieldBlock>Subscription<select name="planId" value={planId} disabled={action.busy} onChange={event => { setPlanId(event.target.value); setConfirmed(false); }}>
            <option value={p.planId}>{p.planName} · {formatPlanLength(p.durationDays)} · {formatUgx(p.price)}</option>
            {plans.filter(plan => plan.active && plan.id !== p.planId).map(plan => <option key={plan.id} value={plan.id}>{plan.name} · {formatPlanLength(plan.durationDays)} · {formatUgx(plan.priceUgx)}</option>)}
          </select></FieldBlock></FieldRow></details>
        <ApprovalFooter><label><input id="payment-wallet-confirmed" type="checkbox" required checked={confirmed} disabled={action.busy || !p.accountPhone} onChange={event => setConfirmed(event.target.checked)} /> Received in my wallet</label>
          <ActionButton type="submit" $variant="primary" disabled={action.busy || !canApprove} data-payment-approve><CheckIcon />{action.busy ? "Saving…" : "Approve payment"}</ActionButton>
          <Hint>Check your own wallet. A screenshot does not confirm receipt.</Hint></ApprovalFooter>
      </FormStack></form>
      <details><summary>Reject payment<ChevronDownIcon /></summary><form method="post" action={`/api/admin/payments/${p.id}`} onSubmit={async event => {
        event.preventDefault(); if (action.busy) return; const form = new FormData(event.currentTarget); onStart();
        const reply = await action.send(`/api/admin/payments/${p.id}`, { action: "reject", reason: form.get("reason"), text: form.get("text"), deleteImage: form.get("deleteImage") === "on" }, `Rejected ${p.reference}.`);
        if (reply.ok) onResolved();
      }}><FormStack><FieldBlock>Reason<select name="reason" disabled={action.busy}>{Object.entries(reasonLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></FieldBlock>
        <FieldBlock>Message · optional<textarea name="text" maxLength={200} disabled={action.busy} rows={2} /></FieldBlock>
        <label><input type="checkbox" name="deleteImage" disabled={action.busy} />Delete screenshot</label>
        <DangerButton type="submit" disabled={action.busy}>Reject payment</DangerButton></FormStack></form></details>
    </>}
    {p.status === "approved" && !reversed && <details><summary>Reverse payment<ChevronDownIcon /></summary><form method="post" action={`/api/admin/payments/${p.id}`} onSubmit={async event => {
      event.preventDefault(); if (action.busy) return; const reason = new FormData(event.currentTarget).get("reason"); onStart();
      const reply = await action.send(`/api/admin/payments/${p.id}`, { action: "reverse", reason }, `Reversed ${p.reference}.`);
      if (reply.ok) onRecovery({ reversed: true, carried: reply.body.carriedOtherDays === true, recovery: reason === "wrong-account" });
    }}><FormStack><FieldBlock>Reason<select name="reason" disabled={action.busy}><option value="network-reversal">Network reversal</option><option value="wrong-account">Wrong account</option></select></FieldBlock>
      <label><input type="checkbox" required disabled={action.busy} />End access from this payment</label>
      <DangerButton type="submit" disabled={action.busy}>Confirm reversal</DangerButton></FormStack></form></details>}
    {recovery?.carried && <Notice $tone="warning">Other days moved with this payment. Restore any verified remaining access manually.</Notice>}
    {recovery?.recovery && <FormStack><h3>Grant access to the real payer</h3><Hint>Leave the transaction ID empty here so the payment is counted once.</Hint>
      <ManualCodeForm compact withoutTransaction plans={plans} action={action} onStart={onStart} phone={p.payerPhone ?? ""} amount={p.final?.amount ?? p.amount} note={`for ${p.reference}`} /></FormStack>}
  </PaymentCard>;
}
