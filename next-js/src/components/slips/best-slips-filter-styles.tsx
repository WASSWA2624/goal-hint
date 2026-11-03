"use client";

import styled, { css } from "styled-components";
import { controlBodyHeight, inlineControlRow } from "@/components/ui/control-layout";
import { controlFeedback, filterButtonColors, filterControlColors, filterPanelColors, focusRing, pageFilterPanel } from "@/components/ui/filter-chrome";
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
  color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surface};
  ${media.desktop} { padding-block: var(--gh-spacing-2); }
  ${desktopContentPadding()}
`;

export const FiltersRow = styled.div`
  display: flex; flex-wrap: wrap; align-items: center;
  gap: var(--gh-spacing-1_5) var(--gh-spacing-2_5); min-inline-size: 0;
  ${inlineControlRow}
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

export const DateControls = styled.div`
  display: grid; gap: var(--gh-spacing-3); min-inline-size: 0;
`;

/** One results bar replaces the applied-filter row and repeated publication-day dividers. */
export const AppliedSummary = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: baseline;
  gap: var(--gh-spacing-1) var(--gh-spacing-3); min-inline-size: 0;
  padding: var(--gh-spacing-2);
  color: ${({ theme }) => theme.color.mutedText}; background: ${({ theme }) => theme.color.brandSoft};
  border-radius: ${({ theme }) => theme.radius.none};
  font-size: var(--gh-font-caption); line-height: var(--gh-leading-compact);
  [data-applied-result] { color: ${({ theme }) => theme.color.text}; }
  [data-best-slips-summary] { grid-column: -2 / -1; grid-row: 1; text-align: end; white-space: nowrap; font-variant-numeric: tabular-nums; }
  &:has(> [data-best-slips-publication]) > [data-applied-selection] { grid-column: 1 / -1; grid-row: 2; }
  ${media.desktop} {
    font-size: var(--gh-font-secondary);
    &:has(> [data-best-slips-publication]) { grid-template-columns: auto minmax(0, 1fr) auto; }
    &:has(> [data-best-slips-publication]) > [data-applied-selection] { grid-column: 2; grid-row: 1; }
  }
`;

export const PublicationDate = styled.p`
  grid-column: 1; grid-row: 1; margin: 0; min-inline-size: 0;
  color: ${({ theme }) => theme.color.text}; font-weight: var(--gh-weight-medium);
`;

export const AppliedSelection = styled.div`
  display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: baseline;
  gap: var(--gh-spacing-0_5) var(--gh-spacing-1_5); min-inline-size: 0; text-align: end;
  > span { min-inline-size: 0; overflow-wrap: anywhere; }
`;

export const DateFields = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gh-spacing-3);
  input {
    ${compactControl}
    ${filterControlColors}
    inline-size: 100%; padding: var(--gh-spacing-1_75) var(--gh-spacing-2_25);
    font-size: var(--gh-font-section);
    &[aria-invalid="true"] { color: ${({ theme }) => theme.color.outcome.incorrect.text}; background: ${({ theme }) => theme.color.outcome.incorrect.background}; }
  }
  ${media.belowDesktop} { grid-template-columns: minmax(0, 1fr); }
`;

export const DateHint = styled.p`
  margin-block: var(--gh-spacing-2_5) 0;
  color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary);
`;

export const DateError = styled.p`
  margin-block: var(--gh-spacing-2_5) 0;
  color: ${({ theme }) => theme.color.outcome.incorrect.text}; font-size: var(--gh-font-body);
`;
