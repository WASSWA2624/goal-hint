"use client";
import styled from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { media } from "@/styles/theme";
import { formatUgx } from "@/domain/subscription-plans";
import { formatPeriodEnd } from "@/domain/subscription-period";
import type { OwnerOverview, OwnerPaymentSummary } from "@/domain/owner-members";
export function OverviewReport({ value: v, payments }: { value: OwnerOverview; payments: readonly OwnerPaymentSummary[] | null }) {
  const metrics = [
    ["Pending payments", v.pending], ["Active paid subscribers", v.active],
    ["Revenue · EAT week", formatUgx(v.weekRevenue)], ["Revenue · EAT month", formatUgx(v.monthRevenue)],
    ["Trials · this week", v.trials], ["Upload alerts · this week", v.busy],
  ] as const;
  return <>
    <Ledger aria-label="Admin overview">{metrics.map(([label, value]) => <Metric key={label}><dt>{label}</dt><dd>{value}</dd></Metric>)}</Ledger>
    <section aria-labelledby="payment-queue-title">
      <QueueHeading><h2 id="payment-queue-title">Payment queue</h2><Link href="/admin/payments" prefetch={false}>View all →</Link></QueueHeading>
      {payments === null ? <QueueMessage role="status">Payment queue is unavailable. Try again later.</QueueMessage>
        : payments.length === 0 ? <QueueMessage>No payments awaiting review.</QueueMessage>
        : <Queue>{payments.map(payment => <QueueRow key={payment.id}>
          <div><strong>{payment.reference}</strong><small>{payment.network.toUpperCase()} · {formatPeriodEnd(new Date(payment.submittedAt))}</small></div>
          <Amount>{formatUgx(payment.amount)}</Amount>
          <Review href={`/admin/payments#${encodeURIComponent(payment.id)}`} prefetch={false}>Review</Review>
        </QueueRow>)}</Queue>}
    </section>
    <OverviewNote>
      <p>Payment numbers updated {v.paymentNumbersChangedAt ? formatPeriodEnd(new Date(v.paymentNumbersChangedAt)) : "—"}</p>
      <details><summary>How totals are calculated</summary><p>Revenue includes received approved payments and manual amounts; reversed payments are excluded. Trials do not count as paid subscribers.</p></details>
    </OverviewNote>
  </>;
}

const Ledger = styled.dl`
  display: grid;
  gap: 0;
  margin: 0;
  ${media.tablet} { grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 24px; }
`;
const Metric = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-inline-size: 0;
  padding-block: 12px;
  border-block-end: 1px solid ${({ theme }) => theme.color.border};
  dt { font-size: 0.8125rem; color: ${({ theme }) => theme.color.mutedText}; }
  dd { margin: 0; font-size: 1.125rem; font-weight: 500; white-space: nowrap; font-variant-numeric: tabular-nums; }
`;
const QueueHeading = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-block-end: 8px;
  border-block-end: 1px solid ${({ theme }) => theme.color.border};
  h2, a { font-size: 0.8125rem; }
  a { color: ${({ theme }) => theme.color.link}; text-decoration: none; padding-block: 8px; }
`;
const Queue = styled.ul`list-style: none; padding: 0; margin: 0;`;
const QueueRow = styled.li`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  padding-block: 10px;
  border-block-end: 1px solid ${({ theme }) => theme.color.border};
  strong { font-size: 0.8125rem; font-weight: 500; overflow-wrap: anywhere; }
  small { display: block; font-size: 0.75rem; color: ${({ theme }) => theme.color.mutedText}; }
  @media (max-width: 359px) { grid-template-columns: minmax(0, 1fr) auto; > div { grid-column: 1 / -1; } }
`;
const Amount = styled.span`font-size: 0.8125rem; white-space: nowrap; font-variant-numeric: tabular-nums;`;
const Review = styled(Link)`
  display: inline-flex;
  align-items: center;
  min-block-size: 44px;
  padding: 6px 10px;
  color: ${({ theme }) => theme.color.link};
  font-size: 0.8125rem;
  text-decoration: none;
  &:hover { background: ${({ theme }) => theme.color.surfaceMuted}; }
`;
const QueueMessage = styled.p`padding-block: 12px; font-size: 0.8125rem; color: ${({ theme }) => theme.color.mutedText};`;
const OverviewNote = styled.div`
  padding-block-start: 12px;
  border-block-start: 1px solid ${({ theme }) => theme.color.border};
  font-size: 0.75rem;
  color: ${({ theme }) => theme.color.mutedText};
  p { margin: 0; }
  summary { color: ${({ theme }) => theme.color.link}; cursor: pointer; padding-block: 10px; }
`;
