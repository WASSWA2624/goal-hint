"use client";

import { css } from "styled-components";

/** Shared row structure for the Matches feed, published slips and the slip builder. */
export const desktopMatchBaseStyles = css`
  [data-desktop-row] {
    --desktop-columns: var(--gh-size-14) var(--gh-size-20_4) minmax(var(--gh-size-22), 1fr) minmax(var(--gh-size-15), 0.65fr) minmax(var(--gh-size-32), 2fr) minmax(var(--gh-size-26), 0.95fr) var(--gh-size-16_8) var(--gh-size-19_2);
    position: relative; display: grid; grid-template-columns: var(--desktop-columns);
    grid-template-rows: minmax(var(--gh-size-5), auto); align-items: center; column-gap: var(--gh-spacing-2);
    min-inline-size: 0; min-block-size: var(--gh-size-9); padding: var(--gh-spacing-1) var(--gh-spacing-3);
    color: ${({ theme }) => theme.color.text}; font-family: ${({ theme }) => theme.typography.family};
    font-size: var(--gh-font-body); line-height: var(--gh-leading-label);
    white-space: nowrap; overflow-wrap: normal; font-variant-numeric: tabular-nums;
  }
  [data-desktop-row] > * { min-inline-size: 0; }
  li:nth-child(even) > [data-desktop-row],
  li:nth-child(even) > [data-fixture-id] [data-desktop-row] { background: ${({ theme }) => theme.color.surfaceMuted}; }
  [data-desktop-row]:has(> [data-row-analysis]) { cursor: pointer; }
  [data-desktop-row] :is(a:not([data-row-analysis]), button, input, select, textarea) { position: relative; z-index: var(--gh-layer-raised); }
  @media (hover: hover) {
    [data-desktop-row]:has(> [data-row-analysis]):hover { background: var(--match-card-hover, ${({ theme }) => theme.color.rowHover}); }
  }
  [data-desktop-row]:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-size-0_5)); }
  [data-row-time] { white-space: normal; overflow-wrap: anywhere; }
  [data-row-date], [data-row-time], [data-row-league], [data-row-country] { color: ${({ theme }) => theme.color.mutedText}; }
  [data-row-date][data-kickoff-unknown] { grid-column: span 2; white-space: normal; }
  [data-row-league], [data-row-country], [data-row-market], [data-row-odds], [data-row-probability], [data-row-result] {
    display: flex; align-items: center; min-inline-size: 0; gap: var(--gh-spacing-1);
  }
  [data-row-teams] {
    display: flex; align-items: center; justify-content: flex-end;
    min-inline-size: 0; gap: var(--gh-spacing-1_25); margin: 0; font-size: var(--gh-font-body); line-height: var(--gh-size-5);
    font-weight: var(--gh-weight-semibold);
  }
  [data-home], [data-away] { display: flex; flex: 0 1 auto; align-items: center; min-inline-size: 0; max-inline-size: calc(50% - var(--gh-size-3)); gap: var(--gh-spacing-1); }
  [data-home] { justify-content: flex-end; }
  [data-home] [data-ellipsis-text] { text-align: end; }
  [data-versus] { flex: none; color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); font-weight: ${({ theme }) => theme.typography.weight.body}; }
  [data-truncation] { position: relative; display: inline-flex; flex: 1 1 auto; min-inline-size: 0; max-inline-size: 100%; }
  [data-ellipsis-text] { display: block; min-inline-size: 0; max-inline-size: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  [data-truncation]:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; outline-offset: var(--gh-size-0_5); }
  [data-team-logo] { --gh-logo-size: var(--gh-size-3_25); --gh-logo-font: var(--gh-size-1_75); --gh-logo-radius: 0; flex: none; }
  [data-row-league] [data-team-logo] { --gh-logo-size: var(--gh-size-3); }
  [data-country-flag] { flex: none; inline-size: var(--gh-size-4_5); block-size: var(--gh-size-3); object-fit: contain; }
  [data-row-market] { gap: var(--gh-spacing-1_25); }
  [data-row-market] > strong { color: ${({ theme }) => theme.color.link}; font-size: var(--gh-font-body); }
  [data-desktop-row] [data-market-label], [data-desktop-row] [data-number-label] { color: ${({ theme }) => theme.color.mutedText}; }
  [data-row-odds], [data-row-probability] { justify-content: flex-end; }
  [data-row-odds] strong, [data-row-probability] strong { font-size: var(--gh-font-body); }
  [data-row-result] { gap: var(--gh-spacing-1); justify-content: flex-end; font-size: var(--gh-font-secondary); }
  [data-desktop-row][data-outcome="correct"] [data-row-result] { color: ${({ theme }) => theme.color.outcome.correct.text}; }
  [data-desktop-row][data-outcome="incorrect"] [data-row-result] { color: ${({ theme }) => theme.color.outcome.incorrect.text}; }
  [data-desktop-row][data-outcome="void"] [data-row-result] { color: ${({ theme }) => theme.color.outcome.void.text}; }

  [data-row-details] {
    grid-column: 1 / -1; white-space: normal; color: ${({ theme }) => theme.color.mutedText};
    font-size: var(--gh-font-secondary); line-height: var(--gh-leading-normal);
  }
  @media (pointer: coarse) { [data-desktop-row] { min-block-size: var(--gh-size-11); } }
`;

/** The approved Aligned ledger presentation is identical in every desktop match context. */
export const alignedLedgerStyles = css`
  --review-country-width: var(--gh-size-23);
  --review-league-width: var(--gh-size-29);
  --review-status-width: var(--gh-size-28);
  --review-centre-width: var(--gh-size-14);

  [data-desktop-row] {
    --desktop-columns: var(--review-date-width, var(--gh-size-12_6)) var(--gh-size-17_8) var(--review-country-width) var(--review-league-width) minmax(0, 1fr) var(--gh-size-26) var(--gh-size-24) var(--gh-size-21) var(--review-status-width);
    --review-outcome-text: ${({ theme }) => theme.color.outcome.pending.text};
    --review-outcome-fill: ${({ theme }) => theme.color.outcome.pending.background};
    --review-outcome-border: ${({ theme }) => theme.color.outcome.pending.border};
    grid-template-columns: var(--desktop-columns);
    column-gap: var(--gh-spacing-1); min-block-size: var(--gh-size-9); padding: var(--gh-spacing-1) var(--gh-spacing-2_5);
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
    border-inline-start: 0; padding-inline-start: var(--gh-spacing-1_5);
  }
  [data-row-league] { padding-inline-start: var(--gh-spacing-0_5); }
  [data-row-market], [data-row-odds], [data-row-status] {
    border-inline-start: 0; padding-inline-start: var(--gh-spacing-1_5);
  }

  [data-row-teams] {
    display: grid; grid-template-columns: minmax(0, 1fr) var(--review-centre-width) minmax(0, 1fr);
    column-gap: var(--gh-spacing-1); justify-content: normal; align-items: center;
  }
  [data-home], [data-away] {
    display: grid; flex: none; inline-size: 100%; max-inline-size: none; gap: var(--gh-spacing-1);
  }
  [data-home] { grid-template-columns: minmax(0, 1fr) var(--gh-size-3_25); }
  [data-away] { grid-template-columns: var(--gh-size-3_25) minmax(0, 1fr); }
  [data-home] [data-truncation], [data-away] [data-truncation] { inline-size: 100%; }
  [data-home] [data-truncation] { justify-content: flex-end; }
  [data-home] [data-team-logo] { justify-self: end; }
  [data-away] [data-team-logo] { justify-self: start; }
  [data-centre] {
    position: relative; display: grid; place-items: center; align-self: center;
    min-inline-size: 0; inline-size: 100%; block-size: var(--gh-size-5);
    color: ${({ theme }) => theme.color.text}; font-variant-numeric: tabular-nums;
  }
  [data-score] { inline-size: 100%; text-align: center; }
  [data-clock] {
    position: absolute; inset-block-start: calc(-1 * var(--gh-spacing-1_25)); inset-inline-start: 50%; transform: translateX(-50%);
    color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-micro); line-height: var(--gh-size-2_5);
    font-weight: ${({ theme }) => theme.typography.weight.medium};
  }
  [data-match-state="upcoming"] [data-score] {
    color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-caption);
    font-weight: ${({ theme }) => theme.typography.weight.medium};
  }
  [data-match-state="live"] [data-clock], [data-match-state="halftime"] [data-clock] { color: ${({ theme }) => theme.color.live.text}; }

  [data-row-status] {
    display: flex; align-items: center; justify-content: center;
    min-inline-size: 0; inline-size: 100%; min-block-size: var(--gh-size-6_5);
    font-size: var(--gh-font-body); line-height: var(--gh-size-5); font-weight: ${({ theme }) => theme.typography.weight.bold};
  }

  [data-row-analysis] {
    position: absolute; inset: 0; z-index: var(--gh-layer-content); color: inherit; text-decoration: none;
    &:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-size-0_5)); }
  }
  [data-clock] { pointer-events: none; }
  @media (pointer: coarse) {
    [data-desktop-row] { min-block-size: var(--gh-size-11); }
  }
`;
