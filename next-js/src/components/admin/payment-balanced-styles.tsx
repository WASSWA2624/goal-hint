"use client";

import { controlRow } from "@/components/ui/control-layout";

import styled, { css } from "styled-components";
import { media } from "@/styles/theme";
import { RecordScroll } from "./record-workspace";

export const PaymentReviewScroll = styled(RecordScroll)`
  ${media.desktop} { grid-auto-rows: max-content; }
`;

export const ReviewIdentity = styled.div`
  display: grid;
  gap: var(--gh-spacing-1_5);
  min-inline-size: 0;
  > div { display: flex; align-items: center; flex-wrap: wrap; gap: var(--gh-spacing-2) var(--gh-spacing-3); }
  h2 { font-size: var(--gh-font-heading); line-height: var(--gh-leading-compact); font-variant-numeric: tabular-nums; }
`;

export const ReviewSectionHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--gh-spacing-1_5) var(--gh-spacing-3);
  min-inline-size: 0;
  > p { margin: 0; }
`;

/** A separate label keeps the copy button from also activating the input. */
export const TransactionControl = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--gh-spacing-1);
  min-inline-size: 0;
  input { min-inline-size: 0; font-variant-numeric: tabular-nums; }

  ${controlRow}
`;

/** The approved 01 layout changes desktop geometry; phones retain their panel flow. */
export const desktopBalancedReview = css`
  ${media.desktop} {
    [data-payment-head] {
      display: flex; flex-wrap: nowrap; align-items: start; gap: var(--gh-spacing-3);
      min-block-size: 0; padding: var(--gh-spacing-5);
      border: 0; background: transparent;
      > [data-payment-logo] { flex: none; margin-block-start: var(--gh-spacing-0_5); }
      [data-review-meta] { font-size: var(--gh-font-secondary); }
    }
    [data-payment-zones] {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      grid-template-areas: "decision proof" "expected proof" "checks proof";
      align-items: start;
      gap: var(--gh-spacing-4);
      padding: 0 var(--gh-spacing-5) var(--gh-spacing-5);
      min-inline-size: 0;
      > [data-payment-zone] {
        min-inline-size: 0; padding: var(--gh-spacing-4);
        border: 0;
        border-radius: ${({ theme }) => theme.radius.surface}; background: ${({ theme }) => theme.color.surface};
      }
      > [data-payment-zone="decision"] { grid-area: decision; display: grid; align-content: start; gap: var(--gh-spacing-3_5); }
      > [data-payment-zone="expected"] { grid-area: expected; }
      > [data-payment-zone="checks"] { grid-area: checks; }
      > [data-payment-zone="proof"] { grid-area: proof; display: grid; justify-items: stretch; gap: var(--gh-spacing-3_5); }
      h3 { margin: 0; color: ${({ theme }) => theme.color.text}; font-size: var(--gh-font-emphasis); font-weight: ${({ theme }) => theme.typography.weight.bold}; letter-spacing: 0; text-transform: none; }
      [data-payment-approval] { padding: 0; gap: var(--gh-spacing-4); }
      [data-payment-confirmation-fields], [data-payment-plan-fields] { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gh-spacing-3); }
      [data-payment-approval] label { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); font-weight: ${({ theme }) => theme.typography.weight.medium}; }
      [data-payment-approval] input, [data-payment-approval] select { color: ${({ theme }) => theme.color.text}; font-weight: var(--gh-weight-body); }
      [data-payment-approval] > div:first-of-type { gap: var(--gh-spacing-2) var(--gh-spacing-3); }
      [data-payment-approval] input[name="amount"] { font-size: var(--gh-font-page); font-weight: ${({ theme }) => theme.typography.weight.heavy}; }
      [data-payment-approval] input[name="transactionId"] { font-size: var(--gh-font-secondary); }
      [data-payment-plan-controls] { border: 0; margin: 0; }
      [data-payment-plan-controls] > summary { display: none; }
      [data-payment-plan-controls] > div { padding: 0; }
      [data-payment-facts] { border-block-start: 0; }
      [data-payment-facts] > div { gap: var(--gh-spacing-1) var(--gh-spacing-3); padding-block: var(--gh-spacing-2_5); }
      [data-payment-facts] dt, [data-payment-facts] dd { font-size: var(--gh-font-body); }
      [data-payment-checks] { display: grid; gap: var(--gh-spacing-3_5); }
      [data-payment-checks] li { font-size: var(--gh-font-body); line-height: var(--gh-leading-body); }
      [data-payment-sms] > summary { display: none; }
      [data-payment-sms]:not([open]), [data-reject]:not([open]) { display: none; }
      [data-payment-sms] > div { padding-block: var(--gh-spacing-2_5) 0; }
      [data-payment-zone="decision"] > [data-reject] { order: initial; }
      [data-reject] > summary { display: none; }
      [data-payment-zone="proof"] img { inline-size: 100%; max-block-size: none; border-radius: ${({ theme }) => theme.radius.none}; }
      [data-payment-zone="proof"] > div { max-inline-size: 100%; }
      [data-proof-empty] { display: grid; place-content: center; gap: var(--gh-spacing-2_5); min-block-size: var(--gh-size-60); padding: var(--gh-spacing-5); text-align: center; color: ${({ theme }) => theme.color.mutedText}; background: ${({ theme }) => theme.color.surfaceMuted}; font-size: var(--gh-font-body); }
      [data-proof-empty] p { margin: 0; }
    }
    > [data-decision-bar] {
      padding: var(--gh-spacing-2_5) var(--gh-spacing-5);
      > [data-reject-toggle] { display: inline-flex; }
      > [data-reject-submit] { display: none; }
    }
  }
  @media (min-width: ${({ theme }) => theme.viewport[64]}) and (max-width: ${({ theme }) => theme.viewport[89.99]}) {
    [data-payment-head] { padding: var(--gh-spacing-4); }
    [data-payment-zones] {
      gap: var(--gh-spacing-3); padding: 0 var(--gh-spacing-4) var(--gh-spacing-4);
      > [data-payment-zone] { padding: var(--gh-spacing-3); }
      [data-payment-confirmation-fields], [data-payment-plan-fields] { grid-template-columns: minmax(0, 1fr); }
      [data-payment-facts] > div { grid-template-columns: minmax(0, 1fr); }
      [data-payment-facts] dd { text-align: start; }
    }
  }
`;
