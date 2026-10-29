"use client";

import styled, { css } from "styled-components";
import { controlFeedback, filterButtonColors, filterControlColors, filterPanelColors, focusRing } from "@/components/ui/filter-chrome";
import { CriteriaDialog } from "@/components/ui/criteria-dialog";
import { media } from "@/styles/theme";

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
  gap: 6px;
  min-inline-size: 0;
  padding: 8px;
  color: ${({ theme }) => theme.color.text};
  background: var(--filter-panel-background);
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: 0;
`;

export const FiltersRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  min-inline-size: 0;
`;

export const PeriodLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-inline-size: 0;
  max-inline-size: 100%;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: 0.75rem;
`;

export const PeriodSelect = styled.select`
  ${compactControl}
  ${filterControlColors}
  inline-size: 10rem;
  cursor: pointer;
`;

export const ResultGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-inline-size: 0;
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

export const ResetButton = styled(FilterButton)`
  margin-inline-start: auto;
  border-color: transparent;
  color: ${({ theme }) => theme.color.mutedText};
  background: transparent;
`;

export const RangeButton = styled(FilterButton)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  > svg { flex: none; font-size: 0.875rem; }
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
