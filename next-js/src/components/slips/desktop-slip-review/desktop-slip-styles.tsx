"use client";

import styled from "styled-components";
import { DesktopSlipBase, alignedLedgerStyles } from "../desktop-slip/desktop-slip-styles";

/** Review candidates extend the selected production Aligned ledger geometry. */
export const DesktopSlipLayout = styled(DesktopSlipBase)`
  ${alignedLedgerStyles}

  &[data-desktop-design="score-box"] {
    [data-centre] { background: ${({ theme }) => theme.color.brandSoft}; }
    [data-score] { color: ${({ theme }) => theme.color.link}; }
    [data-outcome-label] { border-block-end: 2px solid var(--review-outcome-border); }
  }
  &[data-desktop-design="inline-clock"] {
    --review-centre-width: 4.5rem;
    [data-clock] { inset-block-start: 5px; inset-inline-start: calc(50% + 1.1rem); transform: none; }
    [data-row-status] { grid-template-columns: 1fr 1fr; column-gap: 3px; }
    [data-match-label], [data-outcome-label] { font-size: 0.625rem; }
  }
  &[data-desktop-design="status-rail"] {
    [data-row-status] { border-inline-start: 3px solid var(--review-outcome-border); background: var(--review-outcome-fill); }
    [data-centre] { border-block-end: 1px solid ${({ theme }) => theme.color.border}; }
  }
  &[data-desktop-design="split-status"] {
    [data-row-status] { grid-template-columns: 1fr 1fr; column-gap: 0; padding-inline-start: 0; }
    [data-match-label], [data-outcome-label] { display: grid; place-items: center; align-self: stretch; min-inline-size: 0; font-size: 0.625rem; }
    [data-outcome-label] { inline-size: 100%; border-inline-start: 1px solid var(--review-outcome-border); background: var(--review-outcome-fill); }
  }
  &[data-desktop-design="quiet-bands"] {
    li:nth-child(even) [data-desktop-row] { background: ${({ theme }) => theme.color.cardHeader}; }
    [data-row-market], [data-row-odds] { border-inline-start-color: transparent; }
    [data-row-status] { grid-template-columns: 1fr 1fr; column-gap: 3px; }
    [data-match-label], [data-outcome-label] { font-size: 0.625rem; }
  }
  &[data-desktop-design="live-highlight"] {
    [data-match-state="live"] [data-centre], [data-match-state="halftime"] [data-centre] {
      color: ${({ theme }) => theme.color.live.text}; background: ${({ theme }) => theme.color.live.soft};
    }
    [data-match-state="live"] [data-clock], [data-match-state="halftime"] [data-clock] {
      padding-inline: 3px; background: ${({ theme }) => theme.color.live.soft};
    }
    [data-row-status] { border: 1px solid ${({ theme }) => theme.color.border}; padding-inline-start: 0; }
  }
  &[data-desktop-design="match-bracket"] {
    [data-centre] { border-inline: 1px solid ${({ theme }) => theme.color.controlBorder}; }
    [data-score] { letter-spacing: 0.04em; }
    [data-row-status] { border-inline-start: 0; border-inline-end: 2px solid var(--review-outcome-border); background: var(--review-outcome-fill); padding-inline-start: 0; }
  }
  &[data-desktop-design="outcome-block"] {
    --review-centre-width: 4.5rem;
    [data-clock] { inset-block-start: 5px; inset-inline-start: calc(50% + 1.1rem); transform: none; }
    [data-row-status] { align-self: stretch; border-inline-start: 0; background: var(--review-outcome-fill); padding-inline-start: 0; }
    [data-outcome-label] { font-size: 0.75rem; }
  }
  &[data-desktop-design="fine-grid"] {
    [data-row-league], [data-row-teams], [data-row-market], [data-row-odds], [data-row-probability], [data-row-status] {
      border-inline-start: 1px solid ${({ theme }) => theme.color.border}; padding-inline-start: 6px;
    }
    [data-row-status] { background: ${({ theme }) => theme.color.surfaceMuted}; }
    [data-score] { color: ${({ theme }) => theme.color.link}; }
  }

`;
