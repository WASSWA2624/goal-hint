"use client";

import styled, { css } from "styled-components";
import { ButtonLink } from "@/components/ui/controls";
import { CriteriaDialog } from "@/components/ui/criteria-dialog";
import { mobileFilterPanel } from "@/components/ui/filter-chrome";
import { media } from "@/styles/theme";
import { ActionButton } from "./admin-form";
import { RecordDetails, RecordHead, RecordListScroll, RecordListTools, RecordWorkspace } from "./record-workspace";

export const AuditLayout = styled(RecordWorkspace)``;
export const AuditHead = styled(RecordHead)`
  > h1 { position: static; inline-size: auto; block-size: auto; margin: 0; padding: 0; overflow: visible; clip: auto; clip-path: none; white-space: normal; }
`;
export const AuditDetails = styled(RecordDetails)`${media.belowDesktop} { display: none; }`;
export const HeadActions = styled.div`margin-inline-start: auto;`;

/** Export always covers the matching loaded activity, including rows beyond the current page. */
export const ExportButton = styled(ActionButton)`
  color: ${({ theme }) => theme.color.link};
  > svg { flex: none; font-size: 1rem; }
`;

/** Search and filters: loose on phones (search, then a Filters drawer), one open side panel from desktop up. */
export const AuditTools = styled(RecordListTools)`
  input, select { min-block-size: 44px; }
  ${media.belowDesktop} { input, select { font-size: 16px; } }
  ${media.desktop} { input, select { min-block-size: 34px; padding-block: 4px; } }
  [data-floating-field] select { border-radius: ${({ theme }) => theme.radius.control}; }
`;

/** The search label stays for assistive technology; the placeholder and icon name the field on screen. */
export const SearchField = styled.div`
  position: relative;
  min-inline-size: 0;
  label { position: absolute; inline-size: 1px; block-size: 1px; margin: -1px; padding: 0; border: 0; overflow: hidden;
    clip: rect(0 0 0 0); white-space: nowrap; }
`;

export const FilterDrawer = styled.div`
  ${mobileFilterPanel}
  min-inline-size: 0;
  ${media.belowDesktop} {
    background: ${({ theme }) => theme.color.surface};
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    border-radius: ${({ theme }) => theme.radius.surface};
  }
`;

export const FilterToggle = styled.button`
  display: flex; align-items: center; gap: 8px; inline-size: 100%; min-block-size: 48px; padding: 0 14px;
  border: 0; color: ${({ theme }) => theme.color.link}; background: none;
  font: inherit; font-weight: ${({ theme }) => theme.typography.weight.bold}; text-align: start; cursor: pointer;
  > svg { flex: none; font-size: 1.125rem; }
  > span { margin-inline-start: 4px; }
  > svg:last-child { margin-inline-start: auto; color: ${({ theme }) => theme.color.mutedText}; font-size: 1rem; transition: transform 0.15s ease; }
  &[aria-expanded="true"] > svg:last-child { transform: rotate(180deg); }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: -3px; }
  @media (prefers-reduced-motion: reduce) { > svg:last-child { transition: none; } }
  ${media.desktop} { display: none; }
`;

export const FilterBody = styled.div<{ $open: boolean }>`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 8px; min-inline-size: 0;
  > * { min-inline-size: 0; }
  > :nth-child(n + 3) { grid-column: 1 / -1; }
  ${({ $open, theme }) => css`${media.belowDesktop} {
    padding: 12px 0 14px; border-block-start: ${theme.border.width} solid ${theme.color.border};
    ${!$open && css`display: none;`}
  }`}
`;

export const AuditRangeSummary = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 8px;
  color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary};
`;

export const AuditRangeDialog = styled(CriteriaDialog)`
  border-radius: ${({ theme }) => theme.radius.overlay};
  && button { border-radius: ${({ theme }) => theme.radius.control}; }
`;

export const AuditRangeFields = styled.div`
  display: grid; gap: 14px;
  > p { margin: 0; }
`;

/** "n events · 1–20 shown" on the start side, the window and time zone on the end side. */
export const AuditSummary = styled.div`
  inline-size: 100%;
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 2px 10px; min-inline-size: 0;
  font-size: ${({ theme }) => theme.typography.scale.body};
  p { margin: 0; }
  b { font-weight: ${({ theme }) => theme.typography.weight.heavy}; }
  > div { display: flex; flex-wrap: wrap; align-items: center; gap: 0 10px; min-inline-size: 0; }
  > p { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary}; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
  ${media.desktop} { font-size: 0.75rem; button { min-block-size: 28px; font-size: 0.75rem; } }
`;

export const AuditFeed = styled(RecordListScroll)`
  scroll-margin-block-start: calc(var(--app-header-height, 4rem) + 16px);
  > * + * { border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border}; }
  &:focus { outline: none; }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: -3px; }
`;

export const AuditDay = styled.h2`
  margin: 0; padding: 6px 14px; color: ${({ theme }) => theme.color.mutedText}; background: ${({ theme }) => theme.color.surfaceMuted};
  font-size: ${({ theme }) => theme.typography.scale.secondary}; font-weight: ${({ theme }) => theme.typography.weight.heavy};
  line-height: 18px; letter-spacing: 0.04em;
  ${media.desktop} { padding-inline: 16px; }
`;

export const AuditEvent = styled.details`
  min-inline-size: 0;
  > summary {
    display: grid; grid-template-columns: 32px minmax(0, 1fr) auto 16px; align-items: center; gap: 0 10px;
    min-block-size: 64px; padding: 8px 12px 8px 14px; list-style: none; cursor: pointer;
    &::-webkit-details-marker { display: none; }
    &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: -3px; }
    > svg:last-child { font-size: 1rem; color: ${({ theme }) => theme.color.mutedText}; transition: transform 0.15s ease; }
  }
  &[open] > summary > svg:last-child { transform: rotate(180deg); }
  ${media.hover} { > summary:hover { background: ${({ theme }) => theme.color.rowHover}; } }
  @media (prefers-reduced-motion: reduce) { > summary > svg:last-child { transition: none; } }
  ${media.desktop} {
    > summary { grid-template-columns: 28px minmax(0, 1fr) auto; min-block-size: 54px; gap: 0 8px; padding: 8px 10px; }
    > summary > svg:last-child { display: none; }
    > summary[aria-current="true"] { background: ${({ theme }) => theme.color.brandSoft}; box-shadow: inset 3px 0 ${({ theme }) => theme.color.link}; }
    > [data-audit-inline-details] { display: none; }
  }
`;

/** Small tinted tile per category: payments green, sign-in and security amber, everything else brand blue. */
export const EventIcon = styled.span<{ $category: string }>`
  display: grid; place-items: center; inline-size: 32px; block-size: 32px; border-radius: ${({ theme }) => theme.radius.control};
  background: ${({ theme, $category }) => $category === "payments" ? theme.color.accent.emerald.soft
    : $category === "security" ? theme.color.accent.amber.soft : theme.color.brandSoft};
  color: ${({ theme, $category }) => $category === "payments" ? theme.color.accent.emerald.text
    : $category === "security" ? theme.color.accent.amber.text : theme.color.link};
  svg { font-size: 1rem; }
  ${media.desktop} { inline-size: 28px; block-size: 28px; border-radius: ${({ theme }) => theme.radius.control}; }
`;

export const EventText = styled.span`
  display: grid; min-inline-size: 0;
  > strong { font-size: ${({ theme }) => theme.typography.scale.emphasis}; font-weight: ${({ theme }) => theme.typography.weight.bold}; line-height: 1.4; overflow-wrap: anywhere; }
  > span { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary}; line-height: 18px; overflow-wrap: anywhere; }
`;

export const EventTime = styled.time`
  color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.body};
  font-variant-numeric: tabular-nums; white-space: nowrap;
`;

/** Facts start under the event title; the related link sits at the end on desktop and fills the row on phones. */
export const EventDetails = styled.div`
  display: grid; gap: 8px; min-inline-size: 0; padding: 0 12px 12px 56px;
  ${media.desktop} {
    display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px 20px; padding: 0 16px 14px 60px;
    > dl { flex: 0 1 22rem; }
  }
`;

export const EventFacts = styled.dl`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; min-inline-size: 0; margin: 0;
  > div { display: grid; align-content: start; min-inline-size: 0; }
  > [data-wide] { grid-column: 1 / -1; }
  dt { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary}; }
  dd { min-inline-size: 0; margin: 0; font-size: ${({ theme }) => theme.typography.scale.body}; font-weight: ${({ theme }) => theme.typography.weight.bold};
    overflow-wrap: anywhere; }
  dd[data-code] { font-family: ui-monospace, Consolas, "Courier New", monospace; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
  ${media.desktop} { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 24px; }
`;

export const EventLink = styled(ButtonLink)`
  && { color: ${({ theme }) => theme.color.link}; min-block-size: 44px; font-size: ${({ theme }) => theme.typography.scale.body}; }
  ${media.desktop} { && { flex: none; min-block-size: 32px; font-size: 0.8125rem; } }
`;

export const AuditPager = styled.nav`
  inline-size: 100%;
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px; min-inline-size: 0; padding: 0;
  border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  > button { gap: 2px; padding-inline: 2px; font-size: 0.75rem; }
  > span { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary}; font-weight: ${({ theme }) => theme.typography.weight.medium}; white-space: nowrap; }
  ${media.desktop} { padding-block: 4px; }
`;
