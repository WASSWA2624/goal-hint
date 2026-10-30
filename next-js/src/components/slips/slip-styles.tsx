"use client";

import styled, { css } from "styled-components";
import { Button, ButtonLink } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/feedback";
import { controlFeedback, filterButtonColors, filterControlColors, filterPanelColors } from "@/components/ui/filter-chrome";
import { PageHeading, Stack, Surface } from "@/components/ui/layout";
import { media } from "@/styles/theme";

const compactControlHeight = "2rem";
const mobileToolbarFontSize = "0.75rem";
const mobileToolbarValueFontSize = "0.875rem";
const toolbarAction = css`
  min-block-size: ${compactControlHeight}; min-inline-size: 0; padding: 4px 8px;
  border-radius: ${({ theme }) => theme.radius.control}; gap: 5px; font-size: 0.75rem; line-height: 1.3;
  > svg { flex: none; font-size: 0.875rem; }
  @media (pointer: coarse) { min-block-size: 44px; }
`;
const desktopBuildAction = css`
  ${media.desktop} {
    && {
      flex: none; inline-size: 13rem; min-inline-size: 13rem;
      block-size: ${compactControlHeight}; min-block-size: ${compactControlHeight};
      padding: 4px 8px; border-radius: ${({ theme }) => theme.radius.control}; font-size: 0.75rem; line-height: 1.3; white-space: nowrap;
    }
    @media (pointer: coarse) { && { block-size: 44px; min-block-size: 44px; } }
  }
`;
const mobileBuildAction = css`
  ${media.belowDesktop} {
    && {
      flex: none; inline-size: 13rem; min-inline-size: 13rem;
      block-size: 36px; min-block-size: 36px; padding: 4px 8px;
      font-size: ${mobileToolbarFontSize}; line-height: 1.3; white-space: nowrap;
    }
  }
`;
const desktopGroupDivider = css`
  padding-inline-start: 10px;
  border-inline-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
`;
const desktopGroupTitle = css`
  color: ${({ theme }) => theme.color.mutedText}; font-size: 0.6875rem;
  font-weight: ${({ theme }) => theme.typography.weight.body}; line-height: 1.3;
`;

export const BuildActionLabel = styled.span`
  > [data-action-label="desktop"] { display: none; }
  ${media.desktop} {
    > [data-action-label="mobile"] { display: none; }
    > [data-action-label="desktop"] { display: inline; }
  }
`;
export const AccessNotice = styled(EmptyState)`
  ${media.belowDesktop} {
    padding: 8px;
    > h3 { font-size: 0.8125rem; line-height: 1.3; }
    > div { font-size: 0.75rem; line-height: 1.4; }
  }
`;
export const StatusCopy = styled.span`
  > [data-slip-access-message="desktop"] { display: none; }
  ${media.desktop} {
    > [data-slip-access-message="mobile"] { display: none; }
    > [data-slip-access-message="desktop"] { display: inline; }
  }
`;

export const SlipStack = styled(Stack)`
  gap: 10px;
  ${media.belowDesktop} { &[data-slip-builder-page] { gap: 6px; } }
  ${media.desktop} {
    gap: 12px;
    &[data-slip-builder-page] { gap: 6px; }
    &[data-best-slips-page] { gap: 4px; }
  }
`;
/** Preserve each phone surface's spacing while keeping adjacent desktop slips compact. */
export const SlipList = styled.div<{ $phoneGap?: number }>`
  display: grid; min-inline-size: 0; gap: ${({ $phoneGap = 10 }) => $phoneGap}px;
  ${media.desktop} { gap: 4.5px; }
`;
export const SlipHeading = styled(PageHeading)`font-size: 1.25rem; ${media.desktop} { font-size: 1.5rem; }`;
export const HeadingRow = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
  gap: 6px 12px; min-inline-size: 0;
  > h2 { font-size: 0.9375rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
`;
export const Note = styled.p`color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; line-height: 1.45;`;
export const CriteriaPanel = styled(Surface)`
  && { padding: 8px; border-radius: ${({ theme }) => theme.radius.surface}; }
  ${media.desktop} { && { padding: 10px; } }
`;
export const BuilderPanel = styled(CriteriaPanel)`
  ${filterPanelColors}
  && { padding: 8px; border-radius: ${({ theme }) => theme.radius.surface}; }
  [data-criteria-dialog] { background: var(--filter-panel-background); }
  [data-slip-label="mobile"] { display: none; }
  ${media.belowDesktop} {
    && { padding: 6px; }
    [data-slip-label="desktop"] { display: none; }
    [data-slip-label="mobile"] { display: inline; }
    && [data-slip-builder-essentials] { grid-template-columns: 3.5rem minmax(0, 1fr); gap: 6px; }
    && [data-slip-count] { align-self: stretch; }
    && [data-slip-count] > div { block-size: 100%; justify-content: space-between; }
    && [data-slip-count] label, && [data-criteria-field="targets"] [data-slip-floating-field] > label,
    && [data-slip-target-groups] > fieldset > legend {
      /* Keep the existing label line boxes so larger type does not move controls. */
      font-size: ${mobileToolbarFontSize}; line-height: 0.78125rem; white-space: nowrap;
    }
    && [data-slip-target-groups] { gap: 6px; }
    && [data-slip-target-groups] > fieldset > legend { margin-block-end: 8px; }
    && [data-slip-builder-essentials] [data-slip-numeric-field] {
      block-size: 36px; min-block-size: 36px; padding-block: 2px; font-size: ${mobileToolbarValueFontSize};
    }
    && [data-slip-builder-options] { gap: 4px; padding-block-start: 4px; }
    && [data-slip-criteria-options] { grid-template-columns: 1.15fr 1.1fr 0.9fr; gap: 4px; }
    && [data-criteria-trigger] {
      min-block-size: 36px; padding: 3px; gap: 2px; font-size: clamp(0.6875rem, 3.125vw, 0.75rem); line-height: 1.2;
    }
    &&& [data-criteria-label] { white-space: nowrap; }
    &&& [data-criteria-value] { display: none; }
    && [data-criteria-trigger] > svg { font-size: 0.625rem; }
    &&& [data-criteria-count] {
      min-inline-size: 0.8125rem; block-size: 0.8125rem; padding-inline: 2px; font-size: 0.6875rem;
    }
    && [data-criteria-actions] { flex: 1 0 100%; margin-inline-start: 0; }
    && [data-slip-criteria-summary] { font-size: clamp(0.625rem, 3.125vw, 0.6875rem); line-height: 0.84375rem; }
    && [data-criteria-dialog] > header, && [data-criteria-dialog] > footer { padding: 8px 10px; }
    && [data-criteria-dialog] > header > h2 { font-size: 0.875rem; }
    && [data-criteria-dialog] > header button { min-block-size: 36px; min-inline-size: 36px; }
    && [data-criteria-dialog] > div { padding: 10px; }
    && [data-criteria-dialog] label[for] { font-size: 0.6875rem; line-height: 1.25; }
    && [data-criteria-dialog] input:not([type="checkbox"]):not([type="hidden"]) {
      min-block-size: 36px; padding-block: 2px; font-size: 1rem;
    }
    &&& [data-criteria-dialog] input[data-slip-numeric-field] { font-size: 0.875rem; }
    && [data-criteria-dialog] fieldset > legend { margin-block-end: 8px; }
    && [data-kickoff-fields] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    && [data-criteria-dialog] > footer button { min-block-size: 36px; padding-block: 4px; font-size: 0.75rem; }
    ${media.tablet} {
      && [data-slip-criteria-options] { flex: 1 1 18rem; }
      && [data-criteria-actions] { flex: 0 0 auto; margin-inline-start: auto; }
    }
    @supports (-webkit-touch-callout: none) {
      && [data-slip-numeric-field] { font-size: 0.875rem !important; }
      && [data-slip-builder-essentials] input[data-slip-numeric-field] { font-size: ${mobileToolbarValueFontSize} !important; }
    }
  }
`;
export const BuilderHeader = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: 12px; min-inline-size: 0;
  > h1 { font-size: 1.1875rem; }
  ${media.belowDesktop} {
    position: absolute; inline-size: 1px; block-size: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0;
  }
  ${media.desktop} {
    position: absolute; inline-size: 1px; block-size: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0;
  }
`;
export const CriteriaForm = styled.form`
  display: flex; flex-direction: column; gap: 6px;
  min-inline-size: 0;
  > [role="alert"] { margin: 0; }
  ${media.desktop} {
    &[data-enhanced="true"] {
      flex-direction: row; flex-wrap: wrap; align-items: stretch; gap: 8px 10px;
      > [data-slip-builder-essentials] { display: contents; }
      [data-criteria-field="targets"], [data-slip-target-groups] { display: contents; }
      [data-slip-criteria-options]:not([hidden]) { display: contents; }
      > [role="alert"], > [data-slip-criteria-summary] { flex: 1 0 100%; }
    }
  }
`;
export const BuilderEssentials = styled.div`
  display: grid; grid-template-columns: 3.25rem minmax(0, 1fr); gap: 8px;
  align-items: end; min-inline-size: 0;
  > [data-slip-count] > div { gap: 2px; }
  > [data-slip-count] label { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.6875rem; font-weight: ${({ theme }) => theme.typography.weight.body}; }
  [data-slip-count-label="desktop"] { display: none; }
  > [data-slip-count] input {
    min-block-size: ${compactControlHeight}; padding: 4px; border-radius: ${({ theme }) => theme.radius.control}; font-size: 1rem;
    ${filterControlColors}
    ${controlFeedback}
    &[aria-invalid="true"] { border-color: ${({ theme }) => theme.color.outcome.incorrect.text}; }
  }
  ${media.desktop} {
    grid-template-columns: 4.25rem max-content; gap: 12px;
    > [data-slip-count] { flex: none; inline-size: 4.25rem; }
    > [data-slip-count] > div { block-size: 100%; justify-content: space-between; }
    > [data-slip-count] label { ${desktopGroupTitle} }
    [data-slip-count-label="mobile"] { display: none; }
    [data-slip-count-label="desktop"] { display: inline; }
    > [data-slip-count] input { font-size: 0.75rem; font-variant-numeric: tabular-nums; }
  }
  @media (pointer: coarse) { > [data-slip-count] input { min-block-size: 44px; } }
`;
export const BuilderOptions = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  min-inline-size: 0; padding-block-start: 6px;
  border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  ${media.desktop} { display: contents; }
`;
export const CriteriaOptions = styled.div`
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); flex: 1 1 18rem;
  gap: 5px; min-inline-size: 0;
  &[hidden] { display: none; }
  ${media.desktop} { display: flex; flex: 0 1 auto; flex-wrap: wrap; gap: 6px; align-items: end; }
`;
export const CriteriaOption = styled.div`
  display: contents;
  [data-criteria-view="desktop"] { display: none; }
  ${media.desktop} {
    display: flex; flex: none; flex-direction: column; justify-content: space-between; gap: 8px;
    ${desktopGroupDivider}
    > [data-criteria-title] { white-space: nowrap; }
    [data-criteria-view="mobile"] { display: none; }
    [data-criteria-view="desktop"] { display: inline; }
  }
`;
export const CriteriaTitle = styled.span`
  display: none;
  ${media.desktop} { display: block; ${desktopGroupTitle} }
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
      min-inline-size: 1rem; block-size: 1rem; padding-inline: 3px; border-radius: ${({ theme }) => theme.radius.small};
      color: ${({ theme }) => theme.color.link}; background: ${({ theme }) => theme.color.brandSoft};
      font-size: 0.6875rem; font-weight: ${({ theme }) => theme.typography.weight.medium}; font-variant-numeric: tabular-nums; line-height: 1;
    }
    &[data-edited="true"], &[aria-expanded="true"] { color: ${({ theme }) => theme.color.link}; border-color: ${({ theme }) => theme.color.brand}; background: ${({ theme }) => theme.color.brandSoft}; }
    ${controlFeedback}
  }
  ${media.desktop} { && { inline-size: 100%; min-block-size: ${compactControlHeight}; padding-inline: 8px; } }
  @media (pointer: coarse) { && { min-block-size: 44px; } }
`;
export const CriteriaSummary = styled.p`
  margin: 0; min-inline-size: 0; color: ${({ theme }) => theme.color.mutedText};
  font-size: 0.6875rem; line-height: 1.4; overflow-wrap: anywhere;
  > [data-slip-summary-layout="desktop"] { display: none; }
  ${media.desktop} {
    > [data-slip-summary-layout="mobile"] { display: none; }
    > [data-slip-summary-layout="desktop"] {
      display: flex; flex-wrap: wrap; gap: 4px 12px;
      > span { display: inline-flex; flex-wrap: wrap; gap: 4px; }
      strong { font-weight: ${({ theme }) => theme.typography.weight.medium}; color: ${({ theme }) => theme.color.text}; }
    }
  }
`;
export const FieldGroup = styled.fieldset`
  border: 0; padding: 0; margin: 0; min-inline-size: 0;
  > legend { padding: 0; margin-block-end: 5px; font-size: 0.8125rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
`;
export const Fields = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px;
  > div { gap: 2px; }
  > div > label { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.6875rem; font-weight: ${({ theme }) => theme.typography.weight.body}; }
  > div > input { min-block-size: ${compactControlHeight}; padding: 4px 6px; border-radius: ${({ theme }) => theme.radius.control}; font-size: 1rem; }
  ${media.desktop} { > div > input { font-size: 0.875rem; } }
  @media (max-width: 22.5rem) { &[data-kickoff-fields] { grid-template-columns: minmax(0, 1fr); } }
  @media (pointer: coarse) { > div > input { min-block-size: 44px; } }
`;
export const LimitGroups = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px;
  @media (max-width: 22.5rem) { grid-template-columns: minmax(0, 1fr); }
  > fieldset { padding: 0; margin: 0; border: 0; min-inline-size: 0; }
  > fieldset > legend { padding: 0; margin-block-end: 8px; font-size: 0.75rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  > fieldset[data-joint-limit] { grid-column: 1 / -1; }
  > fieldset[data-joint-limit] > ${Note} { margin-block-start: 4px; }
`;
export const TargetGroups = styled(LimitGroups)`
  grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: end; gap: 8px;
  > fieldset > legend { font-size: 0.6875rem; font-weight: ${({ theme }) => theme.typography.weight.body}; margin-block-end: 8px; }
  ${Fields} { gap: 4px; }
  ${Fields} > div > input {
    padding-inline: 3px; border-radius: ${({ theme }) => theme.radius.small};
    ${filterControlColors}
    ${controlFeedback}
    &[aria-invalid="true"] { border-color: ${({ theme }) => theme.color.outcome.incorrect.text}; }
  }
  @media (max-width: 22.5rem) { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  ${media.desktop} {
    grid-template-columns: repeat(2, max-content); gap: 12px;
    > fieldset { flex: none; ${desktopGroupDivider} }
    > fieldset > legend { ${desktopGroupTitle} }
    ${Fields} { grid-template-columns: repeat(2, 6rem); }
    ${Fields} > div > input { font-size: 0.75rem; padding-inline: 6px; font-variant-numeric: tabular-nums; }
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
  display: flex; flex: 1 0 auto; flex-wrap: wrap; align-items: center;
  justify-content: flex-end; gap: 4px; margin-inline-start: auto;
  ${media.desktop} {
    flex: 1 0 auto; flex-direction: column; align-items: stretch; justify-content: space-between; gap: 8px;
    ${desktopGroupDivider}
  }
`;
export const ActionControls = styled.div`
  display: contents;
  ${media.desktop} { display: flex; align-items: center; gap: 4px; }
`;
export const BuildButton = styled(Button)`
  && { ${toolbarAction} }
  ${desktopBuildAction}
  ${mobileBuildAction}
`;
export const BuildLink = styled(ButtonLink)`
  && { ${toolbarAction} }
  ${desktopBuildAction}
  ${mobileBuildAction}
`;
export const ClearLink = styled(ButtonLink)`
  && { ${toolbarAction} flex: 1 1 auto; }
  ${media.desktop} { && { ${filterButtonColors} } }
  ${media.belowDesktop} {
    && { flex: 1 1 0; inline-size: auto; min-inline-size: 4rem; block-size: 36px; min-block-size: 36px; padding: 4px; font-size: ${mobileToolbarFontSize}; white-space: nowrap; ${filterButtonColors} }
  }
`;
export const CriteriaError = styled.p`color: ${({ theme }) => theme.color.outcome.incorrect.text}; font-size: 0.8125rem;`;
export const Results = styled.section`
  display: grid; gap: 9px; min-inline-size: 0;
  &[aria-busy="true"] { opacity: 0.65; }
`;
