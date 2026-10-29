"use client";

import styled, { css } from "styled-components";
import { media } from "@/styles/theme";
import { adminControl } from "./admin-form";
import { DeskColumn, DeskGrid, DeskHead, Panel, panelRadius, Segmented, StickyActions } from "./desk-styles";

export const MobileSettingsHead = styled(DeskHead)`
  ${media.desktop} { display: none; }
`;
export const DesktopOnly = styled.div`
  display: none;
  ${media.desktop} { display: block; min-inline-size: 0; }
`;
export const MobileOnly = styled.div`
  ${media.desktop} { display: none; }
`;
/** Desktop owns its scroll area, leaving both navigation and the save footer in view. */
export const SettingsForm = styled.form`
  ${media.desktop} {
    display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 12px;
    block-size: calc(100dvh - var(--app-header-height, 3rem) - 28px);
    min-block-size: 0; margin-block: -12px -32px;
    input, select, textarea, button, section, details { border-radius: 0; }
  }
`;
export const SettingsHeading = styled(DeskHead)`
  display: none;
  ${media.desktop} { display: flex; flex-wrap: nowrap; gap: 24px; min-block-size: 44px; > h1 { flex: none; } }
`;
export const SettingsGrid = styled(DeskGrid)`
  ${media.desktop} { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; align-items: stretch; gap: 0; min-block-size: 0; overflow: hidden; }
`;
export const SettingsColumn = styled(DeskColumn)`
  ${media.desktop} { display: flex; flex-direction: column; gap: 12px; min-block-size: 0; overflow: auto; padding-block-end: 16px; scrollbar-gutter: stable; > * { flex: none; } }
`;
export const DesktopSettingsTabs = styled(Segmented)`
  min-inline-size: 0; overflow-x: auto; border-radius: 0;
  > button { flex: none; white-space: nowrap; border-radius: 0; }
  > [aria-current="page"] > svg { color: ${({ theme }) => theme.color.link}; }
`;

const focusRing = css`
  outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
  outline-offset: 2px;
`;

/** Section switches: four equal icon-over-label cells on phones, one row sized to its labels from desktop up. */
export const SectionTabs = styled(Segmented)`
  > [aria-current="page"] > svg { color: ${({ theme }) => theme.color.link}; }
  ${media.belowDesktop} {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    overflow: hidden;
    > button {
      flex-direction: column;
      gap: 4px;
      min-inline-size: 0;
      min-block-size: 58px;
      padding: 6px 4px;
      font-size: ${({ theme }) => theme.typography.scale.secondary};
      line-height: 1.2;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    > button > svg { font-size: 1.125rem; }
  }
  ${media.desktop} { display: none; }
`;

/** The one content panel under the tabs; fields size to the panel, not the window, so 1024px with the sidebar still fits. */
export const SectionPanel = styled(Panel)`
  container-type: inline-size;
  &:focus { outline: none; }
  &:focus-visible { ${focusRing} }
  label:not([data-mode-tile]), legend {
    font-size: ${({ theme }) => theme.typography.scale.body};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
  }
  input, select, textarea { font-weight: ${({ theme }) => theme.typography.weight.body}; }
  dd { font-size: ${({ theme }) => theme.typography.scale.emphasis}; }
`;

/** Two fields side by side once the panel is wide enough; stacked on phones and beside the 1024px side panel. */
export const TwoUp = styled.div`
  display: grid;
  gap: 12px;
  align-items: start;
  min-inline-size: 0;
  > * { min-inline-size: 0; }
  @container (min-width: 32rem) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;

/** The two payment networks: stacked with a hairline on phones, side by side with a vertical hairline when wide. */
export const NetworkGrid = styled.div`
  display: grid;
  min-inline-size: 0;
  > section { display: grid; align-content: start; gap: 12px; min-inline-size: 0; padding: 14px; }
  > section + section { border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border}; }
  ${media.desktop} { > section { padding: 16px; } }
  @container (min-width: 36rem) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    > section + section {
      border-block-start: 0;
      border-inline-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    }
  }
`;

export const ManagedBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  padding: 2px 6px;
  border-radius: ${({ theme }) => theme.border.radius};
  color: ${({ theme }) => theme.color.mutedText};
  background: ${({ theme }) => theme.color.surfaceMuted};
  font-size: ${({ theme }) => theme.typography.scale.caption};
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  line-height: 1.3;
  > svg { flex: none; font-size: 0.75rem; }
`;
export const ManagedNote = styled.p`
  display: flex;
  align-items: center;
  gap: 6px;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  > svg { flex: none; }
`;

export const NetworkTitle = styled.h3`
  display: flex;
  align-items: center;
  gap: 8px;
  min-inline-size: 0;
  font-size: ${({ theme }) => theme.typography.scale.emphasis};
  font-weight: ${({ theme }) => theme.typography.weight.heavy};
  /* The members' network artwork, shrunk to a chip beside the name. */
  [data-payment-logo] { inline-size: 36px; block-size: 20px; }
  > ${ManagedBadge} { margin-inline-start: auto; }
`;

export const DialField = styled.div`
  display: grid;
  gap: 4px;
  min-inline-size: 0;
`;
export const DialRow = styled.div`
  display: flex;
  gap: 8px;
  min-inline-size: 0;
  input { ${adminControl} flex: 1 1 auto; min-inline-size: 0; }
  button { flex: none; white-space: nowrap; }
`;

/** Device limit sits in a narrow column; a full-width select for five numbers reads as noise. */
export const NarrowField = styled.div`
  display: grid;
  gap: 8px;
  max-inline-size: 20rem;
  min-inline-size: 0;
`;

export const ManagedFact = styled.dl`
  display: grid;
  gap: 4px;
  min-inline-size: 0;
  margin: 0;
  > div { display: grid; gap: 4px; min-inline-size: 0; }
  dt {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    font-size: ${({ theme }) => theme.typography.scale.body};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
  }
  dd {
    margin: 0;
    min-inline-size: 0;
    font-weight: ${({ theme }) => theme.typography.weight.medium};
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
`;
export const ModeTiles = styled.fieldset`
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  border: 0;
  > legend { padding: 0; margin-block-end: 8px; }
  > div { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; min-inline-size: 0; }
  ${media.desktop} { > div { gap: 10px; } }
`;
/** A whole-tile radio: the native input covers the tile, so clicks, arrows and focus stay native. */
export const ModeTile = styled.label<{ $unavailable: boolean }>`
  position: relative;
  display: grid;
  min-inline-size: 0;
  cursor: ${({ $unavailable }) => $unavailable ? "not-allowed" : "pointer"};
  > input { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; margin: 0; opacity: 0; cursor: inherit; }
  > span {
    display: grid;
    align-content: start;
    gap: 2px;
    min-inline-size: 0;
    min-block-size: 68px;
    padding: 9px 10px;
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
    border-radius: ${panelRadius};
    color: ${({ theme }) => theme.color.mutedText};
    background: ${({ theme }) => theme.color.surface};
    font-size: ${({ theme }) => theme.typography.scale.secondary};
    font-weight: ${({ theme }) => theme.typography.weight.body};
    line-height: 1.35;
    overflow-wrap: anywhere;
    ${({ $unavailable }) => $unavailable && css`opacity: 0.55;`}
  }
  strong { color: ${({ theme }) => theme.color.text}; font-size: 0.9375rem; font-weight: ${({ theme }) => theme.typography.weight.heavy}; }
  em {
    margin-block-start: 2px;
    color: ${({ theme }) => theme.color.outcome.correct.text};
    font-size: ${({ theme }) => theme.typography.scale.micro};
    font-style: normal;
    font-weight: ${({ theme }) => theme.typography.weight.heavy};
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  > input:checked + span {
    border-color: ${({ theme }) => theme.color.link};
    background: ${({ theme }) => theme.color.brandSoft};
    box-shadow: inset 0 -2px ${({ theme }) => theme.color.brand};
  }
  > input:focus-visible + span { ${focusRing} }
  ${media.hover} { &:hover > input:not(:checked, :disabled) + span { background: ${({ theme }) => theme.color.rowHover}; } }
  ${media.desktop} { > span { padding: 10px 12px; } }
`;

/** The second step of a mode switch: a warning box, buttons beside the text when the panel is wide. */
export const ConfirmBox = styled.div`
  display: grid;
  gap: 6px;
  min-inline-size: 0;
  padding: 12px 14px;
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.outcome.pending.border};
  border-radius: ${panelRadius};
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.outcome.pending.background};
  > strong {
    color: ${({ theme }) => theme.color.outcome.pending.text};
    font-size: ${({ theme }) => theme.typography.scale.emphasis};
    font-weight: ${({ theme }) => theme.typography.weight.heavy};
  }
  > p { font-size: ${({ theme }) => theme.typography.scale.body}; line-height: 1.45; }
  > div { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-block-start: 4px; }
  > div > button { white-space: nowrap; }
  @container (min-width: 34rem) {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 4px 16px;
    > div { grid-column: 2; grid-row: 1 / span 2; margin: 0; }
  }
`;

export const SettingsHint = styled.p`
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  line-height: 1.5;
`;

export const RequirementBox = styled.div`
  display: grid;
  gap: 4px;
  min-inline-size: 0;
  padding: 10px 12px 6px;
  border-radius: ${panelRadius};
  background: ${({ theme }) => theme.color.surfaceMuted};
`;
export const RequirementList = styled.ul`
  display: grid;
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  li { display: flex; align-items: center; gap: 8px; min-inline-size: 0; min-block-size: 36px; font-size: ${({ theme }) => theme.typography.scale.body}; }
  li > svg { flex: none; font-size: 0.9375rem; color: ${({ theme }) => theme.color.mutedText}; }
  li > span { min-inline-size: 0; overflow-wrap: anywhere; }
  li > a, li > button {
    display: flex;
    flex: 1;
    align-items: center;
    min-inline-size: 0;
    min-block-size: ${({ theme }) => theme.control.minHeight};
    margin: 0;
    padding: 0;
    border: 0;
    color: ${({ theme }) => theme.color.link};
    background: transparent;
    font: inherit;
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    text-align: start;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
    &:focus-visible { ${focusRing} }
  }
  ${media.desktop} { li > a, li > button { min-block-size: 36px; } }
`;

/**
 * The desktop footer occupies its own viewport-grid row. On phones only the password part shows in the flow;
 * the existing SaveDock continues to hold mobile actions.
 */
export const SavePanel = styled(Panel)<{ $phoneHidden: boolean }>`
  container-type: inline-size;
  display: grid;
  gap: 12px;
  padding: 14px;
  label { font-size: ${({ theme }) => theme.typography.scale.body}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  ${media.belowDesktop} {
    > [data-save-wide] { display: none; }
    ${({ $phoneHidden }) => $phoneHidden && css`display: none;`}
  }
  ${media.desktop} {
    display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px 20px;
    border-radius: 0; padding: 12px 16px; border-block-start: 2px solid ${({ theme }) => theme.color.border};
    > [data-save-wide]:first-child { align-self: center; }
    > [data-save-wide]:last-child { grid-column: 2; grid-row: 1 / span 2; }
    > [data-setting-password] { max-inline-size: 30rem; grid-column: 1; }
  }
`;
export const SaveButtons = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  > button { white-space: nowrap; }
  @container (max-width: 18rem) { grid-template-columns: auto minmax(0, 1fr); }
`;
/** Phones: unsaved count, Undo and Save stay in reach at the bottom of the screen while the form scrolls. */
export const SaveDock = styled(StickyActions)`
  align-items: center;
  margin-block-start: 12px;
  background: ${({ theme }) => theme.color.surface};
  > * { flex: none; }
  > span {
    flex: 1 1 auto;
    min-inline-size: 0;
    color: ${({ theme }) => theme.color.mutedText};
    font-size: ${({ theme }) => theme.typography.scale.secondary};
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
  > button { padding-inline: 12px; white-space: nowrap; }
  ${media.desktop} { display: none; }
`;
