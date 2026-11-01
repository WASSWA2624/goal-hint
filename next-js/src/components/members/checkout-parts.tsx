"use client";
import styled from "styled-components";
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
  display: grid; gap: 12px; inline-size: 100%; max-inline-size: 40rem; min-inline-size: 0;
  margin-inline: auto; padding: 16px; border: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.surface}; border-radius: ${({ theme }) => theme.radius.none};
  h2, h3, p { margin: 0; } form, fieldset { min-inline-size: 0; }
  form { display: grid; gap: 12px; } fieldset { margin: 0; padding: 10px; border: 1px solid ${({ theme }) => theme.color.border}; }
  label { overflow-wrap: anywhere; } input, textarea, select { max-inline-size: 100%; }
  textarea { inline-size: 100%; resize: vertical; }
`;
export const CheckoutChoices = styled.fieldset`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; min-inline-size: 0; margin: 0; padding: 0; border: 0;
  > label, > a { position: relative; display: flex; align-items: center; justify-content: start; gap: 6px; padding: 8px; min-block-size: 44px; min-inline-size: 0;
    border: 1px solid ${({ theme }) => theme.color.border}; cursor: pointer; }
  > a { text-align: start; font-weight: inherit; border-radius: ${({ theme }) => theme.radius.none}; }
  > label:has(input:checked) { border-color: ${({ theme }) => theme.color.brand}; background: ${({ theme }) => theme.color.brandSoft}; }
  > label:has(input:focus-visible) { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
  > label:has(input:disabled) { opacity: 0.55; cursor: not-allowed; }
  > :last-child:nth-child(2) { grid-column: 1 / -1; }
  input { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; margin: 0; opacity: 0; cursor: inherit; }
  [data-method-text] { flex: 1; min-inline-size: 0; font-size: 13px; line-height: 18px; }
  small { display: block; color: ${({ theme }) => theme.color.mutedText}; font-size: 12px; }
  > label > svg, > a > svg { flex: none; inline-size: 22px; block-size: 22px; color: ${({ theme }) => theme.color.brand}; }
`;
export const CheckoutProviderMark = styled.span`
  display: inline-flex; align-items: center; justify-content: center; flex: none;
  inline-size: 30px; block-size: 24px;
  [data-payment-logo] { inline-size: 30px; block-size: 24px; }
`;
export const CheckoutFundingFields = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; min-inline-size: 0;
  > * { min-inline-size: 0; }
  > :only-child { grid-column: 1 / -1; }
  label { font-size: 13px; line-height: 18px; }
  input { padding-inline-end: 56px; }
`;
const MaxButton = styled(Button)`
  && { min-inline-size: 40px; padding: 0 8px; font-size: 12px; line-height: 18px; border-radius: ${({ theme }) => theme.radius.none}; }
`;
export function CheckoutFundingInput({ label, value, maximum, maxLabel, disabled = false, onValueChange }: {
  label: string; value: string; maximum: number; maxLabel: string; disabled?: boolean; onValueChange: (value: string) => void;
}) {
  return <TextInput label={label} type="number" inputMode="numeric" min={0} max={maximum} step={1} value={value} disabled={disabled}
    onChange={event => onValueChange(event.target.value)} trailing={<MaxButton type="button" variant="quiet" aria-label={maxLabel}
      disabled={disabled || maximum === 0 || value !== "" && Number(value) === maximum} onClick={() => onValueChange(String(maximum))}>Max</MaxButton>} />;
}
export const CheckoutPayee = styled.div`
  display: grid; gap: 2px; padding-block-start: 8px; margin-block-start: 6px;
  border-block-start: 1px solid ${({ theme }) => theme.color.border};
  > div { display: flex; align-items: center; gap: 8px; min-inline-size: 0; }
  strong { font-size: 20px; line-height: 28px; font-variant-numeric: tabular-nums; }
  small { color: ${({ theme }) => theme.color.mutedText}; overflow-wrap: anywhere; font-size: 13px; line-height: 18px; }
  button { flex: none; min-inline-size: 36px; min-block-size: 36px; padding: 6px; }
  button svg { inline-size: 18px; block-size: 18px; }
`;
export const CheckoutActions = styled.div`
  display: flex; flex-wrap: wrap; gap: 8px; min-inline-size: 0;
  > button, > a { min-block-size: 44px; }
`;
export const CheckoutEvidenceField = styled.div`
  display: grid; gap: 6px; min-inline-size: 0; inline-size: 100%;
  > header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  > header label { font-size: 14px; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  > header button { min-block-size: 36px; padding: 4px 8px; font-size: 13px; }
  > header button svg { inline-size: 16px; block-size: 16px; }
`;
export const CheckoutMessage = styled.textarea`
  display: block; box-sizing: border-box; inline-size: 100%; min-inline-size: 0; min-block-size: 88px;
  padding: 10px; resize: vertical; font: inherit; font-size: 15px; line-height: 21px;
  border: 1px solid ${({ theme }) => theme.color.controlBorder}; border-radius: ${({ theme }) => theme.radius.control};
  color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surface};
  ${focusTreatment}
`;
export const CheckoutScreenshot = styled.div`
  display: grid; gap: 8px; min-inline-size: 0; padding: 10px;
  border: 1px dashed ${({ theme }) => theme.color.controlBorder}; border-radius: ${({ theme }) => theme.radius.control};
  background: ${({ theme }) => theme.color.surface};
  > div { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  button { min-block-size: 38px; padding: 6px 10px; font-size: 13px; }
  svg { inline-size: 18px; block-size: 18px; }
  p { margin: 0; color: ${({ theme }) => theme.color.mutedText}; font-size: 13px; line-height: 18px; }
  [data-screenshot-preview] { display: flex; flex-wrap: nowrap; justify-content: space-between; }
  [data-screenshot-preview] > button:last-child { flex: none; min-block-size: 36px; padding: 4px 8px; }
  ${focusTreatment}
`;
const PayLine = styled.div`
  min-inline-size: 0; font-size: 14px; line-height: 20px;
  p { margin: 0; }
  small { display: block; color: ${({ theme }) => theme.color.mutedText}; font-size: 12px; line-height: 18px; }
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
      {reportedUgx !== undefined && <div><dt>Reported payment</dt><dd>{formatUgx(reportedUgx)}</dd></div>}
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
