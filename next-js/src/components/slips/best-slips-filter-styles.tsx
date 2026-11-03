"use client";

import { controlBodyHeight, inlineControlRow } from "@/components/ui/control-layout";
import styled, { css } from "styled-components";
import { controlFeedback, filterButtonColors, filterControlColors, filterPanelColors, focusRing, pageFilterPanel } from "@/components/ui/filter-chrome";
import { CriteriaDialog } from "@/components/ui/criteria-dialog";
import { desktopContentPadding } from "@/components/ui/layout";
import { SelectMenu } from "@/components/ui/select-menu";
import { filledAction, selectSurface } from "@/components/ui/filled-surfaces";
import { media } from "@/styles/theme";

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
  ${pageFilterPanel}
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
  ${media.belowDesktop} {
    flex: 1 1 calc(var(--gh-size-36) * 2 + var(--gh-spacing-1));
    gap: var(--gh-spacing-1); margin: 0; padding: 0; border: 0;
  }

  ${inlineControlRow}
`;

export const DateSelect = styled(SelectMenu)`
  flex: none;
  min-inline-size: var(--gh-size-36);
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

export const ResetButton = styled(FilterButton)`
  margin-inline-start: auto;
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: var(--gh-spacing-1_25);
  padding: var(--gh-spacing-1) var(--gh-spacing-2_5);

  ${filledAction}
  > svg { flex: none; font-size: var(--gh-font-emphasis); }
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
