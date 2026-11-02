"use client";

import styled from "styled-components";
import { DesktopSlipBase, alignedLedgerStyles } from "../desktop-slip/desktop-slip-styles";

/** Review candidates extend the selected production Aligned ledger geometry. */
export const DesktopSlipLayout = styled(DesktopSlipBase)`
  ${alignedLedgerStyles}

  &[data-desktop-design="score-box"] {
    [data-centre] { background: ${({ theme }) => theme.color.brandSoft}; }
    [data-score] { color: ${({ theme }) => theme.color.link}; }
    [data-outcome-label] { border-block-end: var(--gh-stroke-strong) solid var(--review-outcome-border); }
  }
  &[data-desktop-design="inline-clock"] {
    --review-centre-width: var(--gh-size-18);
    [data-clock] { inset-block-start: var(--gh-spacing-1_25); inset-inline-start: calc(50% + var(--gh-size-4_4)); transform: none; }
    [data-row-status] { grid-template-columns: 1fr 1fr; column-gap: var(--gh-spacing-0_75); }
    [data-match-label], [data-outcome-label] { font-size: var(--gh-font-micro); }
  }
  &[data-desktop-design="status-rail"] {
    [data-row-status] { border-inline-start: var(--gh-stroke-focus) solid var(--review-outcome-border); background: var(--review-outcome-fill); }
    [data-centre] { border-block-end: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; }
  }
  &[data-desktop-design="split-status"] {
    [data-row-status] { grid-template-columns: 1fr 1fr; column-gap: 0; padding-inline-start: 0; }
    [data-match-label], [data-outcome-label] { display: grid; place-items: center; align-self: stretch; min-inline-size: 0; font-size: var(--gh-font-micro); }
    [data-outcome-label] { inline-size: 100%; border-inline-start: var(--gh-stroke-thin) solid var(--review-outcome-border); background: var(--review-outcome-fill); }
  }
  &[data-desktop-design="quiet-bands"] {
    li:nth-child(even) [data-desktop-row] { background: ${({ theme }) => theme.color.cardHeader}; }
    [data-row-market], [data-row-odds] { border-inline-start-color: transparent; }
    [data-row-status] { grid-template-columns: 1fr 1fr; column-gap: var(--gh-spacing-0_75); }
    [data-match-label], [data-outcome-label] { font-size: var(--gh-font-micro); }
  }
  &[data-desktop-design="live-highlight"] {
    [data-match-state="live"] [data-centre], [data-match-state="halftime"] [data-centre] {
      color: ${({ theme }) => theme.color.live.text}; background: ${({ theme }) => theme.color.live.soft};
    }
    [data-match-state="live"] [data-clock], [data-match-state="halftime"] [data-clock] {
      padding-inline: var(--gh-spacing-0_75); background: ${({ theme }) => theme.color.live.soft};
    }
    [data-row-status] { border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; padding-inline-start: 0; }
  }
  &[data-desktop-design="match-bracket"] {
    [data-centre] { border-inline: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.controlBorder}; }
    [data-score] { letter-spacing: var(--gh-tracking-wider); }
    [data-row-status] { border-inline-start: 0; border-inline-end: var(--gh-stroke-strong) solid var(--review-outcome-border); background: var(--review-outcome-fill); padding-inline-start: 0; }
  }
  &[data-desktop-design="outcome-block"] {
    --review-centre-width: var(--gh-size-18);
    [data-clock] { inset-block-start: var(--gh-spacing-1_25); inset-inline-start: calc(50% + var(--gh-size-4_4)); transform: none; }
    [data-row-status] { align-self: stretch; border-inline-start: 0; background: var(--review-outcome-fill); padding-inline-start: 0; }
    [data-outcome-label] { font-size: var(--gh-font-secondary); }
  }
  &[data-desktop-design="fine-grid"] {
    [data-row-league], [data-row-teams], [data-row-market], [data-row-odds], [data-row-probability], [data-row-status] {
      border-inline-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; padding-inline-start: var(--gh-spacing-1_5);
    }
    [data-row-status] { background: ${({ theme }) => theme.color.surfaceMuted}; }
    [data-score] { color: ${({ theme }) => theme.color.link}; }
  }

`;
