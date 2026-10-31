"use client";

import styled from "styled-components";
import { mobileStatusWidth } from "@/components/ui/status-badge";

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
  box-sizing: border-box; list-style: none; cursor: pointer;
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

  /* Compact Rail is shared by every production mobile slip. Historical samples stay isolated. */
  &&:not([data-header-variant]) {
    --header-height: 2.75rem;
    grid-template-columns: minmax(0, 1fr) ${mobileStatusWidth};
    background: ${({ theme }) => `color-mix(in srgb, ${theme.color.surface} 96%, ${theme.color.accent.blue.text})`};
    /* Match badges end after the selection list's 6px gutter, 1px frame and 8px padding. */
    gap: 4px 6px; padding: 6px 15px 6px 9px; block-size: auto; white-space: normal;
    > h3, > h3[data-dense-identity] {
      grid-column: 1; grid-row: 1; flex-wrap: wrap; gap: 3px 5px; align-items: baseline;
      padding: 0; font-size: 0.875rem; text-align: start; line-height: 1.3;
    }
    [data-header-slip-number] {
      display: inline-flex; align-items: baseline; gap: 3px; flex: none; padding: 2px 4px;
      border-radius: ${({ theme }) => theme.radius.small};
      color: ${({ theme }) => theme.color.accent.blue.text}; background: ${({ theme }) => theme.color.accent.blue.soft};
      white-space: nowrap; font-weight: 700;
    }
    [data-header-number] { font-size: inherit; font-weight: inherit; }
    [data-rank] { color: ${({ theme }) => theme.color.link}; font-size: 0.6875rem; font-weight: 400; margin-inline-start: 3px; }
    [data-header-generation] {
      display: inline-flex; align-items: baseline; gap: 5px; min-inline-size: 0; max-inline-size: 100%;
      font-size: 0.6875rem; line-height: 1.4;
      [data-slip-publication-date] { min-inline-size: 0; font-size: inherit; white-space: normal; }
      [data-slip-weekday] { font-weight: 400; }
      strong { color: ${({ theme }) => theme.color.text}; font-weight: 600; }
    }
    [data-header-metrics] {
      grid-column: 1 / -1; grid-row: 2; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr) auto;
      align-items: baseline; gap: 4px 6px; min-inline-size: 0;
    }
    [data-header-field] {
      align-self: auto; flex-wrap: wrap; gap: 2px 4px; padding: 0; border: 0;
      align-items: baseline; justify-content: flex-start; white-space: normal;
    }
    [data-header-field] strong { font-size: 0.875rem; font-weight: 700; }
    [data-header-field="odds"] strong { color: ${({ theme }) => theme.color.accent.blue.text}; }
    [data-header-label] { order: -1; min-inline-size: 0; flex-shrink: 1; font-size: 0.6875rem; }
    [data-label-full] { display: inline; }
    [data-label-compact] { display: none; }
    &[data-large-odds] [data-header-field="odds"] [data-header-label] { display: inline; }
    &[data-large-odds] [data-header-field="odds"] strong { font-size: 0.875rem; overflow-wrap: anywhere; white-space: normal; }
    [data-header-status] {
      grid-column: 2; grid-row: 1; align-self: center; padding: 0; border: 0;
      > [data-header-label] { display: none; }
    }
    [data-slip-status] { inline-size: ${mobileStatusWidth}; min-block-size: 1.5rem; font-size: 0.75rem; white-space: normal; }
    @container compact-slip (max-width: 18rem) {
      [data-label-full] { display: none; }
      [data-label-compact] { display: inline; }
    }
    @container compact-slip (max-width: 18.875rem) { overflow: visible; contain: none; }
    @container compact-slip (max-width: 12rem) {
      grid-template-columns: minmax(0, 1fr);
      [data-header-status] { grid-column: 1 / -1; grid-row: 1; justify-self: end; inline-size: min(100%, ${mobileStatusWidth}); }
      > h3 { grid-column: 1; grid-row: 2; }
      [data-header-metrics] { grid-column: 1; grid-row: 3; }
    }
  }
  /* Reserve a sibling icon's touch target beside the narrower slip-only badge. */
  &&:not([data-header-variant])[data-header-action] {
    grid-template-columns: minmax(0, 1fr) min(6rem, 96px) 44px;
    grid-template-rows: minmax(44px, auto) auto;
    padding-inline-end: 6px;
    > h3 { align-self: center; }
    [data-header-status] { align-self: start; min-block-size: 44px; }
    [data-header-metrics] { grid-column: 1 / -1; padding-inline-end: 9px; }
    [data-slip-status] { inline-size: min(6rem, 96px); }
    @container compact-slip (max-width: 12rem) {
      [data-header-status] { grid-column: 2; grid-row: 1; }
      > h3 { grid-column: 1 / -1; grid-row: 2; }
      [data-header-metrics] { grid-column: 1 / -1; grid-row: 3; }
    }
  }
`;
