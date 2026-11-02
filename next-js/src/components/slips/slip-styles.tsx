"use client";

import { controlBodyHeight } from "@/components/ui/control-layout";
import styled, { css } from "styled-components";
import { Button, ButtonLink } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/feedback";
import { controlFeedback, desktopStickyFilters, filterButtonColors, filterControlColors, filterPanelColors, mobileFilterPanel } from "@/components/ui/filter-chrome";
import { desktopContentPadding, desktopSectionFrame, joinedDesktopSections, PageHeading, Stack, Surface } from "@/components/ui/layout";
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
const desktopBuildAction = css`
  ${media.desktop} {
    && {
      flex: 1 1 var(--gh-size-22); inline-size: auto; min-inline-size: max-content; max-inline-size: var(--gh-size-52);
      block-size: ${compactControlHeight}; min-block-size: ${compactControlHeight};
      padding: var(--gh-spacing-1) var(--gh-spacing-2); border-radius: ${({ theme }) => theme.radius.control}; font-size: var(--gh-font-secondary); line-height: var(--gh-leading-label); white-space: nowrap;
    }
    @media (pointer: coarse) { && { block-size: var(--gh-size-11); min-block-size: var(--gh-size-11); } }
  }
`;
const mobileBuildAction = css`
  ${media.belowDesktop} {
    && {
      flex: none; inline-size: var(--gh-size-52); min-inline-size: var(--gh-size-52);
      block-size: var(--form-control-height); min-block-size: var(--form-control-height); padding: var(--gh-spacing-1) var(--gh-spacing-2);
      font-size: ${mobileToolbarFontSize}; line-height: var(--gh-leading-label); white-space: nowrap;
    }
  }
`;
const desktopGroupDivider = css`
  padding-inline-start: var(--gh-spacing-2_5);
  border-inline-start: 0;
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
    > p, > [data-best-slips-update-failed] { ${desktopContentPadding()} }
  }
`;
/** Preserve each phone surface's spacing while keeping adjacent desktop slips compact. */
export const SlipList = styled.div`
  display: grid; min-inline-size: 0; gap: var(--gh-spacing-3_5);
  ${media.desktop} { gap: var(--gh-spacing-1_125); }
  ${desktopContentPadding()}
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
  ${filterPanelColors}
  ${desktopStickyFilters}
  && { padding: var(--gh-spacing-2); border-radius: ${({ theme }) => theme.radius.surface}; }
  [data-criteria-dialog] { ${filterDialogSurface} }
  ${mobileFilterPanel}
  && { ${desktopSectionFrame} ${desktopContentPadding(true)} }
  [data-slip-label="mobile"] { display: none; }
  ${media.belowDesktop} {
    && { padding-block: var(--gh-spacing-1_5); }
    [data-slip-label="desktop"] { display: none; }
    [data-slip-label="mobile"] { display: inline; }
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
    && [data-slip-criteria-options] { grid-template-columns: 1.15fr 1.1fr 0.9fr; gap: var(--gh-spacing-1); }
    && [data-criteria-trigger] {
      min-block-size: var(--form-control-height); padding: var(--gh-spacing-0_75); gap: var(--gh-spacing-0_5); font-size: clamp(var(--gh-font-caption), 3.125vw, var(--gh-font-secondary)); line-height: var(--gh-leading-control);
    }
    &&& [data-criteria-label] { white-space: nowrap; }
    &&& [data-criteria-value] { display: none; }
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
    && [data-criteria-dialog] input:not([type="checkbox"]):not([type="hidden"]) {
      min-block-size: var(--form-control-height); padding-block: var(--gh-spacing-2); font-size: var(--gh-font-section);
    }
    &&& [data-criteria-dialog] input[data-slip-numeric-field] { font-size: var(--gh-font-emphasis); }
    && [data-criteria-dialog] fieldset:not([data-floating-outline]) > legend { margin-block-end: var(--gh-spacing-2); }
    && [data-kickoff-fields] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    && [data-criteria-dialog] > footer button { min-block-size: var(--form-control-height); padding-block: var(--gh-spacing-1); font-size: var(--gh-font-secondary); }
    ${media.tablet} {
      && [data-slip-criteria-options] { flex: 1 1 var(--gh-size-72); }
      && [data-criteria-actions] { flex: 0 0 auto; margin-inline-start: auto; }
    }
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
  ${media.desktop} {
    &[data-enhanced="true"] {
      display: grid; align-items: end; gap: var(--gh-spacing-2) clamp(var(--gh-spacing-1_5), .7vw, var(--gh-spacing-2_5));
      grid-template-columns: var(--gh-size-22) repeat(2, minmax(var(--gh-size-28), 1fr)) repeat(3, max-content) minmax(max-content, 1.6fr);
      > [data-slip-builder-essentials] { display: contents; }
      [data-criteria-field="targets"], [data-slip-target-groups] { display: contents; }
      [data-slip-criteria-options]:not([hidden]) { display: contents; }
      > [role="alert"], > [data-slip-criteria-summary] { grid-column: 1 / -1; }
      [data-toolbar-group]:not([data-toolbar-group="slips"]) { padding-inline-start: var(--gh-spacing-1_5); }
    }
  }
`;
export const BuilderEssentials = styled.div`
  display: grid; grid-template-columns: var(--gh-size-20) minmax(0, 1fr); gap: var(--gh-spacing-2);
  align-items: end; min-inline-size: 0;
  > [data-slip-count] { min-inline-size: 0; margin: 0; padding: 0; border: 0; }
  > [data-slip-count] > legend { ${desktopGroupTitle} margin-block-end: var(--gh-spacing-2); padding: 0; white-space: nowrap; }
  > [data-slip-count] input { font-variant-numeric: tabular-nums; }
  ${media.desktop} { grid-template-columns: var(--gh-size-22) max-content; gap: var(--gh-spacing-3); }
`;
export const BuilderOptions = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--gh-spacing-1_5);
  min-inline-size: 0; padding-block-start: var(--gh-spacing-1_5);
  border-block-start: 0;
  ${media.desktop} { display: contents; }
`;
export const CriteriaOptions = styled.div`
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); flex: 1 1 var(--gh-size-72);
  gap: var(--gh-spacing-1_25); min-inline-size: 0;
  &[hidden] { display: none; }
  ${media.desktop} { display: flex; flex: 0 1 auto; flex-wrap: wrap; gap: var(--gh-spacing-1_5); align-items: end; }
`;
export const CriteriaOption = styled.div`
  display: contents;
  [data-criteria-view="desktop"] { display: none; }
  ${media.desktop} {
    display: flex; flex: none; flex-direction: column; justify-content: space-between; gap: var(--gh-spacing-2);
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
    ${slipToolbarControl}
    inline-size: 100%; min-block-size: var(--form-control-height); padding-inline: var(--gh-spacing-1_5);
    flex-direction: row; gap: var(--gh-spacing-1); font-weight: ${({ theme }) => theme.typography.weight.medium};
    ${filterButtonColors}
    > [data-criteria-label] { min-inline-size: 0; white-space: normal; }
    > [data-criteria-value] { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-caption); }
    > svg { font-size: var(--gh-font-secondary); }
    > [data-criteria-count] {
      flex: none; display: inline-flex; align-items: center; justify-content: center;
      min-inline-size: var(--gh-size-4); block-size: var(--gh-size-4); padding-inline: var(--gh-spacing-0_75); border-radius: ${({ theme }) => theme.radius.small};
      color: ${({ theme }) => theme.color.link}; background: ${({ theme }) => theme.color.brandSoft};
      font-size: var(--gh-font-caption); font-weight: ${({ theme }) => theme.typography.weight.medium}; font-variant-numeric: tabular-nums; line-height: var(--gh-leading-solid);
    }
    &[data-edited="true"], &[aria-expanded="true"] { color: ${({ theme }) => theme.color.link};  background: ${({ theme }) => theme.color.brandSoft}; }
    ${controlFeedback}
  }
  ${media.desktop} { && { inline-size: 100%; min-block-size: ${compactControlHeight}; padding-inline: var(--gh-spacing-2); } }
  @media (pointer: coarse) { && { min-block-size: var(--form-control-height); } }
`;
export const CriteriaSummary = styled.p`
  margin: 0; min-inline-size: 0; color: ${({ theme }) => theme.color.mutedText};
  font-size: var(--gh-font-caption); line-height: var(--gh-leading-compact); overflow-wrap: anywhere;
  > [data-slip-summary-layout="desktop"] { display: none; }
  ${media.desktop} {
    > [data-slip-summary-layout="mobile"] { display: none; }
    > [data-slip-summary-layout="desktop"] {
      display: flex; flex-wrap: wrap; gap: var(--gh-spacing-1) var(--gh-spacing-3);
      > span { display: inline-flex; flex-wrap: wrap; gap: var(--gh-spacing-1); }
      strong { font-weight: ${({ theme }) => theme.typography.weight.medium}; color: ${({ theme }) => theme.color.text}; }
    }
  }
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
export const LimitGroups = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gh-spacing-2);
  @media (max-width: ${({ theme }) => theme.viewport[22.5]}) { grid-template-columns: minmax(0, 1fr); }
  > fieldset { padding: 0; margin: 0; border: 0; min-inline-size: 0; }
  > fieldset > legend { padding: 0; margin-block-end: var(--gh-spacing-2); font-size: var(--gh-font-secondary); font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  > fieldset[data-joint-limit] { grid-column: 1 / -1; }
  > fieldset[data-joint-limit] > ${Note} { margin-block-start: var(--gh-spacing-1); }
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
    grid-template-columns: repeat(2, max-content); gap: var(--gh-spacing-3);
    > fieldset { flex: none; ${desktopGroupDivider} }
    > fieldset > legend { ${desktopGroupTitle} }
    ${Fields} { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    ${Fields} > div > input { font-size: var(--gh-font-secondary); padding-inline: var(--gh-spacing-1_5); font-variant-numeric: tabular-nums; }
  }
`;
export const MarketChoices = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr);
`;
export const MarketChoice = styled.label`
  display: flex; align-items: center; gap: var(--gh-spacing-1_5); min-inline-size: 0; min-block-size: var(--form-control-height);
  padding: var(--gh-spacing-1) 0; color: ${({ theme }) => theme.color.text};
  font-size: var(--gh-font-secondary); font-weight: ${({ theme }) => theme.typography.weight.bold}; cursor: pointer;
  > input { flex: none; inline-size: var(--gh-size-4); block-size: var(--gh-size-4); accent-color: ${({ theme }) => theme.color.brand}; }
`;
export const MarketField = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--gh-spacing-1); align-items: start; min-inline-size: 0; padding-block: var(--gh-spacing-2_25);
  border-block-end: 0;
  &:first-child { padding-block-start: 0; }
  &:last-child { padding-block-end: 0; border-block-end: 0; }
`;
export const ReuseRow = styled.div`
  display: flex; align-items: center; min-inline-size: 0; margin-block-start: var(--gh-spacing-3); padding-block-start: var(--gh-spacing-2_5);
  border-block-start: 0;
  > label { display: inline-flex; align-items: center; gap: var(--gh-spacing-1_5); font-size: var(--gh-font-secondary); color: ${({ theme }) => theme.color.mutedText}; cursor: pointer; }
  input[type="checkbox"] { inline-size: var(--gh-size-4); block-size: var(--gh-size-4); accent-color: ${({ theme }) => theme.color.brand}; }
`;
export const Actions = styled.div`
  display: flex; flex: 1 0 auto; flex-wrap: wrap; align-items: center;
  justify-content: flex-end; gap: var(--gh-spacing-1); margin-inline-start: auto;
  ${media.desktop} {
    flex: 1 0 auto; flex-direction: column; align-items: stretch; justify-content: space-between; gap: var(--gh-spacing-2);
    ${desktopGroupDivider}
  }
`;
export const ActionControls = styled.div`
  display: contents;
  ${media.desktop} { display: flex; align-items: center; gap: var(--gh-spacing-1); }
`;
export const SavedFiltersButton = styled(Button)`
  && { ${slipToolbarControl} ${filterButtonColors} flex: none; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
  ${media.belowDesktop} { && { flex: 1 0 100%; min-block-size: var(--form-control-height); } }
`;
export const BuildButton = styled(Button)`
  && { ${slipToolbarControl} }
  ${desktopBuildAction}
  ${mobileBuildAction}
`;
export const BuildLink = styled(ButtonLink)`
  && { ${slipToolbarControl} }
  ${desktopBuildAction}
  ${mobileBuildAction}
`;
export const ClearLink = styled(ButtonLink)`
  && { ${slipToolbarControl} flex: 1 1 auto; }
  ${media.desktop} { && { ${filterButtonColors} flex: none; } }
  ${media.belowDesktop} {
    && { flex: 1 1 0; inline-size: auto; min-inline-size: var(--gh-size-16); block-size: var(--form-control-height); min-block-size: var(--form-control-height); padding: var(--gh-spacing-1); font-size: ${mobileToolbarFontSize}; white-space: nowrap; ${filterButtonColors} }
  }
`;
export const CriteriaError = styled.p`color: ${({ theme }) => theme.color.outcome.incorrect.text}; font-size: var(--gh-font-body);`;
export const Results = styled.section`
  display: grid; gap: var(--gh-spacing-2_25); min-inline-size: 0;
  > ${HeadingRow}, > ${Note}, > nav { ${desktopContentPadding()} }
  &[aria-busy="true"] { opacity: var(--gh-opacity-65); }
`;
