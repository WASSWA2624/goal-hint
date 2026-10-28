"use client";

import styled, { css } from "styled-components";
import { Button, ButtonLink } from "@/components/ui/controls";
import { controlFeedback, filterButtonColors, filterControlColors, filterPanelColors } from "@/components/ui/filter-chrome";
import { PageHeading, Stack, Surface } from "@/components/ui/layout";
import { media } from "@/styles/theme";

const compactControlHeight = "2rem";
const toolbarAction = css`
  min-block-size: ${compactControlHeight}; min-inline-size: 0; padding: 4px 8px;
  border-radius: 0; gap: 5px; font-size: 0.75rem; line-height: 1.3;
  > svg { flex: none; font-size: 0.875rem; }
  @media (pointer: coarse) { min-block-size: 44px; }
`;

export const SlipStack = styled(Stack)`gap: 10px; ${media.desktop} { gap: 12px; }`;
/** Preserve each phone surface's spacing while keeping adjacent desktop slips compact. */
export const SlipList = styled.div<{ $phoneGap?: number }>`
  display: grid; min-inline-size: 0; gap: ${({ $phoneGap = 10 }) => $phoneGap}px;
  ${media.desktop} { gap: 3px; }
`;
export const SlipHeading = styled(PageHeading)`font-size: 1.25rem; ${media.desktop} { font-size: 1.5rem; }`;
export const HeadingRow = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
  gap: 6px 12px; min-inline-size: 0;
  > h2 { font-size: 0.9375rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
`;
export const Note = styled.p`color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; line-height: 1.45;`;
export const CriteriaPanel = styled(Surface)`
  && { padding: 8px; border-radius: ${({ theme }) => theme.border.radius}; }
  ${media.desktop} { && { padding: 10px; } }
`;
export const BuilderPanel = styled(CriteriaPanel)`
  ${filterPanelColors}
  && { padding: 8px; border-radius: 0; }
  [data-criteria-dialog] { background: var(--filter-panel-background); }
`;
export const BuilderHeader = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: 12px; min-inline-size: 0;
  > h1 { font-size: 1.1875rem; }
  ${media.desktop} { > h1 { font-size: 1.375rem; } }
`;
export const CriteriaForm = styled.form`
  display: flex; flex-direction: column; gap: 6px;
  min-inline-size: 0;
  > [role="alert"] { margin: 0; }
`;
export const BuilderEssentials = styled.div`
  display: grid; grid-template-columns: 3.25rem minmax(0, 1fr); gap: 8px;
  align-items: end; min-inline-size: 0;
  > [data-slip-count] > div { gap: 2px; }
  > [data-slip-count] label { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.6875rem; font-weight: ${({ theme }) => theme.typography.weight.body}; }
  > [data-slip-count] input {
    min-block-size: ${compactControlHeight}; padding: 4px; border-radius: 0; font-size: 1rem;
    ${filterControlColors}
    ${controlFeedback}
    &[aria-invalid="true"] { border-color: ${({ theme }) => theme.color.outcome.incorrect.text}; }
  }
  ${media.desktop} {
    grid-template-columns: 6rem minmax(0, 1fr);
    > [data-slip-count] input { font-size: 0.75rem; }
  }
  @media (pointer: coarse) { > [data-slip-count] input { min-block-size: 44px; } }
`;
export const BuilderOptions = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  min-inline-size: 0; padding-block-start: 6px;
  border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
`;
export const CriteriaOptions = styled.div`
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); flex: 1 1 18rem;
  gap: 5px; min-inline-size: 0;
  &[hidden] { display: none; }
  ${media.desktop} { display: flex; flex: 0 1 auto; flex-wrap: wrap; gap: 6px; }
`;
export const CriteriaTrigger = styled(Button)`
  && {
    ${toolbarAction}
    inline-size: 100%; min-block-size: 36px; padding-inline: 6px;
    flex-direction: row; gap: 4px; font-weight: ${({ theme }) => theme.typography.weight.medium};
    ${filterButtonColors}
    > [data-criteria-label] { min-inline-size: 0; white-space: normal; }
    > [data-criteria-value] { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.6875rem; }
    > svg { font-size: 0.75rem; }
    > [data-criteria-count] {
      flex: none; display: inline-flex; align-items: center; justify-content: center;
      min-inline-size: 1rem; block-size: 1rem; padding-inline: 3px; border-radius: 0;
      color: ${({ theme }) => theme.color.link}; background: ${({ theme }) => theme.color.brandSoft};
      font-size: 0.6875rem; font-weight: ${({ theme }) => theme.typography.weight.medium}; font-variant-numeric: tabular-nums; line-height: 1;
    }
    &[data-edited="true"], &[aria-expanded="true"] { color: ${({ theme }) => theme.color.link}; border-color: ${({ theme }) => theme.color.brand}; background: ${({ theme }) => theme.color.brandSoft}; }
    ${controlFeedback}
  }
  ${media.desktop} { && { inline-size: auto; min-block-size: ${compactControlHeight}; padding-inline: 8px; } }
  @media (pointer: coarse) { && { min-block-size: 44px; } }
`;
export const CriteriaSummary = styled.p`
  margin: 0; min-inline-size: 0; color: ${({ theme }) => theme.color.mutedText};
  font-size: 0.6875rem; line-height: 1.4; overflow-wrap: anywhere;
`;
export const FieldGroup = styled.fieldset`
  border: 0; padding: 0; margin: 0; min-inline-size: 0;
  > legend { padding: 0; margin-block-end: 5px; font-size: 0.8125rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
`;
export const Fields = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px;
  > div { gap: 2px; }
  > div > label { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.6875rem; font-weight: ${({ theme }) => theme.typography.weight.body}; }
  > div > input { min-block-size: ${compactControlHeight}; padding: 4px 6px; border-radius: ${({ theme }) => theme.border.radius}; font-size: 1rem; }
  ${media.desktop} { > div > input { font-size: 0.875rem; } }
  @media (max-width: 22.5rem) { &[data-kickoff-fields] { grid-template-columns: minmax(0, 1fr); } }
  @media (pointer: coarse) { > div > input { min-block-size: 44px; } }
`;
export const LimitGroups = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px;
  @media (max-width: 22.5rem) { grid-template-columns: minmax(0, 1fr); }
  > fieldset { padding: 0; margin: 0; border: 0; min-inline-size: 0; }
  > fieldset > legend { padding: 0; margin-block-end: 4px; font-size: 0.75rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  > fieldset[data-joint-limit] { grid-column: 1 / -1; }
  > fieldset[data-joint-limit] > ${Note} { margin-block-start: 4px; }
`;
export const TargetGroups = styled(LimitGroups)`
  grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: end; gap: 8px;
  > fieldset > legend { font-size: 0.6875rem; font-weight: ${({ theme }) => theme.typography.weight.body}; margin-block-end: 3px; }
  ${Fields} { gap: 4px; }
  ${Fields} > div > input {
    padding-inline: 3px; border-radius: 0;
    ${filterControlColors}
    ${controlFeedback}
    &[aria-invalid="true"] { border-color: ${({ theme }) => theme.color.outcome.incorrect.text}; }
  }
  @media (max-width: 22.5rem) { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  ${media.desktop} { ${Fields} > div > input { font-size: 0.75rem; padding-inline: 6px; } }
`;
export const MarketChoices = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr);
`;
export const MarketChoice = styled.label`
  display: flex; align-items: center; gap: 6px; min-inline-size: 0; min-block-size: 1.75rem;
  padding: 4px 0; color: ${({ theme }) => theme.color.text};
  font-size: 0.75rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; cursor: pointer;
  > input { flex: none; inline-size: 1rem; block-size: 1rem; accent-color: ${({ theme }) => theme.color.brand}; }
  @media (pointer: coarse) { min-block-size: 44px; }
`;
export const MarketField = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; align-items: start; min-inline-size: 0; padding-block: 9px;
  border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  &:first-child { padding-block-start: 0; }
  &:last-child { padding-block-end: 0; border-block-end: 0; }
`;
export const ReuseRow = styled.div`
  display: flex; align-items: center; min-inline-size: 0; margin-block-start: 12px; padding-block-start: 10px;
  border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  > label { display: inline-flex; align-items: center; gap: 6px; font-size: 0.75rem; color: ${({ theme }) => theme.color.mutedText}; cursor: pointer; }
  input[type="checkbox"] { inline-size: 1rem; block-size: 1rem; accent-color: ${({ theme }) => theme.color.brand}; }
`;
export const Actions = styled.div`
  display: flex; flex: 1 0 auto; flex-wrap: wrap; align-items: center;
  justify-content: flex-end; gap: 4px; margin-inline-start: auto;
`;
export const BuildButton = styled(Button)`
  && { ${toolbarAction} }
`;
export const BuildLink = styled(ButtonLink)`
  && { ${toolbarAction} }
`;
export const ClearLink = styled(ButtonLink)`
  && { ${toolbarAction} }
`;
export const CriteriaError = styled.p`color: ${({ theme }) => theme.color.outcome.incorrect.text}; font-size: 0.8125rem;`;
export const Results = styled.section`
  display: grid; gap: 9px; min-inline-size: 0;
  &[aria-busy="true"] { opacity: 0.65; }
`;
