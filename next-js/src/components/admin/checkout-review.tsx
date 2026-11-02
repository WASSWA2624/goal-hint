"use client";

import { FloatingField } from "@/components/ui/floating-field";
import { useEffect, useState, type ReactNode } from "react";
import styled from "styled-components";
import { Button, TextInput } from "@/components/ui/controls";
import { formatUgx } from "@/domain/subscription-plans";
import { formatPeriodEnd } from "@/domain/subscription-period";
import { checkoutLabels, checkoutOpenStatuses } from "@/domain/checkout";
import { paymentDateNotExtracted as dateNotExtracted } from "@/domain/payment-evidence-date";
import type { ReceiptEvidenceValidation } from "@/domain/checkout-evidence";
import type { OwnerPayment } from "@/domain/owner-members";
import { CheckoutActions } from "../members/checkout-parts";
import { WizardReview } from "../members/payment-wizard";

type Receipt = { id: string; provider: string; transactionId: string; verifiedAt: string | null; verifiedBy: string | null;
  amountUgx: number | null; disputed: boolean; senderPhone: string | null; recipient: string | null;
  allocatedSubmissionId: string | null; intendedSubmissionId: string | null; receivedAt: string | null;
  claims: { submissionId: string; submission: { reference: string; accountId: string } }[] };
type Detail = { revision: number; status: string; walletUgx: number; referralDays: number; receivingNumber: string | null;
  reservationActive: boolean; reservationUntil: string | null; amountToSend: number; remainingUgx: number; excessUgx: number; verifiedUgx: number;
  claims: { id: string; receipt: Receipt; amountUgx: number; payerPhone: string | null; paidAt: string; original: unknown; corrections: unknown; imageSha256: string | null; withdrawn: boolean; purgedAt: string | null;
    legacyImage: boolean; imageIsLegacy: boolean; validation: ReceiptEvidenceValidation;
    evidence: { id: string; createdAt: string }[] }[];
  events: { id: string; action: string; actor: string; reason: string | null; createdAt: string }[] };
const Review = styled.article`
  display: grid; gap: var(--gh-spacing-3_5); padding: var(--gh-spacing-4); min-inline-size: 0; overflow-y: auto; align-content: start;
  h2, h3, p { margin: 0; } form { display: grid; gap: var(--gh-spacing-2_5); min-inline-size: 0; }
  fieldset { min-inline-size: 0; margin: 0; padding: var(--gh-spacing-3); border: 0; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; font-size: var(--gh-font-body); }
  textarea { inline-size: 100%; resize: vertical; } label { overflow-wrap: anywhere; }
`;
const localDate = (value: string) => new Date(Date.parse(value) - new Date(value).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export function CheckoutReview({ payment, nav, onResolved }: { payment: OwnerPayment; nav: ReactNode; onResolved: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [reason, setReason] = useState(""), [notice, setNotice] = useState("");
  const url = `/api/admin/payments/${payment.id}`;
  async function refresh() {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("Review is unavailable.");
    setDetail(await response.json());
  }
  useEffect(() => {
    let alive = true;
    void fetch(url, { cache: "no-store" }).then(async response => { if (!response.ok) throw new Error("Review unavailable."); const result = await response.json(); if (alive) setDetail(result); }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [url]);
  async function act(body: Record<string, unknown>, advance = false) {
    if (busy || !detail) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, revision: detail.revision }) });
      const result = await response.json();
      await refresh();
      if (!response.ok) throw new Error(result.message ?? "Action could not be completed.");
      setNotice("Saved."); if (advance) onResolved();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const pending = detail && (checkoutOpenStatuses as readonly string[]).includes(detail.status);
  const blocked = detail?.claims.some(c => c.receipt.disputed) || detail?.status === "disputed";
  return <Review data-checkout-review>
    {nav}<h2>{payment.reference} · {payment.planName}</h2>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!detail ? <p>Loading receipt records…</p> : <>
      <p>{checkoutLabels[detail.status] ?? detail.status} · Subscriber {payment.accountPhone ?? "erased"}</p>
      <WizardReview>
        <div><dt>Package price</dt><dd>{formatUgx(payment.price)}</dd></div>
        <div><dt>Purchased time</dt><dd>{payment.durationDays ?? 0} days + {detail.referralDays} referral days</dd></div>
        <div><dt>Wallet contribution</dt><dd>{formatUgx(detail.walletUgx)} · {detail.reservationActive ? "reserved" : "not reserved"}</dd></div>
        <div><dt>Verified incoming</dt><dd>{formatUgx(detail.verifiedUgx)}</dd></div>
        <div><dt>Remaining</dt><dd>{formatUgx(detail.remainingUgx)}</dd></div>
        {detail.excessUgx > 0 && <div><dt>Wallet excess on approval</dt><dd>{formatUgx(detail.excessUgx)}</dd></div>}
      </WizardReview>
      {detail.claims.map(claim => <fieldset key={`${claim.id}:${detail.revision}`}><legend>{claim.receipt.provider.toUpperCase()} · {claim.receipt.transactionId}</legend>
        {claim.validation.warnings.length > 0 && <section aria-label="Evidence discrepancies">
          <p><strong>Customer continued with evidence warnings</strong> · Selected {claim.validation.selectedProvider?.toUpperCase()}</p>
          <ul>{claim.validation.warnings.map(warning => <li key={warning.id}>{warning.message}</li>)}</ul>
          <p>Verify the actual transfer on the selected receiving account. If the provider or transaction identity is wrong, request correction; do not credit it under another provider.</p>
          {claim.validation.reviewed ? <p>Admin findings recorded for this evidence.</p> : !claim.withdrawn && pending && <form onSubmit={event => {
            event.preventDefault(); const data = new FormData(event.currentTarget);
            void act({ action: "review-evidence", claimId: claim.id, warningsChecked: data.has("warningsChecked"), reason: data.get("reason") });
          }}><FloatingField label={"Findings and action taken"}><textarea name="reason" required minLength={3} maxLength={500} rows={2} /></FloatingField>
            <label><input name="warningsChecked" type="checkbox" required /> Checked these differences against the original evidence and receiving-account records</label>
            <Button variant="secondary" type="submit" disabled={busy}>Record evidence review</Button></form>}
        </section>}
        <p>{claim.withdrawn ? "Withdrawn evidence · " : ""}Reported {formatUgx(claim.amountUgx)} · payer {claim.payerPhone ?? "unavailable"} · {dateNotExtracted(claim.original) ? "Payment date not read from evidence" : `${formatPeriodEnd(new Date(claim.paidAt))} EAT`}</p>
        {claim.purgedAt ? <p>Private evidence removed under the retention policy. Accounting is retained.</p> : <>
          {claim.legacyImage && <a href={`${url}/screenshot`} target="_blank" rel="noopener">Original screenshot</a>}
          {claim.imageSha256 && !claim.imageIsLegacy && <a href={`${url}/screenshot?claimId=${claim.id}`} target="_blank" rel="noopener">View private screenshot</a>}
          {claim.evidence.map(evidence => <a key={evidence.id} href={`${url}/screenshot?evidenceId=${evidence.id}`} target="_blank" rel="noopener">Additional screenshot · {formatPeriodEnd(new Date(evidence.createdAt))}</a>)}
        </>}
        <details><summary>Original evidence and customer corrections</summary><pre>{JSON.stringify({ original: claim.original, corrections: claim.corrections }, null, 2)}</pre></details>
        {claim.receipt.disputed && <p role="alert">Disputed ownership. Contact the payer using the sender number from the actual receiving account. Upload order and claimed phone numbers do not settle ownership.</p>}
        {claim.receipt.verifiedAt && <p>Verified by {claim.receipt.verifiedBy} · {formatUgx(claim.receipt.amountUgx ?? 0)} · sender {claim.receipt.senderPhone ?? "not available"}</p>}
        {claim.receipt.allocatedSubmissionId && <p>Receipt allocated once. Further allocation is blocked.</p>}
        {(!claim.receipt.allocatedSubmissionId || !claim.receipt.senderPhone) && !claim.withdrawn && <form onSubmit={event => {
          event.preventDefault(); const data = new FormData(event.currentTarget);
          void act({ action: "verify-receipt", receiptId: claim.receipt.id, amountUgx: Number(data.get("amountUgx")), recipient: data.get("recipient"),
            senderPhone: data.get("senderPhone"), receivedAt: new Date(String(data.get("receivedAt"))).toISOString(),
            transactionChecked: data.has("transactionChecked"), recipientChecked: data.has("recipientChecked"), successfulReceipt: data.has("successfulReceipt"), senderChecked: data.has("senderChecked") });
        }}>
          <TextInput name="amountUgx" label="Actual incoming amount (UGX)" required inputMode="numeric" defaultValue={claim.receipt.amountUgx ?? claim.amountUgx} />
          <TextInput name="recipient" label="Receiving number from provider records" required defaultValue={claim.receipt.recipient ?? detail.receivingNumber ?? ""} />
          <TextInput name="senderPhone" label="Sender number from receiving account (if available)" defaultValue={claim.receipt.senderPhone ?? ""} />
          <TextInput name="receivedAt" label="Actual payment date and time (local)" type="datetime-local" required defaultValue={claim.receipt.receivedAt ? localDate(claim.receipt.receivedAt) : dateNotExtracted(claim.original) ? "" : localDate(claim.paidAt)} />
          <label><input type="checkbox" name="transactionChecked" required /> Transaction ID matches the incoming transfer</label>
          <label><input type="checkbox" name="recipientChecked" required /> Correct receiving MTN/Airtel account</label>
          <label><input type="checkbox" name="successfulReceipt" required /> Funds successfully received; amount checked</label>
          <label><input type="checkbox" name="senderChecked" required /> Sender details checked where available</label>
          <Button disabled={busy} type="submit">Record receipt verification</Button>
        </form>}
        {claim.receipt.disputed && <form onSubmit={event => {
          event.preventDefault(); const data = new FormData(event.currentTarget);
          void act({ action: "resolve-dispute", receiptId: claim.receipt.id, intendedSubmissionId: data.get("intendedSubmissionId"), reason: data.get("reason"),
            contactedVerifiedPayer: data.has("contactedVerifiedPayer"), ownershipClear: data.has("ownershipClear") });
        }}>
          <FloatingField label={"Intended subscriber request"}><select name="intendedSubmissionId" required>{claim.receipt.claims.map(c => <option key={c.submissionId} value={c.submissionId}>P{c.submission.reference} · {c.submission.accountId}</option>)}</select></FloatingField>
          <FloatingField label={"Resolution and reasons"}><textarea name="reason" required minLength={3} maxLength={500} rows={2} /></FloatingField>
          <label><input type="checkbox" name="contactedVerifiedPayer" required /> Contacted the sender number verified from receiving-account records</label>
          <label><input type="checkbox" name="ownershipClear" required /> Payer confirmed the intended subscriber; shared-phone ownership is clear</label>
          <p>If the payer cannot be verified or ownership remains unclear, leave funds unallocated and escalate through official provider support.</p>
          <Button variant="secondary" disabled={busy} type="submit">Record ownership resolution</Button>
        </form>}
      </fieldset>)}
      {pending && <>
        <Button disabled={busy || blocked || detail.claims.some(c => !c.withdrawn && !c.validation.reviewed) || detail.remainingUgx > 0 || !detail.reservationActive} onClick={() => void act({ action: "approve-checkout" }, true)}>Approve and next</Button>
        <FloatingField label={"Reason / correction"}><textarea value={reason} maxLength={500} rows={2} onChange={event => setReason(event.target.value)} /></FloatingField>
        <CheckoutActions>
          <Button variant="secondary" disabled={busy || reason.trim().length < 3} onClick={() => void act({ action: "request-correction", reason })}>Request correction</Button>
          <Button variant="secondary" disabled={busy || reason.trim().length < 3} onClick={() => void act({ action: "mark-disputed", reason })}>Mark disputed</Button>
          <Button variant="quiet" disabled={busy || reason.trim().length < 3} onClick={() => void act({ action: "reject-checkout", reason }, true)}>Reject with reason</Button>
        </CheckoutActions>
      </>}
      <details><summary>Audit history</summary><ul>{detail.events.map(e => <li key={e.id}>{formatPeriodEnd(new Date(e.createdAt))} EAT · {e.actor} · {e.action}{e.reason ? ` · ${e.reason}` : ""}</li>)}</ul></details>
    </>}
  </Review>;
}
