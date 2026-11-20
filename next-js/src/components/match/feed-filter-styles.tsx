"use client";

import styled from "styled-components";
import { controlRow } from "@/components/ui/control-layout";
import { contentGutter } from "@/components/ui/layout";
import { focusRing } from "@/components/ui/filter-chrome";
import { FilterDialogContent, FilterFieldRow } from "@/components/ui/advanced-filter-dialog";
import { darkTheme, lightTheme, media } from "@/styles/theme";
import { themeColorVariables } from "@/styles/theme-css";
import { themePreferenceAttribute } from "@/styles/theme-preference";

/** Transparent search row, separated from the app header and performance by shared spacing. */
const darkFilterColors = themeColorVariables(darkTheme).join("\n");
const lightFilterColors = themeColorVariables(lightTheme).join("\n");

export const Panel = styled.form`
  min-inline-size: 0;
  padding: var(--gh-spacing-0_5) ${contentGutter};
  color: ${({ theme }) => theme.color.text};
  html[${themePreferenceAttribute}="light"] & { ${lightFilterColors} color-scheme: light; }
  html[${themePreferenceAttribute}="dark"] & { ${darkFilterColors} color-scheme: dark; }
  @media (prefers-color-scheme: dark) {
    html:not([${themePreferenceAttribute}]) & { ${darkFilterColors} color-scheme: dark; }
  }
  /* Keep the inline GET controls available when scripting is disabled. */
  @media (scripting: enabled) {
    & > dialog[data-enhanced="false"] { display: none; }
  }
  ${media.desktop} { padding-block: var(--gh-spacing-1); }
`;

export const DialogContent = styled(FilterDialogContent)`
  fieldset { min-inline-size: 0; margin: 0; padding: 0; border: 0; }
  [data-filter-section] > fieldset > legend {
    font-size: var(--gh-font-reading);
    font-weight: var(--gh-weight-bold);
  }
  && [data-status-sort-fields] [data-floating-control] > select {
    font-size: var(--gh-font-body); padding-inline-end: var(--gh-spacing-4); text-overflow: ellipsis;
  }
  && [data-status-sort-fields] [data-select-trigger] { font-size: var(--gh-font-body); }
  [data-probability-fields] label, [data-odds-fields] label { font-size: var(--gh-font-secondary); }
  && [data-probability-fields] label { max-inline-size: calc(100% - var(--gh-size-3)); }
  input[type="checkbox"] { flex: none; inline-size: var(--gh-size-4); block-size: var(--gh-size-4); margin: 0; accent-color: ${({ theme }) => theme.color.brand}; ${focusRing} }
  [data-options] { max-block-size: var(--gh-size-45); overflow-y: auto; overscroll-behavior: contain; }
  [data-help] { margin-block-start: var(--gh-spacing-1_75); color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); line-height: var(--gh-leading-compact); }
`;

export const DraftDateFields = styled.div`
  display: grid;
  gap: var(--gh-spacing-1_5);
  min-inline-size: 0;
`;

export const LocationFields = styled(FilterFieldRow)`
  ${controlRow}
  && [data-select-popup] { inline-size: calc(200% + var(--gh-spacing-2_5)); }
  && [data-select-trigger] { padding-block: var(--gh-spacing-1); }
  && [data-current] {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    white-space: normal;
    overflow-wrap: anywhere;
    line-height: var(--gh-leading-caption);
  }
`;

export const Muted = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: var(--gh-font-secondary);
  line-height: var(--gh-leading-compact);
`;
