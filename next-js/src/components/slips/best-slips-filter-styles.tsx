"use client";

import { controlBodyHeight, inlineControlRow } from "@/components/ui/control-layout";
import styled, { css } from "styled-components";
import { controlFeedback, filterButtonColors, filterControlColors, filterPanelColors, focusRing, mobileFilterPanel } from "@/components/ui/filter-chrome";
import { CriteriaDialog } from "@/components/ui/criteria-dialog";
import { desktopContentPadding } from "@/components/ui/layout";
import { SelectMenu } from "@/components/ui/select-menu";
import { selectSurface } from "@/components/ui/filled-surfaces";
import { media } from "@/styles/theme";
import type { BestSlipsStatus } from "@/domain/best-slips-query";

const compactControl = css`
  box-sizing: border-box;
  min-inline-size: 0;
  ${controlBodyHeight}
  max-inline-size: 100%;
  padding: var(--gh-spacing-1) var(--gh-spacing-2_25);
  color: ${({ theme }) => theme.color.text};
  border: 0;
  border-radius: ${({ theme }) => theme.radius.control};
  font: inherit;
  font-size: var(--gh-font-secondary);
  line-height: var(--gh-leading-label);
  ${controlFeedback}
  ${focusRing}
`;

export const FiltersPanel = styled.section`
  ${filterPanelColors}
  ${mobileFilterPanel}
  display: grid;
  gap: var(--gh-spacing-1_25);
  min-inline-size: 0;
  padding: 0;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  border: 0;
  border-radius: ${({ theme }) => theme.radius.none};
  ${media.desktop} { padding-block: var(--gh-spacing-2); background: ${({ theme }) => theme.color.surface}; }
  ${desktopContentPadding()}
`;

export const FiltersRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gh-spacing-1_5) var(--gh-spacing-2_5);
  min-inline-size: 0;

  ${inlineControlRow}
`;

const toggleGroup = css`
  display: flex;
  align-items: center;
  gap: var(--gh-spacing-0_5);
  padding: var(--gh-spacing-0_5);
  background: ${({ theme }) => theme.color.surface};
  border: 0;
  border-radius: ${({ theme }) => theme.radius.surface};
  min-inline-size: 0;
`;

export const ToggleRow = styled.div`
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: var(--gh-spacing-2_5);
  min-inline-size: 0;
  @media (max-width: ${({ theme }) => theme.viewport[79.99]}) { gap: var(--gh-spacing-1_5); }
  ${media.desktop} {
    gap: var(--gh-spacing-2_5) var(--gh-spacing-3_5);
    @media (max-width: ${({ theme }) => theme.viewport[79.99]}) { flex-wrap: wrap; }
  }
  ${media.belowDesktop} { flex-wrap: wrap; gap: var(--gh-spacing-1); }

  ${inlineControlRow}
`;

export const ResultGroup = styled.div`
  ${toggleGroup}
  flex: 0 1 auto;
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: ${({ theme }) => theme.color.border} transparent;
  &::-webkit-scrollbar { block-size: var(--gh-size-0_75); }
  &::-webkit-scrollbar-thumb { background: ${({ theme }) => theme.color.border}; }
  ${media.desktop} {
    gap: var(--gh-spacing-1_5);
    padding: 0;
    background: transparent;
    @media (max-width: ${({ theme }) => theme.viewport[79.99]}) { flex: 1 0 100%; box-sizing: border-box; }
  }
  ${media.belowDesktop} {
    order: 2; flex: 1 0 100%; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--gh-spacing-1); padding: 0; border: 0; border-radius: ${({ theme }) => theme.radius.none};
    overflow: visible; background: transparent;
  }
`;

export const FilterButton = styled.button`
  ${compactControl}
  ${filterButtonColors}
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  cursor: pointer;
  &[aria-pressed="true"] {
    color: ${({ theme }) => theme.color.link};
    background: ${({ theme }) => theme.color.brandSoft};
  }
  ${media.hover} { &:hover { background: ${({ theme }) => theme.color.rowHover}; } }
  ${media.desktop} { font-weight: var(--gh-weight-medium); }
`;

export const DateControls = styled.div`
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--gh-spacing-2);
  min-inline-size: 0;
  margin-inline-start: var(--gh-spacing-2);
  padding-inline-start: var(--gh-spacing-3_5);
  border-inline-start: 0;
  @media (max-width: ${({ theme }) => theme.viewport[79.99]}) { margin-inline-start: var(--gh-spacing-0_5); padding-inline-start: var(--gh-spacing-2); gap: var(--gh-spacing-1_5); }
  ${media.desktop} {
    @media (max-width: ${({ theme }) => theme.viewport[79.99]}) { margin-inline-start: 0; padding-inline-start: 0; border-inline-start: 0; }
  }
  ${media.belowDesktop} { flex: 1 1 var(--gh-size-48); gap: var(--gh-spacing-1); margin: 0; padding: 0; border: 0; }

  ${inlineControlRow}
`;

export const DateSelect = styled(SelectMenu)`
  flex: none;
  > [data-select-trigger] {
    --select-surface: ${({ theme }) => theme.color.brandSoft};
    --select-hover-surface: ${({ theme }) => theme.color.brandSoft};
    color: ${({ theme }) => theme.color.link};
    ${selectSurface}
    font-weight: ${({ theme }) => theme.typography.weight.medium};
    box-shadow: none;
    ${media.desktop} { font-size: var(--gh-font-body);  }
  }
  ${media.belowDesktop} {
    flex: 1; inline-size: 100%;
    > [data-select-trigger] { padding: var(--gh-spacing-0_75) var(--gh-spacing-2); font-size: var(--gh-font-body); box-shadow: none; }
  }
`;

export const CustomRangeButton = styled(FilterButton)`
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: var(--gh-spacing-1_25);
  padding: var(--gh-spacing-1) var(--gh-spacing-2);
  border-radius: ${({ theme }) => theme.radius.control};
  white-space: nowrap;
  > svg { color: ${({ theme }) => theme.color.brand}; }
  > svg { flex: none; font-size: var(--gh-font-emphasis); }
  ${media.desktop} { font-size: var(--gh-font-body); font-weight: var(--gh-weight-semibold);  }
  ${media.belowDesktop} { padding: var(--gh-spacing-0_5) var(--gh-spacing-1_5); }
`;

export const ResultButton = styled(FilterButton)<{ $status: BestSlipsStatus }>`
  ${({ theme, $status }) => {
    const tone = $status === "all" ? { text: theme.color.text, background: theme.color.surfaceMuted }
      : $status === "cancelled" ? { text: theme.color.accent.orange.text, background: theme.color.accent.orange.soft }
        : theme.color.outcome[$status === "won" ? "correct" : $status === "lost" ? "incorrect" : $status === "void" ? "void" : "pending"];
    return css`
      --result-text: ${tone.text};
      --result-background: ${tone.background};
    `;
  }}
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: var(--gh-spacing-1_25);
  padding: var(--gh-spacing-0_75) var(--gh-spacing-1_5);
  white-space: nowrap;
  border: 0;
  color: var(--result-text);
  background: color-mix(in srgb, var(--result-background) 55%, ${({ theme }) => theme.color.surface});
  &::before { content: ""; inline-size: var(--gh-size-1_25); block-size: var(--gh-size-1_25); background: currentColor; }
  > strong { font-size: var(--gh-font-caption); font-variant-numeric: tabular-nums; }
  [data-slip-result-percent] { font-size: var(--gh-font-caption); font-variant-numeric: tabular-nums; }
  [data-mobile-result-percent] { display: none; }
  &:focus-visible { outline-offset: calc(-1 * var(--gh-size-0_75)); }
  &[aria-pressed="true"]:focus-visible { outline-color: ${({ theme }) => theme.color.surface}; }
  &[aria-pressed="true"] {
    color: ${({ theme }) => theme.color.surface};
    background: var(--result-text);
  }
  ${media.hover} {
    &:hover:not([aria-pressed="true"]) { background: var(--result-background); }
    &[aria-pressed="true"]:hover { background: var(--result-text); }
  }
  @media (max-width: ${({ theme }) => theme.viewport[79.99]}) { gap: var(--gh-spacing-0_75); padding-inline: var(--gh-spacing-1); }
  @media (pointer: coarse) { min-block-size: var(--gh-size-11); }
  ${media.desktop} {
    gap: var(--gh-spacing-1_5);
    padding: var(--gh-spacing-1_5) var(--gh-spacing-2_5);
    font-size: var(--gh-font-body);
    > strong { font-size: var(--gh-font-body); font-weight: var(--gh-weight-bold); }
    [data-slip-result-percent] { font-size: var(--gh-font-secondary); font-weight: var(--gh-weight-medium); }
    @media (pointer: coarse) { min-block-size: var(--gh-size-11); }
    ${({ theme, $status }) => $status === "all" && css`
      &[aria-pressed="true"], &[aria-pressed="true"]:hover {
        color: ${theme.color.accent.blue.text}; background: ${theme.color.accent.blue.soft};
      }
      &[aria-pressed="true"]:focus-visible { outline-color: ${theme.color.accent.blue.text}; }
    `}
  }
  ${media.belowDesktop} {
    display: grid; grid-template-columns: max-content max-content; justify-content: center; align-content: center;
    gap: var(--gh-spacing-0_25) var(--gh-spacing-0_75); padding: var(--gh-spacing-0_5) var(--gh-spacing-1);
    border-radius: ${({ theme }) => theme.radius.control}; font-size: var(--gh-font-secondary); line-height: var(--gh-leading-control); text-align: center;
    &::before { display: none; }
    > span:first-of-type { grid-column: 1 / -1; }
    > strong { grid-row: 2; font-size: var(--gh-font-secondary); font-weight: var(--gh-weight-bold); }
    [data-slip-result-percent] { grid-row: 2; font-size: var(--gh-font-caption); }
    [data-mobile-result-percent] { display: inline; }
    ${({ theme, $status }) => $status === "all" && css`
      color: ${theme.color.accent.blue.text}; background: ${theme.color.accent.blue.soft};
      &[aria-pressed="true"], &[aria-pressed="true"]:hover {
        color: ${theme.color.accent.blue.soft}; background: ${theme.color.accent.blue.text};
      }
    `}
  }
`;

export const ResetButton = styled(FilterButton)`
  margin-inline-start: auto;
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: var(--gh-spacing-1_25);
  padding: var(--gh-spacing-1) var(--gh-spacing-2_5);

  color: ${({ theme }) => theme.color.mutedText};
  background: ${({ theme }) => theme.color.surface};
  > svg { flex: none; font-size: var(--gh-font-emphasis); }
  ${media.hover} { &:hover { color: ${({ theme }) => theme.color.link}; background: ${({ theme }) => theme.color.brandSoft};  } }
  ${media.desktop} { font-size: var(--gh-font-body); }
  ${media.belowDesktop} { padding: var(--gh-spacing-0_5) var(--gh-spacing-1_5); }
`;

export const RangeButton = styled(FilterButton)`
  display: inline-flex;
  align-items: center;
  gap: var(--gh-spacing-1_5);
  block-size: auto; min-block-size: var(--form-control-height);
  padding: var(--gh-spacing-0_25) var(--gh-spacing-1);
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.color.link};
  font-size: var(--gh-font-caption);
  > svg { flex: none; font-size: var(--gh-font-emphasis); }
`;

export const AppliedSummary = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--gh-spacing-0_75) var(--gh-spacing-3);
  min-inline-size: 0;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: var(--gh-font-caption);
  line-height: var(--gh-leading-compact);
  [data-applied-result] { color: ${({ theme }) => theme.color.text}; }
  [data-best-slips-summary] { margin-inline-start: auto; font-variant-numeric: tabular-nums; }
  ${media.desktop} {
    font-size: var(--gh-font-secondary);
    font-weight: var(--gh-weight-medium);
    [data-best-slips-summary] { color: ${({ theme }) => theme.color.text}; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
  }
  ${media.belowDesktop} {
    display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: var(--gh-spacing-0_5) var(--gh-spacing-2);
    [data-best-slips-summary] { grid-column: 2; grid-row: 1; text-align: end; }
  }
`;

export const AppliedDetails = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gh-spacing-0_75) var(--gh-spacing-1_5);
  min-inline-size: 0;
  ${media.belowDesktop} { display: contents; }
`;

/** Preserve the desktop flex layout while grouping mobile selections beside the result range. */
export const AppliedSelection = styled.span`
  display: contents;
  ${media.belowDesktop} {
    grid-column: 1; grid-row: 1; display: flex; flex-wrap: wrap; align-items: baseline;
    gap: var(--gh-spacing-0_5) var(--gh-spacing-1); min-inline-size: 0; text-align: start;
    > span { min-inline-size: 0; }
  }
`;

export const RangeDialog = styled(CriteriaDialog)`
  border-radius: ${({ theme }) => theme.radius.overlay};
  button, input { border-radius: ${({ theme }) => theme.radius.control}; }
`;

export const DateFields = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--gh-spacing-3);
  > label { display: grid; gap: var(--gh-spacing-1_25); min-inline-size: 0; font-size: var(--gh-font-body); }
  input {
    ${compactControl}
    ${filterControlColors}
    inline-size: 100%;
    min-block-size: var(--form-control-height);
    padding: var(--gh-spacing-1_75) var(--gh-spacing-2_25);
    font-size: var(--gh-font-emphasis);
    &[aria-invalid="true"] { color: ${({ theme }) => theme.color.outcome.incorrect.text}; background: ${({ theme }) => theme.color.outcome.incorrect.background}; }
  }
  ${media.belowDesktop} { grid-template-columns: minmax(0, 1fr); input { font-size: var(--gh-font-section); } }
`;

export const DateHint = styled.p`
  margin-block: var(--gh-spacing-2_5) 0;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: var(--gh-font-secondary);
`;

export const DateError = styled.p`
  margin-block: var(--gh-spacing-2_5) 0;
  color: ${({ theme }) => theme.color.outcome.incorrect.text};
  font-size: var(--gh-font-body);
`;
