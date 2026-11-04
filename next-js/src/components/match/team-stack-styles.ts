"use client";

import { css } from "styled-components";
import { mobileStatusWidth } from "@/components/ui/status-badge";

/** Shared phone layout: team-aligned scores precede a compact status/facts column. */
export const teamStackStyles = css`
  display: grid;
  grid-template-columns: minmax(0, 1fr) ${mobileStatusWidth};
  grid-template-areas: "meta status" "teams facts";
  align-items: start;
  gap: var(--gh-spacing-1) var(--gh-spacing-1_5);
  min-inline-size: 0;
  padding: var(--gh-spacing-2);
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.typography.family};
  font-size: var(--gh-font-body);
  line-height: var(--gh-leading-label);
  overflow-wrap: anywhere;
  [data-desktop-only] { display: none; }

  [data-ledger-meta] {
    grid-area: meta;
    display: grid;
    grid-template-columns: max-content max-content max-content minmax(0, 1fr);
    grid-template-areas: "number date clock league";
    align-items: center;
    gap: var(--gh-spacing-1_25);
    min-inline-size: 0;
    color: ${({ theme }) => theme.color.mutedText};
    font-size: var(--gh-font-secondary);
    line-height: var(--gh-leading-label);
  }
  &:not([data-numbered]) [data-ledger-meta] { grid-template-columns: max-content max-content minmax(0, 1fr); grid-template-areas: "date clock league"; }
  [data-match-number] {
    grid-area: number; display: grid; place-items: center; align-self: center;
    inline-size: var(--gh-size-4_5); block-size: var(--gh-size-4_5); padding: 0;
    color: ${({ theme }) => theme.color.link}; font-size: min(var(--gh-font-section), calc(var(--gh-font-displaySmall) / var(--match-number-digits, 1)));
    background: ${({ theme }) => theme.color.brandSoft};
    font-weight: var(--gh-weight-bold); line-height: var(--gh-leading-solid);
    font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  [data-ledger-competition], [data-ledger-league] {
    display: flex; align-items: center; gap: var(--gh-spacing-1); min-inline-size: 0;
  }
  [data-ledger-kickoff], [data-ledger-kickoff] > time,
  [data-ledger-kickoff] > span:not([data-match-number]) { display: contents; }
  [data-kickoff-date], [data-mobile-date] { grid-area: date; min-inline-size: 0; white-space: nowrap; }
  [data-kickoff-time], [data-mobile-clock] { grid-area: clock; white-space: nowrap; font-variant-numeric: tabular-nums; }
  [data-ledger-competition] { grid-area: league; justify-content: start; gap: var(--gh-spacing-1_25); }
  [data-ledger-league] { flex: 1; overflow: hidden; }
  [data-ledger-competition] [data-ledger-name] { min-inline-size: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  [data-ledger-country] { display: none; }
  [data-country-flag] { flex: none; inline-size: var(--gh-size-3_75); block-size: var(--gh-size-2_5); object-fit: contain; }
  [data-ledger-league] { --gh-logo-size: var(--gh-size-2_75); --gh-logo-font: var(--gh-size-2); }

  [data-ledger-teams] {
    grid-area: teams;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: repeat(2, minmax(var(--gh-size-4_5), auto));
    align-self: stretch;
    align-items: center;
    gap: var(--gh-spacing-0_75);
    min-inline-size: 0;
    margin: 0;
    padding-inline-end: var(--gh-spacing-3);
    --gh-logo-size: var(--gh-font-body);
    --gh-logo-font: var(--gh-font-caption);
  }
  [data-ledger-teams]:has([data-score]) {
    grid-template-columns: minmax(0, 1fr) max-content;
    column-gap: var(--gh-spacing-2);
  }
  [data-ledger-teams] > [data-ledger-home],
  [data-ledger-teams] > [data-ledger-away] {
    display: flex; grid-column: 1; align-items: center; flex-direction: row;
    justify-content: start; gap: var(--gh-spacing-1_25); min-inline-size: 0; min-block-size: var(--gh-size-4_5); align-self: stretch; text-align: start;
  }
  [data-ledger-home] { grid-row: 1; }
  [data-ledger-away] { grid-row: 2; }
  [data-ledger-teams] [data-team-name], [data-ledger-teams] [data-ledger-name] {
    flex: 1; min-inline-size: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
    font-size: var(--gh-font-body); font-weight: var(--gh-weight-medium); line-height: var(--gh-leading-label);
  }
  [data-ledger-versus] { display: none; }
  [data-ledger-teams] > [data-match-state], [data-ledger-teams] [data-score] { display: contents; }
  [data-stack-progress]:empty { display: none; }
  [data-ledger-teams] [data-score-home], [data-ledger-teams] [data-score-away] {
    grid-column: 2; align-self: center; justify-self: end;
    font-size: var(--gh-font-section); font-weight: var(--gh-weight-medium); line-height: var(--gh-leading-control);
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
    gap: var(--gh-spacing-0_75) var(--gh-spacing-1_5); min-inline-size: 0; white-space: normal;
    font-variant-numeric: tabular-nums;
  }
  [data-ledger-facts] [data-match-metrics] {
    grid-area: metrics; display: grid; grid-template-columns: max-content minmax(0, 1fr);
    align-items: baseline; gap: var(--gh-spacing-1); min-inline-size: 0;
  }
  [data-ledger-field] { min-inline-size: 0; }
  [data-ledger-field="market"] { grid-area: market; display: block; align-self: end; overflow: visible; }
  [data-pick-state="none"] > [data-ledger-field="market"] { display: none; }
  [data-ledger-field="prediction"] { grid-area: pick; display: block; justify-self: end; text-align: end; }
  [data-ledger-field="market"]::before, [data-ledger-field="prediction"]::before { content: none; }
  [data-ledger-field="market"] [data-pick-value], [data-ledger-field="market"] [data-field-value] {
    display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
    color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-caption); font-weight: var(--gh-weight-body); line-height: var(--gh-leading-label);
  }
  [data-ledger-field="prediction"] [data-pick-value], [data-ledger-field="prediction"] [data-field-value] {
    display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
    color: ${({ theme }) => theme.color.link}; font-size: var(--gh-font-secondary); font-weight: ${({ theme }) => theme.typography.weight.heavy}; line-height: var(--gh-leading-label);
  }
  [data-ledger-field="market"] [data-field-label], [data-ledger-field="prediction"] [data-field-label] { display: none; }
  [data-ledger-field="odds"], [data-ledger-field="probability"] {
    display: inline-flex; flex-direction: row; align-items: baseline; gap: var(--gh-spacing-0_75); padding: 0;
    flex: none;
    font-size: var(--gh-font-caption); font-weight: ${({ theme }) => theme.typography.weight.bold}; line-height: var(--gh-leading-label); white-space: nowrap;
  }
  [data-ledger-field="odds"] { grid-column: 1; }
  [data-ledger-field="probability"] { grid-column: 2; justify-content: space-between; }
  [data-ledger-field="odds"][data-stack-label]::before, [data-ledger-field="probability"][data-stack-label]::before {
    content: attr(data-stack-label); color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-micro); font-weight: var(--gh-weight-body);
  }
  [data-ledger-field] [data-field-label] { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-micro); font-weight: var(--gh-weight-body); }
  [data-ledger-field="odds"] [data-field-value], [data-ledger-field="probability"] [data-pick-value],
  [data-ledger-field="probability"] [data-field-value], [data-ledger-field="probability"] [data-public-probability] { font-size: var(--gh-font-caption); font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  [data-stack-result][data-result], [data-stack-result][data-result-badge] {
    grid-area: status; display: flex; align-items: center; justify-content: end;
    justify-self: end; align-self: start; inline-size: min(100%, ${mobileStatusWidth}); min-inline-size: 0;
  }
  [data-stack-result] [data-match-status] { inline-size: 100%; min-block-size: var(--gh-size-5); font-size: var(--gh-font-caption); }
  [data-stack-result] [data-status-clock] { white-space: normal; }
  [data-pick-state="subscriber"] [data-ledger-field="odds"] { display: none; }
  [data-pick-state="subscriber"] [data-ledger-field="market"] { display: none; }
  [data-pick-state="subscriber"] [data-ledger-field="prediction"] { grid-column: 1 / -1; justify-self: end; font-size: var(--gh-font-caption); }
  [data-pick-state="none"] [data-ledger-field="prediction"] { grid-column: 1 / -1; }
  [data-pick-state="none"] [data-ledger-field="prediction"] [data-pick-value] { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-caption); }
  [data-pick-state="none"] [data-ledger-field="prediction"][data-no-pick] > [data-pick-value] { display: none; }
  [data-pick-state="none"] [data-ledger-field="prediction"] > b { display: block; font-size: var(--gh-font-caption); white-space: nowrap; }
  [data-ledger-facts] [data-desktop-only] { display: none; }

  @container (max-width: ${({ theme }) => theme.viewport[16]}) {
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
