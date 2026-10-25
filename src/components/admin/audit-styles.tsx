"use client";

import styled, { css } from "styled-components";
import { ButtonLink } from "@/components/ui/controls";
import { media } from "@/styles/theme";
import { ActionButton } from "./admin-form";
import { Panel } from "./desk-styles";

export const AuditLayout = styled.div`
  display: grid; gap: 12px; min-inline-size: 0;
  ${media.desktop} { gap: 16px; }
`;

/** One Export button lives in the phone title row, the other at the foot of the desktop filter panel; only one shows. */
export const ExportButton = styled(ActionButton)<{ $place: "head" | "panel" }>`
  color: ${({ theme }) => theme.color.link};
  > svg { flex: none; font-size: 1rem; }
  ${({ $place }) => $place === "head" ? css`${media.desktop} { display: none; }`
    : css`inline-size: 100%; ${media.belowDesktop} { display: none; } ${media.desktop} { min-block-size: 40px; }`}
`;

/** Search and filters: loose on phones (search, then a Filters drawer), one open side panel from desktop up. */
export const AuditTools = styled(Panel)`
  display: grid; gap: 12px; align-content: start;
  ${media.belowDesktop} { background: none; border: 0; }
  ${media.desktop} {
    position: sticky; inset-block-start: calc(var(--app-header-height, 4rem) + 16px);
    padding: 14px 16px 16px;
  }
  label { font-size: ${({ theme }) => theme.typography.scale.body}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  input, select { min-block-size: 44px; }
  ${media.belowDesktop} { input, select { font-size: 16px; } }
  ${media.desktop} { input, select { min-block-size: 40px; padding-block: 6px; } }
`;

/** The search label stays for assistive technology; the placeholder and icon name the field on screen. */
export const SearchField = styled.div`
  min-inline-size: 0;
  label { position: absolute; inline-size: 1px; block-size: 1px; margin: -1px; padding: 0; border: 0; overflow: hidden;
    clip: rect(0 0 0 0); white-space: nowrap; }
`;

export const FilterDrawer = styled.div`
  min-inline-size: 0;
  ${media.belowDesktop} {
    background: ${({ theme }) => theme.color.surface};
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    border-radius: 6px;
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
  > :first-child { grid-column: 1 / -1; }
  ${({ $open, theme }) => css`${media.belowDesktop} {
    padding: 12px 14px 14px; border-block-start: ${theme.border.width} solid ${theme.color.border};
    ${!$open && css`display: none;`}
  }`}
  ${media.desktop} { grid-template-columns: minmax(0, 1fr); }
`;

/** "n events · 1–20 shown" on the start side, the window and time zone on the end side. */
export const AuditSummary = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 2px 10px; min-inline-size: 0;
  font-size: ${({ theme }) => theme.typography.scale.body};
  p { margin: 0; }
  b { font-weight: ${({ theme }) => theme.typography.weight.heavy}; }
  > div { display: flex; flex-wrap: wrap; align-items: center; gap: 0 10px; min-inline-size: 0; }
  > p { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary}; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
`;

export const FeedPanel = styled(Panel)`overflow: hidden;`;

export const AuditFeed = styled.section`
  display: grid; min-inline-size: 0;
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
  ${media.desktop} { > summary { gap: 0 12px; padding: 8px 14px 8px 16px; } }
`;

/** Small tinted tile per category: payments green, sign-in and security amber, everything else brand blue. */
export const EventIcon = styled.span<{ $category: string }>`
  display: grid; place-items: center; inline-size: 32px; block-size: 32px; border-radius: 6px;
  background: ${({ theme, $category }) => $category === "payments" ? theme.color.accent.emerald.soft
    : $category === "security" ? theme.color.accent.amber.soft : theme.color.brandSoft};
  color: ${({ theme, $category }) => $category === "payments" ? theme.color.accent.emerald.text
    : $category === "security" ? theme.color.accent.amber.text : theme.color.link};
  svg { font-size: 1rem; }
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
  ${media.desktop} { grid-template-columns: repeat(2, minmax(0, 10rem)); gap: 8px 24px; }
`;

export const EventLink = styled(ButtonLink)`
  && { color: ${({ theme }) => theme.color.link}; min-block-size: 44px; font-size: ${({ theme }) => theme.typography.scale.body}; }
  ${media.desktop} { && { flex: none; min-block-size: 40px; } }
`;

export const AuditPager = styled.nav`
  display: flex; align-items: center; justify-content: space-between; gap: 8px; min-inline-size: 0; padding: 0 6px;
  border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  > span { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary}; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
  ${media.desktop} { padding: 4px 8px; }
`;
