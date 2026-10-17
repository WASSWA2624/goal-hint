"use client";

import styled from "styled-components";
import { Button, ButtonLink } from "@/components/ui/controls";
import { PageHeading, Stack, Surface } from "@/components/ui/layout";
import type { MarketFamily } from "@/domain/markets";
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
export const CriteriaForm = styled.form<{ $hasError: boolean }>`
  display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px;
  grid-template-areas: "targets" "limits" "kickoff" "markets" "reuse" "hint" ${({ $hasError }) => $hasError ? '"error"' : ""} "actions";
  min-inline-size: 0;
  > [data-criteria-field="targets"] { grid-area: targets; }
  > [data-slip-criteria-group="limits"] { grid-area: limits; }
  > [data-slip-criteria-group="kickoff"] { grid-area: kickoff; }
  > [data-slip-criteria-group="markets"] { grid-area: markets; }
  > [data-criteria-hint] { grid-area: hint; font-size: 0.6875rem; }
  ${media.belowDesktop} {
    > [data-slip-criteria-group] {
      border-color: ${({ theme }) => theme.color.border}; background: ${({ theme }) => theme.color.surface};
      > summary { padding: 7px 9px; }
      > summary > span { gap: 2px; }
      > summary strong { font-size: 0.75rem; }
      > summary small { font-size: 0.6875rem; }
      &[open] > div { padding-block-start: 8px; border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border}; }
    }
  }
  ${media.desktop} {
    grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px;
    grid-template-areas: "targets limits kickoff" "markets markets markets" "hint hint hint" ${({ $hasError }) => $hasError ? '"error error error"' : ""} "reuse actions actions";
  }
`;
export const FieldGroup = styled.fieldset`
  border: 0; padding: 0; margin: 0; min-inline-size: 0;
  > legend { padding: 0; margin-block-end: 5px; font-size: 0.8125rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  &[data-criteria-field="markets"] { grid-area: markets; }
`;
export const Fields = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px;
  > div { gap: 2px; }
  > div > label { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; font-weight: ${({ theme }) => theme.typography.weight.body}; }
  > div > input { min-block-size: 2rem; padding: 3px 6px; border-radius: 0; font-size: 1rem; }
  ${media.desktop} { > div > input { font-size: 0.875rem; } }
`;
export const LimitGroups = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px;
  @media (max-width: 22.5rem) { grid-template-columns: minmax(0, 1fr); }
  > fieldset { padding: 0; margin: 0; border: 0; min-inline-size: 0; }
  > fieldset > legend { padding: 0; margin-block-end: 4px; font-size: 0.75rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
`;
export const TargetGroups = styled(LimitGroups)`
  grid-template-columns: 2.75rem minmax(0, 1.3fr) minmax(0, 1fr); align-items: end; gap: 7px;
  > div { gap: 2px; }
  > div > label { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.6875rem; font-weight: ${({ theme }) => theme.typography.weight.body}; }
  > div > input { min-block-size: 2rem; padding: 3px 5px; font-size: 1rem; }
  > fieldset > legend { font-size: 0.6875rem; margin-block-end: 3px; }
  > div > label { margin-block-end: 1.25rem; }
  ${Fields} { gap: 4px; }
  ${Fields} > div > label { font-size: 0.625rem; }
  ${Fields} > div > input { padding-inline: 4px; }
  @media (max-width: 22.5rem) { grid-template-columns: 2.5rem minmax(0, 1.3fr) minmax(0, 1fr); gap: 5px; }
  ${media.desktop} {
    grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start;
    > div { grid-column: 1 / -1; max-inline-size: 6rem; }
    > div > label { margin-block-end: 0; }
    > div > input { font-size: 0.875rem; }
  }
`;
export const MarketChoices = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr);
  ${media.desktop} { gap: 8px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
`;
export const MarketChoice = styled.label`
  display: flex; align-items: center; gap: 6px; min-inline-size: 0; min-block-size: 2.5rem;
  padding: 4px 0; color: ${({ theme }) => theme.color.text};
  font-size: 0.75rem; cursor: pointer;
  > input { flex: none; inline-size: 1rem; block-size: 1rem; accent-color: ${({ theme }) => theme.color.brand}; }
`;
export const MarketField = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 0.85fr); gap: 8px; align-items: start; min-inline-size: 0;
  border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  > details > summary {
    min-block-size: 2.5rem; padding: 4px 0; border: 0;
    color: ${({ theme }) => theme.color.link}; background: transparent; font-size: 0.6875rem;
  }
  > details > fieldset { position: static; margin-block-end: 6px; box-shadow: none; }
  ${media.desktop} { grid-template-columns: minmax(0, 1fr); gap: 0; }
`;
export const ReuseRow = styled.div`
  grid-area: reuse; display: flex; align-items: center; min-inline-size: 0;
  > label { display: inline-flex; align-items: center; gap: 6px; font-size: 0.75rem; color: ${({ theme }) => theme.color.mutedText}; cursor: pointer; }
  input[type="checkbox"] { inline-size: 1rem; block-size: 1rem; accent-color: ${({ theme }) => theme.color.brand}; }
  ${media.desktop} { padding-block-start: 7px; border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border}; }
`;
export const Actions = styled.div`
  grid-area: actions; display: flex; flex-wrap: wrap; align-items: center;
  justify-content: flex-end; gap: 6px; padding-block-start: 7px;
  border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  @media (max-width: 37.5rem) { > button { flex: 1; } }
`;
export const BuildButton = styled(Button)`
  && { min-block-size: 2.5rem; border-radius: 0; padding: 6px 10px; font-size: 0.8125rem; }
  ${media.desktop} { && { min-block-size: 2.25rem; } }
`;
export const ClearLink = styled(ButtonLink)`
  && { min-block-size: 2.5rem; border-radius: 0; padding: 6px 10px; font-size: 0.8125rem; }
  ${media.desktop} { && { min-block-size: 2.25rem; } }
`;
export const CriteriaError = styled.p`grid-area: error; color: ${({ theme }) => theme.color.outcome.incorrect.text}; font-size: 0.8125rem;`;
export const Results = styled.section`
  display: grid; gap: 9px; min-inline-size: 0;
  &[aria-busy="true"] { opacity: 0.65; }
`;
export const SlipCard = styled.article`
  min-inline-size: 0; border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: 0; background: ${({ theme }) => theme.color.surface};
`;
export const SlipTitle = styled.header`
  display: flex; flex-wrap: wrap; align-items: center; gap: 5px 10px; min-inline-size: 0;
  padding: 7px 9px; background: ${({ theme }) => theme.color.surface};
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
export const SlipMarket = styled.span<{ $family: MarketFamily }>`
  display: block; margin-block-end: 3px;
  color: ${({ theme, $family }) => theme.color.market[$family].text};
  font-size: 0.625rem; line-height: 1.2;
`;
export const SlipPick = styled.span<{ $family: MarketFamily }>`
  display: inline-flex; flex-wrap: wrap; align-items: baseline; gap: 2px 4px; max-inline-size: 100%; padding: 2px 5px;
  border-inline-start: 2px solid ${({ theme, $family }) => theme.color.market[$family].solid};
  color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surface};
  font-size: 0.8125rem; font-weight: ${({ theme }) => theme.typography.weight.heavy};
  line-height: 1.3;
  [data-pick-selection] { white-space: normal; }
  @media (max-width: 22.5rem) { font-size: 0.75rem; }
`;
export const Table = styled.table`
  inline-size: 100%; table-layout: fixed; text-align: start;
  border-collapse: separate; border-spacing: 0 5px; padding: 0 6px 1px;
  background: ${({ theme }) => theme.color.page};
  thead { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); }
  tbody tr { position: relative; background: ${({ theme }) => theme.color.surface}; }
  th, td { padding: 28px 7px 7px; vertical-align: middle; overflow-wrap: anywhere; }
  td { border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border}; font-size: 0.75rem; }
  [data-column="match"] { inline-size: 58%; border-inline-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border}; }
  [data-column="selection"] { inline-size: 42%; border-inline-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border}; border-inline-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border}; }
  [data-column="kickoff"], [data-column="probability"] { display: none; }
  [data-mobile="metadata"] {
    position: absolute; inset-block-start: 0; inset-inline: 0;
    display: flex; align-items: center; justify-content: space-between; gap: 7px; min-inline-size: 0;
    padding: 3px 6px; border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    background: ${({ theme }) => theme.color.surfaceMuted}; color: ${({ theme }) => theme.color.mutedText};
    font-size: 0.625rem; line-height: 1.4;
    > time { flex: none; white-space: nowrap; font-variant-numeric: tabular-nums; }
  }
  [data-competition] { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  [data-team-list] { display: grid; gap: 4px; }
  [data-team-side] { display: flex; align-items: center; gap: 5px; min-inline-size: 0; line-height: 1.3; }
  [data-team-logo] { --gh-logo-size: 17px; --gh-logo-font: 0.5625rem; }
  [data-versus] { display: none; }
  [data-mobile="probability"] { display: block; margin-block-start: 4px; }
  [data-probability-content] { display: flex; align-items: center; gap: 5px; min-inline-size: 0; max-inline-size: 8.25rem; }
  [data-probability-content] strong { flex: none; font-size: 0.6875rem; font-weight: ${({ theme }) => theme.typography.weight.medium}; font-variant-numeric: tabular-nums; }
  a { color: inherit; font-weight: ${({ theme }) => theme.typography.weight.bold}; text-decoration: none; }
  a:hover { color: ${({ theme }) => theme.color.link}; text-decoration: underline; }
  a:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
  ${media.desktop} {
    border-collapse: collapse; border-spacing: 0; padding: 0; background: ${({ theme }) => theme.color.surface};
    thead { position: static; inline-size: auto; block-size: auto; overflow: visible; clip-path: none; }
    th, td { padding: 7px 9px; }
    th { text-align: start; color: ${({ theme }) => theme.header.text}; background: ${({ theme }) => theme.header.background}; font-size: 0.6875rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
    td { font-size: 0.8125rem; }
    tbody tr:nth-child(even) { background: ${({ theme }) => theme.color.surfaceMuted}; }
    tbody tr:last-child td { border-block-end: 0; }
    [data-column="match"] { inline-size: 36%; border-inline-start: 0; }
    [data-column="selection"] { inline-size: 26%; border-inline: 0; }
    [data-column="kickoff"] { display: table-cell; inline-size: 24%; font-variant-numeric: tabular-nums; }
    td[data-column="kickoff"] { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; }
    [data-column="probability"] { display: table-cell; inline-size: 14%; }
    [data-mobile] { display: none; }
    [data-team-list] { display: flex; align-items: center; gap: 8px; }
    [data-team-side] { flex: 1; }
    [data-team-name] { min-inline-size: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    [data-versus] { display: inline; color: ${({ theme }) => theme.color.mutedText}; font-weight: ${({ theme }) => theme.typography.weight.body}; }
    [data-probability-content] { margin-inline-start: auto; }
  }
`;
