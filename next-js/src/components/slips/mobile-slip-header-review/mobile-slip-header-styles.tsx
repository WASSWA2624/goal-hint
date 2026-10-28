"use client";

import styled from "styled-components";

/** Only this review's summary changes. Expanded matches retain the production Clean ledger styles. */
export const HeaderRow = styled.summary`
  --header-status-ink: ${({ theme }) => theme.color.outcome.pending.text};
  --header-status-fill: ${({ theme }) => theme.color.outcome.pending.background};
  display: grid; grid-template-columns: auto auto minmax(max-content, 1fr) auto auto 6px;
  align-items: center; gap: 6px; min-inline-size: 0; min-block-size: 44px;
  padding: 4px 7px; box-sizing: border-box; list-style: none; cursor: pointer;
  color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.cardHeader};
  font-size: 0.6875rem; line-height: 1.2; white-space: nowrap; font-variant-numeric: tabular-nums;
  &::-webkit-details-marker { display: none; }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: -2px; }
  &[data-header-only] { cursor: default; }
  > h3 { margin: 0; font-size: 0.75rem; font-weight: 800; line-height: 1.2; white-space: nowrap; }
  [data-header-field] { position: relative; display: inline-flex; align-items: baseline; gap: 3px; min-inline-size: 0; white-space: nowrap; }
  [data-header-field] strong { font-size: 0.6875rem; font-weight: 700; }
  [data-header-label] { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.625rem; font-weight: 400; }
  [data-label-symbol], [data-label-icon], [data-count-compact], [data-status-compact], [data-status-icon] { display: none; }
  [data-label-icon], [data-count-icon], [data-status-icon] { flex: none; inline-size: 0.6875rem; block-size: 0.6875rem; align-self: center; }
  [data-count-icon] { display: none; }
  [data-header-status] { display: flex; align-items: center; gap: 3px; color: var(--header-status-ink); font-size: 0.625rem; font-weight: 700; }
  &[data-header-outcome="won"] { --header-status-ink: ${({ theme }) => theme.color.outcome.correct.text}; --header-status-fill: ${({ theme }) => theme.color.outcome.correct.background}; }
  &[data-header-outcome="lost"] { --header-status-ink: ${({ theme }) => theme.color.outcome.incorrect.text}; --header-status-fill: ${({ theme }) => theme.color.outcome.incorrect.background}; }
  &[data-header-outcome="void"] { --header-status-ink: ${({ theme }) => theme.color.outcome.void.text}; --header-status-fill: ${({ theme }) => theme.color.outcome.void.background}; }
  [data-header-chevron] { justify-self: end; inline-size: 5px; block-size: 5px; border-inline-end: 1.5px solid currentColor; border-block-end: 1.5px solid currentColor; transform: rotate(45deg); }
  details[open] > & [data-header-chevron] { transform: rotate(225deg); }
  &[data-header-only] [data-header-chevron] { visibility: hidden; }

  &[data-header-variant="vertical-rules"] {
    [data-header-field], [data-header-status] { border-inline-start: 1px solid ${({ theme }) => theme.color.border}; padding-inline-start: 5px; }
  }
  &[data-header-variant="icon-labels"] {
    [data-label-word], [data-label-symbol], [data-count-word] { display: none; }
    [data-label-icon], [data-count-icon], [data-status-icon] { display: inline; }
    [data-header-field] { align-items: center; }
  }
  &[data-header-variant="outlined-facts"] {
    [data-header-field] { padding: 3px 4px; outline: 1px solid ${({ theme }) => theme.color.border}; outline-offset: -1px; }
  }
  &[data-header-variant="number-tab"] {
    > h3 { align-self: stretch; display: flex; align-items: center; padding-inline: 5px; color: ${({ theme }) => theme.color.onBrand}; background: ${({ theme }) => theme.color.brand}; }
  }
  &[data-header-variant="outcome-endcap"] {
    [data-header-status] { align-self: stretch; justify-content: center; padding-inline: 5px; background: var(--header-status-fill); }
    [data-status-icon] { display: inline; }
  }
  &[data-header-variant="aligned-tracks"] {
    grid-template-columns: auto minmax(max-content, 1fr) minmax(max-content, 1fr) auto auto 6px;
    [data-header-field] { justify-content: flex-end; }
    [data-header-field] strong { font-weight: 800; }
  }
  &[data-header-variant="probability-line"] {
    [data-header-field="probability"] { padding-block: 3px; }
    [data-header-field="probability"]::after { content: ""; position: absolute; inset-inline-start: 0; inset-block-end: 0; inline-size: var(--header-probability); block-size: 2px; background: ${({ theme }) => theme.color.brand}; }
  }
  &[data-header-variant="ticket-dividers"] {
    [data-header-field] { border-inline-start: 1px dashed ${({ theme }) => theme.color.controlBorder}; padding-inline-start: 5px; }
    [data-header-field] strong { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
  }
  &[data-header-variant="minimal-notation"] {
    background: ${({ theme }) => theme.color.surface};
    [data-label-word], [data-count-word], [data-status-full] { display: none; }
    [data-label-symbol], [data-count-icon], [data-status-compact], [data-status-icon] { display: inline; }
    [data-header-field] strong { font-weight: 600; }
  }

  @container compact-slip (max-width: 19rem) {
    gap: 4px; padding-inline: 6px;
    > h3 { font-size: 0.6875rem; }
    [data-label-word], [data-count-word], [data-status-full] { display: none; }
    [data-label-symbol], [data-count-compact], [data-status-compact] { display: inline; }
    &[data-header-variant="icon-labels"] [data-label-symbol] { display: none; }
    &[data-header-variant="icon-labels"] [data-count-compact],
    &[data-header-variant="minimal-notation"] [data-count-compact] { display: none; }
    &[data-header-variant="outlined-facts"] [data-header-field] { padding-inline: 3px; }
    &[data-header-variant="vertical-rules"] [data-header-field],
    &[data-header-variant="vertical-rules"] [data-header-status],
    &[data-header-variant="ticket-dividers"] [data-header-field] { padding-inline-start: 3px; }
  }
  @container compact-slip (max-width: 12rem) {
    grid-template-columns: repeat(5, max-content) 6px;
    overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; contain: paint;
  }
`;
