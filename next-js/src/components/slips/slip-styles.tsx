"use client";

import styled from "styled-components";
import { Button, ButtonLink } from "@/components/ui/controls";
import { PageHeading, Stack, Surface } from "@/components/ui/layout";
import { media } from "@/styles/theme";

const compactControlHeight = "2.125rem";

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
export const BuilderPanel = styled(CriteriaPanel)`&& { padding: 0; }`;
export const BuilderHeader = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: 12px; min-inline-size: 0;
  > h1 { font-size: 1.1875rem; }
  > div { flex: none; display: flex; flex-direction: row; align-items: center; gap: 7px; }
  > div > label { font-size: 0.6875rem; font-weight: ${({ theme }) => theme.typography.weight.body}; color: ${({ theme }) => theme.color.mutedText}; }
  > div > input { inline-size: 4rem; min-block-size: ${compactControlHeight}; padding: 4px 6px; border-radius: ${({ theme }) => theme.border.radius}; font-size: 1rem; }
  ${media.desktop} { > h1 { font-size: 1.375rem; } }
  @media (pointer: coarse) { > div > input { min-block-size: 44px; } }
`;
export const CriteriaForm = styled.form`
  display: grid; grid-template-columns: minmax(0, 1fr); gap: 0;
  min-inline-size: 0;
  > [data-criteria-field="targets"] { padding: 12px 12px 0; }
  > [data-criteria-dialog][data-enhanced="false"] { margin: 0 12px 12px; }
  > [role="alert"] { margin: 0 12px 10px; }
  ${media.desktop} {
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); column-gap: 16px; align-items: end;
    > [data-criteria-field="targets"] { padding-block-end: 12px; padding-inline-end: 0; }
    > [data-slip-criteria-options] { padding-inline-start: 0; }
    > [data-criteria-dialog][data-enhanced="false"], > [role="alert"], > [data-criteria-actions] { grid-column: 1 / -1; }
  }
`;
export const CriteriaOptions = styled.div`
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; padding: 10px 12px 12px; min-inline-size: 0;
  &[hidden] { display: none; }
`;
export const CriteriaTrigger = styled(Button)`
  && {
    inline-size: 100%; min-inline-size: 0; min-block-size: 44px; padding: 6px 4px;
    flex-direction: row; gap: 4px; border-radius: ${({ theme }) => theme.border.radius}; font-size: 0.75rem; line-height: 1.25;
    > [data-criteria-label] { min-inline-size: 0; white-space: normal; }
    > [data-criteria-count] {
      flex: none; display: inline-flex; align-items: center; justify-content: center;
      min-inline-size: 1rem; block-size: 1rem; padding-inline: 2px; border: 1px solid ${({ theme }) => theme.color.border};
      border-radius: ${({ theme }) => theme.border.radius};
      font-size: 0.625rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; font-variant-numeric: tabular-nums; line-height: 1;
    }
    &[data-edited="true"] { color: ${({ theme }) => theme.color.link}; background: ${({ theme }) => theme.color.brandSoft}; }
    @media (max-width: 22.5rem) { font-size: 0.6875rem; }
  }
  ${media.desktop} { && { min-block-size: ${compactControlHeight}; } }
  @media (pointer: coarse) { && { min-block-size: 44px; } }
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
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); align-items: end; gap: 10px;
  > fieldset > legend { font-size: 0.6875rem; margin-block-end: 3px; }
  ${Fields} { gap: 5px; }
  ${Fields} > div > input { padding-inline: 4px; }
  > fieldset:first-child ${Fields} { grid-template-columns: minmax(0, 1fr) minmax(4.375rem, 1.2fr); }
  @media (max-width: 22.5rem) { grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 8px; }
  ${media.desktop} {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
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
  display: flex; flex-wrap: wrap; align-items: center;
  justify-content: flex-end; gap: 6px; padding: 9px 12px;
  border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
`;
export const BuildButton = styled(Button)`
  && { min-block-size: 2.5rem; border-radius: ${({ theme }) => theme.border.radius}; padding: 6px 10px; font-size: 0.8125rem; }
  ${media.desktop} { && { min-block-size: 2.25rem; } }
`;
export const ClearLink = styled(ButtonLink)`
  && { min-block-size: 2.5rem; border-radius: ${({ theme }) => theme.border.radius}; padding: 6px 10px; font-size: 0.8125rem; }
  ${media.desktop} { && { min-block-size: 2.25rem; } }
`;
export const CriteriaError = styled.p`color: ${({ theme }) => theme.color.outcome.incorrect.text}; font-size: 0.8125rem;`;
export const Results = styled.section`
  display: grid; gap: 9px; min-inline-size: 0;
  &[aria-busy="true"] { opacity: 0.65; }
`;
