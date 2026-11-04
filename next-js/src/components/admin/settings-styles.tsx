"use client";

import { controlRow } from "@/components/ui/control-layout";

import styled, { css } from "styled-components";
import { media } from "@/styles/theme";
import { adminControl } from "./admin-form";
import { Panel, visuallyHidden } from "./desk-styles";
import { RecordFooter, RecordWorkspace } from "./record-workspace";

export const DesktopOnly = styled.div`
  display: none;
  ${media.desktop} { display: block; min-inline-size: 0; }
`;
export const MobileOnly = styled.div`
  ${media.desktop} { display: none; }
`;
/** Desktop owns its scroll area, leaving both navigation and the save footer in view. */
export const SettingsForm = styled.form`
  > h1 { ${visuallyHidden} }
  ${media.desktop} {
    display: grid; grid-template-rows: minmax(0, 1fr);
    block-size: calc(100dvh - var(--app-header-height, var(--gh-size-12)) - var(--gh-size-7));
    min-block-size: 0; margin-block: calc(-1 * var(--gh-spacing-3)) calc(-1 * var(--gh-spacing-8));
  }
`;
export const SettingsWorkspace = styled(RecordWorkspace)`
  && { grid-template-rows: auto auto minmax(0, 1fr) auto; }
`;

export const DesktopSettingItem = styled.li`
  ${media.belowDesktop} { && { display: none; } }
`;

const focusRing = css`
  outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
  outline-offset: var(--gh-size-0_5);
`;

/** Fields respond to the detail pane's width. */
export const SectionPanel = styled(Panel)`
  container-type: inline-size;
  inline-size: 100%;
  text-align: start;
  &:focus { outline: none; }
  &:focus-visible { ${focusRing} }
  label:not([data-mode-tile]), legend {
    font-size: ${({ theme }) => theme.typography.scale.body};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
  }
  input, select, textarea { font-weight: ${({ theme }) => theme.typography.weight.body}; }
  input:not([type="checkbox"], [type="radio"]), select, textarea { inline-size: 100%; min-inline-size: 0; }
  dd { font-size: ${({ theme }) => theme.typography.scale.emphasis}; }
`;

/** Two fields side by side once the panel is wide enough; stacked on phones and beside the 1024px side panel. */
export const TwoUp = styled.div`
  display: grid;
  gap: var(--gh-spacing-3);
  align-items: start;
  min-inline-size: 0;
  > * { min-inline-size: 0; }
  @container (min-width: ${({ theme }) => theme.viewport[32]}) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;

/** The two payment networks: stacked with a hairline on phones, side by side with a vertical hairline when wide. */
export const NetworkGrid = styled.div`
  display: grid;
  min-inline-size: 0;
  > section { display: grid; align-content: start; gap: var(--gh-spacing-3); min-inline-size: 0; padding: var(--gh-spacing-3_5); }
  > section + section { border-block-start: 0; }
  ${media.desktop} { > section { padding: var(--gh-spacing-4); } }
  @container (min-width: ${({ theme }) => theme.viewport[36]}) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    > section + section {
      border-block-start: 0;
      border-inline-start: 0;
    }
  }
`;

export const ManagedBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: var(--gh-spacing-1);
  flex: none;
  padding: var(--gh-spacing-0_5) var(--gh-spacing-1_5);
  border-radius: ${({ theme }) => theme.radius.small};
  color: ${({ theme }) => theme.color.mutedText};
  background: ${({ theme }) => theme.color.surfaceMuted};
  font-size: ${({ theme }) => theme.typography.scale.caption};
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  line-height: var(--gh-leading-label);
  > svg { flex: none; font-size: var(--gh-font-secondary); }
`;
export const ManagedNote = styled.p`
  display: flex;
  align-items: center;
  gap: var(--gh-spacing-1_5);
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  > svg { flex: none; }
`;

export const NetworkTitle = styled.h3`
  display: flex;
  align-items: center;
  gap: var(--gh-spacing-2);
  min-inline-size: 0;
  font-size: ${({ theme }) => theme.typography.scale.emphasis};
  font-weight: ${({ theme }) => theme.typography.weight.heavy};
  /* The members' network artwork, shrunk to a chip beside the name. */
  [data-payment-logo] { inline-size: var(--gh-size-9); block-size: var(--gh-size-5); }
  > ${ManagedBadge} { margin-inline-start: auto; }
`;

export const DialField = styled.div`
  display: grid;
  gap: var(--gh-spacing-1);
  min-inline-size: 0;
`;
export const DialRow = styled.div`
  display: flex;
  gap: var(--gh-spacing-2);
  align-items: start;
  min-inline-size: 0;
  > [data-floating-field] { flex: 1 1 auto; }
  input { ${adminControl} min-inline-size: 0; }
  button { flex: none; white-space: nowrap; }

  ${controlRow}
`;

/** Device limit sits in a narrow column; a full-width select for five numbers reads as noise. */
export const NarrowField = styled.div`
  display: grid;
  gap: var(--gh-spacing-2);
  max-inline-size: var(--gh-size-80);
  min-inline-size: 0;
`;

export const ManagedFact = styled.dl`
  display: grid;
  gap: var(--gh-spacing-1);
  min-inline-size: 0;
  margin: 0;
  > div { display: grid; gap: var(--gh-spacing-1); min-inline-size: 0; }
  dt {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--gh-spacing-1_5);
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
  > legend { padding: 0; margin-block-end: var(--gh-spacing-2); }
  > div { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--gh-spacing-2); min-inline-size: 0; }
  ${media.desktop} { > div { gap: var(--gh-spacing-2_5); } }
`;
/** A whole-tile radio: the native input covers the tile, so clicks, arrows and focus stay native. */
export const ModeTile = styled.label`
  position: relative;
  display: grid;
  min-inline-size: 0;
  cursor: pointer;
  > input { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; margin: 0; opacity: 0; cursor: inherit; }
  > span {
    display: grid;
    align-content: start;
    gap: var(--gh-spacing-0_5);
    min-inline-size: 0;
    min-block-size: var(--form-control-height);
    padding: var(--gh-spacing-2_25) var(--gh-spacing-2_5);
    border: 0;
    border-radius: ${({ theme }) => theme.radius.surface};
    color: ${({ theme }) => theme.color.mutedText};
    background: ${({ theme }) => theme.color.surfaceMuted};
    font-size: ${({ theme }) => theme.typography.scale.secondary};
    font-weight: ${({ theme }) => theme.typography.weight.body};
    line-height: var(--gh-leading-caption);
    overflow-wrap: anywhere;
  }
  strong { color: ${({ theme }) => theme.color.text}; font-size: var(--gh-font-reading); font-weight: ${({ theme }) => theme.typography.weight.heavy}; }
  em {
    margin-block-start: var(--gh-spacing-0_5);
    color: ${({ theme }) => theme.color.outcome.correct.text};
    font-size: ${({ theme }) => theme.typography.scale.micro};
    font-style: normal;
    font-weight: ${({ theme }) => theme.typography.weight.heavy};
    letter-spacing: var(--gh-tracking-caption);
    text-transform: uppercase;
  }
  > input:checked + span {

    background: ${({ theme }) => theme.color.brandSoft};
    box-shadow: none;
  }
  > input:focus-visible + span { ${focusRing} }
  ${media.hover} { &:hover > input:not(:checked, :disabled) + span { background: ${({ theme }) => theme.color.rowHover}; } }
  ${media.desktop} { > span { padding: var(--gh-spacing-2_5) var(--gh-spacing-3); } }
`;

/** The second step of a mode switch: a warning box, buttons beside the text when the panel is wide. */
export const ConfirmBox = styled.div`
  display: grid;
  gap: var(--gh-spacing-1_5);
  min-inline-size: 0;
  padding: var(--gh-spacing-3) var(--gh-spacing-3_5);
  border: 0;
  border-radius: ${({ theme }) => theme.radius.surface};
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.outcome.pending.background};
  > strong {
    color: ${({ theme }) => theme.color.outcome.pending.text};
    font-size: ${({ theme }) => theme.typography.scale.emphasis};
    font-weight: ${({ theme }) => theme.typography.weight.heavy};
  }
  > p { font-size: ${({ theme }) => theme.typography.scale.body}; line-height: var(--gh-leading-reading); }
  > div { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--gh-spacing-2); margin-block-start: var(--gh-spacing-1); }
  > div > button { white-space: nowrap; }
  @container (min-width: ${({ theme }) => theme.viewport[34]}) {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--gh-spacing-1) var(--gh-spacing-4);
    > div { grid-column: 2; grid-row: 1 / span 2; margin: 0; }
  }
`;

export const SettingsHint = styled.p`
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  line-height: var(--gh-leading-normal);
`;

export const RequirementBox = styled.div`
  display: grid;
  gap: var(--gh-spacing-1);
  min-inline-size: 0;
  padding: var(--gh-spacing-2_5) var(--gh-spacing-3) var(--gh-spacing-1_5);
  border-radius: ${({ theme }) => theme.radius.surface};
  background: ${({ theme }) => theme.color.surfaceMuted};
`;
export const RequirementList = styled.ul`
  display: grid;
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  li { display: flex; align-items: center; gap: var(--gh-spacing-2); min-inline-size: 0; min-block-size: var(--form-control-height); font-size: ${({ theme }) => theme.typography.scale.body}; }
  li > svg { flex: none; font-size: var(--gh-font-reading); color: ${({ theme }) => theme.color.mutedText}; }
  li > span { min-inline-size: 0; overflow-wrap: anywhere; }
  li > a, li > button {
    display: flex;
    flex: 1;
    align-items: center;
    min-inline-size: 0;
    min-block-size: var(--form-control-height);
    margin: 0;
    padding: 0;
    border: 0;
    color: ${({ theme }) => theme.color.link};
    background: transparent;
    font: inherit;
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    text-align: start;
    text-decoration: underline;
    text-underline-offset: var(--gh-size-0_75);
    cursor: pointer;
    &:focus-visible { ${focusRing} }
  }
  ${media.desktop} { li > a, li > button { min-block-size: var(--form-control-height); } }
`;

/** The footer shares its action group across widths and keeps any password field above it. */
export const SettingsFooter = styled(RecordFooter)`
  && {
    grid-row: 4;
    position: static; flex-wrap: wrap; align-items: center; justify-content: flex-end;
    padding-block: var(--gh-spacing-1);
    > * { flex: none; }
    > [data-setting-password] { flex: 1 0 100%; min-inline-size: 0; }
    > span {
      flex: 1 1 var(--gh-size-18); min-inline-size: 0;
      color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary);
    }
    > [data-record-actions] {
      display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--gh-spacing-2);
      min-inline-size: 0; max-inline-size: 100%;
      button { white-space: nowrap; }
    }
    ${media.desktop} { grid-column: 3; }
  }
`;
