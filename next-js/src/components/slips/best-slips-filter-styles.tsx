"use client";

import styled, { css } from "styled-components";
import { controlBodyHeight } from "@/components/ui/control-layout";
import { controlFeedback, filterButtonColors, filterPanelColors, focusRing, pageFilterPanel } from "@/components/ui/filter-chrome";
import { desktopContentPadding } from "@/components/ui/layout";
import { media } from "@/styles/theme";

const compactControl = css`
  box-sizing: border-box; min-inline-size: 0; max-inline-size: 100%;
  ${controlBodyHeight}
  padding: var(--gh-spacing-1) var(--gh-spacing-2_25);
  color: ${({ theme }) => theme.color.text}; border: 0;
  border-radius: ${({ theme }) => theme.radius.control};
  font: inherit; font-size: var(--gh-font-secondary); line-height: var(--gh-leading-label);
  ${controlFeedback}
  ${focusRing}
`;

export const FiltersPanel = styled.section`
  ${filterPanelColors}
  ${pageFilterPanel}
  display: grid; gap: var(--gh-spacing-1_25); min-inline-size: 0;
  padding: 0; border: 0; border-radius: ${({ theme }) => theme.radius.none};
  color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.page};
  ${media.desktop} {
    gap: var(--gh-spacing-3); padding-block: var(--gh-spacing-1);
    background: ${({ theme }) => theme.color.page};
    [data-performance-summary] { background: transparent; }
    [data-performance-heading] { padding-block-start: var(--gh-spacing-0_5); }
  }
  ${media.belowDesktop} {
    /* Keep the title's existing top spacing while joining the results caption to its slip list. */
    &&& { padding-block-end: 0; }
    &:has(+ div > [data-slip-list]) { margin-block-end: calc(-1 * var(--gh-spacing-1)); }
  }
  ${desktopContentPadding()}
`;

export const FilterButton = styled.button`
  ${compactControl}
  ${filterButtonColors}
  font-weight: ${({ theme }) => theme.typography.weight.medium}; cursor: pointer;
  ${media.hover} { &:hover:not(:disabled) { background: ${({ theme }) => theme.color.rowHover}; } }
  &:disabled { cursor: wait; }
`;

/** An embedded summary action stretches to the card row; its minimum uses shared control metrics. */
export const AdvancedFiltersButton = styled(FilterButton)`
  display: inline-flex; align-items: center; justify-content: center; gap: var(--gh-spacing-1_5);
  block-size: auto; align-self: stretch; white-space: nowrap;
  > svg { flex: none; font-size: var(--gh-font-emphasis); }
`;

export const FilterOptions = styled.div`
  display: grid; gap: var(--gh-spacing-3); min-inline-size: 0;
`;

/** Desktop browsing details and the mobile today summary share the same outer card rails. */
export const AppliedSummary = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: baseline;
  gap: var(--gh-spacing-1) var(--gh-spacing-3); min-inline-size: 0;
  padding-block: var(--gh-spacing-2) 0; padding-inline: 0;
  color: ${({ theme }) => theme.color.mutedText}; background: transparent;
  border-radius: ${({ theme }) => theme.radius.none};
  font-size: var(--gh-font-caption); line-height: var(--gh-leading-compact);
  [data-applied-result] { color: ${({ theme }) => theme.color.text}; }
  [data-best-slips-summary] { grid-column: -2 / -1; grid-row: 1; text-align: end; white-space: nowrap; font-variant-numeric: tabular-nums; }
  ${media.desktop} {
    padding: 0; background: transparent; font-size: var(--gh-font-secondary);
  }
`;

export const AppliedSelection = styled.div`
  display: flex; flex-wrap: wrap; justify-content: flex-start; align-items: baseline;
  gap: var(--gh-spacing-0_5) var(--gh-spacing-1_5); min-inline-size: 0; text-align: start;
  > span { min-inline-size: 0; overflow-wrap: anywhere; }
  [data-browse-scope="mobile"] { display: none; }
  ${media.belowDesktop} {
    [data-browse-scope="mobile"] { display: inline; }
    [data-browse-scope="desktop"] { display: none; }
  }
`;
