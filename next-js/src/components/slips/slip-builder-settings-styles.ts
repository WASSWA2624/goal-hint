"use client";

import styled, { css } from "styled-components";
import { controlBodyHeight } from "@/components/ui/control-layout";
import { Button, ButtonLink } from "@/components/ui/controls";
import { FilterDialogTrigger } from "@/components/ui/filter-dialog-trigger";
import { media, type AccentName } from "@/styles/theme";

export const SettingsHeader = styled.header`
  display: flex;
  align-items: center;
  gap: var(--gh-spacing-2_5);
  min-inline-size: 0;
  padding: var(--gh-spacing-2) calc(var(--builder-panel-inset) + var(--gh-spacing-0_75));
  border-start-start-radius: inherit;
  border-start-end-radius: inherit;
  background: color-mix(in srgb, ${({ theme }) => theme.color.section} calc(var(--gh-opacity-60) * 100%), ${({ theme }) => theme.color.surface});
  color: ${({ theme }) => theme.color.text};

  h2, p { margin: 0; }
  h2 {
    font-size: var(--gh-font-reading);
    font-weight: var(--gh-weight-semibold);
    line-height: var(--gh-leading-heading);
  }
  p {
    margin-block-start: var(--gh-spacing-0_75);
    color: ${({ theme }) => theme.color.mutedText};
    font-size: var(--gh-font-secondary);
    line-height: var(--gh-leading-caption);
  }

  ${media.desktop} {
    gap: var(--gh-spacing-3);
    padding: var(--gh-spacing-1_5) var(--builder-panel-inset);
    p { display: none; }
    h2 { font-size: var(--gh-font-lead); }
  }
`;

const responsiveIcons = css`
  > [data-settings-icon="desktop"] { display: none; }
  ${media.desktop} {
    > [data-settings-icon="compact"] { display: none; }
    > [data-settings-icon="desktop"] { display: block; }
  }
`;

export const SettingsHeaderIcon = styled.span`
  ${responsiveIcons}
  display: grid;
  place-items: center;
  flex: none;
  inline-size: var(--gh-size-9);
  block-size: var(--gh-size-9);
  font-size: var(--gh-font-headline);
  border-radius: ${({ theme }) => theme.radius.surface};
  background: ${({ theme }) => theme.color.brandSoft};
  color: ${({ theme }) => theme.color.link};

  ${media.desktop} {
    inline-size: var(--gh-size-10);
  }
`;

export const SettingsLayout = styled.div`
  display: grid;
  gap: var(--gh-spacing-3_5);
  min-inline-size: 0;

  ${media.desktop} {
    grid-template-columns: minmax(0, 1fr) clamp(var(--gh-size-36), 16%, var(--gh-size-60));
    column-gap: var(--gh-spacing-4);
  }
`;

const summaryTone = (tone: AccentName) => css`
  --builder-setting-accent: ${({ theme }) => theme.color.accent[tone].solid};
  --builder-setting-tint: color-mix(in srgb, ${({ theme }) => theme.color.accent[tone].soft} calc(var(--gh-opacity-35) * 100%), ${({ theme }) => theme.color.surface});
`;

export const CriteriaSummary = styled.dl`
  container-type: inline-size;
  display: grid;
  grid-template-columns: minmax(0, .82fr) minmax(0, .68fr) minmax(0, .4fr) minmax(0, 1.1fr);
  gap: var(--gh-spacing-1_25);
  margin: 0;
  min-inline-size: 0;
  ${summaryTone("blue")}

  > div {
    --builder-setting-label-size: var(--gh-font-micro);
    --builder-setting-value-size: var(--gh-font-emphasis);
    --builder-setting-label-line: calc(var(--builder-setting-label-size) * var(--gh-leading-control));
    --builder-setting-value-line: calc(var(--builder-setting-value-size) * var(--gh-leading-snug));
    --builder-setting-line-gap: var(--gh-spacing-0_5);
    --builder-setting-stack-height: calc(
      var(--builder-setting-label-line) + var(--builder-setting-value-line) + var(--builder-setting-line-gap)
    );
    --builder-setting-icon-size: var(--builder-setting-stack-height);
    --builder-setting-inset: var(--gh-spacing-1);
    --builder-setting-icon-gap: var(--gh-spacing-0_5);
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-content: center;
    gap: var(--builder-setting-line-gap);
    min-inline-size: 0;
    min-block-size: var(--gh-size-11);
    padding: var(--gh-spacing-1_5) var(--gh-spacing-0_5);
    padding-inline-start: calc(var(--builder-setting-inset) + var(--builder-setting-icon-size) + var(--builder-setting-icon-gap));
    background: var(--builder-setting-tint);
    border-radius: ${({ theme }) => theme.radius.surface};
  }
  dt {
    min-inline-size: 0;
    color: ${({ theme }) => theme.color.mutedText};
    font-size: var(--builder-setting-label-size);
    line-height: var(--builder-setting-label-line);
  }
  dd {
    min-inline-size: 0;
    max-inline-size: 100%;
    margin: 0;
    color: ${({ theme }) => theme.color.text};
    font-size: var(--builder-setting-value-size);
    font-weight: var(--gh-weight-medium);
    font-variant-numeric: tabular-nums;
    line-height: var(--builder-setting-value-line);
  }
  [data-settings-label], > :not([data-settings-field="markets"]) > dd {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  [data-settings-label] { display: block; }
  [data-settings-separator] { padding-inline: var(--gh-spacing-0_5); }
  [data-settings-field="kickoff"] [data-settings-separator] { padding-inline: var(--gh-spacing-0_25); }

  [data-settings-field="total-odds"] {
    grid-column: span 2;
    ${summaryTone("emerald")}
  }
  [data-settings-field="matches"] { ${summaryTone("orange")} }
  [data-settings-field="individual-odds"] { ${summaryTone("violet")} }
  [data-settings-tile="half"] {
    --builder-setting-value-size: var(--gh-font-section);
    --builder-setting-inset: var(--gh-spacing-2);
    --builder-setting-icon-gap: var(--gh-spacing-1);
    grid-column: span 2;
  }
  [data-settings-tile="row"] {
    --builder-setting-label-size: var(--gh-font-secondary);
    --builder-setting-value-size: var(--gh-font-micro);
    --builder-setting-pill-padding: var(--gh-spacing-1);
    --builder-setting-icon-size: calc(
      var(--builder-setting-value-line) + var(--builder-setting-pill-padding) * 2
    );
    --builder-setting-inset: var(--gh-spacing-2);
    --builder-setting-icon-gap: var(--gh-spacing-1_5);
    grid-column: 1 / -1;
    grid-template-columns: fit-content(44%) minmax(0, 1fr);
    align-items: center;
    gap: var(--gh-spacing-1);
    min-block-size: var(--gh-size-8);
    padding-block: var(--gh-spacing-1);
    padding-inline-end: var(--builder-setting-inset);
    background: ${({ theme }) => theme.color.section};
  }
  [data-settings-tile="row"] dd {
    justify-self: end;
    padding: var(--builder-setting-pill-padding) var(--gh-spacing-1_5);
    border-radius: ${({ theme }) => theme.radius.control};
    background: ${({ theme }) => theme.color.surface};
  }
  [data-settings-field="reuse"] dd {
    padding-inline: var(--gh-spacing-2_5);
  }
  [data-settings-symbol] {
    ${responsiveIcons}
    position: absolute;
    inset-block-start: 50%;
    inset-inline-start: var(--builder-setting-inset);
    translate: 0 -50%;
    display: grid;
    place-items: center;
    inline-size: var(--builder-setting-icon-size);
    block-size: var(--builder-setting-icon-size);
    color: color-mix(in srgb, var(--builder-setting-accent) calc(var(--gh-opacity-60) * 100%), ${({ theme }) => theme.color.mutedText});
    > svg { inline-size: 100%; block-size: 100%; }
  }

  ${media.belowDesktop} {
    [data-settings-field="total-odds"] [data-settings-separator] { padding-inline: var(--gh-spacing-0_25); }

    @container (inline-size < ${({ theme }) => theme.viewport[20]}) {
      > div { grid-column: span 2; }
      [data-settings-tile="half"] { --builder-setting-value-size: var(--gh-font-emphasis); }
      [data-settings-field="probability"], [data-settings-tile="row"] { grid-column: 1 / -1; }
      [data-settings-field="kickoff"] {
        --builder-setting-icon-size: calc(var(--builder-setting-stack-height) + var(--builder-setting-pill-padding) * 2);
        grid-template-columns: minmax(0, 1fr);
        gap: var(--builder-setting-line-gap);
        dd { justify-self: start; }
      }
    }
  }

  ${media.desktop} {
    grid-template-columns: repeat(2, minmax(0, .9fr)) minmax(0, 1.4fr) minmax(0, 1.2fr);
    gap: var(--gh-spacing-2);

    > div, [data-settings-field="total-odds"], [data-settings-tile] {
      --builder-setting-label-size: var(--gh-font-secondary);
      --builder-setting-value-size: var(--gh-font-section);
      --builder-setting-value-line: calc(var(--gh-font-section) * var(--gh-leading-snug));
      --builder-setting-icon-size: var(--builder-setting-stack-height);
      --builder-setting-inset: var(--gh-spacing-2);
      --builder-setting-icon-gap: var(--gh-spacing-1_5);
      grid-column: auto;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--builder-setting-line-gap);
      min-block-size: var(--gh-size-13);
      padding-block: var(--gh-spacing-1_5);
      padding-inline-end: var(--builder-setting-inset);
      background: ${({ theme }) => theme.color.section};
      box-shadow: inset 0 0 0 ${({ theme }) => theme.phoneCardFrame.ruleWidth} ${({ theme }) => theme.color.border};
    }
    [data-settings-field="joint"] { grid-column: 1 / -1; }
    [data-settings-field="kickoff"], [data-settings-field="markets"] {
      --builder-setting-value-size: var(--gh-font-secondary);
    }
    [data-settings-tile="row"] dd {
      justify-self: stretch;
      padding: 0;
      background: transparent;
    }
    [data-settings-symbol] { color: ${({ theme }) => theme.color.mutedText}; }
  }
`;

export const MarketSummaryValue = styled.span`
  display: flex;
  align-items: baseline;
  gap: var(--gh-spacing-0_75);
  > :first-child {
    min-inline-size: 0;
    overflow: hidden;
    text-align: start;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  > [aria-hidden] { flex: none; }
`;

export const BuilderOptions = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--gh-spacing-1_5);
  align-items: center;
  min-inline-size: 0;
  &:has(> [hidden]) { grid-template-columns: minmax(0, 1fr); }
  > [hidden] { display: none; }
  > div { min-inline-size: 0; }

  ${media.desktop} {
    grid-template-columns: minmax(0, 1fr);
    grid-auto-rows: 1fr;
    gap: var(--gh-spacing-2);
    padding-inline-start: var(--gh-spacing-4);
    border-inline-start: ${({ theme }) => theme.phoneCardFrame.ruleWidth} solid ${({ theme }) => theme.color.border};
  }
`;

const builderAction = css`
  ${controlBodyHeight}
  gap: var(--gh-spacing-1_5);
  inline-size: 100%;
  min-inline-size: 0;
  padding: var(--gh-spacing-0_5) var(--gh-spacing-1_5);
  border-radius: ${({ theme }) => theme.radius.control};
  font-size: var(--gh-font-emphasis);
  font-weight: var(--gh-weight-semibold);
  line-height: var(--gh-leading-control);
  > svg { flex: none; font-size: var(--gh-font-title); }

  ${media.desktop} {
    gap: var(--gh-spacing-2);
    > svg { font-size: var(--gh-font-heading); }
  }
`;

export const BuilderFilters = styled(FilterDialogTrigger)`
  && {
    ${builderAction}
    &:enabled {
      background: ${({ theme }) => theme.color.section};
      color: ${({ theme }) => theme.color.mutedText};
      box-shadow: inset 0 0 0 ${({ theme }) => theme.phoneCardFrame.ruleWidth} ${({ theme }) => theme.color.border};
    }
    ${media.hover} { &:enabled:hover { background: ${({ theme }) => theme.color.fieldHover}; } }
    &:enabled:active { background: ${({ theme }) => theme.color.fieldHover}; }
    > b {
      display: inline-grid;
      place-items: center;
      min-inline-size: var(--gh-size-4_5);
      min-block-size: var(--gh-size-4_5);
      padding: 0 var(--gh-spacing-0_75);
      border-radius: ${({ theme }) => theme.radius.pill};
      background: ${({ theme }) => theme.color.surface};
      color: ${({ theme }) => theme.color.mutedText};
      font-size: var(--gh-font-secondary);
      font-weight: var(--gh-weight-medium);
      font-variant-numeric: tabular-nums;
    }
    ${media.desktop} {
      > b { min-inline-size: var(--gh-size-6_5); min-block-size: var(--gh-size-6_5); font-size: var(--gh-font-emphasis); }
    }
  }
`;

const buildAction = css`
  && { ${builderAction} }
`;

export const BuildButton = styled(Button).attrs({ variant: "secondary" as const })`${buildAction}`;
export const BuildLink = styled(ButtonLink).attrs({ variant: "secondary" as const })`${buildAction}`;
