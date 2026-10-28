"use client";

import styled, { css } from "styled-components";
import { Button } from "@/components/ui/controls";
import { media } from "@/styles/theme";
import { controlFeedback, filterControlColors, filterPanelColors, focusRing } from "./filter-parts";

const fieldControl = css`
  box-sizing: border-box;
  inline-size: 100%;
  min-inline-size: 0;
  min-block-size: 40px;
  padding: 8px 11px;
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
  border-radius: ${({ theme }) => theme.border.radius};
  color: ${({ theme }) => theme.color.text};
  ${filterControlColors}
  font: inherit;
  font-size: 0.875rem;
  line-height: 1.3;
  &::placeholder { color: ${({ theme }) => theme.color.mutedText}; opacity: 1; }
  &:disabled { color: ${({ theme }) => theme.color.disabledText}; background: ${({ theme }) => theme.color.disabledSurface}; cursor: not-allowed; }
  &[aria-invalid="true"] { border-color: ${({ theme }) => theme.color.outcome.incorrect.text}; }
  ${controlFeedback}
  ${focusRing}
`;

/** Toolbar density is independent of the unchanged dialog fields below. */
const toolbarFieldControl = css`
  ${fieldControl}
  min-block-size: 2rem;
  padding: 4px 8px;
  border-radius: 0;
  background: ${({ theme }) => theme.color.surface};
  font-size: 0.75rem;
  @media (pointer: coarse) { min-block-size: 44px; }
`;

/** Desktop-only exports keep the existing phone filter components independent. */
export const Panel = styled.form`
  ${filterPanelColors}
  display: grid;
  gap: 6px;
  inline-size: 100%;
  min-inline-size: 0;
  padding: 8px;
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: 0;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  [data-criteria-dialog] { background: var(--filter-panel-background); }
`;

export const SearchRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 6px;
  min-inline-size: 0;
  > [data-feed-search] { flex: 1 1 14rem; }
`;

export const PeriodField = styled.label`
  display: flex;
  flex: 0 1 auto;
  max-inline-size: 100%;
  min-inline-size: 0;
  > select { ${toolbarFieldControl} block-size: 100%; cursor: pointer; }
`;


export const OptionsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-inline-size: 0;
`;

export const SectionButton = styled.button`
  display: flex;
  align-items: center;
  flex: 0 1 auto;
  gap: 6px;
  max-inline-size: 100%;
  min-inline-size: 0;
  min-block-size: 2rem;
  padding: 4px 8px;
  border-radius: 0;
  color: ${({ theme }) => theme.color.text};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.surface};
  font: inherit;
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  line-height: 1.3;
  text-align: start;
  cursor: pointer;
  > svg { flex: none; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.875rem; }
  > svg:last-child { font-size: 0.75rem; }
  > [data-section-label] { min-inline-size: 0; }
  @media (pointer: coarse) { min-block-size: 44px; }
  &[data-active="true"], &[aria-expanded="true"] { color: ${({ theme }) => theme.color.link}; border-color: ${({ theme }) => theme.color.brand}; background: ${({ theme }) => theme.color.brandSoft}; }
  ${media.hover} { &:hover:enabled { border-color: ${({ theme }) => theme.color.brand}; background: ${({ theme }) => theme.color.rowHover}; } }
  &:disabled { color: ${({ theme }) => theme.color.disabledText}; background: ${({ theme }) => theme.color.disabledSurface}; cursor: not-allowed; }
  ${focusRing}
`;

export const Count = styled.span`
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  min-inline-size: 16px;
  min-block-size: 16px;
  padding: 1px 4px;
  border-radius: 0;
  color: ${({ theme }) => theme.color.link};
  background: ${({ theme }) => theme.color.brandSoft};
  font-size: 0.6875rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  line-height: 1;
  font-variant-numeric: tabular-nums;
`;

export const ActionRow = styled.div`
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-inline-size: 0;
  > [data-picks] {
    display: flex;
    flex: 0 1 auto;
    align-items: center;
    gap: 6px;
    min-inline-size: 0;
    min-block-size: 2rem;
    font-size: 0.75rem;
    cursor: pointer;
    > label { gap: 6px; min-block-size: 2rem; font-size: 0.75rem; line-height: 1.3; }
    input { flex: none; inline-size: 14px; block-size: 14px; margin: 0; accent-color: ${({ theme }) => theme.color.brand}; ${focusRing} }
    @media (pointer: coarse) { &, > label { min-block-size: 44px; } }
  }
  > [data-filter-submit-actions] { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-inline-start: auto; }
`;

export const SortField = styled.label`
  display: flex;
  flex: 0 1 auto;
  max-inline-size: 100%;
  min-inline-size: 0;
  > select {
    ${toolbarFieldControl}
    cursor: pointer;
  }
`;

export const ActionButton = styled(Button)`
  && {
    flex: none;
    gap: 6px;
    min-inline-size: 0;
    min-block-size: 2rem;
    padding: 4px 8px;
    border-radius: 0;
    font-size: 0.75rem;
    line-height: 1.25;
    white-space: nowrap;
    > svg { flex: none; font-size: 0.875rem; }
    @media (pointer: coarse) { min-block-size: 44px; }
  }
`;

export const DialogContent = styled.div`
  min-inline-size: 0;
  fieldset { min-inline-size: 0; margin: 0; padding: 0; border: 0; }
  fieldset + fieldset { margin-block-start: 15px; padding-block-start: 13px; border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border}; }
  legend { margin-block-end: 7px; padding: 0; font-size: 0.8125rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  [data-fields] { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  label[data-input] { display: flex; flex-direction: column; gap: 4px; min-inline-size: 0; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; }
  label[data-input][data-full] { grid-column: 1 / -1; }
  label[data-input] > input, label[data-input] > select, input[data-option-search] { ${fieldControl} }
  input[data-option-search] { margin-block-end: 6px; }
  label[data-choice] { display: flex; align-items: center; gap: 8px; min-block-size: 36px; font-size: 0.8125rem; cursor: pointer; }
  input[type="checkbox"] { flex: none; inline-size: 16px; block-size: 16px; margin: 0; accent-color: ${({ theme }) => theme.color.brand}; ${focusRing} }
  [data-options] { max-block-size: 180px; overflow-y: auto; overscroll-behavior: contain; }
  [data-help] { margin-block-start: 7px; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; line-height: 1.4; }
`;

export const Error = styled.p.attrs({ role: "alert" })`
  margin: 0;
  color: ${({ theme }) => theme.color.outcome.incorrect.text};
  font-size: 0.8125rem;
  line-height: 1.4;
`;

export const Muted = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: 0.75rem;
  line-height: 1.4;
`;
