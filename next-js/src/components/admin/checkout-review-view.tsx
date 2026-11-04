"use client";

import { useState } from "react";
import styled from "styled-components";
import { Button, TextInput } from "@/components/ui/controls";
import { DateTimeField } from "@/components/ui/date-time-field";
import { FloatingField } from "@/components/ui/floating-field";
import { PaymentScreenshotPreview } from "@/components/members/payment-image-preview";
import { checkoutOpenStatuses, checkoutRules, fundingAmounts } from "@/domain/checkout";
import { dateTimeIntervalRange, localDateTimeValue } from "@/domain/date-time";
import type { OwnerPayment } from "@/domain/owner-members";
import { paymentDateNotExtracted } from "@/domain/payment-evidence-date";
import { formatInternationalPhone } from "@/domain/phone-countries";
import { formatUgx } from "@/domain/subscription-plans";
import { media } from "@/styles/theme";
import { CheckField } from "./admin-form";
import type { CheckoutReviewDetail } from "./checkout-review";
import { CopyTextButton } from "./copy-text-button";
import { NetworkChip } from "./network-chip";
import { PaymentAccountSummary, PaymentFacts } from "./payment-account-summary";
import { paymentReceiptChecks } from "./payment-receipt-checks";
import { PaymentRejectionDialog } from "./payment-rejection-dialog";
import { PaymentReviewFooter } from "./payment-styles";
import { RecordCard, RecordScroll } from "./record-workspace";

type Claim = CheckoutReviewDetail["claims"][number];
type Act = (body: Record<string, unknown>, advance?: boolean) => Promise<void>;
const zone = "Africa/Kampala";
const openStatuses: readonly string[] = checkoutOpenStatuses;
const phone = (value: string | null) => value ? formatInternationalPhone(value) : "";
const receiptForm = (id: string) => `checkout-verify-${id}`;

const Body = styled(RecordScroll)`
  gap: var(--gh-spacing-3); padding: var(--gh-spacing-3) var(--gh-spacing-4);
  h3, p { margin: 0; }
  h3 { font-size: var(--gh-font-section); font-weight: var(--gh-weight-medium); }
  form { display: grid; gap: var(--gh-spacing-2); min-inline-size: 0; }
  ${media.belowDesktop} {
    display: grid; align-content: start; min-inline-size: 0; padding: 0;
  }
`;
const Identity = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--gh-spacing-2); min-inline-size: 0;
  > span, > strong { min-inline-size: 0; overflow-wrap: anywhere; }
  > strong { font-weight: var(--gh-weight-medium); }
`;
const Receipt = styled.section`
  display: grid; gap: var(--gh-spacing-2); min-inline-size: 0;
  padding-block-start: var(--gh-spacing-3);
  border-block-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
  details > summary { cursor: pointer; }
  details > form { margin-block-start: var(--gh-spacing-2); }
`;
const Transactions = styled.section`
  display: grid; gap: var(--gh-spacing-2); min-inline-size: 0;
  padding-block-start: var(--gh-spacing-3);
  border-block-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
`;
const Fields = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--gh-spacing-2); min-inline-size: 0;
  @media (max-width: ${({ theme }) => theme.viewport[22.5]}) {
    grid-template-columns: minmax(0, 1fr);
  }
`;
const Checklist = styled(Fields)`column-gap: var(--gh-spacing-3); row-gap: 0;`;
const Previews = styled.div`
  display: flex; flex-wrap: wrap; align-items: start; gap: var(--gh-spacing-2);
`;
const Muted = styled.p`color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary);`;

function verifiedFields(form: HTMLFormElement, claim: Claim) {
  const data = new FormData(form);
  const date = String(data.get("receivedAt") ?? "");
  return {
    receiptId: claim.receipt.id, amountUgx: Number(data.get("amountUgx")), recipient: data.get("recipient"),
    senderPhone: data.get("senderPhone"),
    receivedAt: new Date(dateTimeIntervalRange({ from: date, to: date }, zone).window.startInclusive).toISOString(),
    ...Object.fromEntries(paymentReceiptChecks.map(([name]) => [name, data.has(name)])),
  };
}

function TransactionId({ claim, busy }: { claim: Claim; busy: boolean }) {
  return <Identity><NetworkChip network={claim.receipt.provider} labelled />
    <strong>{claim.receipt.transactionId}</strong>
    <CopyTextButton value={claim.receipt.transactionId} compact disabled={busy} />
  </Identity>;
}

function ReceiptDetails({ claim, detail, url, showLegacy, editable, canEdit, exception, busy, onEdit, onAmount, act }: {
  claim: Claim; detail: CheckoutReviewDetail; url: string; showLegacy: boolean; editable: boolean; canEdit: boolean; exception: boolean;
  busy: boolean; onEdit: () => void; onAmount: (amount: number) => void; act: Act;
}) {
  const received = claim.receipt.receivedAt ?? (paymentDateNotExtracted(claim.original) ? null : claim.paidAt);
  const sender = claim.receipt.senderPhone ?? (claim.receipt.verifiedAt ? null : claim.payerPhone);
  const recipient = claim.receipt.recipient ?? detail.receivingNumber;
  const originalText = claim.original && typeof claim.original === "object" && "text" in claim.original
    && typeof claim.original.text === "string" ? claim.original.text : "";
  const images = claim.purgedAt ? [] : [
    ...(claim.imageSha256 && !claim.imageIsLegacy ? [`${url}/screenshot?claimId=${claim.id}`] : []),
    ...(claim.legacyImage && showLegacy ? [`${url}/screenshot`] : []),
    ...claim.evidence.map(item => `${url}/screenshot?evidenceId=${item.id}`),
  ];
  return <Receipt aria-label="Receipt">
    <TransactionId claim={claim} busy={busy} />
    {claim.receipt.verifiedAt && <Muted>Receipt verified</Muted>}
    {editable ? <form id={receiptForm(claim.id)} onSubmit={event => {
      event.preventDefault();
      if (exception) void act({ action: "verify-receipt", ...verifiedFields(event.currentTarget, claim) });
    }}>
      <Fields>
        <TextInput name="amountUgx" label="Amount deposited · UGX" type="number" required min={1} max={checkoutRules.maximumUgx} defaultValue={claim.receipt.amountUgx ?? claim.amountUgx}
          onChange={event => onAmount(Number(event.target.value))} disabled={busy} />
        <TextInput name="recipient" label="Receiving number" required type="tel" defaultValue={phone(recipient)} disabled={busy} />
        <TextInput name="senderPhone" label="Sender number" type="tel" defaultValue={phone(sender)} disabled={busy} />
        <DateTimeField name="receivedAt" label="Payment date and time · EAT" mode="datetime" timeZone={zone} required
          defaultValue={received ? localDateTimeValue(Date.parse(received), zone) : ""} disabled={busy} />
      </Fields>
      <Checklist>{paymentReceiptChecks.map(([name, label]) => <CheckField key={name}><input type="checkbox" name={name} required disabled={busy} />{label}</CheckField>)}</Checklist>
      {exception && <Identity><Button variant="secondary" type="submit" disabled={busy}>{claim.receipt.disputed ? "Confirm transfer for dispute" : "Confirm transfer for reconciliation"}</Button></Identity>}
    </form> : <>
      <PaymentFacts>
        <div><dt>Amount deposited</dt><dd>{formatUgx(claim.receipt.amountUgx ?? claim.amountUgx)}</dd></div>
        {recipient && <div><dt>Receiving number</dt><dd>{phone(recipient)}</dd></div>}
        <div><dt>Sender number</dt><dd>{phone(sender) || "Unavailable"}</dd></div>
        {received && <div><dt>Payment date and time</dt><dd>{localDateTimeValue(Date.parse(received), zone).replace("T", " · ")} EAT</dd></div>}
      </PaymentFacts>
      {canEdit && <Identity><Button variant="quiet" type="button" onClick={onEdit} disabled={busy}>Edit receipt</Button></Identity>}
    </>}
    {claim.receipt.senderPhone && claim.payerPhone && claim.receipt.senderPhone !== claim.payerPhone &&
      <Muted role="note">The reported payer, {phone(claim.payerPhone)}, differs from the verified sender.</Muted>}
    {images.length > 0 && <Previews aria-label="Payment screenshots">
      {images.map((image, index) => <PaymentScreenshotPreview key={image} url={image}
        {...(images.length > 1 ? { label: `Preview payment screenshot ${index + 1}` } : {})} />)}
    </Previews>}
    {!claim.validation.reviewed && claim.validation.warnings.length > 0 && <details open>
      <summary>Evidence discrepancies</summary>
      <ul>{claim.validation.warnings.map(warning => <li key={warning.id}>{warning.message}</li>)}</ul>
      {originalText && <details><summary>Original payment message</summary><Muted>{originalText}</Muted></details>}
      {openStatuses.includes(detail.status) && <form onSubmit={event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void act({ action: "review-evidence", claimId: claim.id, warningsChecked: data.has("warningsChecked"), reason: data.get("reason") });
      }}>
        <TextInput name="reason" label="Review findings" required minLength={3} maxLength={500} disabled={busy} />
        <CheckField><input name="warningsChecked" type="checkbox" required disabled={busy} />Checked the differences against the evidence and receiving records</CheckField>
        <Identity><Button type="submit" variant="secondary" disabled={busy}>Save findings</Button></Identity>
      </form>}
    </details>}
    {claim.receipt.disputed && <details open>
      <summary>Resolve receipt ownership</summary>
      <Muted>Contact the verified sender. If ownership is unclear, leave funds unallocated for provider reconciliation.</Muted>
      {claim.receipt.verifiedAt && claim.receipt.senderPhone && <form onSubmit={event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void act({ action: "resolve-dispute", receiptId: claim.receipt.id, intendedSubmissionId: data.get("intendedSubmissionId"), reason: data.get("reason"),
          contactedVerifiedPayer: data.has("contactedVerifiedPayer"), ownershipClear: data.has("ownershipClear") });
      }}>
        <FloatingField label="Intended payment request"><select name="intendedSubmissionId" required disabled={busy}>
          {claim.receipt.claims.map(item => <option key={item.submissionId} value={item.submissionId}>P{item.submission.reference}</option>)}
        </select></FloatingField>
        <TextInput name="reason" label="Ownership resolution" required minLength={3} maxLength={500} disabled={busy} />
        <CheckField><input type="checkbox" name="contactedVerifiedPayer" required disabled={busy} />Contacted the verified sender</CheckField>
        <CheckField><input type="checkbox" name="ownershipClear" required disabled={busy} />Confirmed who the payment belongs to</CheckField>
        <Identity><Button type="submit" variant="secondary" disabled={busy}>Save ownership resolution</Button></Identity>
      </form>}
    </details>}
  </Receipt>;
}

export function CheckoutReviewView({ payment, detail, busy, loading, hasNext, error, notice, act }: {
  payment: OwnerPayment; detail: CheckoutReviewDetail | null; busy: boolean; loading: boolean; hasNext: boolean; error: string; notice: string; act: Act;
}) {
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const rejecting = rejectingId === payment.id;
  const [edits, setEdits] = useState<string[]>([]), [amounts, setAmounts] = useState<Record<string, number>>({});
  const reviewKey = `${payment.id}:${detail?.revision ?? ""}`;
  const [draftKey, setDraftKey] = useState(reviewKey);
  if (draftKey !== reviewKey) {
    setDraftKey(reviewKey);
    if (rejectingId && !rejecting) setRejectingId(null);
    setEdits([]); setAmounts({});
  }
  const url = `/api/admin/payments/${payment.id}`;
  const claims = detail?.claims.filter(claim => !claim.withdrawn) ?? [], primary = claims[0];
  const legacyImageClaim = claims.find(claim => claim.imageIsLegacy) ?? primary;
  const pending = openStatuses.includes(detail?.status ?? payment.status);
  const blocked = detail?.status === "disputed" || claims.some(claim => claim.receipt.disputed);
  const exception = !pending || !!blocked || !detail?.reservationActive;
  const canEdit = (claim: Claim) => (!claim.receipt.allocatedSubmissionId || !claim.receipt.senderPhone)
    && (pending || !claim.receipt.allocatedSubmissionId || claim.receipt.disputed);
  const editing = (claim: Claim) => canEdit(claim) && (!claim.receipt.verifiedAt || edits.includes(claim.id) || claim.receipt.disputed && !claim.receipt.senderPhone);
  const needsAnotherReceipt = !!detail && detail.remainingUgx > 0 && !claims.some(editing);
  const received = claims.reduce((sum, claim) => sum + (!claim.receipt.disputed && claim.receipt.intendedSubmissionId === payment.id
    ? amounts[claim.id] ?? claim.receipt.amountUgx ?? claim.amountUgx : 0), 0);
  const topUp = payment.purpose === "topup";
  const walletCredit = fundingAmounts(payment.price, detail?.walletUgx ?? 0, received).excessUgx;

  function approve() {
    const receipts = [];
    for (const claim of claims.filter(editing)) {
      const form = document.getElementById(receiptForm(claim.id));
      if (!(form instanceof HTMLFormElement) || !form.reportValidity()) return;
      receipts.push(verifiedFields(form, claim));
    }
    void act({ action: "approve-checkout", receipts }, true);
  }

  return <RecordCard data-checkout-review data-compact-checkout-review aria-busy={loading || undefined}>
    <Body>
      <PaymentAccountSummary payment={payment} status={detail?.status ?? payment.status} busy={busy} />
      {error && !rejecting && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      {!detail && !error && <Muted>Loading receipt records…</Muted>}
      {detail && <>
        <Transactions aria-label="Transaction details"><h3>Transaction details</h3>
        <PaymentFacts aria-label="Funding and days">
          {!topUp && payment.planId && <div><dt>Package price</dt><dd>{formatUgx(payment.price)}</dd></div>}
          {detail.walletUgx > 0 && <div><dt>Wallet used</dt><dd>{formatUgx(detail.walletUgx)}</dd></div>}
          {topUp ? <div><dt>Wallet credit</dt><dd>Full deposit</dd></div> : walletCredit > 0 && <div>
            <dt>{detail.status === "approved" ? "Wallet credit" : "Wallet credit on approval"}</dt><dd>{formatUgx(walletCredit)}</dd>
          </div>}
          {!!payment.durationDays && <div><dt>Purchased days</dt><dd>{payment.durationDays}</dd></div>}
          {detail.referralDays > 0 && <div><dt>Referral days</dt><dd>{detail.referralDays}</dd></div>}
        </PaymentFacts>
        {claims.map(claim => <ReceiptDetails key={`${claim.id}:${detail.revision}`} claim={claim} detail={detail} url={url} showLegacy={claim === legacyImageClaim}
          busy={busy} editable={editing(claim)} canEdit={canEdit(claim)} exception={exception} act={act}
          onEdit={() => setEdits(current => [...current, claim.id])} onAmount={amount => setAmounts(current => ({ ...current, [claim.id]: amount }))} />)}
        </Transactions>
      </>}
    </Body>
    {pending && <PaymentReviewFooter>
      <Button variant="quiet" aria-haspopup="dialog" disabled={busy} onClick={() => setRejectingId(payment.id)}>Reject with reason</Button>
      <Button onClick={approve} disabled={busy || exception || needsAnotherReceipt || claims.some(claim => !claim.validation.reviewed)}>{hasNext ? "Approve and next" : "Approve"}</Button>
    </PaymentReviewFooter>}
    {pending && rejecting && <PaymentRejectionDialog busy={busy} error={error} onCancel={() => setRejectingId(null)}
      onReject={({ presets, note }) => { void act({ action: "reject-checkout", presets, ...(note ? { reason: note } : {}) }, true); }} />}
  </RecordCard>;
}
