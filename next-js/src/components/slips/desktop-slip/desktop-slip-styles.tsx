"use client";

import styled from "styled-components";
import { alignedLedgerStyles, desktopMatchBaseStyles } from "@/components/match/desktop-match-styles";

export { alignedLedgerStyles } from "@/components/match/desktop-match-styles";

/** Shared desktop geometry for production slips and the design review. */
export const DesktopSlipBase = styled.div`
  --slip-header-separator-offset: -7px;
  min-inline-size: 0; position: relative;

  &&& [data-slip-summary] {
    grid-template-columns: minmax(0, 1fr) auto auto auto 5.75rem;
    grid-template-areas: "identity odds count average status"; grid-template-rows: auto;
    min-block-size: 2.25rem; block-size: auto;
    column-gap: 14px; row-gap: 0; padding: 4px 32px 4px 12px;
    white-space: nowrap; font-size: 0.75rem; line-height: 1.25;
    background: ${({ theme }) => theme.color.surface};
  }
  &&& [data-summary-identity] { flex-wrap: wrap; align-items: center; gap: 3px 9px; padding-inline-start: 2px; white-space: nowrap; font-size: 0.875rem; }
  &&& [data-slip-publication-date] {
    border-inline-start: 1px solid ${({ theme }) => theme.color.border}; padding-inline-start: 8px;
  }
  &&& [data-rank] { font-size: 0.75rem; }
  &&& [data-summary-fact] { flex-wrap: nowrap; flex-direction: row; align-items: baseline; gap: 6px; }
  &&& [data-summary-fact] strong { font-size: 0.875rem; }
  &&& [data-summary-odds] { justify-self: start; min-inline-size: 0; max-inline-size: 14rem; }
  &&& [data-summary-odds] strong { min-inline-size: 0; flex-shrink: 1; overflow: hidden; text-overflow: ellipsis; }
  &&& [data-summary-count], &&& [data-summary-average] { justify-self: end; }
  &&& [data-summary-average] [data-fact-label] { max-inline-size: none; }
  &&& [data-summary-status] { grid-area: status; justify-self: end; }
  &&& [data-summary-action-space] { grid-area: action; inline-size: 4.5rem; block-size: 1.5rem; }
  &&& [data-summary-fact], &&& [data-summary-count], &&& [data-summary-status], &&& [data-summary-action-space] {
    position: relative;
    &::before {
      content: ""; position: absolute; inset-inline-start: var(--slip-header-separator-offset); inset-block-start: 50%;
      inline-size: 1px; block-size: 0.875rem; transform: translateY(-50%); background: ${({ theme }) => theme.color.border};
    }
  }
  &&&[data-shareable] [data-slip-summary] {
    grid-template-columns: minmax(0, 1fr) auto auto auto 5.75rem 4.5rem;
    grid-template-areas: "identity odds count average status action";
  }
  [data-slip-header-action] {
    position: absolute; inset-inline-end: 32px; inset-block-start: 4px; z-index: 2;
  }

  ${desktopMatchBaseStyles}
  [data-desktop-row][data-numbered-date] { --review-date-width: 4.65rem; }
  [data-numbered-date] [data-row-date] { display: flex; align-items: center; gap: 5px; }
  @media (pointer: coarse) {
    &&& [data-slip-summary] { min-block-size: 44px; }
  }
  @media (max-width: 79.99rem) {
    --slip-header-separator-offset: -5px;
    &&& [data-slip-summary] { column-gap: 9px; padding-inline-start: 8px; }
  }
`;

export const DesktopSlipLayout = styled(DesktopSlipBase)`${alignedLedgerStyles}`;
