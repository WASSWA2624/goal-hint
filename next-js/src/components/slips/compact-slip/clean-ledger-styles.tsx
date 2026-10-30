"use client";

import styled from "styled-components";
import { cleanLedgerIdentityStyles } from "@/components/match/clean-ledger-styles";

/** The whole selection is a touch target; text and decoration stay compact within it. */
export const CleanLedgerRow = styled.div`
  display: grid; gap: 4px; padding: 6px 8px; min-inline-size: 0;
  color: ${({ theme }) => theme.color.text}; font-size: 0.75rem; line-height: 1.25; text-decoration: none;
  ${cleanLedgerIdentityStyles}
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: -2px; }
  @media (hover: hover) { &[href]:hover { background: ${({ theme }) => theme.color.rowHover}; } }
  [data-country-flag] { flex: none; inline-size: 1.5em; block-size: 1em; object-fit: contain; }
  [data-ledger-kickoff] > time { display: inline-flex; align-items: center; gap: 6px; }
  [data-ledger-facts] {
    display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: baseline; gap: 8px;
    min-inline-size: 0; font-variant-numeric: tabular-nums;
  }
  [data-ledger-field] { display: flex; align-items: baseline; gap: 4px; min-inline-size: 0; white-space: nowrap; }
  [data-field-label] { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.625rem; font-weight: 400; }
  [data-field-value] { font-size: 0.75rem; }
  [data-ledger-field="prediction"] strong { color: ${({ theme }) => theme.color.link}; }
  [data-result] { display: flex; justify-content: flex-end; gap: 6px; font-size: 0.625rem; font-weight: 700; }
  &[data-outcome="correct"] [data-result] { color: ${({ theme }) => theme.color.outcome.correct.text}; }
  &[data-outcome="incorrect"] [data-result] { color: ${({ theme }) => theme.color.outcome.incorrect.text}; }
  &[data-outcome="void"] [data-result] { color: ${({ theme }) => theme.color.outcome.void.text}; }
  @container compact-slip (max-width: 19rem) {
    padding-inline: 6px;
    [data-ledger-meta], [data-ledger-competition] { gap: 5px; }
    [data-ledger-facts] { column-gap: 5px; }
    [data-ledger-field] { column-gap: 3px; }
  }
  @container compact-slip (max-width: 12rem) {
    [data-ledger-meta] { grid-template-columns: minmax(0, 1fr); }
    [data-ledger-competition] { justify-content: flex-start; }
    [data-ledger-facts] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    [data-ledger-field] { flex-wrap: wrap; }
  }
`;
