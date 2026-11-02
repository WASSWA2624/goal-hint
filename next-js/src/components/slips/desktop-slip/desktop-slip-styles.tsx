"use client";

import styled from "styled-components";
import { alignedLedgerStyles, desktopMatchBaseStyles } from "@/components/match/desktop-match-styles";
import { media } from "@/styles/theme";
import { slipDisclosureIndicator } from "../slip-disclosure-styles";

export { alignedLedgerStyles } from "@/components/match/desktop-match-styles";

/** Shared desktop geometry for production slips and the design review. */
export const DesktopSlipBase = styled.div`
  --slip-header-separator-offset: -7px;
  --slip-header-gap: 14px;
  --slip-header-end: 10px;
  min-inline-size: 0; position: relative;

  &&& [data-slip-summary] {
    grid-template-columns: minmax(0, 1fr) auto auto auto var(--review-status-width, 7rem);
    grid-template-areas: "identity odds count average status"; grid-template-rows: auto;
    min-block-size: var(--form-control-height, 40px); block-size: auto;
    column-gap: var(--slip-header-gap); row-gap: 0; padding: 0 var(--slip-header-end) 0 12px;
    white-space: nowrap; font-size: 0.75rem; line-height: 1.25;
    background: ${({ theme }) => theme.phoneCardFrame.header};
  }
  &&& [data-summary-identity] { flex-wrap: wrap; align-items: center; gap: 3px 9px; padding-inline-start: 2px; white-space: nowrap; font-size: 0.875rem; }
  &&& [data-slip-publication-date] {
    border-inline-start: 0; padding-inline-start: 8px;
  }
  &&& [data-rank] { font-size: 0.75rem; }
  &&& [data-summary-fact] { flex-wrap: nowrap; flex-direction: row; align-items: baseline; gap: 6px; }
  &&& [data-summary-fact] strong { font-size: 0.875rem; }
  &&& [data-summary-odds] { justify-self: start; min-inline-size: 0; max-inline-size: 14rem; }
  &&& [data-summary-odds] strong { min-inline-size: 0; flex-shrink: 1; overflow: hidden; text-overflow: ellipsis; }
  &&& [data-summary-count], &&& [data-summary-average] { justify-self: end; }
  &&& [data-summary-average] [data-fact-label] { max-inline-size: none; }
  /* Match the final match-row track, including its border and inner padding. */
  &&& [data-summary-status] {
    grid-area: status; justify-self: stretch; display: flex; align-items: center; justify-content: center;
    inline-size: 100%; box-sizing: border-box;
    border-inline-start: 0; padding-inline-start: 6px;
  }
  &&& [data-summary-action-space] { grid-area: action; inline-size: 4.5rem; block-size: var(--form-control-height, 40px); }
  &&& [data-toggle-chevron] { inset-inline-end: 4px; }
  &&&[data-shareable] [data-slip-summary] {
    grid-template-columns: minmax(0, 1fr) auto auto auto 4.5rem var(--review-status-width, 7rem);
    grid-template-areas: "identity odds count average action status";
  }
  [data-slip-header-action] {
    position: absolute;
    inset-inline-end: calc(var(--slip-header-end) + var(--review-status-width, 7rem) + var(--slip-header-gap) + ${({ theme }) => theme.border.width});
    inset-block-start: 0; z-index: 2;
  }

  ${desktopMatchBaseStyles}
  [data-desktop-row][data-numbered-date] { --review-date-width: 4.65rem; }
  [data-numbered-date] [data-row-date] { display: flex; align-items: center; gap: 5px; }
  @media (max-width: 79.99rem) {
    --slip-header-separator-offset: -5px;
    --slip-header-gap: 9px;
    &&& [data-slip-summary] { padding-inline-start: 8px; }
  }
`;

/** Blue Signal is shared by Best Slips, the builder and saved desktop slips. */
export const DesktopSlipLayout = styled(DesktopSlipBase)`
  ${alignedLedgerStyles}
  ${media.desktop} {
    /* Reserve the end gutter for the control and keep header/body status tracks aligned. */
    &:has([data-toggle-chevron]) {
      --slip-header-end: 34px;
      [data-desktop-row] { padding-inline-end: var(--slip-header-end); }
    }
    &&& [data-toggle-chevron] {
      ${slipDisclosureIndicator}
      --slip-chevron-size: 7px;
      inline-size: var(--form-control-height, 40px); block-size: var(--form-control-height, 40px);
      inset-inline-end: calc((var(--slip-header-end) - var(--form-control-height, 40px)) / 2); inset-block-start: 0; transform: none;
    }
    &&& [data-slip-disclosure][open] > [data-slip-summary] [data-toggle-chevron] { --slip-chevron-rotation: 45deg; }
    /* Draw on the outer frame so the rail spans matches without affecting their layout. */
    &::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: 1;
      border-inline-start: 0;
      border-radius: ${({ theme }) => theme.frame.desktopCardRadius};
      pointer-events: none;
    }
    [data-compact-slip] {  border-radius: ${({ theme }) => theme.frame.desktopCardRadius}; }
    [data-slip-content] {
      border-end-start-radius: var(--slip-inner-radius);
      border-end-end-radius: var(--slip-inner-radius);
    }
    &&& [data-slip-disclosure]:not([open]) > [data-slip-summary],
    &&& [data-compact-slip] > header[data-slip-summary] {
      min-block-size: var(--form-control-height, 40px);
      color: ${({ theme }) => theme.color.text};
      background: ${({ theme }) => theme.phoneCardFrame.header};
      [data-summary-identity] > span:first-child { font-size: .9375rem; font-weight: 700; }
      [data-summary-odds] strong, [data-summary-average] strong {
        color: ${({ theme }) => theme.color.accent.blue.text}; font-size: .9375rem; font-weight: 700;
      }
      [data-fact-label], [data-summary-count] { font-size: .8125rem; font-weight: 500; }
      [data-slip-publication-date], [data-rank] { font-size: .75rem; font-weight: 500; line-height: 1.35; }
      [data-rank] { color: ${({ theme }) => theme.color.accent.blue.text}; }
      [data-slip-status] { font-size: .8125rem; font-weight: 600; }
      &:focus-visible { outline-color: ${({ theme }) => theme.color.accent.blue.text}; }
      ${media.hover} { &:hover { background: color-mix(in srgb, ${({ theme }) => theme.phoneCardFrame.header} 94%, ${({ theme }) => theme.color.surface}); } }
    }
    &:not(:has([data-slip-disclosure][open])) {
      [data-slip-header-action] { inset-block-start: 0; block-size: var(--form-control-height, 40px); display: flex; align-items: center; }
      [data-share-slip] {
        color: ${({ theme }) => theme.color.accent.blue.text}; background: ${({ theme }) => theme.color.surface};
        font-size: .8125rem; font-weight: 600;
        &:focus-visible { outline-color: ${({ theme }) => theme.color.accent.blue.text}; }
        @media (pointer: coarse) { min-block-size: var(--form-control-height, 40px); }
      }
    }
  }
`;
