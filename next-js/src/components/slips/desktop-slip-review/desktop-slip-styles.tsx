"use client";

import styled from "styled-components";
import { DesktopSlipBase } from "../desktop-slip/desktop-slip-styles";

/** Preview-only geometry; the selected production desktop presentation is unchanged. */
export const DesktopSlipLayout = styled(DesktopSlipBase)`
  --review-country-width: 5.75rem;
  --review-league-width: 7.25rem;
  --review-status-width: 7rem;
  --review-centre-width: 3.5rem;

  [data-desktop-row] {
    --desktop-columns: 3.15rem 4.45rem var(--review-country-width) var(--review-league-width) minmax(10rem, 1fr) 6.5rem 4.5rem 4.8rem var(--review-status-width);
    --review-outcome-text: ${({ theme }) => theme.color.outcome.pending.text};
    --review-outcome-fill: ${({ theme }) => theme.color.outcome.pending.background};
    --review-outcome-border: ${({ theme }) => theme.color.outcome.pending.border};
    grid-template-columns: var(--desktop-columns);
    column-gap: 4px; min-block-size: 36px; padding: 4px 10px;
  }
  [data-desktop-row][data-outcome="correct"] {
    --review-outcome-text: ${({ theme }) => theme.color.outcome.correct.text};
    --review-outcome-fill: ${({ theme }) => theme.color.outcome.correct.background};
    --review-outcome-border: ${({ theme }) => theme.color.outcome.correct.border};
  }
  [data-desktop-row][data-outcome="incorrect"] {
    --review-outcome-text: ${({ theme }) => theme.color.outcome.incorrect.text};
    --review-outcome-fill: ${({ theme }) => theme.color.outcome.incorrect.background};
    --review-outcome-border: ${({ theme }) => theme.color.outcome.incorrect.border};
  }
  [data-row-date], [data-row-time] { border: 0; padding: 0; }
  [data-row-country] {
    border-inline-start: 1px solid ${({ theme }) => theme.color.border}; padding-inline-start: 6px;
  }
  [data-row-league] { padding-inline-start: 2px; }
  [data-row-market], [data-row-odds], [data-row-status] {
    border-inline-start: 1px solid ${({ theme }) => theme.color.border}; padding-inline-start: 6px;
  }

  [data-row-teams] {
    display: grid; grid-template-columns: minmax(0, 1fr) var(--review-centre-width) minmax(0, 1fr);
    column-gap: 4px; justify-content: normal; align-items: center;
  }
  [data-home], [data-away] {
    display: grid; flex: none; inline-size: 100%; max-inline-size: none; gap: 4px;
  }
  [data-home] { grid-template-columns: minmax(0, 1fr) 0.8125rem; }
  [data-away] { grid-template-columns: 0.8125rem minmax(0, 1fr); }
  [data-home] [data-truncation], [data-away] [data-truncation] { inline-size: 100%; }
  [data-home] [data-truncation] { justify-content: flex-end; }
  [data-home] [data-team-logo] { justify-self: end; }
  [data-away] [data-team-logo] { justify-self: start; }
  [data-centre] {
    position: relative; display: grid; place-items: center; align-self: center;
    min-inline-size: 0; inline-size: 100%; block-size: 20px;
    color: ${({ theme }) => theme.color.text}; font-variant-numeric: tabular-nums;
  }
  [data-score] { display: block; inline-size: 2.1rem; text-align: center; font-size: 0.8125rem; line-height: 16px; }
  [data-clock] {
    position: absolute; inset-block-start: -8px; inset-inline-start: 50%; transform: translateX(-50%);
    color: ${({ theme }) => theme.color.mutedText}; font-size: 0.625rem; line-height: 10px;
    font-weight: ${({ theme }) => theme.typography.weight.medium};
  }
  [data-match-state="upcoming"] [data-score] {
    color: ${({ theme }) => theme.color.mutedText}; font-size: 0.6875rem;
    font-weight: ${({ theme }) => theme.typography.weight.medium};
  }
  [data-match-state="live"] [data-clock], [data-match-state="halftime"] [data-clock] { color: ${({ theme }) => theme.color.live.text}; }

  [data-row-status] {
    display: grid; grid-template-columns: 1fr; align-content: center; justify-items: center; gap: 0;
    min-inline-size: 0; inline-size: 100%; min-block-size: 26px; line-height: 12px;
  }
  [data-match-label] { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.625rem; font-weight: ${({ theme }) => theme.typography.weight.body}; }
  [data-outcome-label] { color: var(--review-outcome-text); font-size: 0.6875rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; }

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

  @media (pointer: coarse) { [data-desktop-row] { min-block-size: 44px; } }
`;
