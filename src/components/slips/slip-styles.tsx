"use client";

import styled from "styled-components";
import { Button, ButtonLink } from "@/components/ui/controls";
import { PageHeading, Stack, Surface } from "@/components/ui/layout";
import { media } from "@/styles/theme";

export const SlipStack = styled(Stack)`gap: 10px; ${media.desktop} { gap: 12px; }`;
export const SlipHeading = styled(PageHeading)`font-size: 1.25rem; ${media.desktop} { font-size: 1.5rem; }`;
export const HeadingRow = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
  gap: 6px 12px; min-inline-size: 0;
  > h2 { font-size: 0.9375rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
`;
export const Note = styled.p`color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; line-height: 1.45;`;
export const CriteriaPanel = styled(Surface)`
  && { padding: 8px; border-radius: 0; }
  ${media.desktop} { && { padding: 10px; } }
`;
export const CriteriaForm = styled.form`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px;
  min-inline-size: 0; margin-block-start: 8px;
  ${media.desktop} { grid-template-columns: repeat(3, minmax(0, 1fr)); }
`;
export const FieldGroup = styled.fieldset`
  border: 0; padding: 0; margin: 0; min-inline-size: 0;
  > legend { padding: 0; margin-block-end: 5px; font-size: 0.8125rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  &[data-criteria-field="markets"] { grid-column: 1 / -1; }
  ${media.belowDesktop} { &[data-criteria-field="kickoff"] { grid-column: 1 / -1; } }
`;
export const Fields = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px;
  > div { gap: 2px; }
  > div > label { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; font-weight: ${({ theme }) => theme.typography.weight.body}; }
  > div > input { min-block-size: 2rem; padding: 3px 6px; border-radius: 0; font-size: 1rem; }
  ${media.desktop} { > div > input { font-size: 0.875rem; } }
`;
export const MarketChoices = styled.div`
  display: grid; gap: 4px; grid-template-columns: repeat(2, minmax(0, 1fr));
  ${media.tablet} { grid-template-columns: repeat(4, minmax(0, 1fr)); }
`;
export const MarketChoice = styled.label`
  display: flex; align-items: center; gap: 6px; min-inline-size: 0; min-block-size: 2rem;
  padding: 4px 6px; border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
  color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surfaceMuted};
  font-size: 0.75rem; cursor: pointer;
  &:has(input:checked) { background: ${({ theme }) => theme.color.brandSoft}; border-color: ${({ theme }) => theme.color.brand}; }
  > input { flex: none; inline-size: 1rem; block-size: 1rem; accent-color: ${({ theme }) => theme.color.brand}; }
`;
export const MarketField = styled.div`display: grid; gap: 4px; align-content: start; min-inline-size: 0;`;
export const Actions = styled.div`
  grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center;
  justify-content: flex-end; gap: 6px; padding-block-start: 7px;
  border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  > label { display: inline-flex; align-items: center; gap: 6px; margin-inline-end: auto; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; }
  input[type="checkbox"] { accent-color: ${({ theme }) => theme.color.brand}; }
  @media (max-width: 37.5rem) { > label { flex-basis: 100%; } > button { flex: 1; } }
`;
export const BuildButton = styled(Button)`
  && { min-block-size: 2.5rem; border-radius: 0; padding: 6px 10px; font-size: 0.8125rem; }
  ${media.desktop} { && { min-block-size: 2.25rem; } }
`;
export const ClearLink = styled(ButtonLink)`
  && { min-block-size: 2.5rem; border-radius: 0; padding: 6px 10px; font-size: 0.8125rem; }
  ${media.desktop} { && { min-block-size: 2.25rem; } }
`;
export const CriteriaError = styled.p`grid-column: 1 / -1; color: ${({ theme }) => theme.color.outcome.incorrect.text}; font-size: 0.8125rem;`;
export const Results = styled.section`
  display: grid; gap: 9px; min-inline-size: 0;
  &[aria-busy="true"] { opacity: 0.65; }
`;
export const SlipCard = styled.article`
  min-inline-size: 0; border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.surface};
`;
export const SlipTitle = styled.header`
  display: flex; flex-wrap: wrap; align-items: center; gap: 5px 10px; min-inline-size: 0;
  padding: 7px 9px; background: ${({ theme }) => theme.color.surfaceMuted};
  border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  > h3 { font-size: 0.875rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  > span { color: ${({ theme }) => theme.color.link}; font-size: 0.6875rem; }
`;
export const SlipSummary = styled.dl`
  display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px;
  min-inline-size: 0; margin: 0 0 0 auto; padding: 0; font-size: 0.6875rem;
  > div { display: flex; align-items: baseline; gap: 4px; }
  dt { color: ${({ theme }) => theme.color.mutedText}; }
  dd { margin: 0; font-weight: ${({ theme }) => theme.typography.weight.bold}; font-variant-numeric: tabular-nums; }
  ${media.desktop} { font-size: 0.75rem; }
`;
export const Table = styled.table`
  inline-size: 100%; border-collapse: collapse; table-layout: fixed; text-align: start;
  th, td { padding: 6px 5px; vertical-align: middle; overflow-wrap: anywhere; border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border}; }
  th { font-size: 0.6875rem; font-weight: ${({ theme }) => theme.typography.weight.body}; color: ${({ theme }) => theme.color.mutedText}; }
  td { font-size: 0.75rem; }
  tbody tr:last-child td { border-block-end: 0; }
  [data-column="match"] { inline-size: 43%; }
  [data-column="selection"] { inline-size: 40%; }
  [data-column="odds"] { inline-size: 17%; text-align: end; font-variant-numeric: tabular-nums; }
  [data-column="kickoff"], [data-column="probability"] { display: none; }
  [data-mobile] { display: block; margin-block-start: 3px; font-size: 0.6875rem; }
  [data-mobile="kickoff"] { color: ${({ theme }) => theme.color.mutedText}; }
  [data-mobile="probability"], [data-column="probability"] strong { color: ${({ theme }) => theme.color.link}; }
  [data-market] { color: ${({ theme }) => theme.color.mutedText}; display: block; }
  [data-separator] { display: none; }
  a { color: inherit; font-weight: ${({ theme }) => theme.typography.weight.bold}; text-decoration: none; }
  a:hover { color: ${({ theme }) => theme.color.link}; text-decoration: underline; }
  a:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
  ${media.desktop} {
    th, td { padding: 7px 9px; }
    td { font-size: 0.8125rem; }
    [data-column="match"] { inline-size: 32%; }
    [data-column="selection"] { inline-size: 30%; }
    [data-column="kickoff"] { display: table-cell; inline-size: 20%; }
    [data-column="odds"], [data-column="probability"] { inline-size: 9%; text-align: end; }
    [data-column="probability"] { display: table-cell; }
    [data-mobile] { display: none; }
    [data-market], [data-separator] { display: inline; }
  }
`;
