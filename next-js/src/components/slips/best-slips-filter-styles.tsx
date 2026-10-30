"use client";

import styled, { css } from "styled-components";
import { controlFeedback, filterButtonColors, filterControlColors, filterPanelColors, focusRing } from "@/components/ui/filter-chrome";
import { CriteriaDialog } from "@/components/ui/criteria-dialog";
import { SelectMenu } from "@/components/ui/select-menu";
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
  border-radius: ${({ theme }) => theme.radius.control};
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
  padding: 0;
  color: ${({ theme }) => theme.color.text};
  background: transparent;
  border: 0;
  border-radius: ${({ theme }) => theme.radius.none};
  ${media.belowDesktop} {
    padding: 4px; border: 1px solid color-mix(in srgb, ${({ theme }) => theme.color.accent.blue.text} 28%, ${({ theme }) => theme.color.border});
    border-radius: ${({ theme }) => theme.radius.control};
    background: color-mix(in srgb, ${({ theme }) => theme.color.accent.blue.soft} 65%, ${({ theme }) => theme.color.surface});
  }
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
  border-radius: ${({ theme }) => theme.radius.surface};
  min-inline-size: 0;
`;

export const ToggleRow = styled.div`
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 10px;
  min-inline-size: 0;
  @media (max-width: 79.99rem) { gap: 6px; }
  ${media.desktop} {
    gap: 10px 14px;
    @media (max-width: 79.99rem) { flex-wrap: wrap; }
  }
  ${media.belowDesktop} { flex-wrap: wrap; gap: 4px; }
`;

export const ResultGroup = styled.div`
  ${toggleGroup}
  flex: 0 1 auto;
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: ${({ theme }) => theme.color.border} transparent;
  &::-webkit-scrollbar { block-size: 3px; }
  &::-webkit-scrollbar-thumb { background: ${({ theme }) => theme.color.border}; }
  ${media.desktop} {
    gap: 6px;
    padding: 3px;
    background: transparent;
    @media (max-width: 79.99rem) { flex: 1 0 100%; box-sizing: border-box; }
  }
  ${media.belowDesktop} {
    order: 2; flex: 1 0 100%; display: flex; flex-wrap: nowrap;
    gap: 4px; padding: 0; border: 0; border-radius: ${({ theme }) => theme.radius.none};
    overflow-x: auto; overflow-y: hidden; overscroll-behavior-inline: contain; background: transparent;
  }
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
  ${media.desktop} { font-weight: 500; }
`;

export const DateControls = styled.div`
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  min-inline-size: 0;
  margin-inline-start: 8px;
  padding-inline-start: 14px;
  border-inline-start: 1px solid ${({ theme }) => theme.color.border};
  @media (max-width: 79.99rem) { margin-inline-start: 2px; padding-inline-start: 8px; gap: 6px; }
  ${media.desktop} {
    @media (max-width: 79.99rem) { margin-inline-start: 0; padding-inline-start: 0; border-inline-start: 0; }
  }
  ${media.belowDesktop} { flex: 1 1 12rem; gap: 4px; margin: 0; padding: 0; border: 0; }
`;

/** A visual floating label complements the SelectMenu's existing accessible name. */
export const DateField = styled.div`
  display: contents;
  > [data-slip-date-label] { display: none; }
  ${media.belowDesktop} {
    position: relative; display: block; flex: 1; min-inline-size: 0;
    > [data-slip-date-label] {
      position: absolute; inset-block-start: 3px; inset-inline-start: 9px; z-index: 1;
      display: block; color: ${({ theme }) => theme.color.mutedText};
      font-size: .6875rem; line-height: 1.2; pointer-events: none;
    }
  }
`;

export const DateSelect = styled(SelectMenu)`
  flex: none;
  > [data-select-trigger] {
    font-weight: ${({ theme }) => theme.typography.weight.medium};
    box-shadow: 0 1px 2px color-mix(in srgb, ${({ theme }) => theme.color.text} 6%, transparent);
    ${media.hover} { &:hover { border-color: ${({ theme }) => theme.color.brand}; } }
    ${media.desktop} { font-size: .8125rem; border-color: ${({ theme }) => theme.color.accent.blue.text}; }
  }
  ${media.belowDesktop} {
    inline-size: 100%;
    > [data-select-trigger] { min-block-size: 44px; padding: 17px 8px 3px; font-size: .875rem; box-shadow: none; }
  }
`;

export const CustomRangeButton = styled(FilterButton)`
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 5px;
  min-block-size: 34px;
  padding: 4px 8px;
  border-radius: ${({ theme }) => theme.radius.control};
  white-space: nowrap;
  > svg { color: ${({ theme }) => theme.color.brand}; }
  > svg { flex: none; font-size: 0.875rem; }
  @media (pointer: coarse) { min-block-size: 44px; }
  ${media.desktop} { font-size: .8125rem; font-weight: 600; border-color: ${({ theme }) => theme.color.accent.blue.text}; }
  ${media.belowDesktop} { min-block-size: 44px; padding: 4px 6px; }
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
  gap: 5px;
  min-block-size: 28px;
  padding: 3px 6px;
  white-space: nowrap;
  border: 1px solid transparent;
  color: var(--result-text);
  background: color-mix(in srgb, var(--result-background) 55%, ${({ theme }) => theme.color.surface});
  &::before { content: ""; inline-size: 5px; block-size: 5px; background: currentColor; }
  > strong { font-size: 0.6875rem; font-variant-numeric: tabular-nums; }
  [data-slip-result-percent] { font-size: 0.6875rem; font-variant-numeric: tabular-nums; }
  [data-mobile-result-percent] { display: none; }
  &:focus-visible { outline-offset: -3px; }
  &[aria-pressed="true"]:focus-visible { outline-color: ${({ theme }) => theme.color.surface}; }
  &[aria-pressed="true"] {
    color: ${({ theme }) => theme.color.surface};
    background: var(--result-text);
    border-color: var(--result-text);
  }
  ${media.hover} {
    &:hover:not([aria-pressed="true"]) { background: var(--result-background); border-color: var(--result-text); }
    &[aria-pressed="true"]:hover { background: var(--result-text); }
  }
  @media (max-width: 79.99rem) { gap: 3px; padding-inline: 4px; }
  @media (pointer: coarse) { min-block-size: 44px; }
  ${media.desktop} {
    gap: 6px;
    min-block-size: 36px;
    padding: 6px 10px;
    font-size: .8125rem;
    > strong { font-size: .8125rem; font-weight: 700; }
    [data-slip-result-percent] { font-size: .75rem; font-weight: 500; }
    @media (pointer: coarse) { min-block-size: 44px; }
    ${({ theme, $status }) => $status === "all" && css`
      &[aria-pressed="true"], &[aria-pressed="true"]:hover {
        color: ${theme.color.accent.blue.text}; background: ${theme.color.accent.blue.soft};
        border-color: ${theme.color.accent.blue.text};
      }
      &[aria-pressed="true"]:focus-visible { outline-color: ${theme.color.accent.blue.text}; }
    `}
  }
  ${media.belowDesktop} {
    gap: 4px; min-block-size: 44px; padding: 4px 6px; border-color: var(--result-text);
    border-radius: ${({ theme }) => theme.radius.control}; font-size: .8125rem;
    &::before { display: none; }
    > strong { font-size: .8125rem; font-weight: 700; }
    [data-slip-result-percent] { font-size: .75rem; }
    [data-mobile-result-percent] { display: inline; }
    ${({ theme, $status }) => $status === "all" && css`
      color: ${theme.color.accent.blue.text}; background: ${theme.color.accent.blue.soft}; border-color: ${theme.color.accent.blue.text};
      &[aria-pressed="true"], &[aria-pressed="true"]:hover {
        color: ${theme.color.accent.blue.soft}; background: ${theme.color.accent.blue.text}; border-color: ${theme.color.accent.blue.text};
      }
    `}
  }
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
  ${media.desktop} { font-size: .8125rem; }
  ${media.belowDesktop} { min-block-size: 44px; padding: 4px 6px; }
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
  justify-content: space-between;
  gap: 3px 12px;
  min-inline-size: 0;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: 0.6875rem;
  line-height: 1.4;
  [data-applied-result] { color: ${({ theme }) => theme.color.text}; }
  [data-best-slips-summary] { margin-inline-start: auto; font-variant-numeric: tabular-nums; }
  ${media.desktop} {
    font-size: .75rem;
    font-weight: 500;
    [data-best-slips-summary] { color: ${({ theme }) => theme.color.text}; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
  }
`;

export const AppliedDetails = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 3px 6px;
  min-inline-size: 0;
`;

export const RangeDialog = styled(CriteriaDialog)`
  border-radius: ${({ theme }) => theme.radius.overlay};
  button, input { border-radius: ${({ theme }) => theme.radius.control}; }
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
  ${media.belowDesktop} { grid-template-columns: minmax(0, 1fr); input { font-size: 1rem; } }
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
