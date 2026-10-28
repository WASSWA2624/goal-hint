"use client";

import styled from "styled-components";

/** Shared tracks keep every divider fixed while only the review header's treatment changes. */
export const HeaderRow = styled.summary`
  --header-height: 32px;
  --header-rule: ${({ theme }) => theme.color.border};
  --header-status-ink: ${({ theme }) => theme.color.outcome.pending.text};
  --header-status-fill: ${({ theme }) => theme.color.outcome.pending.background};
  display: grid;
  grid-template-columns: 2.5rem 3.75rem minmax(4rem, 1fr) 3.25rem 3rem 0.5rem;
  align-items: center; gap: 0; min-inline-size: 0;
  min-block-size: var(--header-height); block-size: var(--header-height);
  padding: 0 4px; box-sizing: border-box; border-radius: 0; list-style: none; cursor: pointer;
  /* Keep review spacing independent of the card's generic narrow summary rules. */
  && { gap: 0; padding: 0 4px; }
  color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.cardHeader};
  font-size: 0.6875rem; line-height: 1.2; white-space: nowrap; font-variant-numeric: tabular-nums;
  &::-webkit-details-marker { display: none; }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: -2px; }
  &[data-header-only] { cursor: default; }
  > * { box-sizing: border-box; }
  > h3 {
    display: flex; align-items: center; align-self: stretch; min-inline-size: 0;
    margin: 0; padding-inline: 1px; font-size: 0.6875rem; font-weight: 700;
    line-height: 1.2; white-space: nowrap;
  }
  > h3[data-dense-identity] { font-size: 0.625rem; }
  [data-header-field], [data-header-status] {
    position: relative; display: flex; align-items: center; align-self: stretch;
    min-inline-size: 0; gap: 2px; padding-inline: 2px;
    border-inline-start: 1px solid var(--header-rule); white-space: nowrap;
  }
  [data-header-field] strong { font-size: 0.6875rem; font-weight: 700; white-space: nowrap; }
  [data-header-label] { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.625rem; font-weight: 400; }
  [data-label-compact] { display: none; }
  &[data-large-odds] [data-header-field="odds"] [data-header-label] { display: none; }
  &[data-large-odds] [data-header-field="odds"] strong { font-size: 0.625rem; }
  [data-header-status] {
    justify-content: center; border-inline-end: 1px solid var(--header-rule);
    color: var(--header-status-ink); font-size: 0.625rem; font-weight: 700;
  }
  &[data-header-outcome="won"] { --header-status-ink: ${({ theme }) => theme.color.outcome.correct.text}; --header-status-fill: ${({ theme }) => theme.color.outcome.correct.background}; }
  &[data-header-outcome="lost"] { --header-status-ink: ${({ theme }) => theme.color.outcome.incorrect.text}; --header-status-fill: ${({ theme }) => theme.color.outcome.incorrect.background}; }
  &[data-header-outcome="void"] { --header-status-ink: ${({ theme }) => theme.color.outcome.void.text}; --header-status-fill: ${({ theme }) => theme.color.outcome.void.background}; }
  [data-header-chevron] {
    justify-self: center; inline-size: 5px; block-size: 5px;
    border-inline-end: 1.5px solid currentColor; border-block-end: 1.5px solid currentColor;
    transform: rotate(45deg);
  }
  details[open] > & [data-header-chevron] { transform: rotate(225deg); }
  &[data-header-only] [data-header-chevron] { visibility: hidden; }

  &[data-header-variant="continuous-rules"] { --header-height: 30px; }
  &[data-header-variant="inset-rules"] {
    [data-header-field], [data-header-status] { border-color: transparent; }
    [data-header-field]::before, [data-header-status]::before, [data-header-status]::after {
      content: ""; position: absolute; inset-block: 5px; inline-size: 1px; background: var(--header-rule);
    }
    [data-header-field]::before, [data-header-status]::before { inset-inline-start: -1px; }
    [data-header-status]::after { inset-inline-end: -1px; }
  }
  &[data-header-variant="strong-rules"] { --header-rule: ${({ theme }) => theme.color.controlBorder}; }
  &[data-header-variant="status-cell"] [data-header-status] { background: var(--header-status-fill); }
  &[data-header-variant="metric-cells"] [data-header-field] { background: ${({ theme }) => theme.color.surface}; }
  &[data-header-variant="centered-columns"] {
    > h3, [data-header-field] { justify-content: center; }
  }
  &[data-header-variant="right-aligned"] {
    --header-height: 30px;
    [data-header-field] { justify-content: flex-end; }
  }
  &[data-header-variant="minimal-rules"] {
    --header-height: 28px;
    --header-rule: ${({ theme }) => `color-mix(in srgb, ${theme.color.border} 65%, transparent)`};
    background: ${({ theme }) => theme.color.surface};
    [data-header-field] strong { font-weight: 600; }
  }
  &[data-header-variant="bold-identity"] {
    --header-height: 34px;
    > h3 { color: ${({ theme }) => theme.color.link}; font-weight: 800; }
  }

  @container compact-slip (max-width: 21rem) {
    [data-label-full] { display: none; }
    [data-label-compact] { display: inline; }
  }
  @container compact-slip (max-width: 12rem) {
    block-size: max(var(--header-height), 2rem);
    overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; contain: paint;
  }
`;
