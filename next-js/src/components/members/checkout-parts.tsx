"use client";
import styled from "styled-components";
import { textFieldSurface } from "@/components/ui/filled-surfaces";
import type { CheckoutQuote } from "@/domain/checkout";
import { fundingAmounts } from "@/domain/checkout";
import { formatUgx } from "@/domain/subscription-plans";
import { supportContactsOf, type SupportContactSettings } from "@/domain/support-contacts";
import { telHref, waHref } from "@/domain/phone";
import { WizardReview } from "./payment-wizard";
import { Button, TextInput, focusTreatment } from "@/components/ui/controls";
import { CriteriaDialog, type CriteriaDialogProps } from "@/components/ui/criteria-dialog";

export function CheckoutDialog(props: CriteriaDialogProps) {
  return <CriteriaDialog {...props} dismissOnBackdrop={false} dismissOnEscape={false} />;
}

export const CheckoutPanel = styled.section`
  display: grid; gap: var(--gh-spacing-3); inline-size: 100%; max-inline-size: var(--gh-size-160); min-inline-size: 0;
  margin-inline: auto; padding: var(--gh-spacing-4); border: 0;
  background: ${({ theme }) => theme.color.surface}; border-radius: ${({ theme }) => theme.radius.none};
  h2, h3, p { margin: 0; } form, fieldset { min-inline-size: 0; }
  form { display: grid; gap: var(--gh-spacing-3); } fieldset { margin: 0; padding: var(--gh-spacing-2_5); border: 0; }
  label { overflow-wrap: anywhere; } input, textarea, select { max-inline-size: 100%; }
  textarea { inline-size: 100%; resize: vertical; }
`;
export const CheckoutChoices = styled.fieldset`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gh-spacing-2); min-inline-size: 0; margin: 0; padding: 0; border: 0;
  > label, > a { position: relative; display: flex; align-items: center; justify-content: start; gap: var(--gh-spacing-1_5); padding: var(--gh-spacing-2); min-block-size: var(--form-control-height); min-inline-size: 0;
    border: 0; cursor: pointer; }
  > a { text-align: start; font-weight: inherit; border-radius: ${({ theme }) => theme.radius.none}; }
  > label:has(input:checked) {  background: ${({ theme }) => theme.color.brandSoft}; }
  > label:has(input:focus-visible) { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; outline-offset: var(--gh-size-0_5); }
  > label:has(input:disabled) { opacity: var(--gh-opacity-55); cursor: not-allowed; }
  > :last-child:nth-child(2) { grid-column: 1 / -1; }
  input { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; margin: 0; opacity: 0; cursor: inherit; }
  [data-method-text] { flex: 1; min-inline-size: 0; font-size: var(--gh-font-body); line-height: var(--gh-size-4_5); }
  small { display: block; color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); }
  > label > svg, > a > svg { flex: none; inline-size: var(--gh-size-5_5); block-size: var(--gh-size-5_5); color: ${({ theme }) => theme.color.brand}; }
`;
export const CheckoutProviderMark = styled.span`
  display: inline-flex; align-items: center; justify-content: center; flex: none;
  inline-size: var(--gh-size-7_5); block-size: var(--gh-size-6);
  [data-payment-logo] { inline-size: var(--gh-size-7_5); block-size: var(--gh-size-6); }
`;
export const CheckoutFundingFields = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gh-spacing-2); min-inline-size: 0;
  > * { min-inline-size: 0; }
  > :only-child { grid-column: 1 / -1; }
  label { font-size: var(--gh-font-body); line-height: var(--gh-size-4_5); }
  input { padding-inline-end: var(--gh-spacing-14); }
`;
const MaxButton = styled(Button)`
  && { min-inline-size: var(--gh-size-10); padding: 0 var(--gh-spacing-2); font-size: var(--gh-font-secondary); line-height: var(--gh-size-4_5); border-radius: ${({ theme }) => theme.radius.none}; }
`;
export function CheckoutFundingInput({ label, value, maximum, maxLabel, disabled = false, onValueChange }: {
  label: string; value: string; maximum: number; maxLabel: string; disabled?: boolean; onValueChange: (value: string) => void;
}) {
  return <TextInput label={label} type="number" inputMode="numeric" min={0} max={maximum} step={1} value={value} disabled={disabled}
    onChange={event => onValueChange(event.target.value)} trailing={<MaxButton type="button" variant="quiet" aria-label={maxLabel}
      disabled={disabled || maximum === 0 || value !== "" && Number(value) === maximum} onClick={() => onValueChange(String(maximum))}>Max</MaxButton>} />;
}
export const CheckoutPayee = styled.div`
  display: grid; gap: var(--gh-spacing-0_5); padding-block-start: var(--gh-spacing-2); margin-block-start: var(--gh-spacing-1_5);
  border-block-start: 0;
  > div { display: flex; align-items: center; gap: var(--gh-spacing-2); min-inline-size: 0; }
  strong { font-size: var(--gh-font-heading); line-height: var(--gh-size-7); font-variant-numeric: tabular-nums; }
  small { color: ${({ theme }) => theme.color.mutedText}; overflow-wrap: anywhere; font-size: var(--gh-font-body); line-height: var(--gh-size-4_5); }
  button { flex: none; min-inline-size: var(--gh-size-9); min-block-size: var(--form-control-height); padding: var(--gh-spacing-1_5); }
  button svg { inline-size: var(--gh-size-4_5); block-size: var(--gh-size-4_5); }
`;
export const CheckoutActions = styled.div`
  display: flex; flex-wrap: wrap; gap: var(--gh-spacing-2); min-inline-size: 0;
  > button, > a { min-block-size: var(--form-control-height); }
`;
export const CheckoutEvidenceField = styled.div`
  display: grid; gap: var(--gh-spacing-1_5); min-inline-size: 0; inline-size: 100%;
  > header { display: flex; align-items: center; justify-content: space-between; gap: var(--gh-spacing-2); }
  > header label { font-size: var(--gh-font-emphasis); font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  > header button { min-block-size: var(--form-control-height); padding: var(--gh-spacing-1) var(--gh-spacing-2); font-size: var(--gh-font-body); }
  > header button svg { inline-size: var(--gh-size-4); block-size: var(--gh-size-4); }
`;
export const CheckoutMessage = styled.textarea`
  display: block; box-sizing: border-box; inline-size: 100%; min-inline-size: 0; min-block-size: var(--gh-size-22);
  padding: var(--gh-spacing-2_5); resize: vertical; font: inherit; font-size: var(--gh-font-reading); line-height: var(--gh-size-5_25);
  border: 0; border-radius: ${({ theme }) => theme.radius.control};
  color: ${({ theme }) => theme.color.text}; ${textFieldSurface}
  ${focusTreatment}
`;
export const CheckoutScreenshot = styled.div`
  display: grid; gap: var(--gh-spacing-2); min-inline-size: 0; padding: var(--gh-spacing-2_5);
  border: 0; border-radius: ${({ theme }) => theme.radius.control};
  background: ${({ theme }) => theme.color.surfaceMuted};
  > div { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gh-spacing-2); }
  button { min-block-size: var(--form-control-height); padding: var(--gh-spacing-1_5) var(--gh-spacing-2_5); font-size: var(--gh-font-body); }
  svg { inline-size: var(--gh-size-4_5); block-size: var(--gh-size-4_5); }
  p { margin: 0; color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-body); line-height: var(--gh-size-4_5); }
  [data-screenshot-preview] { display: flex; flex-wrap: nowrap; justify-content: space-between; }
  [data-screenshot-preview] > button:last-child { flex: none; min-block-size: var(--form-control-height); padding: var(--gh-spacing-1) var(--gh-spacing-2); }
  ${focusTreatment}
`;
const PayLine = styled.div`
  min-inline-size: 0; font-size: var(--gh-font-emphasis); line-height: var(--gh-size-5);
  p { margin: 0; }
  small { display: block; color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); line-height: var(--gh-size-4_5); }
  strong { font-variant-numeric: tabular-nums; }
`;
export type CheckoutPayPreview = Pick<CheckoutQuote, "purpose" | "method" | "walletUgx" | "referralDays" | "priceUgx" | "durationDays" | "amountToSend" | "recipient" | "recipientName">;
export function CheckoutPaySummary({ quote: q }: { quote: CheckoutPayPreview }) {
  const days = `${q.durationDays} ${q.durationDays === 1 ? "day" : "days"}`;
  return <PayLine data-pay-summary>
    <p>{q.purpose === "referral" ? <>Redeem <strong>{q.referralDays} referral {q.referralDays === 1 ? "day" : "days"}</strong> · UGX 0 due</>
      : <>{q.purpose === "topup" ? "Top up" : q.method === "wallet" ? "Use wallet" : "Pay"}{" "}<strong>{formatUgx(q.method === "wallet" ? q.walletUgx : q.amountToSend)}</strong>
        {q.durationDays > 0 && <> · {days}</>}{q.referralDays > 0 && <> + {q.referralDays} referral {q.referralDays === 1 ? "day" : "days"}</>}</>}
    </p>
    {q.walletUgx > 0 && q.amountToSend > 0 && <small>Package {formatUgx(q.priceUgx)} · wallet {formatUgx(q.walletUgx)}</small>}
  </PayLine>;
}
export function FundingBreakdown({ quote: q, reportedUgx }: { quote: Pick<CheckoutQuote, "purpose" | "planName" | "priceUgx" | "durationDays" | "referralDays" | "walletUgx" | "amountToSend">; reportedUgx?: number }) {
  const amounts = fundingAmounts(q.priceUgx, q.walletUgx, reportedUgx ?? 0);
  return <div data-funding-breakdown>
    <WizardReview>
      {q.purpose === "referral" ? <div><dt>Referral days</dt><dd>{q.referralDays} {q.referralDays === 1 ? "day" : "days"}</dd></div> : <>
        <div><dt>{q.purpose === "topup" ? "Wallet top-up" : "Package price"}</dt><dd>{q.planName} · {formatUgx(q.priceUgx)}</dd></div>
        {q.walletUgx > 0 && <div><dt>Wallet contribution</dt><dd>{formatUgx(q.walletUgx)}</dd></div>}
        {q.durationDays > 0 && <div><dt>Access time</dt><dd>{q.durationDays} purchased {q.durationDays === 1 ? "day" : "days"}{q.referralDays > 0 ? ` + ${q.referralDays} referral ${q.referralDays === 1 ? "day" : "days"}` : ""}</dd></div>}
      </>}
      <div><dt>{q.amountToSend > 0 ? "Amount to send" : "Cash due"}</dt><dd><strong>{formatUgx(q.amountToSend)}</strong></dd></div>
      {reportedUgx !== undefined && <div><dt>Amount paid</dt><dd>{formatUgx(reportedUgx)}</dd></div>}
      {reportedUgx !== undefined && amounts.remainingUgx > 0 && <div><dt>Remaining if confirmed</dt><dd>{formatUgx(amounts.remainingUgx)}</dd></div>}
    </WizardReview>
  </div>;
}
export function CheckoutSupport({ settings, reference }: { settings: SupportContactSettings; reference: string }) {
  const contacts = supportContactsOf(settings), call = contacts.find(c => c.calls), whatsapp = contacts.find(c => c.whatsapp);
  const text = `Please help with payment request ${reference}.`;
  return <CheckoutActions data-checkout-support>
    {whatsapp && <a href={waHref(whatsapp.phone, text)}>WhatsApp admin</a>}
    {call && <><a href={telHref(call.phone)}>Call admin</a><a href={`sms:+${call.phone}?body=${encodeURIComponent(text)}`}>SMS admin</a></>}
  </CheckoutActions>;
}
