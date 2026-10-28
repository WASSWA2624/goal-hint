"use client";

import { css } from "styled-components";

/** Shared mobile identity geometry for feeds, slip selections and the approved review sample. */
export const cleanLedgerIdentityStyles = css`
  [data-ledger-meta] {
    display: grid; grid-template-columns: max-content minmax(0, 1fr); align-items: center; gap: 8px;
    min-inline-size: 0; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.625rem; line-height: 1.3;
  }
  [data-ledger-kickoff], [data-ledger-competition], [data-ledger-league], [data-ledger-country] {
    display: flex; align-items: center; gap: 4px; min-inline-size: 0;
  }
  [data-ledger-kickoff] { gap: 6px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  [data-ledger-competition] { justify-content: flex-end; gap: 7px; }
  [data-ledger-league] { --gh-logo-size: 0.625rem; --gh-logo-font: 0.45rem; }
  [data-ledger-country] { flex-shrink: 0; }
  [data-ledger-name] { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  [data-ledger-teams] {
    display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center;
    gap: 6px; min-inline-size: 0; margin: 0; font-size: 0.8125rem; line-height: 1.3; font-weight: 700;
    --gh-logo-size: 0.8125rem; --gh-logo-font: 0.5rem;
  }
  [data-ledger-home], [data-ledger-away] { display: flex; align-items: center; gap: 4px; min-inline-size: 0; }
  [data-ledger-home] { justify-content: flex-end; }
  [data-ledger-versus] { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.625rem; font-weight: 600; }
`;
