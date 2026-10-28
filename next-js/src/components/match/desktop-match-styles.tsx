"use client";

import { css } from "styled-components";

/** Shared row structure for the Matches feed, published slips and the slip builder. */
export const desktopMatchBaseStyles = css`
  [data-desktop-row] {
    --desktop-columns: 3.5rem 5.1rem minmax(5.5rem, 1fr) minmax(3.75rem, 0.65fr) minmax(8rem, 2fr) minmax(6.5rem, 0.95fr) 4.2rem 4.8rem;
    position: relative; display: grid; grid-template-columns: var(--desktop-columns);
    grid-template-rows: minmax(1.25rem, auto); align-items: center; column-gap: 8px;
    min-inline-size: 0; min-block-size: 2.25rem; padding: 4px 12px;
    color: ${({ theme }) => theme.color.text}; font-size: 0.75rem; line-height: 1.25rem;
    white-space: nowrap; overflow-wrap: normal; font-variant-numeric: tabular-nums;
  }
  [data-desktop-row] > * { min-inline-size: 0; }
  [data-desktop-row]:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: -2px; }
  [data-row-time] { white-space: normal; overflow-wrap: anywhere; }
  [data-row-date], [data-row-time], [data-row-league], [data-row-country] { color: ${({ theme }) => theme.color.mutedText}; }
  [data-row-date][data-kickoff-unknown] { grid-column: span 2; white-space: normal; }
  [data-row-league], [data-row-country], [data-row-market], [data-row-odds], [data-row-probability], [data-row-result] {
    display: flex; align-items: center; min-inline-size: 0; gap: 4px;
  }
  [data-row-teams] {
    display: flex; align-items: center; justify-content: flex-end;
    min-inline-size: 0; gap: 5px; margin: 0; font-size: 0.8125rem; line-height: 1.25rem;
    font-weight: ${({ theme }) => theme.typography.weight.bold};
  }
  [data-home], [data-away] { display: flex; flex: 0 1 auto; align-items: center; min-inline-size: 0; max-inline-size: calc(50% - 0.75rem); gap: 4px; }
  [data-home] { justify-content: flex-end; }
  [data-home] [data-ellipsis-text] { text-align: end; }
  [data-versus] { flex: none; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; font-weight: ${({ theme }) => theme.typography.weight.body}; }
  [data-truncation] { position: relative; display: inline-flex; flex: 1 1 auto; min-inline-size: 0; max-inline-size: 100%; }
  [data-ellipsis-text] { display: block; min-inline-size: 0; max-inline-size: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  [data-truncation]:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
  [data-team-logo] { --gh-logo-size: 0.8125rem; --gh-logo-font: 0.4375rem; --gh-logo-radius: 0; flex: none; }
  [data-row-league] [data-team-logo] { --gh-logo-size: 0.75rem; }
  [data-country-flag] { flex: none; inline-size: 1.125rem; block-size: 0.75rem; object-fit: contain; }
  [data-row-market] { gap: 5px; }
  [data-row-market] > strong { color: ${({ theme }) => theme.color.link}; font-size: 0.8125rem; }
  [data-desktop-row] [data-market-label], [data-desktop-row] [data-number-label] { color: ${({ theme }) => theme.color.mutedText}; }
  [data-row-odds], [data-row-probability] { justify-content: flex-end; }
  [data-row-odds] strong, [data-row-probability] strong { font-size: 0.8125rem; }
  [data-row-result] { gap: 4px; justify-content: flex-end; font-size: 0.75rem; }
  [data-desktop-row][data-outcome="correct"] [data-row-result] { color: ${({ theme }) => theme.color.outcome.correct.text}; }
  [data-desktop-row][data-outcome="incorrect"] [data-row-result] { color: ${({ theme }) => theme.color.outcome.incorrect.text}; }
  [data-desktop-row][data-outcome="void"] [data-row-result] { color: ${({ theme }) => theme.color.outcome.void.text}; }

  [data-row-details] {
    grid-column: 1 / -1; white-space: normal; color: ${({ theme }) => theme.color.mutedText};
    font-size: 0.75rem; line-height: 1.5;
  }
  @media (pointer: coarse) { [data-desktop-row] { min-block-size: 44px; } }
`;

/** The approved Aligned ledger presentation is identical in every desktop match context. */
export const alignedLedgerStyles = css`
  --review-country-width: 5.75rem;
  --review-league-width: 7.25rem;
  --review-status-width: 7rem;
  --review-centre-width: 3.5rem;

  [data-desktop-row] {
    --desktop-columns: 3.15rem 4.45rem var(--review-country-width) var(--review-league-width) minmax(0, 1fr) 6.5rem 6rem 5.25rem var(--review-status-width);
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
  [data-desktop-row][data-outcome="void"] {
    --review-outcome-text: ${({ theme }) => theme.color.outcome.void.text};
    --review-outcome-fill: ${({ theme }) => theme.color.outcome.void.background};
    --review-outcome-border: ${({ theme }) => theme.color.outcome.void.border};
  }
  [data-desktop-row][data-outcome="unavailable"] {
    --review-outcome-text: ${({ theme }) => theme.color.outcome.unavailable.text};
    --review-outcome-fill: ${({ theme }) => theme.color.outcome.unavailable.background};
    --review-outcome-border: ${({ theme }) => theme.color.outcome.unavailable.border};
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

  [data-row-analysis] {
    position: absolute; inset-inline-start: 50%; inset-block-start: 50%; transform: translate(-50%, -50%);
    display: inline-flex; align-items: center; justify-content: center;
    min-inline-size: 24px; min-block-size: 24px; color: inherit; font: inherit; text-decoration: none;
    &:hover { text-decoration: underline; }
    &:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: 1px; }
  }
  [data-clock] { pointer-events: none; }
  @media (pointer: coarse) {
    [data-desktop-row] { min-block-size: 44px; }
    [data-row-analysis] { min-inline-size: 44px; min-block-size: 44px; }
  }
`;
