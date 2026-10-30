"use client";

import { css } from "styled-components";
import { mobileStatusWidth } from "@/components/ui/status-badge";

/** Shared phone layout: team-aligned scores precede a compact status/facts column. */
export const teamStackStyles = css`
  display: grid;
  grid-template-columns: minmax(0, 1fr) ${mobileStatusWidth};
  grid-template-areas: "meta status" "teams facts";
  align-items: start;
  gap: 4px 6px;
  min-inline-size: 0;
  padding: 8px;
  color: ${({ theme }) => theme.color.text};
  font-size: 0.8125rem;
  line-height: 1.3;
  overflow-wrap: anywhere;
  [data-desktop-only] { display: none; }

  [data-ledger-meta] {
    grid-area: meta;
    display: grid;
    grid-template-columns: max-content max-content max-content minmax(0, 1fr);
    grid-template-areas: "number date clock league";
    align-items: center;
    gap: 5px;
    min-inline-size: 0;
    color: ${({ theme }) => theme.color.mutedText};
    font-size: 0.6875rem;
    line-height: 1.3;
  }
  &:not([data-numbered]) [data-ledger-meta] { grid-template-columns: max-content max-content minmax(0, 1fr); grid-template-areas: "date clock league"; }
  [data-match-number] {
    grid-area: number; display: grid; place-items: center; align-self: center;
    inline-size: 18px; block-size: 18px; padding: 0;
    color: ${({ theme }) => theme.color.link}; font-size: min(16px, calc(28px / var(--match-number-digits, 1)));
    background: ${({ theme }) => `color-mix(in srgb, ${theme.color.surface} 96%, ${theme.color.accent.blue.text})`};
    font-weight: ${({ theme }) => theme.typography.weight.heavy}; line-height: 1;
    font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  [data-ledger-competition], [data-ledger-league] {
    display: flex; align-items: center; gap: 4px; min-inline-size: 0;
  }
  [data-ledger-kickoff], [data-ledger-kickoff] > time,
  [data-ledger-kickoff] > span:not([data-match-number]) { display: contents; }
  [data-kickoff-date], [data-mobile-date] { grid-area: date; min-inline-size: 0; white-space: nowrap; }
  [data-kickoff-time], [data-mobile-clock] { grid-area: clock; white-space: nowrap; font-variant-numeric: tabular-nums; }
  [data-ledger-competition] { grid-area: league; justify-content: start; gap: 5px; }
  [data-ledger-league] { flex: 1; overflow: hidden; }
  [data-ledger-competition] [data-ledger-name] { min-inline-size: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  [data-ledger-country] { display: none; }
  [data-country-flag] { flex: none; inline-size: 15px; block-size: 10px; object-fit: contain; }
  [data-ledger-league] { --gh-logo-size: 11px; --gh-logo-font: 8px; }

  [data-ledger-teams] {
    grid-area: teams;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: repeat(2, minmax(1.125rem, auto));
    align-self: stretch;
    align-items: center;
    gap: 3px;
    min-inline-size: 0;
    margin: 0;
    padding-inline-end: 12px;
    --gh-logo-size: 18px;
    --gh-logo-font: 9px;
  }
  [data-ledger-teams]:has([data-score]) {
    grid-template-columns: minmax(0, 1fr) max-content;
    column-gap: 8px;
  }
  [data-ledger-teams] > [data-ledger-home],
  [data-ledger-teams] > [data-ledger-away] {
    display: flex; grid-column: 1; align-items: center; flex-direction: row;
    justify-content: start; gap: 5px; min-inline-size: 0; min-block-size: 1.125rem; align-self: stretch; text-align: start;
  }
  [data-ledger-home] { grid-row: 1; }
  [data-ledger-away] { grid-row: 2; }
  [data-ledger-teams] [data-team-name], [data-ledger-teams] [data-ledger-name] {
    flex: 1; min-inline-size: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
    font-size: 0.875rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; line-height: 1.3;
  }
  [data-ledger-versus] { display: none; }
  [data-ledger-teams] > [data-match-state], [data-ledger-teams] [data-score] { display: contents; }
  [data-stack-progress]:empty { display: none; }
  [data-ledger-teams] [data-score-home], [data-ledger-teams] [data-score-away] {
    grid-column: 2; align-self: center; justify-self: end;
    font-size: 1rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; line-height: 1.2;
    font-variant-numeric: tabular-nums;
  }
  [data-ledger-teams] [data-score-home] { grid-row: 1; }
  [data-ledger-teams] [data-score-away] { grid-row: 2; }
  [data-ledger-teams] [data-score-separator] { display: none; }
  [data-ledger-teams] [data-match-state="live"] [data-ledger-versus],
  [data-ledger-teams] [data-match-state="final"] [data-ledger-versus] {
    display: inline; grid-column: 2; grid-row: 1 / 3; align-self: center;
  }
  [data-score-clock], [data-match-phase] { display: none; }

  [data-ledger-facts] {
    grid-area: facts; display: grid; grid-template-columns: minmax(0, 1fr) max-content;
    grid-template-areas: "metrics metrics" "market pick";
    align-self: stretch; align-content: space-between;
    gap: 3px 6px; min-inline-size: 0; white-space: normal;
    font-variant-numeric: tabular-nums;
  }
  [data-ledger-facts] [data-match-metrics] {
    grid-area: metrics; display: grid; grid-template-columns: max-content minmax(0, 1fr);
    align-items: baseline; gap: 4px; min-inline-size: 0;
  }
  [data-ledger-field] { min-inline-size: 0; }
  [data-ledger-field="market"] { grid-area: market; display: block; align-self: end; overflow: visible; }
  [data-pick-state="none"] > [data-ledger-field="market"] { display: none; }
  [data-ledger-field="prediction"] { grid-area: pick; display: block; justify-self: end; text-align: end; }
  [data-ledger-field="market"]::before, [data-ledger-field="prediction"]::before { content: none; }
  [data-ledger-field="market"] [data-pick-value], [data-ledger-field="market"] [data-field-value] {
    display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
    color: ${({ theme }) => theme.color.mutedText}; font-size: 0.6875rem; font-weight: 400; line-height: 1.3;
  }
  [data-ledger-field="prediction"] [data-pick-value], [data-ledger-field="prediction"] [data-field-value] {
    display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
    color: ${({ theme }) => theme.color.link}; font-size: 0.75rem; font-weight: ${({ theme }) => theme.typography.weight.heavy}; line-height: 1.3;
  }
  [data-ledger-field="market"] [data-field-label], [data-ledger-field="prediction"] [data-field-label] { display: none; }
  [data-ledger-field="odds"], [data-ledger-field="probability"] {
    display: inline-flex; flex-direction: row; align-items: baseline; gap: 3px; padding: 0;
    flex: none;
    font-size: 0.6875rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; line-height: 1.3; white-space: nowrap;
  }
  [data-ledger-field="odds"] { grid-column: 1; }
  [data-ledger-field="probability"] { grid-column: 2; justify-content: space-between; }
  [data-ledger-field="odds"][data-stack-label]::before, [data-ledger-field="probability"][data-stack-label]::before {
    content: attr(data-stack-label); color: ${({ theme }) => theme.color.mutedText}; font-size: 0.625rem; font-weight: 400;
  }
  [data-ledger-field] [data-field-label] { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.625rem; font-weight: 400; }
  [data-ledger-field="odds"] [data-field-value], [data-ledger-field="probability"] [data-pick-value],
  [data-ledger-field="probability"] [data-field-value], [data-ledger-field="probability"] [data-public-probability] { font-size: 0.6875rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  [data-stack-result][data-result], [data-stack-result][data-result-badge] {
    grid-area: status; display: flex; align-items: center; justify-content: end;
    justify-self: end; align-self: start; inline-size: min(100%, ${mobileStatusWidth}); min-inline-size: 0;
  }
  [data-stack-result] [data-match-status] { inline-size: 100%; min-block-size: 1.25rem; font-size: 0.6875rem; }
  [data-stack-result] [data-status-clock] { white-space: normal; }
  [data-pick-state="subscriber"] [data-ledger-field="odds"] { display: none; }
  [data-pick-state="subscriber"] [data-ledger-field="market"] { display: none; }
  [data-pick-state="subscriber"] [data-ledger-field="prediction"] { grid-column: 1 / -1; justify-self: end; font-size: 0.6875rem; }
  [data-pick-state="none"] [data-ledger-field="prediction"] { grid-column: 1 / -1; }
  [data-pick-state="none"] [data-ledger-field="prediction"] [data-pick-value] { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.6875rem; }
  [data-pick-state="none"] [data-ledger-field="prediction"][data-no-pick] > [data-pick-value] { display: none; }
  [data-pick-state="none"] [data-ledger-field="prediction"] > b { display: block; font-size: 0.6875rem; white-space: nowrap; }
  [data-ledger-facts] [data-desktop-only] { display: none; }

  @container (max-width: 16rem) {
    grid-template-columns: minmax(0, 1fr) minmax(0, min(${mobileStatusWidth}, 65%));
    grid-template-areas: "status status" "meta meta" "teams facts";
    [data-ledger-facts] [data-match-metrics] { display: flex; flex-direction: column; }
    [data-match-metrics] [data-ledger-field] { inline-size: 100%; max-inline-size: 100%; flex-wrap: wrap; }
    [data-match-metrics] [data-ledger-field="probability"] { flex: none; }
    [data-ledger-field="probability"] > [data-pick-value],
    [data-ledger-field="probability"] > [data-field-value],
    [data-ledger-field="probability"] > [data-public-probability] { margin-inline-start: auto; }
  }
`;
