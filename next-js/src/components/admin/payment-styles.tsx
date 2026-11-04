"use client";


import styled, { css } from "styled-components";
import { contentGutter } from "@/components/ui/layout";
import { media } from "@/styles/theme";
import { Drawer, EmptyPanel, TextAction, visuallyHidden } from "./desk-styles";
import { desktopBalancedReview } from "./payment-balanced-styles";
import { RecordCard, RecordDetailHead, RecordDetails, RecordFeedback, RecordFooter, RecordHead, RecordItem, RecordList, RecordListFooter, RecordListScroll, RecordWorkspace } from "./record-workspace";

/**
 * Compact desktop queue beside a persistent review. Phones keep the queue-to-review flow.
 */
const panelLook = css`
  background: ${({ theme }) => theme.color.surface};
  border: 0;
  border-radius: ${({ theme }) => theme.radius.surface};
`;

export const PaymentLayout = styled(RecordWorkspace)`
  --record-list-default: clamp(var(--gh-size-70), 24vw, var(--gh-size-82_5));
  ${media.belowDesktop} {
    &[data-payment-mobile-queue] {
      block-size: max(0px, calc(var(--payment-viewport-height, 100dvh) - var(--app-header-height)
        - var(--app-mobile-tab-height) - env(safe-area-inset-bottom) - var(--gh-spacing-1)));
      grid-template-rows: auto auto minmax(0, 1fr);
      gap: 0;
      > header { grid-row: 1; padding-block-end: var(--gh-spacing-2); }
      > [data-record-list-pane] {
        grid-row: 3; grid-template-rows: minmax(0, 1fr) auto;
        min-block-size: 0; gap: 0;
      }
      [data-payment-queue-scroll] {
        grid-row: 1; min-block-size: 0; overflow-y: auto; overscroll-behavior-y: contain;
        scrollbar-width: thin;
      }
      [data-payment-queue-footer] { grid-row: 2; }
      [data-payment-empty] { grid-row: 1; align-self: start; }
    }
    &:not([data-payment-mobile-queue]) { gap: var(--gh-spacing-0_5); }
  }
`;
export const PaymentUnavailable = styled.section`
  display: grid;
  align-content: start;
  gap: var(--gh-spacing-4);
  min-inline-size: 0;
  > h1 { ${visuallyHidden} }
`;

/** The phone review shows its own navigation instead of the queue toolbar. */
export const PaymentHead = styled(RecordHead)<{ $reviewing: boolean }>`
  background: transparent;
  ${media.belowDesktop} {
    padding-inline: 0;
    ${({ $reviewing }) => $reviewing && css`
      min-block-size: 0;
      > [data-admin-toolbar] { display: none; }
    `}
  }
`;
export const PaymentFeedback = styled(RecordFeedback)`
  scroll-margin-block-start: calc(var(--app-header-content-height, var(--gh-size-16)) + var(--gh-spacing-4));
`;

/** Desktop: a panel with the toolbar above the ticket tray. Phones: the parts sit straight on the page. */
export const QueuePanel = styled(RecordList)<{ $reviewing: boolean }>`
  ${media.belowDesktop} {
    gap: var(--gh-spacing-3);
    ${({ $reviewing }) => $reviewing && css`display: none;`}
  }
  > h2 { ${visuallyHidden} }
`;
export const QueueBar = styled.div`
  flex: 1 0 100%;
  min-inline-size: 0;
  > form {
    display: grid; gap: var(--gh-spacing-1_5); min-inline-size: 0;
    ${media.desktop} { grid-template-columns: minmax(0, 1fr) max-content; }
  }
`;
export const QueueFilters = styled.div`
  display: grid; gap: var(--gh-spacing-3); min-inline-size: 0;
  > fieldset {
    display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: var(--gh-spacing-3); min-inline-size: 0; margin: 0; padding: 0; border: 0;
  }
  legend { padding: 0; color: ${({ theme }) => theme.color.text}; font-weight: var(--gh-weight-bold); }
  label { min-block-size: var(--form-control-height); min-inline-size: 0; margin: 0; align-items: center; }
  label > input { flex: none; margin: 0; }
`;
export const QueueFooter = styled(RecordListFooter)`
  display: grid; row-gap: 0;
  ${media.desktop} { padding-block: 0; }
  /* Inset the visible button faces inside the shared pointer targets. */
  [data-numbered-pagination] :is([data-pagination-end], [data-pagination-page], [data-pagination-scroll]) {
    padding-block: var(--gh-spacing-1);
    background-clip: content-box;
    &:focus-visible { outline-offset: calc(-1 * var(--gh-spacing-1_5)); }
  }
  > [data-payment-queue-updated] { color: ${({ theme }) => theme.color.link}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
`;

export const TicketTray = styled(RecordListScroll)<{ $opened: boolean }>`
  gap: 0;
  > li + li { border-block-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; }
  ${({ $opened }) => !$opened && css`${media.belowDesktop} { && [aria-current="true"] {  background: ${({ theme }) => theme.color.surface}; } }`}
`;
export const TicketItem = styled(RecordItem)`
  && {
    min-block-size: var(--form-control-height);
    border-radius: ${({ theme }) => theme.radius.none};
    padding-block: var(--gh-spacing-1_5);
  }
  [data-record-row-text] { row-gap: 0; }
  [data-record-row-primary], [data-ticket-meta] {
    display: grid; align-items: baseline; gap: var(--gh-spacing-1_5);
  }
  [data-record-row-primary] { grid-template-columns: minmax(0, max-content) minmax(0, 1fr) minmax(0, max-content); }
  [data-ticket-meta] {
    grid-template-columns: minmax(0, 1fr) minmax(0, max-content);
    font-size: var(--gh-font-caption);
    line-height: var(--gh-leading-caption);
  }
  [data-record-row-primary] > *, [data-ticket-meta] > * {
    min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  [data-ticket-amount], [data-ticket-time] { text-align: end; font-variant-numeric: tabular-nums; }
`;
export const QueueEmpty = styled(EmptyPanel)`
  ${media.belowDesktop} { ${panelLook} }
  ${media.desktop} { grid-row: 2; align-self: start; padding-block: var(--gh-spacing-7); }
`;

export const ReviewSection = styled(RecordDetails)<{ $reviewing: boolean }>`
  scroll-margin-block-start: calc(var(--app-header-content-height, var(--gh-size-16)) + var(--gh-spacing-4));
  ${media.belowDesktop} {
    ${({ $reviewing }) => !$reviewing && css`display: none;`}
    --payment-review-footer-padding: var(--gh-spacing-1);
    --payment-review-footer-height: calc(var(--form-control-height) + 2 * var(--payment-review-footer-padding) + var(--gh-stroke-thin));
    --payment-review-footer-offset: calc(var(--app-mobile-tab-height) + env(safe-area-inset-bottom));
    &:has([data-record-footer]) {
      padding-block-end: var(--payment-review-footer-height);
      :is(input, textarea, select, button, summary, a) {
        scroll-margin-block-end: calc(var(--payment-review-footer-offset) + var(--payment-review-footer-height) + var(--gh-spacing-2));
      }
    }
  }
`;

/* ---------------- Review ---------------- */

export const ReviewCard = styled(RecordCard)`
  dd { font-size: ${({ theme }) => theme.typography.scale.body}; }
  ${media.belowDesktop} {
    gap: var(--gh-spacing-2);
    [data-payment-zone] {
      padding-block-start: var(--gh-spacing-3);
      border-block-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
    }
    h3 { margin: 0; font-size: var(--gh-font-section); font-weight: var(--gh-weight-medium); letter-spacing: normal; text-transform: none; }
  }
  ${desktopBalancedReview}
`;
export const ReviewHead = styled(RecordDetailHead)`
  ${media.belowDesktop} {
    padding: 0;
    border: 0;
    background: transparent;
    > [data-review-link] { padding-inline-start: 0; font-size: var(--gh-font-secondary); font-weight: var(--gh-weight-medium); }
  }
`;
export const ReviewBack = styled(TextAction)`
  gap: var(--gh-spacing-1);
  padding-inline: 0 var(--gh-spacing-2);
  scroll-margin-block-start: var(--app-header-height);
  font-weight: var(--gh-weight-medium);
  ${media.desktop} { display: none; }
`;

const statusTone = (status: string) => status === "pending" ? "pending" : status === "approved" ? "correct" : status === "rejected" ? "incorrect" : "void";
export const PaymentBadge = styled.span<{ $status: string }>`
  display: inline-flex;
  align-items: center;
  min-block-size: var(--gh-size-5);
  padding: 0 var(--gh-spacing-1_75);
  border-radius: ${({ theme }) => theme.radius.small};
  color: ${({ theme, $status }) => theme.color.outcome[statusTone($status)].text};
  background: ${({ theme, $status }) => theme.color.outcome[statusTone($status)].background};
  font-size: ${({ theme }) => theme.typography.scale.caption};
  font-weight: ${({ theme }) => theme.typography.weight.heavy};
  line-height: var(--gh-leading-solid);
  white-space: nowrap;
`;

const zonePadding = "var(--gh-spacing-3_5)";
const zoneBody = css`
  display: grid;
  align-content: start;
  gap: var(--gh-spacing-3);
  min-inline-size: 0;
  padding: ${zonePadding};
`;
export const ReviewZones = styled.div`
  display: grid;
  min-inline-size: 0;
  ${media.belowDesktop} { gap: var(--gh-spacing-3); }
`;
export const ProofZone = styled.section`
  ${zoneBody}
  justify-items: start;
  background: ${({ theme }) => theme.color.surfaceMuted};
  > p:first-child { justify-self: start; }
  ${media.belowDesktop} {
    gap: var(--gh-spacing-2);
    padding-inline: 0;
    padding-block-end: 0;
    background: transparent;
  }
  ${media.desktop} { padding: var(--gh-spacing-4) var(--gh-spacing-4_5) var(--gh-spacing-4_5); }
`;
export const ExpectedZone = styled.section`
  ${zoneBody}
  ${media.belowDesktop} { padding-inline: 0; padding-block-end: 0; }
  ${media.desktop} { padding: var(--gh-spacing-4) var(--gh-spacing-4_5) var(--gh-spacing-4_5); }
  > dl { border-block-start: 0; }
`;
export const PaymentWarnings = styled.div`
  display: grid;
  gap: var(--gh-spacing-1_5);
  min-inline-size: 0;
  padding: var(--gh-spacing-2_5) var(--gh-spacing-3);
  border-radius: ${({ theme }) => theme.radius.surface};
  color: ${({ theme }) => theme.color.outcome.pending.text};
  background: ${({ theme }) => theme.color.outcome.pending.background};
  > p { display: flex; align-items: flex-start; gap: var(--gh-spacing-2); margin: 0; font-size: ${({ theme }) => theme.typography.scale.body}; font-weight: ${({ theme }) => theme.typography.weight.bold}; overflow-wrap: anywhere; }
  > p > svg { flex: none; margin-block-start: var(--gh-spacing-0_5); font-size: var(--gh-font-section); }
`;
export const CheckList = styled.ul`
  display: grid;
  gap: var(--gh-spacing-1_5);
  margin: 0;
  padding: 0;
  list-style: none;
  > li { display: flex; align-items: flex-start; gap: var(--gh-spacing-2); font-size: ${({ theme }) => theme.typography.scale.body}; line-height: var(--gh-leading-reading); overflow-wrap: anywhere; }
  > li > svg { flex: none; margin-block-start: var(--gh-spacing-0_25); font-size: var(--gh-font-section); color: ${({ theme }) => theme.color.mutedText}; }
  > li[data-tone="good"] > svg { color: ${({ theme }) => theme.color.outcome.correct.text}; }
`;

/** A disclosure aligned with the receipt fields. */
export const ZoneDrawer = styled(Drawer)`
  border-block-end: 0;
  border-block-start: 0;
  &:last-child { border-block-end: 0; }
  > summary { min-block-size: var(--form-control-height); padding: 0; }
  > summary > svg:last-child { color: ${({ theme }) => theme.color.mutedText}; }
  > div { padding: var(--gh-spacing-0_5) 0 var(--gh-size-3_5); }
`;
export const ShieldMark = styled.span<{ $clear: boolean }>`
  display: inline-flex;
  color: ${({ theme, $clear }) => $clear ? theme.color.outcome.correct.text : theme.color.outcome.pending.text};
  > svg { font-size: var(--gh-font-title); }
`;

export const DecisionZone = styled.div`
  display: grid;
  align-content: start;
  min-inline-size: 0;
  ${media.desktop} {
    gap: var(--gh-spacing-3);
    padding: var(--gh-spacing-4) var(--gh-spacing-4_5) var(--gh-spacing-4_5);
  }
`;
const decisionPanel = css`
  ${zoneBody}
  padding: 0;
  gap: var(--gh-spacing-2);
`;
export const DecisionPanel = styled.div`${decisionPanel}`;
export const ApprovalForm = styled.form`${decisionPanel}`;

export const PaymentReviewFooter = styled(RecordFooter)`
  justify-content: space-between;
  ${media.belowDesktop} {
    position: fixed;
    inset-block-end: var(--payment-review-footer-offset);
    inset-inline: ${({ theme }) => theme.layout.gutter};
    gap: var(--gh-spacing-2);
    padding: var(--payment-review-footer-padding) ${contentGutter};
    border-block-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
    > button { flex: 0 1 auto; min-inline-size: 0; padding-inline: var(--gh-spacing-2_5); }
    &:has([data-payment-more-actions]) {
      gap: var(--gh-spacing-1);
      > button { padding-inline: var(--gh-spacing-1_5); }
    }
  }
`;
export const DecisionBar = styled(PaymentReviewFooter)`background: ${({ theme }) => theme.color.surface};`;
export const CopyRow = styled.dd`
  && { display: inline-flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 0 var(--gh-spacing-2); }
  > span { overflow-wrap: anywhere; }
`;
