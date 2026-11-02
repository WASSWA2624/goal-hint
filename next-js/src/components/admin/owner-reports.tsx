"use client";
import styled from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { media } from "@/styles/theme";
import { formatUgx } from "@/domain/subscription-plans";
import { formatPeriodEnd } from "@/domain/subscription-period";
import type { OwnerNotice, OwnerOverview, OwnerPaymentSummary } from "@/domain/owner-members";
import { ChevronDownIcon, ChevronRightIcon } from "@/components/ui/icons";
import { useDesktopLayout } from "@/components/ui/use-desktop-layout";
import { DeskGrid, Panel, PanelHead, RowList, StatGrid } from "./desk-styles";
import { NetworkChip } from "./network-chip";
import { PaymentNotices } from "./payment-notices";

/** Metrics on the main side, the two oldest payment reports beside them; on phones the queue sits between the two. */
export function OverviewReport({ value: v, payments, notices = null, now = 0 }: { value: OwnerOverview; payments: readonly OwnerPaymentSummary[] | null;
  notices?: readonly OwnerNotice[] | null; now?: number }) {
  const desktop = useDesktopLayout();
  const attention = (desktop ? notices : notices?.filter(notice => notice.channel !== "whatsapp"))?.length ?? 0;
  const noticeLabel = desktop ? "Message notices to check" : "SMS notices to check";
  const metrics = [
    ["Pending payments", v.pending], ["Active paid subscribers", v.active],
    ["Revenue · EAT week", formatUgx(v.weekRevenue)], ["Revenue · EAT month", formatUgx(v.monthRevenue)],
    ["Trials · this week", v.trials], ["Upload alerts · this week", v.busy],
    // Credit members hold is owed in plans, not cash: it is already in revenue from the payments that added it.
    ["Credit held by members", formatUgx(v.creditHeld)], ...(v.creditOwed > 0 ? [["Credit owed after reversals", formatUgx(v.creditOwed)] as const] : []),
    ...(attention ? [[noticeLabel, attention] as const] : []),
  ] as const;
  return <Overview $notices={attention > 0}>
    <Metrics><StatGrid aria-label="Admin overview">{metrics.map(([label, value]) =>
      <Tile key={label} $pending={label === "Pending payments" ? v.pending > 0 : label === noticeLabel}><dt>{label}</dt><dd>{value}</dd></Tile>)}</StatGrid></Metrics>
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
    {notices && attention > 0 && <PaymentNotices notices={notices} now={now} />}
    <Footnote><div>
      <p>Payment numbers updated {v.paymentNumbersChangedAt ? formatPeriodEnd(new Date(v.paymentNumbersChangedAt)) : "—"}</p>
      <Totals><summary>How totals are calculated<ChevronDownIcon /></summary>
        <p>Revenue includes received approved payments and manual amounts; reversed payments are excluded. Trials do not count as paid subscribers.</p></Totals>
    </div></Footnote>
  </Overview>;
}

// DOM order is metrics, queue, SMS notices (when any), footnote (the phone order); from desktop the queue takes the side
// column beside the rest.
const Overview = styled(DeskGrid)<{ $notices: boolean }>`
  ${media.desktop} {
    row-gap: var(--gh-spacing-3);
    > :nth-child(2) { grid-column: 2; grid-row: 1 / span ${({ $notices }) => $notices ? 3 : 2}; }
    > :nth-child(3) { grid-column: 1; grid-row: 2; }
    > :nth-child(4) { grid-column: 1; grid-row: 3; }
  }
`;
const Metrics = styled.div`
  overflow: hidden;
  border: 0;
  border-radius: ${({ theme }) => theme.radius.surface};
  > dl > div { min-block-size: var(--gh-size-16); }
  /* An odd count would leave a bare hairline cell; the last tile takes the full row instead. */
  > dl > div:last-child:nth-child(odd) { grid-column: 1 / -1; }
  ${media.desktop} { > dl > div { min-block-size: var(--gh-size-18); padding: var(--gh-spacing-3) var(--gh-spacing-4); } }
`;
const Tile = styled.div<{ $pending: boolean }>`
  dd { color: ${({ theme, $pending }) => $pending ? theme.color.outcome.pending.text : theme.color.text}; }
`;
const ViewAll = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: var(--gh-spacing-1);
  min-block-size: var(--form-control-height);
  margin-inline-end: calc(-1 * var(--gh-spacing-1_5));
  padding-inline: var(--gh-spacing-1_5);
  color: ${({ theme }) => theme.color.link};
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  text-decoration: none;
  > svg { flex: none; font-size: var(--gh-font-section); }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-size-0_5)); }
  ${media.hover} { &:hover { text-decoration: underline; } }
`;
const QueueRow = styled.li`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--gh-spacing-3);
  min-block-size: var(--gh-size-15);
  padding: var(--gh-spacing-2) var(--gh-spacing-3_5);
  > span:first-child { display: grid; gap: var(--gh-spacing-0_5); min-inline-size: 0; }
  strong { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gh-spacing-1) var(--gh-spacing-1_5); font-weight: ${({ theme }) => theme.typography.weight.heavy}; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  small { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary}; }
  @media (max-width: ${({ theme }) => theme.viewport[22.4375]}) { grid-template-columns: minmax(0, 1fr) auto; > span:first-child { grid-column: 1 / -1; } }
  ${media.desktop} { padding-inline: var(--gh-spacing-4) var(--gh-spacing-2_5); }
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
  min-block-size: var(--form-control-height);
  padding-inline: var(--gh-spacing-3_5);
  border: 0;
  border-radius: ${({ theme }) => theme.radius.surface};
  color: ${({ theme }) => theme.color.link};
  background: ${({ theme }) => theme.color.brandSoft};
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  text-decoration: none;
  white-space: nowrap;
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: var(--gh-size-0_5); }
  ${media.hover} { &:hover { text-decoration: underline; } }
  ${media.desktop} { min-block-size: var(--form-control-height); padding-inline: var(--gh-spacing-1_5);  background: ${({ theme }) => theme.color.brandSoft}; }
`;
const QueueMessage = styled.p`
  padding: var(--gh-spacing-3_5);
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  ${media.desktop} { padding-inline: var(--gh-spacing-4); }
`;
// One row only where the metrics column is wide; beside the side panel at 1024px it stacks as on phones.
const Footnote = styled.div`
  container-type: inline-size;
  min-inline-size: 0;
  > div { display: grid; min-inline-size: 0; }
  > div > p { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary}; }
  @container (min-width: ${({ theme }) => theme.viewport[34]}) {
    > div { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 0 var(--gh-spacing-4); }
    > div > p { padding-block: var(--gh-spacing-2_25); }
  }
`;
/** A plain drawer: full width with the chevron at the end when stacked; at the end of the footnote row when there is one. */
const Totals = styled.details`
  min-inline-size: 0;
  > summary {
    display: flex;
    align-items: center;
    gap: var(--gh-spacing-2);
    min-block-size: var(--form-control-height);
    color: ${({ theme }) => theme.color.link};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    list-style: none;
    cursor: pointer;
    &::-webkit-details-marker { display: none; }
    > svg { flex: none; margin-inline-start: auto; color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-section); transition: transform ${({ theme }) => theme.motion.disclosure} ${({ theme }) => theme.motion.easing}; }
    &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: var(--gh-size-0_5); }
  }
  &[open] > summary > svg { transform: rotate(180deg); }
  > p { max-inline-size: var(--gh-size-136); padding-block-end: var(--gh-spacing-1); color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary}; }
  @media (prefers-reduced-motion: reduce) { > summary > svg { transition: none; } }
  ${media.desktop} { > summary { min-block-size: var(--form-control-height); } }
  @container (min-width: ${({ theme }) => theme.viewport[34]}) {
    flex: 1 1 var(--gh-size-64);
    > summary { justify-content: flex-end; > svg { margin-inline-start: 0; } }
    > p { margin-inline-start: auto; }
  }
`;
