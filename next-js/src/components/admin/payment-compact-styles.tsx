"use client";

import styled, { css } from "styled-components";
import { media } from "@/styles/theme";
import { RecordScroll } from "./record-workspace";

/** One scroll surface for the desktop review; mobile keeps the existing panel flow. */
export const CompactReviewScroll = RecordScroll;

/** Reported/received money remains distinct from the package price when they differ. */
export const CompactAmountSummary = styled.div`
  display: none;
  ${media.desktop} {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px 16px;
    margin: 0 12px 12px;
    padding: 12px 0 10px;
    border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    min-inline-size: 0;
    > div { display: grid; gap: 4px; min-inline-size: 0; }
    > div:nth-child(2) { text-align: end; }
    strong { color: ${({ theme }) => theme.color.text}; font-size: 1.5rem; line-height: 1.2; font-weight: ${({ theme }) => theme.typography.weight.heavy}; letter-spacing: -0.025em; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
    small, > span { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; line-height: 1.5; }
    [data-payment-package] { font-size: 0.8125rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
    > [data-payment-submitted] { grid-column: 1 / -1; font-variant-numeric: tabular-nums; }
  }
`;

/** Applied to ReviewCard after its legacy styles; every override is desktop-only. */
export const desktopCompactReview = css`
  ${media.desktop} {
    [data-review-badge], [data-payment-zone] > div { border-radius: 2px; }
    [data-payment-head] {
      > [data-review-meta] { font-size: 0.75rem; }
      > [data-review-link] { min-block-size: 28px; padding-block: 2px; font-size: 0.75rem; }
    }

    [data-payment-zones] {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
      gap: 12px;
      padding: 0 12px 12px;
      min-inline-size: 0;
      > [data-payment-zone] {
        min-inline-size: 0;
        padding: 12px;
        border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
        border-radius: 2px;
        background: ${({ theme }) => theme.color.surface};
      }
      > [data-payment-zone="decision"] { grid-column: 1; grid-row: 1; display: grid; gap: 14px; align-content: start; }
      > [data-payment-zone="expected"] { grid-column: 2; grid-row: 1; }
      > [data-payment-zone="proof"] { grid-column: 2; grid-row: 1 / span 2; }
      &:has(> [data-payment-zone="proof"]) > [data-payment-zone="expected"] { grid-column: 1; grid-row: 2; }
      [data-payment-amount] { display: none; }
      [data-payment-facts] { border-block-start: 0; }
      [data-payment-facts] > div { padding-block: 9px; gap: 3px 10px; }
      [data-payment-facts] dt, [data-payment-facts] dd { font-size: 0.8125rem; }
      [data-payment-checks] > summary { min-block-size: 40px; font-size: 0.8125rem; }
      [data-payment-approval] { padding: 0; }
      [data-payment-zone="decision"] > [data-reject] { order: initial; }
      [data-payment-zone="proof"] img { max-block-size: none; }
      [data-payment-zone="proof"] > div { max-inline-size: 100%; }
      [data-payment-zone="proof"] > p:first-child { inline-size: 100%; }
    }

    > [data-decision-bar] {
      > [data-reject-toggle] { display: inline-flex; }
      > [data-reject-submit] { display: none; }
    }
  }

  @media (min-width: 64rem) and (max-width: 79.99rem) {
    [data-payment-zones] {
      grid-template-columns: minmax(0, 1fr);
      > [data-payment-zone="decision"] { grid-column: 1; grid-row: 1; }
      > [data-payment-zone="expected"], &:has(> [data-payment-zone="proof"]) > [data-payment-zone="expected"] { grid-column: 1; grid-row: 2; }
      > [data-payment-zone="proof"] { grid-column: 1; grid-row: 3; }
    }
  }
`;
