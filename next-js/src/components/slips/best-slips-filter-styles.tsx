"use client";

import styled, { css } from "styled-components";
import { controlFeedback, filterButtonColors, filterControlColors, filterPanelColors, focusRing } from "@/components/ui/filter-chrome";
import { CriteriaDialog } from "@/components/ui/criteria-dialog";
import { media } from "@/styles/theme";
import type { BestSlipsStatus } from "@/domain/best-slips-query";

const compactControl = css`
  box-sizing: border-box;
  min-inline-size: 0;
  min-block-size: 2rem;
  max-inline-size: 100%;
  padding: 4px 9px;
  color: ${({ theme }) => theme.color.text};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
  border-radius: 0;
  font: inherit;
  font-size: 0.75rem;
  line-height: 1.3;
  ${controlFeedback}
  ${focusRing}
  @media (pointer: coarse) { min-block-size: 44px; }
`;

export const FiltersPanel = styled.section`
  ${filterPanelColors}
  display: grid;
  gap: 5px;
  min-inline-size: 0;
  padding: 6px 8px;
  color: ${({ theme }) => theme.color.text};
  background: var(--filter-panel-background);
  border-block: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-inline: 0;
  border-radius: 0;
`;

export const FiltersRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  min-inline-size: 0;
`;

const toggleGroup = css`
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  background: ${({ theme }) => theme.color.surface};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 0;
  min-inline-size: 0;
`;

export const ToggleRow = styled.div`
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 10px;
  min-inline-size: 0;
`;

export const ResultGroup = styled.div`
  ${toggleGroup}
  flex: none;
`;

export const FilterButton = styled.button`
  ${compactControl}
  ${filterButtonColors}
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  cursor: pointer;
  &[aria-pressed="true"] {
    color: ${({ theme }) => theme.color.link};
    border-color: ${({ theme }) => theme.color.brand};
    background: ${({ theme }) => theme.color.brandSoft};
  }
  ${media.hover} { &:hover { background: ${({ theme }) => theme.color.rowHover}; } }
`;

export const DateGroup = styled.div`
  ${toggleGroup}
  flex: 0 1 auto;
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
`;

export const DateButton = styled(FilterButton)`
  min-block-size: 28px;
  padding: 3px 8px;
  flex: none;
  border: 1px solid transparent;
  color: ${({ theme }) => theme.color.mutedText};
  background: transparent;
  white-space: nowrap;
  [data-label-compact] { display: none; }
  &[aria-pressed="true"] {
    color: ${({ theme }) => theme.color.onBrand};
    background: ${({ theme }) => theme.color.brand};
    border-color: ${({ theme }) => theme.color.brand};
  }
  &:focus-visible { outline-offset: -3px; }
  &[aria-pressed="true"]:focus-visible { outline-color: ${({ theme }) => theme.color.onBrand}; }
  ${media.hover} { &[aria-pressed="true"]:hover { background: ${({ theme }) => theme.color.brandHover}; } }
  @media (max-width: 79.99rem) {
    padding-inline: 5px;
    [data-label-full] { display: none; }
    [data-label-compact] { display: inline; }
  }
  @media (pointer: coarse) { min-block-size: 44px; }
`;

export const ResultButton = styled(FilterButton)<{ $status: BestSlipsStatus }>`
  ${({ theme, $status }) => {
    const tone = $status === "all" ? { text: theme.color.text, background: theme.color.surfaceMuted }
      : theme.color.outcome[$status === "won" ? "correct" : $status === "lost" ? "incorrect" : "pending"];
    return css`
      --result-text: ${tone.text};
      --result-background: ${tone.background};
    `;
  }}
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-block-size: 28px;
  padding: 3px 8px;
  border: 1px solid transparent;
  color: var(--result-text);
  background: color-mix(in srgb, var(--result-background) 55%, ${({ theme }) => theme.color.surface});
  &::before { content: ""; inline-size: 5px; block-size: 5px; background: currentColor; }
  &[aria-pressed="true"] {
    color: ${({ theme }) => theme.color.surface};
    background: var(--result-text);
    border-color: var(--result-text);
  }
  ${media.hover} {
    &:hover:not([aria-pressed="true"]) { background: var(--result-background); border-color: var(--result-text); }
    &[aria-pressed="true"]:hover { background: var(--result-text); }
  }
  @media (pointer: coarse) { min-block-size: 44px; }
`;

export const ResetButton = styled(FilterButton)`
  margin-inline-start: auto;
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-block-size: 34px;
  padding: 4px 10px;
  border-color: ${({ theme }) => theme.color.buttonBorder};
  color: ${({ theme }) => theme.color.mutedText};
  background: ${({ theme }) => theme.color.surface};
  > svg { flex: none; font-size: 0.875rem; }
  ${media.hover} { &:hover { color: ${({ theme }) => theme.color.link}; background: ${({ theme }) => theme.color.brandSoft}; border-color: ${({ theme }) => theme.color.brand}; } }
  @media (pointer: coarse) { min-block-size: 44px; }
`;

export const RangeButton = styled(FilterButton)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-block-size: 24px;
  padding: 1px 4px;
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.color.link};
  font-size: 0.6875rem;
  > svg { flex: none; font-size: 0.875rem; }
  @media (pointer: coarse) { min-block-size: 44px; }
`;

export const AppliedSummary = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 3px 6px;
  min-inline-size: 0;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: 0.6875rem;
  line-height: 1.4;
  [data-applied-result] { color: ${({ theme }) => theme.color.text}; }
`;

export const RangeDialog = styled(CriteriaDialog)`
  border-radius: 0;
  button, input { border-radius: 0; }
`;

export const DateFields = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  > label { display: grid; gap: 5px; min-inline-size: 0; font-size: 0.8125rem; }
  input {
    ${compactControl}
    ${filterControlColors}
    inline-size: 100%;
    min-block-size: 40px;
    padding: 7px 9px;
    font-size: 0.875rem;
    &[aria-invalid="true"] { border-color: ${({ theme }) => theme.color.outcome.incorrect.text}; }
  }
`;

export const DateHint = styled.p`
  margin-block: 10px 0;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: 0.75rem;
`;

export const DateError = styled.p`
  margin-block: 10px 0;
  color: ${({ theme }) => theme.color.outcome.incorrect.text};
  font-size: 0.8125rem;
`;
