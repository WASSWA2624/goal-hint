"use client";

import styled from "styled-components";
import { slipDisclosureIndicator } from "../slip-disclosure-styles";

/** Minimal rules: stable metadata columns with compact, even text padding. */
export const MobileHeaderRow = styled.summary`
  --header-height: var(--gh-size-7);
  --header-rule: ${({ theme }) => `color-mix(in srgb, ${theme.color.border} 65%, transparent)`};
  --header-status-ink: ${({ theme }) => theme.color.outcome.pending.text};
  --header-status-fill: ${({ theme }) => theme.color.outcome.pending.background};
  position: relative; display: grid;
  grid-template-columns: var(--gh-size-11) var(--gh-size-16) minmax(var(--gh-size-18_5), 1fr) var(--gh-size-14_5) var(--gh-size-12_5) var(--gh-size-2);
  align-items: center; min-inline-size: 0;
  min-block-size: var(--header-height); block-size: var(--header-height);
  /* Override the card's generic narrow summary spacing without affecting its match rows. */
  && { gap: 0; padding: 0 var(--gh-spacing-0_5); }
  box-sizing: border-box; list-style: none; cursor: pointer;
  color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.phoneCardFrame.mobileHeader};
  font-size: var(--gh-font-caption); line-height: var(--gh-leading-control); white-space: nowrap; font-variant-numeric: tabular-nums;
  &::-webkit-details-marker { display: none; }
  &:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-size-0_5)); }
  &[data-header-only] { cursor: default; }
  > * { box-sizing: border-box; }
  > h3 {
    display: flex; align-items: center; align-self: stretch; min-inline-size: 0;
    margin: 0; padding-inline: var(--gh-spacing-0_5); font-size: var(--gh-font-caption); font-weight: var(--gh-weight-bold);
    line-height: var(--gh-leading-control); white-space: nowrap;
  }
  > h3[data-dense-identity] { font-size: var(--gh-font-micro); }
  [data-header-field], [data-header-status] {
    position: relative; display: flex; align-items: center; align-self: stretch;
    min-inline-size: 0; gap: var(--gh-spacing-0_5); padding-inline: var(--gh-spacing-0_75);
    border-inline-start: 0; white-space: nowrap;
  }
  [data-header-field] strong { flex-shrink: 0; font-size: var(--gh-font-caption); font-weight: var(--gh-weight-semibold); white-space: nowrap; }
  [data-header-label] { flex-shrink: 0; color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-micro); font-weight: var(--gh-weight-body); }
  [data-label-compact] { display: none; }
  &[data-large-odds] [data-header-field="odds"] [data-header-label] { display: none; }
  &[data-large-odds] [data-header-field="odds"] strong { font-size: var(--gh-font-micro); }
  [data-header-status] {
    justify-content: center; border-inline-end: 0;
    color: var(--header-status-ink); font-size: var(--gh-font-micro); font-weight: var(--gh-weight-bold);
  }
  &[data-header-outcome="won"] { --header-status-ink: ${({ theme }) => theme.color.outcome.correct.text}; --header-status-fill: ${({ theme }) => theme.color.outcome.correct.background}; }
  &[data-header-outcome="lost"] { --header-status-ink: ${({ theme }) => theme.color.outcome.incorrect.text}; --header-status-fill: ${({ theme }) => theme.color.outcome.incorrect.background}; }
  &[data-header-outcome="void"] { --header-status-ink: ${({ theme }) => theme.color.outcome.void.text}; --header-status-fill: ${({ theme }) => theme.color.outcome.void.background}; }
  [data-header-chevron] {
    justify-self: center; inline-size: var(--gh-size-1_25); block-size: var(--gh-size-1_25);
    border-inline-end: var(--gh-stroke-accent) solid currentColor; border-block-end: var(--gh-stroke-accent) solid currentColor;
    transform: rotate(-45deg);
  }
  details[open] > & [data-header-chevron] { transform: rotate(45deg); --slip-chevron-rotation: 45deg; }
  &[data-header-only] [data-header-chevron] { visibility: hidden; }

  @container compact-slip (max-width: ${({ theme }) => theme.viewport[21]}) {
    [data-label-full] { display: none; }
    [data-label-compact] { display: inline; }
  }
  @container compact-slip (max-width: ${({ theme }) => theme.viewport[18.875]}) {
    overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; contain: paint;
  }
  @container compact-slip (max-width: ${({ theme }) => theme.viewport[12]}) {
    block-size: max(var(--header-height), var(--gh-size-8));
  }

  /* Compact Rail is shared by every production mobile slip. Historical samples stay isolated. */
  &&:not([data-header-variant]) {
    --header-height: var(--gh-size-11);
    grid-template-columns: minmax(0, 1fr) min(var(--gh-size-24), var(--gh-size-24)) var(--slip-header-action-size);
    grid-template-rows: minmax(var(--gh-size-8), auto) auto;
    background: ${({ theme }) => theme.phoneCardFrame.mobileHeader};
    [data-header-chevron] {
      ${slipDisclosureIndicator}
      position: absolute; inset-inline-end: var(--gh-spacing-1_5); inset-block-start: var(--gh-spacing-2);
      inline-size: var(--slip-header-action-size); block-size: var(--slip-header-action-size);
      border-radius: ${({ theme }) => theme.radius.control}; transform: none;
    }
    /* Match badges end after the selection list's 6px gutter, 1px frame and 8px padding. */
    gap: var(--gh-spacing-1) var(--gh-spacing-1_5); padding: var(--gh-spacing-1_5) var(--gh-spacing-1_5) var(--gh-spacing-1_5) var(--gh-spacing-2_25); block-size: auto; white-space: normal;
    > h3, > h3[data-dense-identity] {
      grid-column: 1; grid-row: 1; flex-wrap: wrap; gap: var(--gh-spacing-0_25) var(--gh-spacing-1_25); align-items: baseline;
      padding: 0; font-size: var(--gh-font-emphasis); text-align: start; line-height: var(--gh-leading-label);
    }
    [data-header-slip-number] {
      display: inline-flex; align-items: baseline; gap: var(--gh-spacing-0_75); flex: none; padding: var(--gh-spacing-0_25) var(--gh-spacing-1);
      border-radius: ${({ theme }) => theme.radius.small};
      color: ${({ theme }) => theme.color.accent.blue.text}; background: ${({ theme }) => theme.color.accent.blue.soft};
      white-space: nowrap; font-weight: var(--gh-weight-bold);
    }
    [data-header-number] { font-size: inherit; font-weight: inherit; }
    [data-rank] { color: ${({ theme }) => theme.color.link}; font-size: var(--gh-font-caption); font-weight: var(--gh-weight-body); margin-inline-start: var(--gh-spacing-0_75); }
    [data-header-generation] {
      display: inline-flex; align-items: baseline; gap: var(--gh-spacing-1_25); min-inline-size: 0; max-inline-size: 100%;
      font-size: var(--gh-font-caption); line-height: var(--gh-leading-compact);
      [data-slip-publication-date] { min-inline-size: 0; font-size: inherit; white-space: normal; }
      strong { color: ${({ theme }) => theme.color.text}; font-weight: var(--gh-weight-semibold); }
    }
    [data-header-metrics] {
      grid-column: 1 / -1; grid-row: 2; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr) auto;
      align-items: baseline; gap: var(--gh-spacing-0_5) var(--gh-spacing-1_5); min-inline-size: 0; padding-inline-end: var(--gh-spacing-2_25);
    }
    [data-header-field] {
      align-self: auto; flex-wrap: wrap; gap: var(--gh-spacing-0_25) var(--gh-spacing-1); padding: 0; border: 0;
      align-items: baseline; justify-content: flex-start; white-space: normal;
    }
    [data-header-field] strong { font-size: var(--gh-font-emphasis); font-weight: var(--gh-weight-bold); }
    [data-header-field="odds"] strong { color: ${({ theme }) => theme.color.accent.blue.text}; }
    [data-header-label] { order: -1; min-inline-size: 0; flex-shrink: 1; font-size: var(--gh-font-caption); }
    [data-label-full] { display: inline; }
    [data-label-compact] { display: none; }
    &[data-large-odds] [data-header-field="odds"] [data-header-label] { display: inline; }
    &[data-large-odds] [data-header-field="odds"] strong { font-size: var(--gh-font-emphasis); overflow-wrap: anywhere; white-space: normal; }
    [data-header-status] {
      grid-column: 2; grid-row: 1; align-self: center; padding: 0; border: 0;
      > [data-header-label] { display: none; }
    }
    [data-slip-status] {
      display: grid; grid-template-columns: var(--gh-size-2_5) minmax(0, 1fr);
      inline-size: min(var(--gh-size-24), var(--gh-size-24)); min-block-size: var(--gh-size-6); padding: 0;
      border: 0; background: none; justify-content: start; text-align: start;
      font-size: var(--gh-font-secondary); white-space: normal;
      [data-slip-progress-dot] { grid-column: 1; grid-row: 1; justify-self: start; margin-inline-end: 0; }
      [data-status-full] { grid-column: 2; grid-row: 1; }
    }
    @container compact-slip (max-width: ${({ theme }) => theme.viewport[18]}) {
      [data-label-full] { display: none; }
      [data-label-compact] { display: inline; }
    }
    @container compact-slip (max-width: ${({ theme }) => theme.viewport[18.875]}) { overflow: visible; contain: none; }
    @container compact-slip (max-width: ${({ theme }) => theme.viewport[12]}) {
      [data-header-status] { grid-column: 2; grid-row: 1; }
      > h3 { grid-column: 1 / -1; grid-row: 2; }
      [data-header-metrics] { grid-column: 1 / -1; grid-row: 3; }
    }
  }
  &&:not([data-header-variant])[data-header-only][data-header-action] {
    grid-template-columns: minmax(0, 1fr) var(--gh-size-24) max-content;
    [data-header-actions] { grid-column: 3; grid-row: 1; align-self: center; min-inline-size: 0; }
  }
  /* Keep the sibling Share icon and status on the same compact row. */
  &&:not([data-header-variant])[data-header-action]:not([data-header-only]) {
    /* Independent fixed slots keep Share clear of the disclosure indicator. */
    grid-template-columns: minmax(0, 1fr) min(var(--gh-size-24), var(--gh-size-24)) calc(2 * var(--slip-header-action-size) + var(--slip-header-action-gap));
    > h3 { align-self: center; }
  }
`;
