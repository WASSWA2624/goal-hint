"use client";

import { useState, type FormEvent } from "react";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import { ButtonLink } from "@/components/ui/controls";
import { CheckIcon, ChevronDownIcon, CopyIcon, ShieldIcon } from "@/components/ui/icons";
import { normalizeTransactionId, parseTransactionId } from "@/domain/payment";
import { parsePaymentSms, type PaymentSms } from "@/domain/payment-sms";
import { formatPhone } from "@/domain/phone";
import { formatPeriodEnd } from "@/domain/subscription-period";
import { formatPlanLength, formatUgx, type SubscriptionPlanView } from "@/domain/subscription-plans";
import type { OwnerPayment } from "@/domain/owner-members";
import { ActionButton, DangerButton, FieldBlock, FieldRow, FormStack, Hint } from "./admin-form";
import { ManualCodeForm, type CodeAction } from "./code-tools";
import { ApprovalFooter, CheckDetails, PaymentBadge, PaymentCard, PaymentEvidence, PaymentFacts, PaymentHighlight, PaymentVerification, PaymentWarnings, ReceiptPreview, ReviewHeader } from "./payment-styles";

export type PaymentRecovery = Readonly<{ reversed: boolean; recovery: boolean; carried: boolean }>;
const reasonLabels = { unreadable: "Unreadable receipt", "amount-mismatch": "Wrong amount", "not-received": "Payment not received", duplicate: "Duplicate payment", "wrong-number": "Wrong recipient", other: "Other" };
const phoneLabel = (phone: string | null) => phone ? `+${formatPhone(phone)}` : "Erased account";
const networkLabel = (network: string) => network === "mtn" ? "MTN MoMo" : network === "airtel" ? "Airtel Money" : network.toUpperCase();

/**
 * Reported values remain editable; approval is an explicit administrative decision. A top-up has no plan: everything recorded as
 * received becomes credit. A plan payment's amount above its price becomes credit too.
 */
export function PaymentReview({ payment: p, plans, action, recovery, onStart, onResolved, onRecovery }: {
  payment: OwnerPayment; plans: readonly SubscriptionPlanView[]; action: CodeAction; recovery: PaymentRecovery | undefined;
  onStart: () => void; onResolved: () => void; onRecovery: (value: PaymentRecovery) => void;
}) {
  const [network, setNetwork] = useState(p.network), [id, setId] = useState(() => normalizeTransactionId(p.transactionId || "")), [amount, setAmount] = useState(String(p.amount));
  const topUp = p.purpose === "topup", [planId, setPlanId] = useState(p.planId ?? "");
  const [sms, setSms] = useState<PaymentSms>({}), [hasSms, setHasSms] = useState(false);
  const [copied, setCopied] = useState(false);
  const pending = ["pending", "superseded"].includes(p.status), reversed = recovery?.reversed || p.status === "reversed";
  const warnings = [...new Set(p.checks.filter(check => check.tone === "warning").map(check => check.text))];
  const checks = [...new Set(p.checks.filter(check => check.tone !== "warning" && !warnings.includes(check.text)).map(check => check.text))];
  const changedPlan = planId === p.planId ? undefined : plans.find(plan => plan.id === planId);
  const reportedId = p.final?.transactionId || p.transactionId, receivedAmount = p.final?.amount;
  const validAmount = amount.trim() !== "" && /^\d+$/u.test(amount) && Number.isSafeInteger(Number(amount)) && Number(amount) <= 4_294_967_295;
  const validPlan = topUp || !!planId && (planId === p.planId || plans.some(plan => plan.id === planId && plan.active));
  const price = changedPlan?.priceUgx ?? p.price, excess = !topUp && validAmount ? Number(amount) - price : 0;
  const canApprove = !!p.accountPhone && !!parseTransactionId(id) && validAmount && ["mtn", "airtel"].includes(network) && validPlan;

  function parse(text: string) {
    const parsed = parsePaymentSms(text, {});
    setHasSms(!!text.trim()); setSms(parsed); setAmount(parsed.amount === undefined ? "" : String(parsed.amount));
    setId(parsed.transactionId ?? ""); setNetwork(parsed.network ?? p.network);
  }
  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (action.busy || !canApprove) return;
    onStart();
    const reply = await action.send(`/api/admin/payments/${p.id}`, { action: "approve", network, transactionId: id, amount: Number(amount), ...(topUp ? {} : { planId }) });
    if (reply.ok) onResolved();
  }
  const copyId = () => { void navigator.clipboard?.writeText(reportedId).then(() => setCopied(true), () => setCopied(false)); };

  return <PaymentCard id={p.id} data-payment-review={p.id}>
    <ReviewHeader><div><h2 id="payment-review-title" tabIndex={-1}>{phoneLabel(p.accountPhone)}</h2><p>{p.reference} · {formatPeriodEnd(new Date(p.submittedAt))}</p></div>
      <PaymentBadge $status={reversed ? "reversed" : p.status}>{reversed ? "Reversed" : p.status === "superseded" ? "Replaced report" : p.status.charAt(0).toUpperCase() + p.status.slice(1)}</PaymentBadge></ReviewHeader>
    <PaymentHighlight><div><span>{typeof receivedAmount === "number" ? "Amount received" : "Expected payment"}</span><strong>{formatUgx(receivedAmount ?? p.price)}</strong>
      {pending && <small>Paid from {p.payerPhone ? phoneLabel(p.payerPhone) : "an unspecified number"}</small>}
      {pending && p.amount !== p.price && <small>Reported amount: {formatUgx(p.amount)}</small>}</div>
      <div><span>{topUp || p.durationDays === null ? "Credit top-up" : `${p.planName} · ${formatPlanLength(p.durationDays)}`}</span><span>{networkLabel(p.final?.network || p.network)}</span>
        <span>Credit now {formatUgx(p.accountCreditUgx)}</span></div></PaymentHighlight>
    {!pending && <PaymentFacts>
      <div><dt>{p.final ? "Confirmed transaction ID" : "Reported transaction ID"}</dt><dd data-payment-transaction>{reportedId || "Not provided"}</dd>
        {reportedId && <ActionButton type="button" onClick={copyId}><CopyIcon />{copied ? "Copied" : "Copy ID"}</ActionButton>}</div>
      <div><dt>Paid from</dt><dd>{p.payerPhone ? phoneLabel(p.payerPhone) : "Not provided"}</dd></div>
      {typeof receivedAmount === "number" && receivedAmount !== p.price && <div><dt>Plan price</dt><dd>{formatUgx(p.price)}</dd></div>}
      {!p.final && p.amount !== p.price && <div><dt>Reported amount</dt><dd>{formatUgx(p.amount)}</dd></div>}
    </PaymentFacts>}
    {p.hasImage && <a href={`/api/admin/payments/${p.id}/screenshot`} target="_blank" rel="noopener noreferrer" aria-label={`Open full screenshot ${p.reference}`} data-payment-attachment>
      <ReceiptPreview src={`/api/admin/payments/${p.id}/screenshot`} alt={`Payment screenshot ${p.reference}`} /></a>}
    {warnings.length > 0 && <PaymentWarnings role="note" aria-label="Payment warnings">{warnings.map(text => <p key={text}>{text}</p>)}</PaymentWarnings>}
    {pending && <>
      <PaymentVerification method="post" action={`/api/admin/payments/${p.id}`} onSubmit={approve} data-payment-approval><FormStack>
        <FieldRow><FieldBlock>Transaction ID<input id="payment-confirmed-id" name="transactionId" required maxLength={40} pattern="[A-Z0-9.\-]{4,40}" autoComplete="off" spellCheck={false}
          value={id} disabled={action.busy} onChange={event => setId(normalizeTransactionId(event.target.value))} data-payment-transaction /></FieldBlock>
          <FieldBlock>Amount received · UGX<input id="payment-confirmed-amount" name="amount" type="number" min={0} max={4294967295} step={1} required value={amount} disabled={action.busy}
            onChange={event => setAmount(event.target.value)} /></FieldBlock></FieldRow>
        {validAmount && (topUp ? <Hint role="status" data-payment-credit>{formatUgx(Number(amount))} will be added to the account&apos;s credit.</Hint>
          : excess > 0 && <Hint role="status" data-payment-credit>{formatUgx(excess)} above the price will be added to the account&apos;s credit.</Hint>)}
        <ApprovalFooter><ActionButton type="submit" $variant="primary" disabled={action.busy || !canApprove} data-payment-approve><CheckIcon />{action.busy ? "Saving…" : topUp ? "Approve top-up" : "Approve payment"}</ActionButton></ApprovalFooter>
        <details><summary>{network !== p.network || changedPlan ? `${networkLabel(network)}${topUp ? "" : ` · ${changedPlan?.name ?? p.planName}`} · Edit` : topUp ? "Change network" : "Change network or plan"}<ChevronDownIcon /></summary><FieldRow><FieldBlock>Network<select name="network" value={network} disabled={action.busy} onChange={event => setNetwork(event.target.value)}><option value="mtn">MTN MoMo</option><option value="airtel">Airtel Money</option></select></FieldBlock>
          {!topUp && p.planId && p.durationDays !== null && <FieldBlock>Subscription<select name="planId" value={planId} disabled={action.busy} onChange={event => setPlanId(event.target.value)}>
            <option value={p.planId}>{p.planName} · {formatPlanLength(p.durationDays)} · {formatUgx(p.price)}</option>
            {plans.filter(plan => plan.active && plan.id !== p.planId).map(plan => <option key={plan.id} value={plan.id}>{plan.name} · {formatPlanLength(plan.durationDays)} · {formatUgx(plan.priceUgx)}</option>)}
          </select></FieldBlock>}</FieldRow></details>
        <details data-payment-sms><summary>Paste wallet SMS · optional<ChevronDownIcon /></summary><FieldBlock>Received-payment message<textarea maxLength={12000} disabled={action.busy} rows={3}
          placeholder="Paste the SMS to update the payment fields" onChange={event => parse(event.target.value)} /></FieldBlock>
          {hasSms && <Hint role="status">{sms.transactionId && sms.amount !== undefined ? "Payment details updated." : "Enter the missing details above."}
            {sms.counterparty && ` Sender: ${phoneLabel(sms.counterparty)}${sms.counterparty === p.payerPhone ? " · matches payer" : " · check payer"}.`}</Hint>}
        </details>
      </FormStack></PaymentVerification>
      <details><summary>Reject payment<ChevronDownIcon /></summary><form method="post" action={`/api/admin/payments/${p.id}`} onSubmit={async event => {
        event.preventDefault(); if (action.busy) return; const form = new FormData(event.currentTarget); onStart();
        const reply = await action.send(`/api/admin/payments/${p.id}`, { action: "reject", reason: form.get("reason"), text: form.get("text"), deleteImage: form.get("deleteImage") === "on" }, `Rejected ${p.reference}.`);
        if (reply.ok) onResolved();
      }}><FormStack><FieldBlock>Reason<select name="reason" disabled={action.busy}>{Object.entries(reasonLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></FieldBlock>
        <FieldBlock>Message · optional<textarea name="text" maxLength={200} disabled={action.busy} rows={2} /></FieldBlock>
        <label><input type="checkbox" name="deleteImage" disabled={action.busy} />Delete screenshot</label>
        <DangerButton type="submit" disabled={action.busy}>Reject payment</DangerButton></FormStack></form></details>
    </>}
    <PaymentEvidence>
      <ButtonLink href={`/admin/subscribers?accountId=${encodeURIComponent(p.accountId)}`} variant="quiet" prefetch={false}>View subscriber</ButtonLink>
      {checks.length > 0 && <CheckDetails><summary><ShieldIcon />{warnings.length ? "Other checks" : "Checks"}<ChevronDownIcon /></summary>
        <ul aria-label="Automatic checks">{checks.map(text => <li key={text}>{text}</li>)}</ul></CheckDetails>}
    </PaymentEvidence>
    {p.status === "approved" && !reversed && <details><summary>Reverse payment<ChevronDownIcon /></summary><form method="post" action={`/api/admin/payments/${p.id}`} onSubmit={async event => {
      event.preventDefault(); if (action.busy) return; const reason = new FormData(event.currentTarget).get("reason"); onStart();
      const reply = await action.send(`/api/admin/payments/${p.id}`, { action: "reverse", reason }, `Reversed ${p.reference}.`);
      if (reply.ok) onRecovery({ reversed: true, carried: reply.body.carriedOtherDays === true, recovery: reason === "wrong-account" });
    }}><FormStack><FieldBlock>Reason<select name="reason" disabled={action.busy}><option value="network-reversal">Network reversal</option><option value="wrong-account">Wrong account</option></select></FieldBlock>
      <label><input type="checkbox" required disabled={action.busy} />End access from this payment</label>
      <DangerButton type="submit" disabled={action.busy}>Confirm reversal</DangerButton></FormStack></form></details>}
    {recovery?.carried && <Notice $tone="warning">Other days moved with this payment. Restore any verified remaining access manually.</Notice>}
    {recovery?.recovery && p.purpose === "topup" && <Notice $tone="warning">This was a credit top-up. Add {formatUgx(p.final?.amount ?? p.amount)} to the real payer&apos;s account
      with Subscribers → Credit → Correct credit, noting {p.reference}.</Notice>}
    {recovery?.recovery && p.purpose !== "topup" && <FormStack><h3>Grant access to the real payer</h3><Hint>Leave the transaction ID empty here so the payment is counted once.</Hint>
      <ManualCodeForm compact withoutTransaction plans={plans} action={action} onStart={onStart} phone={p.payerPhone ?? ""} amount={p.final?.amount ?? p.amount} note={`for ${p.reference}`} /></FormStack>}
  </PaymentCard>;
}
