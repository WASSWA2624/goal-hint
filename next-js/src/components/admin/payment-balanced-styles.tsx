"use client";

import styled, { css } from "styled-components";
import { media } from "@/styles/theme";
import { RecordScroll } from "./record-workspace";

export const PaymentReviewScroll = styled(RecordScroll)`
  ${media.desktop} { grid-auto-rows: max-content; }
`;

export const ReviewIdentity = styled.div`
  display: grid;
  gap: 6px;
  min-inline-size: 0;
  > div { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; }
  h2 { font-size: 1.25rem; line-height: 1.4; font-variant-numeric: tabular-nums; }
`;

export const ReviewSectionHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px 12px;
  min-inline-size: 0;
  > p { margin: 0; }
`;

/** A separate label keeps the copy button from also activating the input. */
export const TransactionControl = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 4px;
  min-inline-size: 0;
  input { min-inline-size: 0; font-variant-numeric: tabular-nums; }
`;

/** The approved 01 layout changes desktop geometry; phones retain their panel flow. */
export const desktopBalancedReview = css`
  ${media.desktop} {
    input, select, textarea, button, form, details, summary, img, section, [role="group"] { border-radius: 0; }
    [data-payment-head] {
      display: flex; flex-wrap: nowrap; align-items: start; gap: 12px;
      min-block-size: 0; padding: 20px;
      border: 0; background: transparent;
      > [data-payment-logo] { flex: none; margin-block-start: 2px; }
      [data-review-meta] { font-size: 0.75rem; }
    }
    [data-payment-zones] {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      grid-template-areas: "decision proof" "expected proof" "checks proof";
      align-items: start;
      gap: 16px;
      padding: 0 20px 20px;
      min-inline-size: 0;
      > [data-payment-zone] {
        min-inline-size: 0; padding: 16px;
        border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
        border-radius: 0; background: ${({ theme }) => theme.color.surface};
      }
      > [data-payment-zone="decision"] { grid-area: decision; display: grid; align-content: start; gap: 14px; }
      > [data-payment-zone="expected"] { grid-area: expected; }
      > [data-payment-zone="checks"] { grid-area: checks; }
      > [data-payment-zone="proof"] { grid-area: proof; display: grid; justify-items: stretch; gap: 14px; }
      h3 { margin: 0; color: ${({ theme }) => theme.color.text}; font-size: 0.875rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; letter-spacing: 0; text-transform: none; }
      [data-payment-approval] { padding: 0; gap: 16px; }
      [data-payment-confirmation-fields], [data-payment-plan-fields] { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      [data-payment-approval] label { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
      [data-payment-approval] input, [data-payment-approval] select { color: ${({ theme }) => theme.color.text}; font-weight: normal; }
      [data-payment-approval] > div:first-of-type { gap: 8px 12px; }
      [data-payment-approval] input[name="amount"] { font-size: 1.375rem; font-weight: ${({ theme }) => theme.typography.weight.heavy}; }
      [data-payment-approval] input[name="transactionId"] { font-size: 0.75rem; }
      [data-payment-plan-controls] { border: 0; margin: 0; }
      [data-payment-plan-controls] > summary { display: none; }
      [data-payment-plan-controls] > div { padding: 0; }
      [data-payment-facts] { border-block-start: 0; }
      [data-payment-facts] > div { gap: 4px 12px; padding-block: 10px; }
      [data-payment-facts] dt, [data-payment-facts] dd { font-size: 0.8125rem; }
      [data-payment-checks] { display: grid; gap: 14px; }
      [data-payment-checks] li { font-size: 0.8125rem; line-height: 1.6; }
      [data-payment-sms] > summary { display: none; }
      [data-payment-sms]:not([open]), [data-reject]:not([open]) { display: none; }
      [data-payment-sms] > div { padding-block: 10px 0; }
      [data-payment-zone="decision"] > [data-reject] { order: initial; }
      [data-reject] > summary { display: none; }
      [data-payment-zone="proof"] img { inline-size: 100%; max-block-size: none; border-radius: 0; }
      [data-payment-zone="proof"] > div { max-inline-size: 100%; }
      [data-proof-empty] { display: grid; place-content: center; gap: 10px; min-block-size: 240px; padding: 20px; text-align: center; color: ${({ theme }) => theme.color.mutedText}; background: ${({ theme }) => theme.color.surfaceMuted}; font-size: 0.8125rem; }
      [data-proof-empty] p { margin: 0; }
    }
    > [data-decision-bar] {
      padding: 10px 20px;
      > [data-reject-toggle] { display: inline-flex; }
      > [data-reject-submit] { display: none; }
    }
  }
  @media (min-width: 64rem) and (max-width: 89.99rem) {
    [data-payment-head] { padding: 16px; }
    [data-payment-zones] {
      gap: 12px; padding: 0 16px 16px;
      > [data-payment-zone] { padding: 12px; }
      [data-payment-confirmation-fields], [data-payment-plan-fields] { grid-template-columns: minmax(0, 1fr); }
      [data-payment-facts] > div { grid-template-columns: minmax(0, 1fr); }
      [data-payment-facts] dd { text-align: start; }
    }
  }
`;
