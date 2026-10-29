"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import Link from "@/components/navigation/navigation-link";
import { AlertIcon, CheckIcon, ChevronDownIcon, CloseIcon, ExpandIcon, InfoIcon, ShieldIcon, UserIcon } from "@/components/ui/icons";
import { useDesktopLayout } from "@/components/ui/use-desktop-layout";
import { normalizeTransactionId, parseTransactionId } from "@/domain/payment";
import { parsePaymentSms, type PaymentSms } from "@/domain/payment-sms";
import { formatPhone } from "@/domain/phone";
import { formatPeriodEnd } from "@/domain/subscription-period";
import { formatPlanLength, formatUgx, type SubscriptionPlanView } from "@/domain/subscription-plans";
import type { OwnerPayment } from "@/domain/owner-members";
import { ActionButton, CheckField, DangerButton, FieldBlock, FieldRow, FormStack, Hint } from "./admin-form";
import { ManualCodeForm, type CodeAction } from "./code-tools";
import { CopyTextButton } from "./copy-text-button";
import { DrawerNote, FactList, TextAction, ZoneLabel } from "./desk-styles";
import { NetworkChip, networkLabel } from "./network-chip";
import { PaymentReviewScroll, ReviewIdentity, ReviewSectionHead, TransactionControl } from "./payment-balanced-styles";
import { ApprovalForm, BigAmount, CheckList, CopyRow, DecisionBar, DecisionPanel, DecisionZone, ExpectedZone, NetworkValue, PaymentBadge, PaymentWarnings,
  ProofActions, ProofFrame, ProofImage, ProofToggle, ProofZone, RecoveryStack, RejectDrawer, RejectToggle, ReviewCard, ReviewHead, ReviewMeta, ReviewZones, ShieldMark,
  ZoneDrawer } from "./payment-styles";

export type PaymentRecovery = Readonly<{ reversed: boolean; recovery: boolean; carried: boolean }>;
const reasonLabels = { unreadable: "Unreadable receipt", "amount-mismatch": "Wrong amount", "not-received": "Payment not received", duplicate: "Duplicate payment", "wrong-number": "Wrong recipient", other: "Other" };
const phoneLabel = (phone: string | null) => phone ? `+${formatPhone(phone)}` : "Erased account";
export const paymentWarnings = (p: OwnerPayment) => [...new Set(p.checks.filter(check => check.tone === "warning").map(check => check.text))];

/**
 * Reported values remain editable; approval is an explicit administrative decision. A top-up has no plan: everything recorded as
 * received becomes credit. A plan payment's amount above its price becomes credit too. Mobile keeps its back/stepper header.
 */
export function PaymentReview({ payment: p, plans, action, recovery, nav, onStart, onResolved, onRecovery }: {
  payment: OwnerPayment; plans: readonly SubscriptionPlanView[]; action: CodeAction; recovery: PaymentRecovery | undefined; nav?: ReactNode;
  onStart: () => void; onResolved: () => void; onRecovery: (value: PaymentRecovery) => void;
}) {
  const desktop = useDesktopLayout();
  const [network, setNetwork] = useState(p.network), [id, setId] = useState(() => normalizeTransactionId(p.transactionId || "")), [amount, setAmount] = useState(String(p.amount));
  const topUp = p.purpose === "topup", [planId, setPlanId] = useState(p.planId ?? "");
  const [sms, setSms] = useState<PaymentSms>({}), [hasSms, setHasSms] = useState(false);
  const [zoomed, setZoomed] = useState(false), [rejecting, setRejecting] = useState(false), [smsOpen, setSmsOpen] = useState(false);
  const rejectFocus = useRef(false), [tall, setTall] = useState(true);
  /** Phones clip a screenshot taller than the 280 × 184 preview; a wide one shows whole, without the enlarge toggle. */
  const measure = useCallback((image: HTMLImageElement | null) => { if (image?.complete && image.naturalWidth) setTall(image.naturalHeight / image.naturalWidth > 184 / 280); }, []);
  const pending = ["pending", "superseded"].includes(p.status), reversed = recovery?.reversed || p.status === "reversed";
  const warnings = paymentWarnings(p);
  const checks = [...new Map(p.checks.filter(check => check.tone !== "warning" && !warnings.includes(check.text)).map(check => [check.text, check])).values()];
  const allClear = !warnings.length && checks.every(check => check.tone === "good");
  const changedPlan = planId === p.planId ? undefined : plans.find(plan => plan.id === planId);
  const reportedId = p.final?.transactionId || p.transactionId, receivedAmount = p.final?.amount;
  const validAmount = amount.trim() !== "" && /^\d+$/u.test(amount) && Number.isSafeInteger(Number(amount)) && Number(amount) <= 4_294_967_295;
  const validPlan = topUp || !!planId && (planId === p.planId || plans.some(plan => plan.id === planId && plan.active));
  const price = changedPlan?.priceUgx ?? p.price, duration = changedPlan?.durationDays ?? p.durationDays;
  const excess = !topUp && validAmount ? Number(amount) - price : 0;
  const canApprove = !!p.accountPhone && !!parseTransactionId(id) && validAmount && ["mtn", "airtel"].includes(network) && validPlan;
  const shownNetwork = pending ? network : p.final?.network || p.network, screenshot = `/api/admin/payments/${p.id}/screenshot`;
  const approvalId = `payment-approval-${p.id}`, rejectId = `payment-reject-${p.id}`;

  useEffect(() => {
    if (!rejecting || !rejectFocus.current) return;
    rejectFocus.current = false;
    const reason = document.getElementById(`${rejectId}-reason`);
    reason?.focus({ preventScroll: true }); reason?.closest("details")?.scrollIntoView({ block: "nearest" });
  }, [rejecting, rejectId]);

  function parse(text: string) {
    const parsed = parsePaymentSms(text, {});
    setHasSms(!!text.trim()); setSms(parsed); setAmount(parsed.amount === undefined ? "" : String(parsed.amount));
    setId(parsed.transactionId ?? ""); setNetwork(parsed.network ?? p.network);
  }
  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (action.busy || !canApprove) return;
    onStart();
    await action.send(`/api/admin/payments/${p.id}`, { action: "approve", network, transactionId: id, amount: Number(amount), ...(topUp ? {} : { planId }) }, "", true, onResolved);
  }
  /** The phone decision bar opens the reject panel and moves focus into it; Cancel closes it and keeps focus on the bar. */
  const toggleReject = () => { rejectFocus.current = !rejecting; setRejecting(!rejecting); };
  /** Closing the phone reject panel from its own summary hides it, so focus returns to the bar's Reject button. */
  function closedReject(drawer: HTMLDetailsElement) {
    setRejecting(drawer.open);
    const lost = document.activeElement === document.body || drawer.contains(document.activeElement);
    if (!drawer.open && lost && getComputedStyle(drawer).display === "none") drawer.closest("[data-payment-review]")?.querySelector<HTMLElement>("[data-reject-toggle]")?.focus();
  }

  const status = reversed ? "reversed" : p.status;
  const badge = <PaymentBadge data-review-badge $status={status}>{status === "superseded" ? "Replaced report" : status.charAt(0).toUpperCase() + status.slice(1)}</PaymentBadge>;
  const warningLabels = new Map(p.checks.filter(check => check.tone === "warning").map(check => [check.text, desktop ? check.summary ?? check.text : check.text]));
  const checkList = <CheckList aria-label="Automatic checks">{checks.map(check => <li key={check.text} data-tone={check.tone}>{check.tone === "good" ? <CheckIcon /> : <InfoIcon />}{desktop ? check.summary ?? check.text : check.text}</li>)}</CheckList>;
  const verification = <>
    {warnings.length > 0 && <PaymentWarnings role="note" aria-label="Payment warnings">{warnings.map(text => <p key={text}><AlertIcon />{warningLabels.get(text)}</p>)}</PaymentWarnings>}
    {checks.length > 0 && (desktop ? <div data-payment-checks><ZoneLabel as="h3">Verification checks</ZoneLabel>{checkList}</div> : <ZoneDrawer data-payment-checks>
      <summary><ShieldMark $clear={allClear}><ShieldIcon /></ShieldMark>{warnings.length ? "Other checks" : "Checks"}<DrawerNote>{allClear ? `all ${checks.length} clear` : `(${checks.length})`}</DrawerNote><ChevronDownIcon /></summary>
      <div>{checkList}</div>
    </ZoneDrawer>)}
  </>;

  return <ReviewCard id={p.id} data-payment-review={p.id} data-review-layout="balanced">
    <PaymentReviewScroll data-payment-review-scroll tabIndex={0} aria-label="Payment details">
    <ReviewHead data-payment-head>
      {nav}
      {desktop ? <><NetworkChip network={shownNetwork} labelled /><ReviewIdentity>
        <div><h2 id="payment-review-title" tabIndex={-1}>{p.reference}</h2>{badge}</div>
        <ReviewMeta data-review-meta>Submitted {formatPeriodEnd(new Date(p.submittedAt))}</ReviewMeta>
      </ReviewIdentity></> : <>
        <h2 id="payment-review-title" tabIndex={-1}>{phoneLabel(p.accountPhone)}</h2>{badge}
        <ReviewMeta data-review-meta>{p.reference} · {formatPeriodEnd(new Date(p.submittedAt))}</ReviewMeta>
        <TextAction as={Link} data-review-link href={`/admin/subscribers?accountId=${encodeURIComponent(p.accountId)}`} prefetch={false}><UserIcon />View subscriber</TextAction>
      </>}
    </ReviewHead>
    <ReviewZones $proof={p.hasImage} data-payment-zones>
      {(desktop || p.hasImage) && <ProofZone aria-label="Payment evidence" data-payment-zone="proof">
        <ZoneLabel as={desktop ? "h3" : "p"}>{desktop ? "Payment evidence" : "Proof"}</ZoneLabel>
        {p.hasImage ? <>
        <ProofFrame id={`${p.id}-proof`} $clipped={tall && !zoomed}><ProofImage ref={measure} src={screenshot} alt={`Payment screenshot ${p.reference}`} onLoad={event => measure(event.currentTarget)} /></ProofFrame>
        <ProofActions $hideLink={tall && !zoomed}>
          {tall && <ProofToggle type="button" aria-expanded={zoomed} aria-controls={`${p.id}-proof`} onClick={() => setZoomed(value => !value)}><ExpandIcon />{zoomed ? "Tap to shrink" : "Tap to enlarge"}</ProofToggle>}
          <TextAction as="a" href={screenshot} target="_blank" rel="noopener noreferrer" aria-label={`Open full screenshot ${p.reference}`} data-payment-attachment><ExpandIcon />Open full size</TextAction>
        </ProofActions>
        </> : <div data-proof-empty><strong>No screenshot attached</strong><p>Check the transfer in the receiving wallet.</p></div>}
      </ProofZone>}
      <ExpectedZone aria-labelledby={`${p.id}-expected`} data-payment-zone="expected">
        {desktop ? <ZoneLabel as="h3" id={`${p.id}-expected`}>Subscriber &amp; account</ZoneLabel> : <BigAmount data-payment-amount><ZoneLabel id={`${p.id}-expected`}>{typeof receivedAmount === "number" ? "Amount received" : "Expected payment"}</ZoneLabel>
          <strong>{formatUgx(receivedAmount ?? p.price)}</strong>
          {(pending || !p.final) && p.amount !== p.price && <span>Reported amount: {formatUgx(p.amount)}</span>}</BigAmount>}
        <FactList data-payment-facts>
          {desktop ? <div><dt>Subscriber</dt><dd>{phoneLabel(p.accountPhone)}</dd></div> : <>
            <div><dt>For</dt><dd>{topUp || p.durationDays === null ? "Credit top-up" : `${p.planName} · ${formatPlanLength(p.durationDays)}`}</dd></div>
            <div><dt>Network</dt><NetworkValue><NetworkChip network={shownNetwork} />{networkLabel(shownNetwork)}</NetworkValue></div>
          </>}
          <div><dt>{desktop ? "Sending number" : "Paid from"}</dt><dd>{p.payerPhone ? desktop && p.payerPhone === p.accountPhone ? "Same as subscriber" : phoneLabel(p.payerPhone) : "Not provided"}</dd></div>
          {!desktop && typeof receivedAmount === "number" && receivedAmount !== p.price && <div><dt>Plan price</dt><dd>{formatUgx(p.price)}</dd></div>}
          <div><dt>{desktop ? "Current credit" : "Credit now"}</dt><dd>{desktop && p.accountCreditUgx === 0 ? "No credit balance" : formatUgx(p.accountCreditUgx)}</dd></div>
        </FactList>
        {desktop ? <TextAction as={Link} href={`/admin/subscribers?accountId=${encodeURIComponent(p.accountId)}`} prefetch={false}><UserIcon />View subscriber</TextAction> : verification}
      </ExpectedZone>
      {desktop && (warnings.length > 0 || checks.length > 0) && <ExpectedZone aria-label="Payment verification" data-payment-zone="checks">{verification}</ExpectedZone>}
      <DecisionZone data-payment-zone="decision">
        {pending ? <>
          <ApprovalForm id={approvalId} method="post" action={`/api/admin/payments/${p.id}`} onSubmit={approve} aria-labelledby={`${p.id}-decision`} data-payment-approval>
            <ReviewSectionHead><ZoneLabel as={desktop ? "h3" : "p"} id={`${p.id}-decision`}>{desktop ? "Confirm received payment" : "Decision"}</ZoneLabel>
              {desktop && <TextAction type="button" aria-expanded={smsOpen} aria-controls={`${p.id}-sms`} onClick={() => setSmsOpen(value => !value)}>Paste wallet SMS</TextAction>}
            </ReviewSectionHead>
            <FieldRow data-payment-confirmation-fields><FieldBlock>Amount received · UGX<input id="payment-confirmed-amount" name="amount" type="number" min={0} max={4294967295} step={1} required value={amount} disabled={action.busy}
              onChange={event => setAmount(event.target.value)} /></FieldBlock>
              <FieldBlock as="div"><label htmlFor="payment-confirmed-id">Transaction ID</label><TransactionControl>
                <input id="payment-confirmed-id" name="transactionId" required maxLength={40} pattern="[A-Z0-9.\-]{4,40}" autoComplete="off" spellCheck={false}
                  value={id} disabled={action.busy} onChange={event => setId(normalizeTransactionId(event.target.value))} data-payment-transaction />
                <CopyTextButton value={id} disabled={action.busy} compact />
              </TransactionControl></FieldBlock></FieldRow>
            <ZoneDrawer open={desktop || undefined} data-payment-plan-controls><summary>{network !== p.network || changedPlan ? `${networkLabel(network)}${topUp ? "" : ` · ${changedPlan?.name ?? p.planName}`} · Edit` : topUp ? "Change network" : "Change network or plan"}<ChevronDownIcon /></summary>
              <div><FieldRow data-payment-plan-fields><FieldBlock>{desktop ? "Payment provider" : "Network"}<select name="network" value={network} disabled={action.busy} onChange={event => setNetwork(event.target.value)}><option value="mtn">MTN MoMo</option><option value="airtel">Airtel Money</option></select></FieldBlock>
                {!topUp && p.planId && p.durationDays !== null && <FieldBlock>{desktop ? "Package / purpose" : "Subscription"}<select name="planId" value={planId} disabled={action.busy} onChange={event => setPlanId(event.target.value)}>
                  <option value={p.planId}>{desktop ? p.planName : `${p.planName} · ${formatPlanLength(p.durationDays)} · ${formatUgx(p.price)}`}</option>
                  {plans.filter(plan => plan.active && plan.id !== p.planId).map(plan => <option key={plan.id} value={plan.id}>{desktop ? plan.name : `${plan.name} · ${formatPlanLength(plan.durationDays)} · ${formatUgx(plan.priceUgx)}`}</option>)}
                </select></FieldBlock>}
                {desktop && topUp && <FieldBlock>Purpose<input value="Credit top-up" readOnly /></FieldBlock>}
              </FieldRow></div></ZoneDrawer>
            {desktop && !topUp && <Hint data-payment-package>{duration === null ? "Selected package" : `${formatPlanLength(duration)} of access`}{validAmount && Number(amount) === price ? " · Amount matches package price." : ` · Package price: ${formatUgx(price)}.`}</Hint>}
            {validAmount && (topUp ? <Hint role="status" data-payment-credit>{desktop ? "The received amount" : formatUgx(Number(amount))} will be added to the account&apos;s credit.</Hint>
              : excess > 0 && <Hint role="status" data-payment-credit>{formatUgx(excess)} above the price will be added to the account&apos;s credit.</Hint>)}
            <ZoneDrawer id={`${p.id}-sms`} open={smsOpen} onToggle={event => setSmsOpen(event.currentTarget.open)} data-payment-sms><summary>Paste wallet SMS · optional<ChevronDownIcon /></summary><div><FieldBlock>Received-payment message<textarea maxLength={12000} disabled={action.busy} rows={3}
              placeholder="Paste the SMS to update the payment fields" onChange={event => parse(event.target.value)} /></FieldBlock>
              {hasSms && <Hint role="status">{sms.transactionId && sms.amount !== undefined ? "Payment details updated." : "Enter the missing details above."}
                {sms.counterparty && ` Sender: ${phoneLabel(sms.counterparty)}${sms.counterparty === p.payerPhone ? " · matches payer" : " · check payer"}.`}</Hint>}
            </div></ZoneDrawer>
          </ApprovalForm>
          <RejectDrawer id={rejectId} $tone="danger" open={rejecting} onToggle={event => closedReject(event.currentTarget)} data-reject>
            <summary><CloseIcon />Reject<ChevronDownIcon /></summary>
            <div>{desktop && <ZoneLabel as="h3">Reject payment</ZoneLabel>}<form id={`${rejectId}-form`} method="post" action={`/api/admin/payments/${p.id}`} onSubmit={async event => {
              event.preventDefault(); if (action.busy) return; const form = new FormData(event.currentTarget); onStart();
              await action.send(`/api/admin/payments/${p.id}`, { action: "reject", reason: form.get("reason"), text: form.get("text"), deleteImage: form.get("deleteImage") === "on" }, `Rejected ${p.reference}.`, true, onResolved);
            }} aria-label={`Reject ${p.reference}`}><FormStack><FieldBlock>Reason<select id={`${rejectId}-reason`} name="reason" disabled={action.busy}>{Object.entries(reasonLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></FieldBlock>
              <FieldBlock>Message · optional<textarea name="text" maxLength={200} disabled={action.busy} rows={2} /></FieldBlock>
              {p.hasImage && <CheckField><input type="checkbox" name="deleteImage" disabled={action.busy} />Delete screenshot</CheckField>}
              <DangerButton type="submit" disabled={action.busy} data-reject-inline>Reject payment</DangerButton></FormStack></form></div>
          </RejectDrawer>
        </> : <DecisionPanel>
          <ZoneLabel as={desktop ? "h3" : "p"}>{desktop ? "Recorded payment" : "Decision"}</ZoneLabel>
          <FactList>
            {desktop && <div><dt>{typeof receivedAmount === "number" ? "Amount received" : "Amount reported"}</dt><dd>{formatUgx(receivedAmount ?? p.amount)}</dd></div>}
            <div><dt>{p.final ? "Confirmed transaction ID" : "Reported transaction ID"}</dt><CopyRow><span data-payment-transaction>{reportedId || "Not provided"}</span>
              <CopyTextButton value={reportedId} /></CopyRow></div>
            {desktop && <>
              <div><dt>Payment provider</dt><dd>{networkLabel(shownNetwork)}</dd></div>
              <div><dt>Package / purpose</dt><dd>{topUp || p.durationDays === null ? "Credit top-up" : `${p.planName} · ${formatPlanLength(p.durationDays)}`}</dd></div>
              {!topUp && (receivedAmount ?? p.amount) !== p.price && <div><dt>Package price</dt><dd>{formatUgx(p.price)}</dd></div>}
            </>}
          </FactList>
          {p.status === "approved" && !reversed && <ZoneDrawer $tone="danger"><summary>Reverse payment<ChevronDownIcon /></summary><div><form method="post" action={`/api/admin/payments/${p.id}`} onSubmit={async event => {
            event.preventDefault(); if (action.busy) return; const reason = new FormData(event.currentTarget).get("reason"); onStart();
            const reply = await action.send(`/api/admin/payments/${p.id}`, { action: "reverse", reason }, `Reversed ${p.reference}.`);
            if (reply.ok) onRecovery({ reversed: true, carried: reply.body.carriedOtherDays === true, recovery: reason === "wrong-account" });
          }}><FormStack><FieldBlock>Reason<select name="reason" disabled={action.busy}><option value="network-reversal">Network reversal</option><option value="wrong-account">Wrong account</option></select></FieldBlock>
            <CheckField><input type="checkbox" required disabled={action.busy} />End access from this payment</CheckField>
            <DangerButton type="submit" disabled={action.busy}>Confirm reversal</DangerButton></FormStack></form></div></ZoneDrawer>}
          {recovery?.carried && <Notice $tone="warning">Other days moved with this payment. Restore any verified remaining access manually.</Notice>}
          {recovery?.recovery && p.purpose === "topup" && <Notice $tone="warning">This was a credit top-up. Add {formatUgx(p.final?.amount ?? p.amount)} to the real payer&apos;s account
            with Subscribers → Credit → Correct credit, noting {p.reference}.</Notice>}
          {recovery?.recovery && p.purpose !== "topup" && <RecoveryStack><h3>Grant access to the real payer</h3><Hint>Leave the transaction ID empty here so the payment is counted once.</Hint>
            <ManualCodeForm compact withoutTransaction plans={plans} action={action} onStart={onStart} phone={p.payerPhone ?? ""} amount={p.final?.amount ?? p.amount} note={`for ${p.reference}`} /></RecoveryStack>}
        </DecisionPanel>}
      </DecisionZone>
    </ReviewZones>
    </PaymentReviewScroll>
    {pending && <DecisionBar $rejecting={rejecting} data-decision-bar>
      <span data-payment-footer-summary data-record-summary>Confirm funds before approving</span>
      <RejectToggle type="button" $open={rejecting} aria-expanded={rejecting} aria-controls={rejectId} disabled={action.busy} onClick={toggleReject}
        data-reject-toggle>{rejecting ? "Cancel" : <><CloseIcon />Reject</>}</RejectToggle>
      <ActionButton type="submit" form={approvalId} $variant="primary" disabled={action.busy || !canApprove} data-payment-approve><CheckIcon />{action.busy ? "Saving…" : topUp ? "Approve top-up" : "Approve payment"}</ActionButton>
      <DangerButton type="submit" form={`${rejectId}-form`} disabled={action.busy} data-reject-submit><CloseIcon />Reject payment</DangerButton>
    </DecisionBar>}
  </ReviewCard>;
}
