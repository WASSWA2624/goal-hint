"use client";

import styled from "styled-components";

/** Minimal rules: stable metadata columns with compact, even text padding. */
export const MobileHeaderRow = styled.summary`
  --header-height: 28px;
  --header-rule: ${({ theme }) => `color-mix(in srgb, ${theme.color.border} 65%, transparent)`};
  --header-status-ink: ${({ theme }) => theme.color.outcome.pending.text};
  --header-status-fill: ${({ theme }) => theme.color.outcome.pending.background};
  display: grid;
  grid-template-columns: 2.75rem 4rem minmax(4.625rem, 1fr) 3.625rem 3.125rem 0.5rem;
  align-items: center; min-inline-size: 0;
  min-block-size: var(--header-height); block-size: var(--header-height);
  /* Override the card's generic narrow summary spacing without affecting its match rows. */
  && { gap: 0; padding: 0 2px; }
  box-sizing: border-box; border-radius: 0; list-style: none; cursor: pointer;
  color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surface};
  font-size: 0.6875rem; line-height: 1.2; white-space: nowrap; font-variant-numeric: tabular-nums;
  &::-webkit-details-marker { display: none; }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: -2px; }
  &[data-header-only] { cursor: default; }
  > * { box-sizing: border-box; }
  > h3 {
    display: flex; align-items: center; align-self: stretch; min-inline-size: 0;
    margin: 0; padding-inline: 2px; font-size: 0.6875rem; font-weight: 700;
    line-height: 1.2; white-space: nowrap;
  }
  > h3[data-dense-identity] { font-size: 0.625rem; }
  [data-header-field], [data-header-status] {
    position: relative; display: flex; align-items: center; align-self: stretch;
    min-inline-size: 0; gap: 2px; padding-inline: 3px;
    border-inline-start: 1px solid var(--header-rule); white-space: nowrap;
  }
  [data-header-field] strong { flex-shrink: 0; font-size: 0.6875rem; font-weight: 600; white-space: nowrap; }
  [data-header-label] { flex-shrink: 0; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.625rem; font-weight: 400; }
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

  @container compact-slip (max-width: 21rem) {
    [data-label-full] { display: none; }
    [data-label-compact] { display: inline; }
  }
  @container compact-slip (max-width: 18.875rem) {
    overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; contain: paint;
  }
  @container compact-slip (max-width: 12rem) {
    block-size: max(var(--header-height), 2rem);
  }

  /* Production uses a readable scale; historical comparison samples retain their original sizing. */
  &:not([data-header-variant]) {
    --header-height: 2.75rem;
    grid-template-columns: 2rem 4rem minmax(3rem, 1fr) 2.875rem 5.75rem 0.625rem;
    block-size: auto;
    font-size: 0.875rem;
    > h3, > h3[data-dense-identity] {
      justify-content: center; text-align: center; white-space: normal;
      font-size: 0.875rem;
    }
    [data-header-number] { font-size: 1rem; font-weight: 800; }
    > h3[data-dense-identity] [data-header-number] { font-size: 0.875rem; }
    [data-header-field], [data-header-status] {
      flex-direction: column; justify-content: center; gap: 0.1875rem;
      padding: 4px 2px;
    }
    [data-header-field] strong { font-size: 0.875rem; }
    [data-header-field="odds"] strong {
      min-inline-size: 0; max-inline-size: 100%; overflow: hidden;
      text-overflow: ellipsis; flex-shrink: 1;
    }
    [data-header-label] { order: -1; font-size: 0.75rem; }
    &[data-large-odds] [data-header-field="odds"] [data-header-label] { display: inline; }
    &[data-large-odds] [data-header-field="odds"] strong { font-size: 0.875rem; }
    [data-header-status] { padding-inline: 0; font-size: 0.875rem; }
    [data-slip-status] { inline-size: 100%; min-block-size: 1.25rem; padding: 2px 3px; font-size: 0.75rem; }
    [data-header-chevron] { inline-size: 6px; block-size: 6px; }
    &[data-header-publication] {
      grid-template-columns: 5rem minmax(3.25rem, 1fr) 3.25rem 5.75rem 0.625rem;
      > h3 { grid-column: 1 / -1; justify-content: flex-start; flex-wrap: wrap; gap: 4px 7px; padding: 6px 4px; }
      [data-rank] { color: ${({ theme }) => theme.color.link}; font-size: 0.6875rem; font-weight: 400; }
      [data-slip-publication-date] { font-size: 0.6875rem; }
      [data-header-field="odds"] { border-inline-start: 0; }
    }
  }
`;
