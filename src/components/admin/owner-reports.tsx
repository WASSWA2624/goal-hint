"use client";
import styled from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { media } from "@/styles/theme";
import { formatUgx } from "@/domain/subscription-plans";
import { formatPeriodEnd } from "@/domain/subscription-period";
import type { OwnerOverview, OwnerPaymentSummary } from "@/domain/owner-members";
import { ChevronDownIcon, ChevronRightIcon } from "@/components/ui/icons";
import { DeskGrid, Panel, PanelHead, RowList, StatGrid } from "./desk-styles";
import { NetworkChip } from "./network-chip";

/** Metrics on the main side, the two oldest payment reports beside them; on phones the queue sits between the two. */
export function OverviewReport({ value: v, payments }: { value: OwnerOverview; payments: readonly OwnerPaymentSummary[] | null }) {
  const metrics = [
    ["Pending payments", v.pending], ["Active paid subscribers", v.active],
    ["Revenue · EAT week", formatUgx(v.weekRevenue)], ["Revenue · EAT month", formatUgx(v.monthRevenue)],
    ["Trials · this week", v.trials], ["Upload alerts · this week", v.busy],
    // Credit members hold is owed in plans, not cash: it is already in revenue from the payments that added it.
    ["Credit held by members", formatUgx(v.creditHeld)], ...(v.creditOwed > 0 ? [["Credit owed after reversals", formatUgx(v.creditOwed)] as const] : []),
  ] as const;
  return <Overview>
    <Metrics><StatGrid aria-label="Admin overview">{metrics.map(([label, value]) =>
      <Tile key={label} $pending={label === "Pending payments" && v.pending > 0}><dt>{label}</dt><dd>{value}</dd></Tile>)}</StatGrid></Metrics>
    <Panel aria-labelledby="payment-queue-title">
      <PanelHead><h2 id="payment-queue-title">Payment queue</h2><ViewAll href="/admin/payments" prefetch={false}>View all<ChevronRightIcon /></ViewAll></PanelHead>
      {payments === null ? <QueueMessage role="status">Payment queue is unavailable. Try again later.</QueueMessage>
        : payments.length === 0 ? <QueueMessage>No payments awaiting review.</QueueMessage>
        : <RowList>{payments.map(payment => <QueueRow key={payment.id}>
          <span><strong>{payment.reference}<NetworkChip network={payment.network} labelled /></strong><small>{formatPeriodEnd(new Date(payment.submittedAt))}</small></span>
          <Amount>{formatUgx(payment.amount)}</Amount>
          <Review href={`/admin/payments#${encodeURIComponent(payment.id)}`} prefetch={false} aria-label={`Review ${payment.reference}`}>Review</Review>
        </QueueRow>)}</RowList>}
    </Panel>
    <Footnote><div>
      <p>Payment numbers updated {v.paymentNumbersChangedAt ? formatPeriodEnd(new Date(v.paymentNumbersChangedAt)) : "—"}</p>
      <Totals><summary>How totals are calculated<ChevronDownIcon /></summary>
        <p>Revenue includes received approved payments and manual amounts; reversed payments are excluded. Trials do not count as paid subscribers.</p></Totals>
    </div></Footnote>
  </Overview>;
}

// DOM order is metrics, queue, footnote (the phone order); from desktop the queue takes the side column beside both.
const Overview = styled(DeskGrid)`
  ${media.desktop} {
    row-gap: 12px;
    > :nth-child(2) { grid-column: 2; grid-row: 1 / span 2; }
    > :nth-child(3) { grid-column: 1; grid-row: 2; }
  }
`;
const Metrics = styled.div`
  overflow: hidden;
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: 6px;
  > dl > div { min-block-size: 64px; }
  /* An odd count would leave a bare hairline cell; the last tile takes the full row instead. */
  > dl > div:last-child:nth-child(odd) { grid-column: 1 / -1; }
  ${media.desktop} { > dl > div { min-block-size: 72px; padding: 12px 16px; } }
`;
const Tile = styled.div<{ $pending: boolean }>`
  dd { color: ${({ theme, $pending }) => $pending ? theme.color.outcome.pending.text : theme.color.text}; }
`;
const ViewAll = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-block-size: ${({ theme }) => theme.control.minHeight};
  margin-inline-end: -6px;
  padding-inline: 6px;
  color: ${({ theme }) => theme.color.link};
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  text-decoration: none;
  > svg { flex: none; font-size: 1rem; }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: -2px; }
  ${media.hover} { &:hover { text-decoration: underline; } }
  ${media.desktop} { min-block-size: 36px; }
`;
const QueueRow = styled.li`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  min-block-size: 60px;
  padding: 8px 14px;
  > span:first-child { display: grid; gap: 2px; min-inline-size: 0; }
  strong { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; font-weight: ${({ theme }) => theme.typography.weight.heavy}; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  small { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary}; }
  @media (max-width: 359px) { grid-template-columns: minmax(0, 1fr) auto; > span:first-child { grid-column: 1 / -1; } }
  ${media.desktop} { padding-inline: 16px 10px; }
`;
const Amount = styled.span`
  font-weight: ${({ theme }) => theme.typography.weight.heavy};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
`;
/** An outlined 44px button on phones; a quiet text link beside the amount from desktop up. */
const Review = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-block-size: ${({ theme }) => theme.control.minHeight};
  padding-inline: 14px;
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
  border-radius: ${({ theme }) => theme.border.radius};
  color: ${({ theme }) => theme.color.link};
  background: ${({ theme }) => theme.color.surface};
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  text-decoration: none;
  white-space: nowrap;
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
  ${media.hover} { &:hover { text-decoration: underline; } }
  ${media.desktop} { min-block-size: 36px; padding-inline: 6px; border-color: transparent; background: transparent; }
`;
const QueueMessage = styled.p`
  padding: 14px;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  ${media.desktop} { padding-inline: 16px; }
`;
// One row only where the metrics column is wide; beside the side panel at 1024px it stacks as on phones.
const Footnote = styled.div`
  container-type: inline-size;
  min-inline-size: 0;
  > div { display: grid; min-inline-size: 0; }
  > div > p { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary}; }
  @container (min-width: 34rem) {
    > div { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 0 16px; }
    > div > p { padding-block: 9px; }
  }
`;
/** A plain drawer: full width with the chevron at the end when stacked; at the end of the footnote row when there is one. */
const Totals = styled.details`
  min-inline-size: 0;
  > summary {
    display: flex;
    align-items: center;
    gap: 8px;
    min-block-size: ${({ theme }) => theme.control.minHeight};
    color: ${({ theme }) => theme.color.link};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    list-style: none;
    cursor: pointer;
    &::-webkit-details-marker { display: none; }
    > svg { flex: none; margin-inline-start: auto; color: ${({ theme }) => theme.color.mutedText}; font-size: 1rem; transition: transform 0.15s ease; }
    &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
  }
  &[open] > summary > svg { transform: rotate(180deg); }
  > p { max-inline-size: 34rem; padding-block-end: 4px; color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary}; }
  @media (prefers-reduced-motion: reduce) { > summary > svg { transition: none; } }
  ${media.desktop} { > summary { min-block-size: 36px; } }
  @container (min-width: 34rem) {
    flex: 1 1 16rem;
    > summary { justify-content: flex-end; > svg { margin-inline-start: 0; } }
    > p { margin-inline-start: auto; }
  }
`;
