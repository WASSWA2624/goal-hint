"use client";

import { useId, useState, type FormEvent } from "react";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import Link from "@/components/navigation/navigation-link";
import { AlertIcon, CheckIcon, ChevronDownIcon, CloseIcon, InfoIcon, ShieldIcon, UserIcon } from "@/components/ui/icons";
import { CriteriaDialogButton } from "@/components/ui/criteria-dialog";
import { useDesktopLayout } from "@/components/ui/use-desktop-layout";
import { normalizeTransactionId, parseTransactionId } from "@/domain/payment";
import { parsePaymentSms, type PaymentSms } from "@/domain/payment-sms";
import { formatInternationalPhone } from "@/domain/phone-countries";
import { formatUgx, type SubscriptionPlanView } from "@/domain/subscription-plans";
import type { OwnerPayment } from "@/domain/owner-members";
import { ActionButton, CheckField, DangerButton, FieldBlock, FieldRow, Hint } from "./admin-form";
import { ManualCodeForm, type CodeAction } from "./code-tools";
import { CopyTextButton } from "./copy-text-button";
import { PaymentScreenshotPreview } from "@/components/members/payment-image-preview";
import { PaymentRejectionDialog } from "./payment-rejection-dialog";
import { PaymentReversalDialog } from "./payment-reversal-dialog";
import { PaymentActionDialog, PaymentDialogCancel } from "./payment-action-dialog";
import { paymentReceiptChecks } from "./payment-receipt-checks";
import { PaymentAccountSummary, PaymentFacts } from "./payment-account-summary";
import { DrawerNote, TextAction, ZoneLabel } from "./desk-styles";
import { NetworkChip } from "./network-chip";
import { PaymentReviewScroll, ReviewSectionHead, TransactionControl } from "./payment-balanced-styles";
import { ApprovalForm, CheckList, CopyRow, PaymentReviewFooter, DecisionPanel, DecisionZone, ExpectedZone, PaymentWarnings,
  ProofZone, ReviewCard, ReviewHead, ReviewZones, ShieldMark,
  ZoneDrawer } from "./payment-styles";

export type PaymentRecovery = Readonly<{ reversed: boolean; recovery: boolean; carried: boolean }>;
const phoneLabel = (phone: string | null) => phone ? formatInternationalPhone(phone) : "Erased account";
export const paymentWarnings = (p: OwnerPayment) => [...new Set(p.checks.filter(check => check.tone === "warning").map(check => check.text))];

/**
 * Reported values remain editable; approval is an explicit administrative decision. A top-up has no plan: everything recorded as
 * received becomes credit. A plan payment's amount above its price becomes credit too.
 */
export function PaymentReview({ payment: p, plans, action, recovery, hasNext, nextAcrossPages, onStart, onResolved, onRecovery }: {
  payment: OwnerPayment; plans: readonly SubscriptionPlanView[]; action: CodeAction; recovery: PaymentRecovery | undefined;
  hasNext: boolean; nextAcrossPages: boolean; onStart: () => void; onResolved: (approved: boolean) => void; onRecovery: (value: PaymentRecovery) => void;
}) {
  const desktop = useDesktopLayout();
  const [network, setNetwork] = useState(p.network), [id, setId] = useState(() => normalizeTransactionId(p.transactionId || "")), [amount, setAmount] = useState(String(p.amount));
  const topUp = p.purpose === "topup", [planId, setPlanId] = useState(p.planId ?? "");
  const [sms, setSms] = useState<PaymentSms>({}), [hasSms, setHasSms] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [rejecting, setRejecting] = useState(false), [smsOpen, setSmsOpen] = useState(false);
  const [dialog, setDialog] = useState<"reverse" | "recovery" | null>(null), recoveryFormId = useId();
  const [draftId, setDraftId] = useState(p.id);
  if (draftId !== p.id) {
    setDraftId(p.id);
    setNetwork(p.network); setId(normalizeTransactionId(p.transactionId)); setAmount(String(p.amount)); setPlanId(p.planId ?? "");
    setSms({}); setHasSms(false); setChecked({});
    setRejecting(false); setSmsOpen(false); setDialog(null);
  }
  const pending = ["pending", "superseded"].includes(p.status), reversed = recovery?.reversed || p.status === "reversed";
  const canReverse = p.status === "approved" && !reversed;
  const canRecover = !!recovery?.recovery && !topUp;
  const warnings = paymentWarnings(p);
  const checks = [...new Map(p.checks.filter(check => check.tone !== "warning" && !warnings.includes(check.text)).map(check => [check.text, check])).values()];
  const allClear = !warnings.length && checks.every(check => check.tone === "good");
  const changedPlan = planId === p.planId ? undefined : plans.find(plan => plan.id === planId);
  const reportedId = p.final?.transactionId || p.transactionId, receivedAmount = p.final?.amount;
  const validAmount = amount.trim() !== "" && /^\d+$/u.test(amount) && Number.isSafeInteger(Number(amount)) && Number(amount) <= 4_294_967_295;
  const validPlan = topUp || !!planId && (planId === p.planId || plans.some(plan => plan.id === planId && plan.active));
  const price = changedPlan?.priceUgx ?? p.price;
  const excess = !topUp && validAmount ? Number(amount) - price : 0;
  const confirmed = paymentReceiptChecks.every(([name]) => checked[name]);
  const canApprove = confirmed && !!p.accountPhone && !!parseTransactionId(id) && validAmount && ["mtn", "airtel"].includes(network) && validPlan && (topUp || Number(amount) >= price);
  const shownNetwork = pending ? network : p.final?.network || p.network, screenshot = `/api/admin/payments/${p.id}/screenshot`;
  const approvalId = `payment-approval-${p.id}`;
  function closeDialog() { action.clearFeedback(); setDialog(null); }

  function parse(text: string) {
    const parsed = parsePaymentSms(text, {});
    setHasSms(!!text.trim()); setSms(parsed); setAmount(parsed.amount === undefined ? "" : String(parsed.amount));
    setId(parsed.transactionId ?? ""); setNetwork(parsed.network ?? p.network);
  }
  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (action.busy || !canApprove) return;
    onStart();
    await action.send(`/api/admin/payments/${p.id}`, { action: "approve", verified: true, network, transactionId: id, amount: Number(amount), ...(topUp ? {} : { planId }) },
      "", !nextAcrossPages, () => onResolved(true));
  }
  const status = reversed ? "reversed" : p.status;
  const warningLabels = new Map(p.checks.filter(check => check.tone === "warning").map(check => [check.text, check.summary ?? check.text]));
  const transaction = <TransactionControl><FieldBlock label="Transaction ID">
    <input id="payment-confirmed-id" name="transactionId" required maxLength={40} pattern="[A-Z0-9.\-]{4,40}" autoComplete="off" spellCheck={false}
      value={id} disabled={action.busy} onChange={event => setId(normalizeTransactionId(event.target.value))} data-payment-transaction />
  </FieldBlock><CopyTextButton value={id} disabled={action.busy} compact /></TransactionControl>;
  return <ReviewCard id={p.id} data-payment-review={p.id} data-review-layout="balanced">
    <PaymentReviewScroll data-payment-review-scroll tabIndex={0} aria-label="Payment details">
    <ReviewHead data-payment-head>
      <PaymentAccountSummary payment={p} status={status} busy={action.busy} />
      {!desktop &&
        <TextAction as={Link} data-review-link href={`/admin/subscribers?accountId=${encodeURIComponent(p.accountId)}`} prefetch={false}><UserIcon />View subscriber</TextAction>
      }
    </ReviewHead>
    <ReviewZones data-payment-zones>
      <DecisionZone data-payment-zone="decision">
        {pending ?
          <ApprovalForm id={approvalId} method="post" action={`/api/admin/payments/${p.id}`} onSubmit={approve} aria-labelledby={`${p.id}-decision`} data-payment-approval>
            <ReviewSectionHead><ZoneLabel as="h3" id={`${p.id}-decision`}>Transaction details</ZoneLabel>
              {desktop && <TextAction type="button" aria-expanded={smsOpen} aria-controls={`${p.id}-sms`} onClick={() => setSmsOpen(value => !value)}>Paste wallet SMS</TextAction>}
            </ReviewSectionHead>
            <NetworkChip network={shownNetwork} labelled />
            <FieldRow data-payment-confirmation-fields><FieldBlock label="Amount deposited · UGX"><input id="payment-confirmed-amount" name="amount" type="number" min={0} max={4294967295} step={1} required value={amount} disabled={action.busy}
              onChange={event => setAmount(event.target.value)} /></FieldBlock>
              {transaction}
              <FieldBlock label="Sender number"><input value={p.payerPhone ? phoneLabel(p.payerPhone) : "Unavailable"} readOnly /></FieldBlock>
            </FieldRow>
            <ZoneDrawer data-payment-plan-controls><summary>{topUp ? "Edit provider" : "Edit provider or package"}<ChevronDownIcon /></summary>
              <div><FieldRow data-payment-plan-fields><FieldBlock label="Payment provider"><select name="network" value={network} disabled={action.busy} onChange={event => setNetwork(event.target.value)}><option value="mtn">MTN MoMo</option><option value="airtel">Airtel Money</option></select></FieldBlock>
                {!topUp && p.planId && p.durationDays !== null && <FieldBlock label="Package"><select name="planId" value={planId} disabled={action.busy} onChange={event => setPlanId(event.target.value)}>
                  <option value={p.planId}>{p.planName}</option>
                  {plans.filter(plan => plan.active && plan.id !== p.planId).map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                </select></FieldBlock>}
              </FieldRow></div></ZoneDrawer>
            {!topUp && <PaymentFacts data-payment-package>
              <div><dt>Package price</dt><dd>{formatUgx(price)}</dd></div>
              {!!(changedPlan?.durationDays ?? p.durationDays) && <div><dt>Purchased days</dt><dd>{changedPlan?.durationDays ?? p.durationDays}</dd></div>}
            </PaymentFacts>}
            {validAmount && (topUp ? <Hint role="status" data-payment-credit>The received amount will be added to the account&apos;s credit.</Hint>
              : excess > 0 && <Hint role="status" data-payment-credit>{formatUgx(excess)} above the price will be added to the account&apos;s credit.</Hint>)}
            <ZoneDrawer id={`${p.id}-sms`} open={smsOpen} onToggle={event => setSmsOpen(event.currentTarget.open)} data-payment-sms><summary>Paste wallet SMS · optional<ChevronDownIcon /></summary><div><FieldBlock label={"Received-payment message"}><textarea key={p.id} maxLength={12000} disabled={action.busy} rows={3}
              placeholder="Paste the SMS to update the payment fields" onChange={event => parse(event.target.value)} /></FieldBlock>
              {hasSms && <Hint role="status">{sms.transactionId && sms.amount !== undefined ? "Payment details updated." : "Enter the missing details above."}
                {sms.counterparty && ` Sender: ${phoneLabel(sms.counterparty)}${sms.counterparty === p.payerPhone ? " · matches payer" : " · check payer"}.`}</Hint>}
            </div></ZoneDrawer>
            <div>{paymentReceiptChecks.map(([name, label]) => <CheckField key={name}>
              <input type="checkbox" checked={!!checked[name]} onChange={event => setChecked(current => ({ ...current, [name]: event.target.checked }))} required disabled={action.busy} />{label}
            </CheckField>)}</div>
          </ApprovalForm>
        : <DecisionPanel>
          <ZoneLabel as="h3">Transaction details</ZoneLabel>
          <NetworkChip network={shownNetwork} labelled />
          <PaymentFacts>
            <div><dt>{typeof receivedAmount === "number" ? "Amount deposited" : "Amount reported"}</dt><dd>{formatUgx(receivedAmount ?? p.amount)}</dd></div>
            <div><dt>{p.final ? "Confirmed transaction ID" : "Reported transaction ID"}</dt><CopyRow><span data-payment-transaction>{reportedId || "Not provided"}</span>
              <CopyTextButton value={reportedId} compact /></CopyRow></div>
            {p.payerPhone && <div><dt>Sender number</dt><dd>{phoneLabel(p.payerPhone)}</dd></div>}
            {!topUp && <div><dt>Package price</dt><dd>{formatUgx(p.price)}</dd></div>}
            {!topUp && p.durationDays !== null && <div><dt>Purchased days</dt><dd>{p.durationDays}</dd></div>}
            {p.status === "approved" && (topUp ? <div><dt>Wallet credit</dt><dd>Full deposit</dd></div>
              : typeof receivedAmount === "number" && receivedAmount > p.price && <div><dt>Wallet credit</dt><dd>{formatUgx(receivedAmount - p.price)}</dd></div>)}
          </PaymentFacts>
          {recovery?.carried && <Notice $tone="warning">Other days moved with this payment. Restore any verified remaining access manually.</Notice>}
          {recovery?.recovery && p.purpose === "topup" && <Notice $tone="warning">This was a credit top-up. Add {formatUgx(p.final?.amount ?? p.amount)} to the real payer&apos;s account
            with Subscribers → Credit → Correct credit, noting {p.reference}.</Notice>}
        </DecisionPanel>}
      </DecisionZone>
      {p.hasImage && <ProofZone aria-label="Payment evidence" data-payment-zone="proof">
        <ZoneLabel as="h3">Payment evidence</ZoneLabel>
        <PaymentScreenshotPreview url={screenshot} disabled={action.busy} />
      </ProofZone>}
      {(warnings.length > 0 || !desktop && checks.length > 0) && <ExpectedZone aria-label="Payment verification" data-payment-zone="checks">
        {warnings.length > 0 && <PaymentWarnings role="note" aria-label="Payment warnings">
          {warnings.map(text => <p key={text}><AlertIcon />{warningLabels.get(text)}</p>)}
        </PaymentWarnings>}
        {!desktop && checks.length > 0 && <ZoneDrawer data-payment-checks>
          <summary><ShieldMark $clear={allClear}><ShieldIcon /></ShieldMark>Automatic checks<DrawerNote>{allClear ? `all ${checks.length} clear` : `(${checks.length})`}</DrawerNote><ChevronDownIcon /></summary>
          <div><CheckList aria-label="Automatic checks">{checks.map(check => <li key={check.text} data-tone={check.tone}>{check.tone === "good" ? <CheckIcon /> : <InfoIcon />}{check.summary ?? check.text}</li>)}</CheckList></div>
        </ZoneDrawer>}
      </ExpectedZone>}
    </ReviewZones>
    </PaymentReviewScroll>
    {(pending || canReverse || canRecover) && <PaymentReviewFooter data-decision-bar>
      {pending && <>
      <DangerButton type="button" aria-haspopup="dialog" disabled={action.busy} onClick={() => {
        action.clearFeedback(); setRejecting(true);
      }}><CloseIcon />Reject with reason</DangerButton>
      <ActionButton type="submit" form={approvalId} $variant="primary" disabled={action.busy || !canApprove} data-payment-approve><CheckIcon />{hasNext ? "Approve and next" : "Approve"}</ActionButton>
      </>}
      {canReverse && <DangerButton type="button" aria-haspopup="dialog" disabled={action.busy} onClick={() => {
        action.clearFeedback(); setDialog("reverse");
      }}>Reverse payment</DangerButton>}
      {canRecover && <ActionButton type="button" aria-haspopup="dialog" disabled={action.busy} onClick={() => {
        action.clearFeedback(); setDialog("recovery");
      }}>Grant access to the real payer</ActionButton>}
    </PaymentReviewFooter>}
    {pending && rejecting && <PaymentRejectionDialog busy={action.busy} error={action.message} canDeleteImage={p.hasImage}
      onCancel={() => { action.clearFeedback(); setRejecting(false); }}
      onReject={({ presets, text, deleteImage }) => {
        onStart();
        void action.send(`/api/admin/payments/${p.id}`, { action: "reject", reason: presets[0] ?? "other", text, deleteImage },
          `Rejected ${p.reference}.`, true, () => { setRejecting(false); onResolved(false); });
      }} />}
    {dialog === "reverse" && <PaymentReversalDialog busy={action.busy} error={action.message} topUp={topUp} onClose={closeDialog}
      onReverse={async ({ reasons, note }) => {
        onStart();
        const reply = await action.send(`/api/admin/payments/${p.id}`, { action: "reverse", reasons, note, endAccess: true }, `Reversed ${p.reference}.`);
        if (reply.ok) {
          setDialog(null);
          onRecovery({ reversed: true, carried: reply.body.carriedOtherDays === true, recovery: reasons.includes("wrong-account") });
        }
      }} />}
    {dialog === "recovery" && <PaymentActionDialog title="Grant access to the real payer" busy={action.busy} onClose={closeDialog} footer={<>
      <PaymentDialogCancel type="button" variant="secondary" disabled={action.busy} onClick={closeDialog}>Cancel</PaymentDialogCancel>
      <CriteriaDialogButton type="submit" form={recoveryFormId} disabled={action.busy}>Grant access</CriteriaDialogButton>
    </>}>
      <Hint as="p">The original transaction ID stays with the reversed payment so it is counted once.</Hint>
      <ManualCodeForm compact withoutTransaction externalActions formId={recoveryFormId} plans={plans} action={action} onStart={onStart}
        onSaved={() => setDialog(null)} phone={p.payerPhone ?? ""} amount={p.final?.amount ?? p.amount} note={`for ${p.reference}`} />
      {action.message && <p role="alert">{action.message}</p>}
    </PaymentActionDialog>}
  </ReviewCard>;
}
