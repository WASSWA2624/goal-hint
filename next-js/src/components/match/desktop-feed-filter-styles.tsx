"use client";

import { controlBodyHeight, controlRow } from "@/components/ui/control-layout";

import { FloatingField } from "@/components/ui/floating-field";

import styled, { css } from "styled-components";
import { Button } from "@/components/ui/controls";
import { media } from "@/styles/theme";
import { filterDialogSurface } from "@/components/ui/dialog-surfaces";
import { pageFilterPanel } from "@/components/ui/filter-chrome";
import { filledAction } from "@/components/ui/filled-surfaces";
import { controlFeedback, filterButtonColors, filterControlColors, filterPanelColors, focusRing } from "./filter-parts";

const fieldControl = css`
  box-sizing: border-box;
  inline-size: 100%;
  min-inline-size: 0;
  min-block-size: var(--form-control-height);
  padding: var(--gh-spacing-2) var(--gh-spacing-2_75);
  border: 0;
  border-radius: ${({ theme }) => theme.radius.control};
  color: ${({ theme }) => theme.color.text};
  ${filterControlColors}
  font: inherit;
  font-size: var(--gh-font-emphasis);
  line-height: var(--gh-leading-label);
  &::placeholder { color: ${({ theme }) => theme.color.mutedText}; opacity: 1; }
  &:disabled { color: ${({ theme }) => theme.color.disabledText}; background: ${({ theme }) => theme.color.disabledSurface}; cursor: not-allowed; }
  &[aria-invalid="true"] { color: ${({ theme }) => theme.color.outcome.incorrect.text}; background: ${({ theme }) => theme.color.outcome.incorrect.background}; }
  ${controlFeedback}
  ${focusRing}
`;

/** Toolbar density is independent of the unchanged dialog fields below. */
const toolbarFieldControl = css`
  ${fieldControl}
  min-block-size: var(--form-control-height);
  padding: var(--gh-spacing-1) var(--gh-spacing-2);
  border-radius: ${({ theme }) => theme.radius.control};
  background: ${({ theme }) => theme.color.field};
  font-size: var(--gh-font-secondary);
`;

/** Desktop-only exports keep the existing phone filter components independent. */
export const Panel = styled.form`
  ${filterPanelColors}
  ${pageFilterPanel}
  display: grid;
  gap: var(--gh-spacing-1_5);
  inline-size: 100%;
  min-inline-size: 0;
  border: 0;
  border-radius: ${({ theme }) => theme.radius.none};
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.page};
  [data-criteria-dialog] { ${filterDialogSurface} }
`;

export const SearchRow = styled.div`
  display: grid;
  grid-template-columns: minmax(var(--gh-size-56), 1fr) repeat(3, minmax(0, var(--gh-size-48)));
  align-items: stretch;
  gap: var(--gh-spacing-1_5);
  min-inline-size: 0;
  > * { min-inline-size: 0; }

  ${controlRow}
`;

export const PeriodField = styled.div`
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
  gap: var(--gh-spacing-1_5);
  min-inline-size: 0;
`;

export const SectionButton = styled.button`
  display: flex;
  align-items: center;
  flex: 0 1 auto;
  gap: var(--gh-spacing-1_5);
  max-inline-size: 100%;
  min-inline-size: 0;
  min-block-size: var(--form-control-height);
  padding: var(--gh-spacing-1) var(--gh-spacing-2);
  border-radius: ${({ theme }) => theme.radius.control};
  color: ${({ theme }) => theme.color.text};
  ${filterButtonColors}
  font: inherit;
  font-size: var(--gh-font-secondary);
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  line-height: var(--gh-leading-label);
  text-align: start;
  cursor: pointer;
  > svg { flex: none; color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-emphasis); }
  > svg:last-child { font-size: var(--gh-font-secondary); }
  > [data-section-label] { min-inline-size: 0; }
  &[data-active="true"], &[aria-expanded="true"] { color: ${({ theme }) => theme.color.link};  background: ${({ theme }) => theme.color.brandSoft}; }
  ${media.hover} { &:hover:enabled {  background: ${({ theme }) => theme.color.rowHover}; } }
  &:disabled { color: ${({ theme }) => theme.color.disabledText}; background: ${({ theme }) => theme.color.disabledSurface}; cursor: not-allowed; }
  ${focusRing}
`;

export const Count = styled.span`
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  min-inline-size: var(--gh-size-4);
  min-block-size: var(--gh-size-4);
  padding: var(--gh-spacing-0_25) var(--gh-spacing-1);
  border-radius: ${({ theme }) => theme.radius.small};
  color: ${({ theme }) => theme.color.link};
  background: ${({ theme }) => theme.color.brandSoft};
  font-size: var(--gh-font-caption);
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  line-height: var(--gh-leading-solid);
  font-variant-numeric: tabular-nums;
`;

export const ActionRow = styled.div`
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gh-spacing-1_5);
  min-inline-size: 0;
  > [data-picks] {
    display: flex;
    flex: 0 1 auto;
    align-items: center;
    gap: var(--gh-spacing-1_5);
    min-inline-size: 0;
    min-block-size: var(--form-control-height);
    font-size: var(--gh-font-secondary);
    cursor: pointer;
    > label { gap: var(--gh-spacing-1_5); min-block-size: var(--form-control-height); font-size: var(--gh-font-secondary); line-height: var(--gh-leading-label); }
    input { flex: none; inline-size: var(--gh-size-3_5); block-size: var(--gh-size-3_5); margin: 0; accent-color: ${({ theme }) => theme.color.brand}; ${focusRing} }
    @media (pointer: coarse) { &, > label { min-block-size: var(--form-control-height); } }
  }
  > [data-filter-submit-actions] { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gh-spacing-1); margin-inline-start: auto; }
`;

export const SortField = styled(FloatingField)`
  max-inline-size: 100%;
  min-inline-size: 0;
  > select {
    ${toolbarFieldControl}
    cursor: pointer;
  }
`;

export const ActionButton = styled(Button)`
  && {
    border: 0;
    &[type="reset"] { ${filledAction} }
    flex: none;
    gap: var(--gh-spacing-1_5);
    min-inline-size: 0;
    ${controlBodyHeight}
    padding: var(--gh-spacing-1) var(--gh-spacing-2);
    border-radius: ${({ theme }) => theme.radius.control};
    font-size: var(--gh-font-secondary);
    line-height: var(--gh-leading-heading);
    white-space: nowrap;
    > svg { flex: none; font-size: var(--gh-font-emphasis); }
  }
`;

export const DialogContent = styled.div`
  min-inline-size: 0;
  fieldset { min-inline-size: 0; margin: 0; padding: 0; border: 0; }
  fieldset + fieldset { margin-block-start: var(--gh-spacing-3_75); padding-block-start: var(--gh-spacing-3_25); border-block-start: 0; }
  legend { margin-block-end: var(--gh-spacing-1_75); padding: 0; font-size: var(--gh-font-body); font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  [data-fields] { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gh-spacing-2_5); }
  [data-input][data-full] { grid-column: 1 / -1; }
  input[data-option-search] { margin-block-end: var(--gh-spacing-1_5); }
  label[data-choice] { display: flex; align-items: center; gap: var(--gh-spacing-2); min-block-size: var(--form-control-height); font-size: var(--gh-font-body); cursor: pointer; }
  input[type="checkbox"] { flex: none; inline-size: var(--gh-size-4); block-size: var(--gh-size-4); margin: 0; accent-color: ${({ theme }) => theme.color.brand}; ${focusRing} }
  [data-options] { max-block-size: var(--gh-size-45); overflow-y: auto; overscroll-behavior: contain; }
  [data-help] { margin-block-start: var(--gh-spacing-1_75); color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); line-height: var(--gh-leading-compact); }
`;

export const Error = styled.p.attrs({ role: "alert" })`
  margin: 0;
  color: ${({ theme }) => theme.color.outcome.incorrect.text};
  font-size: var(--gh-font-body);
  line-height: var(--gh-leading-compact);
`;

export const Muted = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: var(--gh-font-secondary);
  line-height: var(--gh-leading-compact);
`;
