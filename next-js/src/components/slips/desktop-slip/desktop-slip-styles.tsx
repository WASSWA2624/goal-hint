"use client";

import styled from "styled-components";
import { alignedLedgerStyles, desktopMatchBaseStyles } from "@/components/match/desktop-match-styles";

export { alignedLedgerStyles } from "@/components/match/desktop-match-styles";

/** Shared desktop geometry for production slips and the design review. */
export const DesktopSlipBase = styled.div`
  min-inline-size: 0;

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
  &&& [data-summary-odds] { justify-self: start; }
  &&& [data-summary-count], &&& [data-summary-average] { justify-self: end; }
  &&& [data-summary-average] [data-fact-label] { max-inline-size: none; }

  ${desktopMatchBaseStyles}
  @media (pointer: coarse) {
    &&& [data-slip-summary] { min-block-size: 44px; block-size: max(44px, 2.25rem); }
  }
`;

export const DesktopSlipLayout = styled(DesktopSlipBase)`${alignedLedgerStyles}`;
