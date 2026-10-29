"use client";

import styled from "styled-components";
import { alignedLedgerStyles, desktopMatchBaseStyles } from "@/components/match/desktop-match-styles";

export { alignedLedgerStyles } from "@/components/match/desktop-match-styles";

/** Shared desktop geometry for production slips and the design review. */
export const DesktopSlipBase = styled.div`
  min-inline-size: 0; position: relative;

  &&& [data-slip-summary] {
    grid-template-columns: minmax(13rem, 1fr) minmax(8.25rem, auto) minmax(7.5rem, auto) minmax(12rem, auto);
    grid-template-areas: "identity odds count average"; grid-template-rows: 1fr;
    min-block-size: 2.25rem; block-size: 2.25rem;
    column-gap: 24px; row-gap: 0; padding: 0 36px 0 12px;
    white-space: nowrap; font-size: 0.75rem; line-height: 1.25;
    background: ${({ theme }) => theme.color.surface};
  }
  &&& [data-summary-identity] { flex-wrap: nowrap; align-items: center; gap: 9px; padding-inline-start: 2px; white-space: nowrap; font-size: 0.875rem; }
  &&& [data-rank] { font-size: 0.75rem; }
  &&& [data-summary-fact] { flex-wrap: nowrap; flex-direction: row; align-items: baseline; gap: 6px; }
  &&& [data-summary-fact] strong { font-size: 0.875rem; }
  &&& [data-summary-odds] { justify-self: start; min-inline-size: 0; max-inline-size: 14rem; }
  &&& [data-summary-odds] strong { min-inline-size: 0; flex-shrink: 1; overflow: hidden; text-overflow: ellipsis; }
  &&& [data-summary-count], &&& [data-summary-average] { justify-self: end; }
  &&& [data-summary-average] [data-fact-label] { max-inline-size: none; }
  &&&[data-shareable] [data-slip-summary] {
    grid-template-columns: minmax(8.25rem, 1fr) auto auto auto;
    column-gap: 18px; padding-inline-end: 116px;
  }
  [data-slip-header-action] {
    position: absolute; inset-inline-end: 31px; inset-block-start: 4px; z-index: 2;
  }

  ${desktopMatchBaseStyles}
  @media (pointer: coarse) {
    &&& [data-slip-summary] { min-block-size: 44px; block-size: max(44px, 2.25rem); }
  }
`;

export const DesktopSlipLayout = styled(DesktopSlipBase)`${alignedLedgerStyles}`;
