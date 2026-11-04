import styled from "styled-components";
import { checkoutLabels } from "@/domain/checkout";
import type { OwnerPayment } from "@/domain/owner-members";
import { formatInternationalPhone } from "@/domain/phone-countries";
import { CopyTextButton } from "./copy-text-button";
import { PaymentBadge } from "./payment-styles";

const Summary = styled.div`
  display: grid; gap: var(--gh-spacing-1); inline-size: 100%; min-inline-size: 0;
  h2 { margin: 0; overflow-wrap: anywhere; font-size: var(--gh-font-section); font-weight: var(--gh-weight-medium); }
  strong { font-weight: var(--gh-weight-medium); }
`;
const Identity = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; gap: 0 var(--gh-spacing-2);
  min-inline-size: 0;
  > span { overflow-wrap: anywhere; }
`;
const CopyValue = styled.div`
  display: flex; align-items: center; min-inline-size: 0;
`;
export const PaymentFacts = styled.dl`
  display: flex; flex-wrap: wrap; align-items: baseline;
  gap: var(--gh-spacing-1) var(--gh-spacing-4); margin: 0; min-inline-size: 0;
  > div {
    display: flex; flex-wrap: wrap; align-items: baseline; min-inline-size: 0;
    column-gap: var(--gh-spacing-1_5);
  }
  dt { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); }
  dd { margin: 0; overflow-wrap: anywhere; font-weight: var(--gh-weight-medium); }
`;
const date = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kampala", year: "numeric", month: "short", day: "numeric" });
const submittedDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Kampala", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const dateLabel = (value: string) => date.format(new Date(value));

export function PaymentAccountSummary({ payment, status, busy = false }: {
  payment: OwnerPayment; status: string; busy?: boolean;
}) {
  const purchased = status === "approved" && payment.decidedAt && payment.decidedAt !== payment.submittedAt ? dateLabel(payment.decidedAt) : undefined;
  const subscriber = payment.accountPhone ? formatInternationalPhone(payment.accountPhone) : "";
  return <Summary data-payment-account-summary>
    <Identity>
      <CopyValue><h2>{payment.reference}</h2><CopyTextButton value={payment.reference} subject="payment reference" compact disabled={busy} /></CopyValue>
      <CopyValue><strong>{subscriber || "Erased account"}</strong>
        {subscriber && <CopyTextButton value={subscriber} subject="subscriber number" compact disabled={busy} />}</CopyValue>
      <PaymentBadge $status={status}>{status === "pending" ? "Awaiting admin approval" : status === "remaining" ? "Part-paid"
        : checkoutLabels[status] ?? status.charAt(0).toUpperCase() + status.slice(1)}</PaymentBadge>
    </Identity>
    <PaymentFacts aria-label="Account and purchase">
      <div><dt>Package</dt><dd>{payment.purpose === "topup" ? "Credit top-up" : payment.planName}</dd></div>
      <div><dt>Submitted</dt><dd>{submittedDate.format(new Date(payment.submittedAt))} EAT</dd></div>
      {purchased && <div><dt>Purchased</dt><dd>{purchased}</dd></div>}
      {payment.accessPeriod && <div><dt>Access period</dt><dd>{dateLabel(payment.accessPeriod.startsAt)} to {dateLabel(payment.accessPeriod.endsAt)}</dd></div>}
    </PaymentFacts>
  </Summary>;
}
