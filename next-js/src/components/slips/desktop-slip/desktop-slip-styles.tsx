"use client";

import styled from "styled-components";
import { alignedLedgerStyles, desktopMatchBaseStyles } from "@/components/match/desktop-match-styles";

export { alignedLedgerStyles } from "@/components/match/desktop-match-styles";

/** Shared desktop geometry for production slips and the design review. */
export const DesktopSlipBase = styled.div`
  min-inline-size: 0; position: relative;

  &&& [data-slip-summary] {
    grid-template-columns: minmax(0, 1fr) auto auto auto 4.5rem;
    grid-template-areas: "identity odds count average status"; grid-template-rows: auto;
    min-block-size: 2.25rem; block-size: auto;
    column-gap: 14px; row-gap: 0; padding: 4px 32px 4px 12px;
    white-space: nowrap; font-size: 0.75rem; line-height: 1.25;
    background: ${({ theme }) => theme.color.surface};
  }
  &&& [data-summary-identity] { flex-wrap: wrap; align-items: center; gap: 3px 9px; padding-inline-start: 2px; white-space: nowrap; font-size: 0.875rem; }
  &&& [data-rank] { font-size: 0.75rem; }
  &&& [data-summary-fact] { flex-wrap: nowrap; flex-direction: row; align-items: baseline; gap: 6px; }
  &&& [data-summary-fact] strong { font-size: 0.875rem; }
  &&& [data-summary-odds] { justify-self: start; min-inline-size: 0; max-inline-size: 14rem; }
  &&& [data-summary-odds] strong { min-inline-size: 0; flex-shrink: 1; overflow: hidden; text-overflow: ellipsis; }
  &&& [data-summary-count], &&& [data-summary-average] { justify-self: end; }
  &&& [data-summary-average] [data-fact-label] { max-inline-size: none; }
  &&& [data-summary-status] { grid-area: status; justify-self: end; }
  &&& [data-summary-action-space] { grid-area: action; inline-size: 4.5rem; }
  &&&[data-shareable] [data-slip-summary] {
    grid-template-columns: minmax(0, 1fr) auto auto auto 4.5rem 4.5rem;
    grid-template-areas: "identity odds count average action status";
  }
  [data-slip-header-action] {
    position: absolute; inset-inline-end: calc(32px + 4.5rem + 14px); inset-block-start: 4px; z-index: 2;
  }

  ${desktopMatchBaseStyles}
  @media (pointer: coarse) {
    &&& [data-slip-summary] { min-block-size: 44px; }
  }
  @media (max-width: 79.99rem) {
    &&& [data-slip-summary] { column-gap: 9px; padding-inline-start: 8px; }
    [data-slip-header-action] { inset-inline-end: calc(32px + 4.5rem + 9px); }
  }
`;

export const DesktopSlipLayout = styled(DesktopSlipBase)`${alignedLedgerStyles}`;
