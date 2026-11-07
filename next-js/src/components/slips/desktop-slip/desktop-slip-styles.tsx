"use client";

import styled from "styled-components";
import { alignedLedgerStyles, desktopMatchBaseStyles } from "@/components/match/desktop-match-styles";
import { media } from "@/styles/theme";
import { slipDisclosureIndicator, slipHeaderActionMetrics } from "../slip-disclosure-styles";

export { alignedLedgerStyles } from "@/components/match/desktop-match-styles";

/** Shared desktop geometry for production slips and the design review. */
export const DesktopSlipBase = styled.div`
  ${slipHeaderActionMetrics}
  --slip-header-separator-offset: calc(-1 * var(--gh-size-1_75));
  --slip-header-gap: var(--gh-spacing-3_5);
  --slip-header-end: var(--gh-size-2_5);
  min-inline-size: 0; position: relative;

  &&& [data-slip-summary] {
    grid-template-columns: minmax(0, 1fr) auto auto auto var(--review-status-width, var(--gh-size-28));
    grid-template-areas: "identity odds count average status"; grid-template-rows: auto;
    min-block-size: var(--form-control-height); block-size: auto;
    column-gap: var(--slip-header-gap); row-gap: 0; padding: 0 var(--slip-header-end) 0 var(--gh-spacing-3);
    white-space: nowrap; font-size: var(--gh-font-secondary); line-height: var(--gh-leading-heading);
    background: ${({ theme }) => theme.phoneCardFrame.header};
  }
  &&& [data-summary-identity] { flex-wrap: wrap; align-items: center; gap: var(--gh-spacing-0_75) var(--gh-spacing-2_25); padding-inline-start: var(--gh-spacing-0_5); white-space: nowrap; font-size: var(--gh-font-emphasis); }
  &&& [data-slip-publication-date] {
    border-inline-start: 0; padding-inline-start: var(--gh-spacing-2);
  }
  &&& [data-rank] { font-size: var(--gh-font-secondary); }
  &&& [data-summary-fact] { flex-wrap: nowrap; flex-direction: row; align-items: baseline; gap: var(--gh-spacing-1_5); }
  &&& [data-summary-fact] strong { font-size: var(--gh-font-emphasis); }
  &&& [data-summary-odds] { justify-self: start; min-inline-size: 0; max-inline-size: var(--gh-size-56); }
  &&& [data-summary-odds] strong { min-inline-size: 0; flex-shrink: 1; overflow: hidden; text-overflow: ellipsis; }
  &&& [data-summary-count], &&& [data-summary-average] { justify-self: end; }
  &&& [data-summary-average] [data-fact-label] { max-inline-size: none; }
  /* Match the final match-row track, including its border and inner padding. */
  &&& [data-summary-status] {
    grid-area: status; justify-self: stretch; display: flex; align-items: center; justify-content: center;
    inline-size: 100%; box-sizing: border-box;
    border-inline-start: 0; padding-inline-start: var(--gh-spacing-1_5);
  }
  &&& [data-summary-action-space] { grid-area: action; inline-size: var(--gh-size-18); block-size: var(--form-control-height); }
  &&& [data-toggle-chevron] { inset-inline-end: var(--gh-spacing-1); }
  &&&[data-shareable] [data-slip-summary] {
    grid-template-columns: minmax(0, 1fr) auto auto auto var(--gh-size-18) var(--review-status-width, var(--gh-size-28));
    grid-template-areas: "identity odds count average action status";
  }
  [data-slip-header-action] {
    position: absolute;
    inset-inline-end: calc(var(--slip-header-end) + var(--review-status-width, var(--gh-size-28)) + var(--slip-header-gap) + ${({ theme }) => theme.border.width});
    inset-block-start: calc(var(--slip-header-action-inset) + ${({ theme }) => theme.phoneCardFrame.ruleWidth});
    block-size: var(--slip-header-action-size); display: flex; align-items: center;
    z-index: var(--gh-layer-raised);
  }

  ${desktopMatchBaseStyles}
  [data-desktop-row][data-numbered-date] { --review-date-width: var(--gh-size-18_6); }
  [data-numbered-date] [data-row-date] { display: flex; align-items: center; gap: var(--gh-spacing-1_25); }
  @media (max-width: ${({ theme }) => theme.viewport[79.99]}) {
    --slip-header-separator-offset: calc(-1 * var(--gh-size-1_25));
    --slip-header-gap: var(--gh-spacing-2_25);
    &&& [data-slip-summary] { padding-inline-start: var(--gh-spacing-2); }
  }
`;

/** Blue Signal is shared by Best Slips, the builder and saved desktop slips. */
export const DesktopSlipLayout = styled(DesktopSlipBase)`
  ${alignedLedgerStyles}
  ${media.desktop} {
    /* Reserve the end gutter for the control and keep header/body status tracks aligned. */
    &:has([data-toggle-chevron]) {
      --slip-header-end: calc(var(--slip-header-action-size) + var(--gh-spacing-1_5));
      [data-desktop-row] { padding-inline-end: var(--slip-header-end); }
    }
    &&& [data-toggle-chevron] {
      ${slipDisclosureIndicator}
      --slip-chevron-size: var(--gh-size-1_75);
      inline-size: var(--slip-header-action-size); block-size: var(--slip-header-action-size);
      inset-inline-end: calc((var(--slip-header-end) - var(--slip-header-action-size)) / 2);
      inset-block-start: var(--slip-header-action-inset); transform: none;
    }
    &&& [data-slip-disclosure][open] > [data-slip-summary] [data-toggle-chevron] { --slip-chevron-rotation: 45deg; }
    /* Draw on the outer frame so the rail spans matches without affecting their layout. */
    &::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: var(--gh-layer-content);
      border-inline-start: 0;
      border-radius: ${({ theme }) => theme.frame.desktopCardRadius};
      pointer-events: none;
    }
    [data-compact-slip] {
      --slip-edge: ${({ theme }) => theme.phoneCardFrame.header};
      border-radius: ${({ theme }) => theme.frame.desktopCardRadius};
    }
    [data-slip-content] {
      border-end-start-radius: var(--slip-inner-radius-end);
      border-end-end-radius: var(--slip-inner-radius-end);
    }
    &&& [data-slip-disclosure]:not([open]) > [data-slip-summary],
    &&& [data-compact-slip] > header[data-slip-summary] {
      min-block-size: var(--form-control-height);
      color: ${({ theme }) => theme.color.text};
      background: ${({ theme }) => theme.phoneCardFrame.header};
      [data-summary-identity] > span:first-child { font-size: var(--gh-font-reading); font-weight: var(--gh-weight-bold); }
      [data-summary-odds] strong, [data-summary-average] strong {
        color: ${({ theme }) => theme.color.accent.blue.text}; font-size: var(--gh-font-reading); font-weight: var(--gh-weight-bold);
      }
      [data-fact-label], [data-summary-count] { font-size: var(--gh-font-body); font-weight: var(--gh-weight-medium); }
      [data-slip-publication-date], [data-rank] { font-size: var(--gh-font-secondary); font-weight: var(--gh-weight-medium); line-height: var(--gh-leading-caption); }
      [data-rank] { color: ${({ theme }) => theme.color.accent.blue.text}; }
      [data-slip-status] { font-size: var(--gh-font-body); font-weight: var(--gh-weight-semibold); }
      &:focus-visible { outline-color: ${({ theme }) => theme.color.accent.blue.text}; }
      ${media.hover} { &:hover { background: color-mix(in srgb, ${({ theme }) => theme.phoneCardFrame.header} 94%, ${({ theme }) => theme.color.surface}); } }
    }
    &:not(:has([data-slip-disclosure][open])) {
      [data-share-slip] {
        color: ${({ theme }) => theme.color.accent.blue.text}; background: ${({ theme }) => theme.color.surface};
        font-size: var(--gh-font-body); font-weight: var(--gh-weight-semibold);
        &:focus-visible { outline-color: ${({ theme }) => theme.color.accent.blue.text}; }
      }
    }
  }
`;
