"use client";

import styled from "styled-components";
import { ButtonLink } from "@/components/ui/controls";
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
  > svg { flex: none; font-size: var(--gh-font-section); }
`;

/** The shared search bar keeps the advanced-filter opener on the same row at every width. */
export const AuditTools = styled(RecordListTools)`
  > p { margin: 0; color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); }
  ${media.belowDesktop} { input, select { font-size: var(--gh-font-section); } }
  [data-floating-field] select { border-radius: ${({ theme }) => theme.radius.control}; }
`;

export const FilterBody = styled.div`
  display: grid; gap: var(--gh-spacing-3); min-inline-size: 0;
  > p[role="alert"] { color: ${({ theme }) => theme.color.outcome.incorrect.text}; margin: 0; }
`;

/** "n events · 1–20 shown" on the start side, the window and time zone on the end side. */
export const AuditSummary = styled.div`
  inline-size: 100%;
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--gh-spacing-0_5) var(--gh-spacing-2_5); min-inline-size: 0;
  font-size: ${({ theme }) => theme.typography.scale.body};
  p { margin: 0; }
  b { font-weight: ${({ theme }) => theme.typography.weight.heavy}; }
  > div { display: flex; flex-wrap: wrap; align-items: center; gap: 0 var(--gh-spacing-2_5); min-inline-size: 0; }
  > p { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary}; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
  ${media.desktop} { font-size: var(--gh-font-secondary); button { min-block-size: var(--form-control-height); font-size: var(--gh-font-secondary); } }
`;

export const AuditFeed = styled(RecordListScroll)`
  scroll-margin-block-start: calc(var(--app-header-height, var(--gh-size-16)) + var(--gh-spacing-4));
  > * + * { border-block-start: 0; }
  &:focus { outline: none; }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-size-0_75)); }
`;

export const AuditDay = styled.h2`
  margin: 0; padding: var(--gh-spacing-1_5) var(--gh-spacing-3_5); color: ${({ theme }) => theme.color.mutedText}; background: ${({ theme }) => theme.color.surfaceMuted};
  font-size: ${({ theme }) => theme.typography.scale.secondary}; font-weight: ${({ theme }) => theme.typography.weight.heavy};
  line-height: var(--gh-size-4_5); letter-spacing: var(--gh-tracking-wider);
  ${media.desktop} { padding-inline: var(--gh-spacing-4); }
`;

export const AuditEvent = styled.details`
  min-inline-size: 0;
  > summary {
    display: grid; grid-template-columns: var(--gh-size-8) minmax(0, 1fr) auto var(--gh-size-4); align-items: center; gap: 0 var(--gh-spacing-2_5);
    min-block-size: var(--gh-size-16); padding: var(--gh-spacing-2) var(--gh-spacing-3) var(--gh-spacing-2) var(--gh-spacing-3_5); list-style: none; cursor: pointer;
    &::-webkit-details-marker { display: none; }
    &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-size-0_75)); }
    > svg:last-child { font-size: var(--gh-font-section); color: ${({ theme }) => theme.color.mutedText}; transition: transform ${({ theme }) => theme.motion.disclosure} ${({ theme }) => theme.motion.easing}; }
  }
  &[open] > summary > svg:last-child { transform: rotate(180deg); }
  ${media.hover} { > summary:hover { background: ${({ theme }) => theme.color.rowHover}; } }
  @media (prefers-reduced-motion: reduce) { > summary > svg:last-child { transition: none; } }
  ${media.desktop} {
    > summary { grid-template-columns: var(--gh-size-7) minmax(0, 1fr) auto; min-block-size: var(--gh-size-13_5); gap: 0 var(--gh-spacing-2); padding: var(--gh-spacing-2) var(--gh-spacing-2_5); }
    > summary > svg:last-child { display: none; }
    > summary[aria-current="true"] { background: ${({ theme }) => theme.color.brandSoft}; box-shadow: none; }
    > [data-audit-inline-details] { display: none; }
  }
`;

/** Small tinted tile per category: payments green, sign-in and security amber, everything else brand blue. */
export const EventIcon = styled.span<{ $category: string }>`
  display: grid; place-items: center; inline-size: var(--gh-size-8); block-size: var(--gh-size-8); border-radius: ${({ theme }) => theme.radius.control};
  background: ${({ theme, $category }) => $category === "payments" ? theme.color.accent.emerald.soft
    : $category === "security" ? theme.color.accent.amber.soft : theme.color.brandSoft};
  color: ${({ theme, $category }) => $category === "payments" ? theme.color.accent.emerald.text
    : $category === "security" ? theme.color.accent.amber.text : theme.color.link};
  svg { font-size: var(--gh-font-section); }
  ${media.desktop} { inline-size: var(--gh-size-7); block-size: var(--gh-size-7); border-radius: ${({ theme }) => theme.radius.control}; }
`;

export const EventText = styled.span`
  display: grid; min-inline-size: 0;
  > strong { font-size: ${({ theme }) => theme.typography.scale.emphasis}; font-weight: ${({ theme }) => theme.typography.weight.bold}; line-height: var(--gh-leading-compact); overflow-wrap: anywhere; }
  > span { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary}; line-height: var(--gh-size-4_5); overflow-wrap: anywhere; }
`;

export const EventTime = styled.time`
  color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.body};
  font-variant-numeric: tabular-nums; white-space: nowrap;
`;

/** Facts start under the event title; the related link sits at the end on desktop and fills the row on phones. */
export const EventDetails = styled.div`
  display: grid; gap: var(--gh-spacing-2); min-inline-size: 0; padding: 0 var(--gh-spacing-3) var(--gh-spacing-3) var(--gh-spacing-14);
  ${media.desktop} {
    display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--gh-spacing-3) var(--gh-spacing-5); padding: 0 var(--gh-spacing-4) var(--gh-spacing-3_5) var(--gh-spacing-15);
    > dl { flex: 0 1 var(--gh-size-88); }
  }
`;

export const EventFacts = styled.dl`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gh-spacing-2) var(--gh-spacing-3); min-inline-size: 0; margin: 0;
  > div { display: grid; align-content: start; min-inline-size: 0; }
  > [data-wide] { grid-column: 1 / -1; }
  dt { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary}; }
  dd { min-inline-size: 0; margin: 0; font-size: ${({ theme }) => theme.typography.scale.body}; font-weight: ${({ theme }) => theme.typography.weight.bold};
    overflow-wrap: anywhere; }
  dd[data-code] { font-family: ${({ theme }) => theme.typography.monoFamily}; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
  ${media.desktop} { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gh-spacing-3) var(--gh-spacing-6); }
`;

export const EventLink = styled(ButtonLink)`
  && { color: ${({ theme }) => theme.color.link}; min-block-size: var(--form-control-height); font-size: ${({ theme }) => theme.typography.scale.body}; }
  ${media.desktop} { && { flex: none; min-block-size: var(--form-control-height); font-size: var(--gh-font-body); } }
`;

export const AuditPager = styled.nav`
  inline-size: 100%;
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--gh-spacing-1); min-inline-size: 0; padding: 0;
  border-block-start: 0;
  > button { gap: var(--gh-spacing-0_5); padding-inline: var(--gh-spacing-0_5); font-size: var(--gh-font-secondary); }
  > span { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary}; font-weight: ${({ theme }) => theme.typography.weight.medium}; white-space: nowrap; }
  ${media.desktop} { padding-block: var(--gh-spacing-1); }
`;
