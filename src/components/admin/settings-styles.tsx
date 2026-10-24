"use client";

import styled, { css } from "styled-components";
import { Panel } from "@/components/analytics/dashboard/dashboard-styles";
import { media } from "@/styles/theme";
import { ActionButton } from "./admin-form";

const focusRing = css`
  outline: 2px solid ${({ theme }) => theme.color.focus};
  outline-offset: -2px;
`;

/** One section at a time keeps the editor compact without narrowing its fields. */
export const SettingsLayout = styled.div`
  display: grid; gap: 16px; min-inline-size: 0; align-items: start;
  > form { min-inline-size: 0; }
  @media (min-width: 1000px) { grid-template-columns: 12rem minmax(0, 1fr); gap: 20px; }
`;

export const SettingsNav = styled.nav`
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px;
  min-inline-size: 0; padding: 4px; border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.border.radius};
  background: ${({ theme }) => theme.color.surface};
  @media (min-width: 1000px) {
    position: sticky; inset-block-start: calc(var(--app-header-content-height, 4rem) + 16px);
    grid-template-columns: minmax(0, 1fr); gap: 4px; padding: 6px;
  }
`;

export const NavButton = styled(ActionButton)<{ $active: boolean }>`
  display: flex; flex-direction: column; gap: 5px; min-inline-size: 0; min-block-size: 60px;
  padding: 8px 2px; border: 0; border-block-end: 3px solid transparent; border-radius: 0;
  color: ${({ theme, $active }) => $active ? theme.color.link : theme.color.mutedText};
  background: ${({ theme, $active }) => $active ? theme.color.brandSoft : "transparent"};
  font-size: 0.75rem; line-height: 1.3; font-weight: ${({ theme, $active }) => $active ? theme.typography.weight.bold : theme.typography.weight.medium};
  border-block-end-color: ${({ theme, $active }) => $active ? theme.color.link : "transparent"};
  svg { inline-size: 19px; block-size: 19px; flex: none; }
  span { min-inline-size: 0; overflow-wrap: anywhere; }
  &:focus-visible { ${focusRing} }
  @media (min-width: 1000px) {
    flex-direction: row; justify-content: flex-start; gap: 10px; min-block-size: 44px;
    padding: 10px 12px; border-block-end: 0; border-inline-start: 3px solid transparent;
    border-inline-start-color: ${({ theme, $active }) => $active ? theme.color.link : "transparent"}; font-size: 0.8125rem;
  }
`;

export const SettingsContent = styled.div`
  display: grid; gap: 14px; min-inline-size: 0; align-content: start;
  form, fieldset { min-inline-size: 0; }
`;

export const SettingsCard = styled(Panel)`
  gap: 14px; margin: 0; padding: 16px;
  h2, h3, p { margin: 0; }
  label { font-size: 0.8125rem; line-height: 1.45; }
  input:not([type="checkbox"], [type="radio"], [type="hidden"]), select, textarea { min-block-size: 44px; font-size: 16px; }
  button { min-block-size: 44px; }
  textarea { min-block-size: 88px; }
  p, label, small { overflow-wrap: anywhere; }
  @media (max-width: 480px) { padding: 12px; }
  ${media.desktop} { padding: 16px; }
`;

export const SettingsCardHeader = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px;
  min-inline-size: 0; padding-block-end: 12px; border-block-end: 1px solid ${({ theme }) => theme.color.border};
  h2 { display: flex; align-items: center; gap: 8px; font-size: 1rem; line-height: 1.4; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  h2 svg, > svg { inline-size: 19px; block-size: 19px; flex: none; color: ${({ theme }) => theme.color.link}; }
  > div { display: grid; gap: 4px; min-inline-size: 0; }
  p { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.8125rem; line-height: 1.45; }
`;

export const SettingsGrid = styled.div`
  display: grid; gap: 14px; min-inline-size: 0; align-items: start;
  > * { min-inline-size: 0; }
  @media (min-width: 640px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;

export const NetworkCard = styled.section<{ $network?: "mtn" | "airtel" }>`
  display: grid; gap: 12px; min-inline-size: 0; padding: 12px;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.border.radius};
  border-block-start: 3px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.surface};
`;

export const CardTitle = styled.h3`
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-inline-size: 0;
  font-size: 0.875rem; line-height: 1.4; font-weight: ${({ theme }) => theme.typography.weight.bold};
  svg { inline-size: 18px; block-size: 18px; flex: none; }
`;

/** Keep phone fields unobstructed; retain Save while scrolling larger screens. */
export const SaveBar = styled.div`
  position: static; z-index: 5;
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; min-inline-size: 0;
  padding: 12px; border: 1px solid ${({ theme }) => theme.color.border}; border-radius: ${({ theme }) => theme.border.radius};
  background: ${({ theme }) => theme.color.surface}; box-shadow: 0 -3px 12px rgb(0 0 0 / 0.04);
  > div { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-inline-size: 0; }
  button { min-block-size: 44px; white-space: nowrap; }
  > div:last-child:not(:first-child) { margin-inline-start: auto; }
  ${media.desktop} { position: sticky; inset-block-end: 16px; }
`;

export const SaveSummary = styled.span`
  color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; line-height: 1.5;
  font-variant-numeric: tabular-nums; overflow-wrap: anywhere;
`;

export const ModeOptions = styled.fieldset`
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px;
  min-inline-size: 0; margin: 0; padding: 0; border: 0;
  > legend { margin-block-end: 8px; font-size: 0.8125rem; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
`;

export const ModeOption = styled.label<{ $selected: boolean; $unavailable?: boolean }>`
  position: relative; display: grid; min-inline-size: 0; min-block-size: 82px; cursor: pointer;
  border: 1px solid ${({ theme, $selected }) => $selected ? theme.color.link : theme.color.controlBorder};
  border-radius: ${({ theme }) => theme.border.radius};
  color: ${({ theme, $selected }) => $selected ? theme.color.link : theme.color.text};
  background: ${({ theme, $selected }) => $selected ? theme.color.brandSoft : theme.color.surface};
  box-shadow: ${({ theme, $selected }) => $selected ? `inset 0 -2px ${theme.color.link}` : "none"};
  ${({ $unavailable }) => $unavailable && css`cursor: not-allowed; opacity: 0.6;`}
  > input { position: absolute; inline-size: 1px; block-size: 1px; margin: 0; padding: 0; opacity: 0; }
  > span { display: grid; align-content: start; justify-items: center; gap: 5px; min-inline-size: 0; padding: 12px 6px; text-align: center; }
  strong { font-size: 0.875rem; line-height: 1.3; }
  small { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.6875rem; line-height: 1.4; }
  svg { inline-size: 20px; block-size: 20px; flex: none; }
  &:has(input:focus-visible) { ${focusRing} }
  &:has(input:disabled) { cursor: not-allowed; }
`;

export const AdvancedDetails = styled.details`
  min-inline-size: 0; border-block-start: 1px solid ${({ theme }) => theme.color.border};
  > summary { display: flex; align-items: center; gap: 7px; min-block-size: 44px; padding-block: 10px; cursor: pointer;
    color: ${({ theme }) => theme.color.link}; font-size: 0.75rem; font-weight: ${({ theme }) => theme.typography.weight.medium};
    list-style: none; }
  > summary::-webkit-details-marker { display: none; }
  > summary:focus-visible { ${focusRing} }
  > summary svg { inline-size: 15px; block-size: 15px; flex: none; }
  > summary svg:last-child:not(:first-child) { margin-inline-start: auto; }
  &[open] > summary svg:last-child:not(:first-child) { transform: rotate(180deg); }
  > div { display: grid; gap: 12px; min-inline-size: 0; padding-block: 2px 8px; }
`;

export const SettingsHint = styled.p`
  color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; line-height: 1.5;
`;

export const ManagedBadge = styled.span`
  display: inline-flex; align-items: center; gap: 4px; flex: none; padding: 3px 6px;
  border: 1px solid ${({ theme }) => theme.color.border}; color: ${({ theme }) => theme.color.mutedText};
  border-radius: ${({ theme }) => theme.border.radius};
  background: ${({ theme }) => theme.color.surfaceMuted}; font-size: 0.6875rem; line-height: 1.3; font-weight: ${({ theme }) => theme.typography.weight.medium};
  svg { inline-size: 12px; block-size: 12px; flex: none; }
`;

export const SettingsFacts = styled.dl`
  display: grid; gap: 12px; min-inline-size: 0; margin: 0;
  > div { display: grid; gap: 4px; min-inline-size: 0; }
  dt { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; line-height: 1.45; }
  dd { margin: 0; min-inline-size: 0; font-size: 0.875rem; line-height: 1.5; font-weight: ${({ theme }) => theme.typography.weight.medium};
    overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
`;

export const SettingsConfirmation = styled.div`
  display: grid; gap: 10px; min-inline-size: 0; padding: 12px;
  border: 1px solid ${({ theme }) => theme.color.outcome.pending.border};
  border-radius: ${({ theme }) => theme.border.radius};
  color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surface};
  p { margin: 0; font-size: 0.8125rem; line-height: 1.5; }
`;

export const RequirementList = styled.ul`
  display: grid; gap: 8px; min-inline-size: 0; margin: 0; padding: 0; list-style: none;
  li { display: flex; align-items: center; gap: 8px; min-inline-size: 0; font-size: 0.8125rem; line-height: 1.5; }
  svg { inline-size: 16px; block-size: 16px; flex: none; color: ${({ theme }) => theme.color.mutedText}; }
  li > span { min-inline-size: 0; overflow-wrap: anywhere; }
  li > a, li > button {
    display: flex; flex: 1; align-items: center; justify-content: flex-start; min-inline-size: 0; min-block-size: 44px;
    margin: 0; padding: 6px 0; border: 0; color: ${({ theme }) => theme.color.link}; background: transparent;
    white-space: normal; text-align: start; text-decoration: underline; text-underline-offset: 3px;
  }
`;
