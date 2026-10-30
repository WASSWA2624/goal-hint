"use client";

import { css } from "styled-components";

/** The approved phone layout is shared by feed cards and immutable slip selections. */
export const teamStackStyles = css`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(min-content, 32%);
  grid-template-areas: "meta meta" "teams forecast" "result forecast";
  align-items: start;
  gap: 5px 10px;
  min-inline-size: 0;
  padding: 8px 10px;
  color: ${({ theme }) => theme.color.text};
  font-size: 0.8125rem;
  line-height: 1.3;
  overflow-wrap: anywhere;

  [data-ledger-meta] {
    grid-area: meta;
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    align-items: center;
    gap: 6px;
    min-inline-size: 0;
    color: ${({ theme }) => theme.color.mutedText};
    font-size: 0.6875rem;
    line-height: 1.3;
  }
  [data-ledger-kickoff], [data-ledger-kickoff] > time,
  [data-ledger-competition], [data-ledger-league], [data-ledger-country] {
    display: flex; align-items: center; gap: 4px; min-inline-size: 0;
  }
  [data-ledger-kickoff] { gap: 6px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  [data-ledger-competition] { justify-content: end; gap: 5px; }
  [data-ledger-competition] [data-ledger-name] { min-inline-size: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  [data-ledger-country] { flex-shrink: 0; }
  [data-country-flag] { flex: none; inline-size: 15px; block-size: 10px; object-fit: contain; }
  [data-ledger-league] { --gh-logo-size: 11px; --gh-logo-font: 8px; }

  [data-ledger-teams] {
    grid-area: teams;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: 5px;
    min-inline-size: 0;
    margin: 0;
    --gh-logo-size: 18px;
    --gh-logo-font: 9px;
  }
  [data-ledger-teams] > [data-ledger-home],
  [data-ledger-teams] > [data-ledger-away] {
    display: flex; grid-column: 1; align-items: center; flex-direction: row;
    justify-content: start; gap: 5px; min-inline-size: 0; text-align: start;
  }
  [data-ledger-home] { grid-row: 1; }
  [data-ledger-away] { grid-row: 2; }
  [data-ledger-teams] [data-team-name], [data-ledger-teams] [data-ledger-name] {
    flex: 1; min-inline-size: 0; overflow: visible; white-space: normal; text-overflow: clip;
    font-size: 0.875rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; line-height: 1.3;
  }
  [data-ledger-versus] { display: none; }
  [data-stack-result] > [data-match-state] {
    display: flex; flex-wrap: wrap; flex-direction: row;
    align-items: center; justify-content: start; gap: 5px;
  }
  [data-stack-progress]:empty { display: none; }
  [data-stack-result] [data-match-state="live"] [data-ledger-versus],
  [data-stack-result] [data-match-state="final"] [data-ledger-versus] { display: inline; }
  [data-score-clock] { transform: none; font-size: 0.6875rem; font-weight: 600; line-height: 1.2; }
  &[data-status="live"] [data-score-clock] { color: ${({ theme }) => theme.color.live.text}; }

  [data-ledger-facts] {
    grid-area: forecast;
    display: grid;
    grid-template-columns: max-content max-content;
    grid-template-areas: "market market" "pick pick" "odds probability";
    align-items: start;
    align-self: center;
    justify-content: start;
    gap: 3px 10px;
    min-inline-size: 0;
    white-space: normal;
    font-variant-numeric: tabular-nums;
  }
  [data-ledger-field] { min-inline-size: 0; }
  [data-ledger-field="market"] { grid-area: market; display: block; overflow: visible; }
  [data-pick-state="none"] > [data-ledger-field="market"] { display: none; }
  [data-ledger-field="prediction"] { grid-area: pick; display: block; }
  [data-ledger-field="market"]::before, [data-ledger-field="prediction"]::before { content: none; }
  [data-ledger-field="market"] [data-pick-value], [data-ledger-field="market"] [data-field-value] {
    display: block; overflow: visible; white-space: normal; text-overflow: clip;
    color: ${({ theme }) => theme.color.mutedText}; font-size: 0.6875rem; font-weight: 400; line-height: 1.3;
  }
  [data-ledger-field="prediction"] [data-pick-value], [data-ledger-field="prediction"] [data-field-value] {
    display: block; overflow: visible; white-space: normal; text-overflow: clip;
    color: ${({ theme }) => theme.color.link}; font-size: 0.875rem; font-weight: ${({ theme }) => theme.typography.weight.heavy}; line-height: 1.3;
  }
  [data-ledger-field="market"] [data-field-label], [data-ledger-field="prediction"] [data-field-label] { display: none; }
  [data-ledger-field="odds"], [data-ledger-field="probability"] {
    display: flex; flex-direction: column; align-items: start; gap: 1px; padding-block-start: 3px;
    font-size: 0.875rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; line-height: 1.3; white-space: nowrap;
  }
  [data-ledger-field="odds"] { grid-area: odds; }
  [data-ledger-field="probability"] { grid-area: probability; }
  [data-ledger-field="odds"][data-stack-label]::before, [data-ledger-field="probability"][data-stack-label]::before {
    content: attr(data-stack-label); color: ${({ theme }) => theme.color.mutedText}; font-size: 0.6875rem; font-weight: 400;
  }
  [data-ledger-field] [data-field-label] { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.6875rem; font-weight: 400; }
  [data-ledger-field="odds"] [data-field-value], [data-ledger-field="probability"] [data-pick-value],
  [data-ledger-field="probability"] [data-field-value], [data-ledger-field="probability"] [data-public-probability] { font-size: 0.875rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  [data-stack-result][data-result], [data-stack-result][data-result-badge] {
    grid-area: result; display: flex; flex-wrap: wrap; align-items: center; justify-content: start;
    justify-self: start; align-self: start; gap: 5px; min-inline-size: 0;
  }
  [data-stack-result] [data-match-status] { inline-size: auto; min-block-size: 1.25rem; font-size: 0.6875rem; }
  [data-pick-state="subscriber"][data-ledger-facts] {
    grid-template-columns: minmax(0, 1fr); grid-template-areas: "market" "pick" "probability";
  }
  [data-pick-state="subscriber"] [data-ledger-field="odds"] { display: none; }
  [data-pick-state="none"] [data-ledger-field="prediction"] { grid-column: 1 / -1; }
  [data-pick-state="none"] [data-ledger-field="prediction"] [data-pick-value] { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.6875rem; }
  [data-ledger-facts] [data-desktop-only] { display: none; }

  @container (max-width: 16rem) {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: "meta" "teams" "forecast" "result";
    [data-ledger-meta] { grid-template-columns: minmax(0, 1fr); }
    [data-ledger-competition] { justify-content: start; }
    [data-ledger-facts] { align-self: start; }
    [data-pick-state="subscriber"][data-ledger-facts] { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "market probability" "pick probability"; }
  }
`;
