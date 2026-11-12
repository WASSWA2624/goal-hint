"use client";

import { controlBodyHeight } from "@/components/ui/control-layout";
import styled, { css } from "styled-components";
import { Button, ButtonLink } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/feedback";
import { controlFeedback, filterControlColors, filterPanelColors, pageFilterPanel } from "@/components/ui/filter-chrome";
import { desktopContentPadding, desktopSectionFrame, joinedDesktopSections, PageHeading, Stack, Surface } from "@/components/ui/layout";
import { MarketFilterChoice } from "@/components/ui/market-filter-dialog";
import { media } from "@/styles/theme";
import { filterDialogSurface } from "@/components/ui/dialog-surfaces";

const compactControlHeight = "var(--form-control-height)";
const mobileToolbarFontSize = "var(--gh-font-secondary)";
const mobileToolbarValueFontSize = "var(--gh-font-emphasis)";
export const slipToolbarControl = css`
  ${controlBodyHeight}
  min-block-size: ${compactControlHeight}; min-inline-size: 0; padding: var(--gh-spacing-1) var(--gh-spacing-2);
  border-radius: ${({ theme }) => theme.radius.control}; gap: var(--gh-spacing-1_25); font-size: var(--gh-font-secondary); line-height: var(--gh-leading-label);
  > svg { flex: none; font-size: var(--gh-font-emphasis); }
  @media (pointer: coarse) { min-block-size: var(--gh-size-11); }
`;
const desktopGroupTitle = css`
  color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-caption);
  font-weight: ${({ theme }) => theme.typography.weight.body}; line-height: var(--gh-leading-label);
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
    padding: var(--gh-spacing-2);
    > h3 { font-size: var(--gh-font-body); line-height: var(--gh-leading-label); }
    > div { font-size: var(--gh-font-secondary); line-height: var(--gh-leading-compact); }
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
  gap: var(--gh-spacing-2_5);
  ${media.belowDesktop} { &[data-slip-builder-page], &[data-best-slips-page] { gap: var(--gh-spacing-1_5); } }
  ${media.desktop} {
    gap: var(--gh-spacing-3);
  }
  &[data-slip-builder-page], &[data-best-slips-page] { ${joinedDesktopSections} }
  &[data-slip-builder-page], &[data-best-slips-page] {
    > p { ${desktopContentPadding()} }
  }
`;
/** Slip collections share one generous gap at every viewport width. */
export const SlipList = styled.div<{ $inset?: boolean }>`
  display: grid; min-inline-size: 0; gap: ${({ theme }) => theme.layout.slipGap};
  ${({ $inset = true }) => $inset && desktopContentPadding()}
`;
export const SlipHeading = styled(PageHeading)`font-size: var(--gh-font-heading); ${media.desktop} { font-size: var(--gh-font-headline); }`;
export const HeadingRow = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
  gap: var(--gh-spacing-1_5) var(--gh-spacing-3); min-inline-size: 0;
  > h2 { font-size: var(--gh-font-reading); font-weight: ${({ theme }) => theme.typography.weight.bold}; }
`;
export const Note = styled.p`color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); line-height: var(--gh-leading-reading);`;
export const CriteriaPanel = styled(Surface)`
  && { padding: var(--gh-spacing-2); border-radius: ${({ theme }) => theme.radius.surface}; }
  ${media.desktop} { && { padding: var(--gh-spacing-2_5); } }
  && { ${desktopSectionFrame} ${desktopContentPadding(true)} }
`;
export const BuilderPanel = styled(CriteriaPanel)`
  && { background: ${({ theme }) => theme.color.surface}; }
  ${filterPanelColors}
  && { padding: var(--gh-spacing-2); border-radius: ${({ theme }) => theme.radius.surface}; }
  [data-criteria-dialog] { ${filterDialogSurface} }
  ${pageFilterPanel}
  && { ${desktopSectionFrame} ${desktopContentPadding(true)} }
  ${media.belowDesktop} {
    && { padding-block: ${({ theme }) => theme.layout.sectionPadding}; }
    && [data-slip-builder-essentials] { grid-template-columns: var(--gh-size-20) minmax(0, 1fr); gap: var(--gh-spacing-1_5); }
    && [data-slip-count] { align-self: end; }
    && [data-slip-count] > legend, && [data-criteria-field="targets"] [data-slip-floating-field] > label,
    && [data-slip-target-groups] > fieldset > legend {
      /* Keep the existing label line boxes so larger type does not move controls. */
      font-size: ${mobileToolbarFontSize}; line-height: var(--gh-size-3_125); white-space: nowrap;
    }
    && [data-slip-target-groups] { gap: var(--gh-spacing-1_5); }
    && [data-slip-target-groups] > fieldset:not([data-floating-outline]) > legend { margin-block-end: var(--gh-spacing-2); }
    && [data-slip-builder-essentials] [data-slip-numeric-field] {
      block-size: var(--form-control-height); min-block-size: var(--form-control-height); padding-block: var(--gh-spacing-2); font-size: ${mobileToolbarValueFontSize};
    }
    && [data-slip-builder-options] { gap: var(--gh-spacing-1); padding-block-start: var(--gh-spacing-1); }
    && :is([data-criteria-trigger], [data-saved-filters-trigger]) {
      min-block-size: var(--form-control-height); padding-inline: var(--gh-spacing-1_5);
      font-size: var(--gh-font-secondary); line-height: var(--gh-leading-control);
    }
    && [data-criteria-trigger] > svg { font-size: var(--gh-font-micro); }
    &&& [data-criteria-count] {
      min-inline-size: var(--gh-size-3_25); block-size: var(--gh-size-3_25); padding-inline: var(--gh-spacing-0_5); font-size: var(--gh-font-caption);
    }
    && [data-criteria-actions] { flex: 1 0 100%; margin-inline-start: 0; }
    && [data-slip-criteria-summary] { font-size: clamp(var(--gh-font-micro), 3.125vw, var(--gh-font-caption)); line-height: var(--gh-size-3_375); }
    && [data-criteria-dialog] > header, && [data-criteria-dialog] > footer { padding: var(--gh-spacing-2) var(--gh-spacing-2_5); }
    && [data-criteria-dialog] > header > h2 { font-size: var(--gh-font-emphasis); }
    && [data-criteria-dialog] > header button { min-block-size: var(--form-control-height); min-inline-size: var(--gh-size-9); }
    && [data-criteria-dialog] > div { padding: var(--gh-spacing-2_5); }
    && [data-criteria-dialog] label[for] { font-size: var(--gh-font-caption); line-height: var(--gh-leading-heading); }
    && [data-criteria-dialog] input:not([type="checkbox"], [type="hidden"], [data-date-part]) {
      min-block-size: var(--form-control-height); padding-block: var(--gh-spacing-2); font-size: var(--gh-font-section);
    }
    &&& [data-criteria-dialog] input[data-slip-numeric-field] { font-size: var(--gh-font-emphasis); }
    && [data-criteria-dialog] fieldset:not([data-floating-outline]) > legend { margin-block-end: var(--gh-spacing-2); }
    && [data-kickoff-fields] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    && [data-criteria-dialog] > footer button { min-block-size: var(--form-control-height); padding-block: var(--gh-spacing-1); font-size: var(--gh-font-secondary); }
    @supports (-webkit-touch-callout: none) {
      && [data-slip-numeric-field] { font-size: var(--gh-font-emphasis) !important; }
      && [data-slip-builder-essentials] input[data-slip-numeric-field] { font-size: ${mobileToolbarValueFontSize} !important; }
    }
  }
`;
export const BuilderHeader = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: var(--gh-spacing-3); min-inline-size: 0;
  > h1 { font-size: var(--gh-font-lead); }
  ${media.belowDesktop} {
    position: absolute; inline-size: var(--gh-size-0_25); block-size: var(--gh-size-0_25); padding: 0; margin: calc(-1 * var(--gh-spacing-0_25));
    overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0;
  }
  ${media.desktop} {
    position: absolute; inline-size: var(--gh-size-0_25); block-size: var(--gh-size-0_25); padding: 0; margin: calc(-1 * var(--gh-spacing-0_25));
    overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0;
  }
`;
export const CriteriaForm = styled.form`
  display: flex; flex-direction: column; gap: var(--gh-spacing-1_5);
  min-inline-size: 0;
  > [role="alert"] { margin: 0; }
`;
export const BuilderEssentials = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--gh-spacing-2);
  align-items: end; min-inline-size: 0;
  [data-slip-label="mobile"] { display: none; }
  ${media.belowDesktop} {
    [data-slip-label="desktop"] { display: none; }
    [data-slip-label="mobile"] { display: inline; }
  }
  > [data-slip-count] { min-inline-size: 0; max-inline-size: var(--gh-size-36); margin: 0; padding: 0; border: 0; }
  > [data-slip-count] > legend { ${desktopGroupTitle} margin-block-end: var(--gh-spacing-2); padding: 0; white-space: nowrap; }
  > [data-slip-count] input { font-variant-numeric: tabular-nums; }
`;
export const BuilderOptions = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: center;
  gap: var(--gh-spacing-1_5); min-inline-size: 0;
  &:has(> [hidden]) { grid-template-columns: minmax(0, 1fr); }
  > div > :is(button, a) { inline-size: 100%; }
  ${media.desktop} {
    display: flex; flex-wrap: wrap;
    > div > :is(button, a) { inline-size: auto; }
  }
`;
export const CriteriaOptions = styled.div`
  display: flex; flex: none;
  &[hidden] { display: none; }
`;
export const CriteriaSummaryPanel = styled.section`
  display: grid; gap: var(--gh-spacing-1_5); min-inline-size: 0;
  margin-block-end: var(--gh-spacing-1);
  > h2 {
    margin: 0; color: ${({ theme }) => theme.color.text};
    font-size: var(--gh-font-body); font-weight: var(--gh-weight-bold); line-height: var(--gh-leading-label);
  }
`;
export const CriteriaSummary = styled.dl`
  display: flex; flex-wrap: wrap; gap: var(--gh-spacing-1_5);
  margin: 0; min-inline-size: 0;
  font-size: var(--gh-font-secondary); line-height: var(--gh-leading-compact); overflow-wrap: anywhere;
  > div {
    display: flex; align-items: baseline; justify-content: space-between; gap: var(--gh-spacing-2);
    flex: 1 1 auto; min-inline-size: 0; max-inline-size: 100%;
    padding: var(--gh-spacing-1_25) var(--gh-spacing-2);
    background: color-mix(in srgb, ${({ theme }) => theme.color.field} calc(var(--gh-opacity-60) * 100%), transparent);
  }
  > [data-summary-wide] { justify-content: flex-start; }
  ${media.belowDesktop} { > [data-summary-wide] { flex-basis: 100%; } }
  dt { flex: none; color: ${({ theme }) => theme.color.mutedText}; }
  dd { min-inline-size: 0; margin: 0; color: ${({ theme }) => theme.color.text}; font-weight: var(--gh-weight-medium); font-variant-numeric: tabular-nums; }
`;
export const FieldGroup = styled.fieldset`
  border: 0; padding: 0; margin: 0; min-inline-size: 0;
  > legend { padding: 0; margin-block-end: var(--gh-spacing-1_25); font-size: var(--gh-font-body); font-weight: ${({ theme }) => theme.typography.weight.bold}; }
`;
export const Fields = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gh-spacing-1_25);
  > div { gap: var(--gh-spacing-0_5); }
  > div > label { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-caption); font-weight: ${({ theme }) => theme.typography.weight.body}; }
  > div > input { min-block-size: ${compactControlHeight}; padding: var(--gh-spacing-1) var(--gh-spacing-1_5); border-radius: ${({ theme }) => theme.radius.control}; font-size: var(--gh-font-section); }
  ${media.desktop} { > div > input { font-size: var(--gh-font-emphasis); } }
  @media (max-width: ${({ theme }) => theme.viewport[22.5]}) { &[data-kickoff-fields] { grid-template-columns: minmax(0, 1fr); } }
  @media (pointer: coarse) { > div > input { min-block-size: var(--gh-size-11); } }
`;
const LimitGroups = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gh-spacing-2);
  @media (max-width: ${({ theme }) => theme.viewport[22.5]}) { grid-template-columns: minmax(0, 1fr); }
  > fieldset { padding: 0; margin: 0; border: 0; min-inline-size: 0; }
  > fieldset > legend { padding: 0; margin-block-end: var(--gh-spacing-2); font-size: var(--gh-font-secondary); font-weight: ${({ theme }) => theme.typography.weight.bold}; }
`;
export const TargetGroups = styled(LimitGroups)`
  grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: end; gap: var(--gh-spacing-2);
  > fieldset > legend { font-size: var(--gh-font-caption); font-weight: ${({ theme }) => theme.typography.weight.body}; margin-block-end: var(--gh-spacing-2); }
  ${Fields} { gap: var(--gh-spacing-1); }
  ${Fields} > div > input {
    padding-inline: var(--gh-spacing-0_75); border-radius: ${({ theme }) => theme.radius.small};
    ${filterControlColors}
    ${controlFeedback}
    &[aria-invalid="true"] { color: ${({ theme }) => theme.color.outcome.incorrect.text}; background: ${({ theme }) => theme.color.outcome.incorrect.background}; }
  }
  @media (max-width: ${({ theme }) => theme.viewport[22.5]}) { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gh-spacing-1_5); }
  ${media.desktop} {
    gap: var(--gh-spacing-3);
    > fieldset > legend { ${desktopGroupTitle} }
    ${Fields} { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    ${Fields} > div > input { font-size: var(--gh-font-secondary); padding-inline: var(--gh-spacing-1_5); font-variant-numeric: tabular-nums; }
  }
`;
export const MarketChoices = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr);
`;
export const MarketChoice = styled(MarketFilterChoice)`
  font-weight: ${({ theme }) => theme.typography.weight.bold};
`;
export const MarketField = styled(FieldGroup)`
  padding-block-end: var(--gh-spacing-1_5);
  &:not(:last-child) { border-block-end: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; }
  > legend { margin-block-end: 0; }
  > [data-choice-inline] {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--gh-size-20)), 1fr));
    gap: var(--gh-spacing-0_5) var(--gh-spacing-2);
    > label { min-inline-size: 0; overflow-wrap: anywhere; }
  }
`;
export const ReuseRow = styled.div`
  display: grid; align-items: center; min-inline-size: 0;
  > label {
    display: inline-flex; align-items: center; gap: var(--gh-spacing-1_5); min-block-size: var(--form-control-height);
    font-size: var(--gh-font-secondary); color: ${({ theme }) => theme.color.text}; cursor: pointer;
  }
  input[type="checkbox"] { inline-size: var(--gh-size-4); block-size: var(--gh-size-4); accent-color: ${({ theme }) => theme.color.brand}; }
  ${media.desktop} {
    > label { font-weight: ${({ theme }) => theme.typography.weight.bold}; }
    > ${Note} { margin: 0; }
  }
`;
export const Actions = styled.div`
  display: flex; min-inline-size: 0;
`;
export const BuildButton = styled(Button)`
  && { ${slipToolbarControl} }
`;
export const BuildLink = styled(ButtonLink)`
  && { ${slipToolbarControl} }
`;
export const CriteriaError = styled.p`color: ${({ theme }) => theme.color.outcome.incorrect.text}; font-size: var(--gh-font-body);`;
export const Results = styled.section`
  display: grid; gap: var(--gh-spacing-2_25); min-inline-size: 0;
  > ${HeadingRow}, > ${Note}, > nav, > [data-page-pagination] { ${desktopContentPadding()} }
  &[aria-busy="true"] { opacity: var(--gh-opacity-65); }
`;
export const BuilderFeedback = styled.div`
  padding: ${({ theme }) => theme.space.lg};
  text-align: center;
  color: ${({ theme }) => theme.color.mutedText};
  > p { margin: 0 auto; max-inline-size: ${({ theme }) => theme.layout.readingMaxWidth}; }
`;
