"use client";

import styled, { css } from "styled-components";
import { media } from "@/styles/theme";

/** One scroll surface for the desktop review; mobile keeps the existing panel flow. */
export const CompactReviewScroll = styled.div`
  display: contents;
  ${media.desktop} {
    display: grid;
    align-content: start;
    min-inline-size: 0;
    min-block-size: 0;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: ${({ theme }) => theme.color.controlBorder} transparent;
    scroll-padding-block: 16px;
  }
`;

type SummaryTone = "good" | "warning" | "neutral";

/** A concise summary of the real report checks, above the payment amount. */
export const CompactReviewSummary = styled.div<{ $tone?: SummaryTone }>`
  display: none;
  ${media.desktop} {
    display: flex;
    align-items: center;
    gap: 10px;
    min-inline-size: 0;
    margin: 16px 20px 0;
    padding: 12px 14px;
    border-inline-start: 2px solid currentColor;
    ${({ theme, $tone = "neutral" }) => {
      const tone = $tone === "good" ? theme.color.outcome.correct
        : $tone === "warning" ? theme.color.outcome.pending
          : { text: theme.color.link, background: theme.color.brandSoft };
      return css`color: ${tone.text}; background: ${tone.background};`;
    }}
    > svg { flex: none; font-size: 1.125rem; }
    > div, > span { display: grid; gap: 3px; min-inline-size: 0; }
    strong { font-size: 0.8125rem; line-height: 1.4; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
    small { font-size: 0.75rem; line-height: 1.5; }
    > [data-payment-summary-count] { margin-inline-start: auto; font-size: 0.75rem; text-align: end; }
  }
`;

/** Reported/received money remains distinct from the package price when they differ. */
export const CompactAmountSummary = styled.div`
  display: none;
  ${media.desktop} {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px 16px;
    margin: 0 20px 16px;
    padding: 18px 0 16px;
    border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    min-inline-size: 0;
    > div { display: grid; gap: 4px; min-inline-size: 0; }
    > div:nth-child(2) { text-align: end; }
    strong { color: ${({ theme }) => theme.color.text}; font-size: 1.75rem; line-height: 1.2; font-weight: ${({ theme }) => theme.typography.weight.heavy}; letter-spacing: -0.025em; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
    small, > span { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; line-height: 1.5; }
    [data-payment-package] { font-size: 0.8125rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
    > [data-payment-submitted] { grid-column: 1 / -1; font-variant-numeric: tabular-nums; }
  }
`;

/** Applied to ReviewCard after its legacy styles; every override is desktop-only. */
export const desktopCompactReview = css`
  ${media.desktop} {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    gap: 0;
    min-block-size: 0;
    block-size: 100%;
    overflow: hidden;
    border: 0;
    border-radius: 0;
    background: ${({ theme }) => theme.color.surfaceMuted};

    input, select, textarea, button, details, summary, img, [role="group"], [data-review-badge], [data-payment-zone] > div { border-radius: 0; }
    [data-payment-head] {
      gap: 6px 12px;
      min-block-size: 78px;
      padding: 16px 20px;
      border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
      background: ${({ theme }) => theme.color.surface};
      > h2 { font-size: 1.1875rem; font-weight: ${({ theme }) => theme.typography.weight.heavy}; }
      > [data-review-meta] { font-size: 0.75rem; }
      > [data-review-link] { font-size: 0.75rem; }
    }

    [data-payment-zones] {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
      gap: 14px;
      padding: 0 20px 20px;
      min-inline-size: 0;
      > [data-payment-zone] {
        min-inline-size: 0;
        padding: 14px;
        border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
        border-radius: 0;
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
      input, select { min-block-size: 38px; font-size: 0.8125rem; }
      textarea { font-size: 0.8125rem; }
      [data-payment-approval] { padding: 0; }
      [data-payment-zone="decision"] > [data-reject] { order: initial; }
      [data-payment-zone="proof"] img { max-block-size: none; }
      [data-payment-zone="proof"] > div { max-inline-size: 100%; }
      [data-payment-zone="proof"] > p:first-child { inline-size: 100%; }
    }

    > [data-decision-bar] {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      position: static;
      min-inline-size: 0;
      margin: 0;
      padding: 12px 20px;
      border: 0;
      border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
      background: ${({ theme }) => theme.color.surface};
      > button { flex: 0 1 auto; min-inline-size: 0; min-block-size: 40px; padding-inline: 14px; font-size: 0.8125rem; }
      > [data-reject-toggle] { display: inline-flex; }
      > [data-reject-submit] { display: none; }
      > [data-payment-footer-summary] { min-inline-size: 0; margin-inline-end: auto; overflow-wrap: anywhere; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; }
    }
  }

  @media (min-width: 64rem) and (max-width: 79.99rem) {
    > [data-decision-bar] > [data-payment-footer-summary] { display: none; }
    [data-payment-zones] {
      grid-template-columns: minmax(0, 1fr);
      > [data-payment-zone="decision"] { grid-column: 1; grid-row: 1; }
      > [data-payment-zone="expected"], &:has(> [data-payment-zone="proof"]) > [data-payment-zone="expected"] { grid-column: 1; grid-row: 2; }
      > [data-payment-zone="proof"] { grid-column: 1; grid-row: 3; }
    }
  }
`;
