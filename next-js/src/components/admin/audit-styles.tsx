"use client";

import styled from "styled-components";
import { ButtonLink } from "@/components/ui/controls";
import { media } from "@/styles/theme";
import { RecordListScroll } from "./record-workspace";

export const FilterBody = styled.div`
  display: grid; gap: var(--gh-spacing-3); min-inline-size: 0;
  > p[role="alert"] { color: ${({ theme }) => theme.color.outcome.incorrect.text}; margin: 0; }
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

export const AuditEvents = styled.ol`
  display: grid; min-inline-size: 0; margin: 0; padding: 0;
  list-style: none;
  > li { min-inline-size: 0; }
  > li + li { border-block-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; }
`;

/** Small tinted tile per category: payments green, sign-in and security amber, everything else brand blue. */
export const EventIcon = styled.span<{ $category: string }>`
  display: grid; place-items: center; inline-size: var(--gh-size-7); block-size: var(--gh-size-7); border-radius: ${({ theme }) => theme.radius.control};
  background: ${({ theme, $category }) => $category === "payments" ? theme.color.accent.emerald.soft
    : $category === "security" ? theme.color.accent.amber.soft : theme.color.brandSoft};
  color: ${({ theme, $category }) => $category === "payments" ? theme.color.accent.emerald.text
    : $category === "security" ? theme.color.accent.amber.text : theme.color.link};
  svg { font-size: var(--gh-font-section); }
`;

export const EventTime = styled.time`
  color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.body};
  font-variant-numeric: tabular-nums; white-space: nowrap;
`;

export const EventFacts = styled.dl`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gh-spacing-2) var(--gh-spacing-3); min-inline-size: 0; margin: 0;
  > div { display: grid; align-content: start; min-inline-size: 0; }
  > [data-wide] { grid-column: 1 / -1; }
  dt { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary}; }
  dd { min-inline-size: 0; margin: 0; font-size: ${({ theme }) => theme.typography.scale.body}; font-weight: ${({ theme }) => theme.typography.weight.bold};
    overflow-wrap: anywhere; }
  dd[data-code] { font-family: ${({ theme }) => theme.typography.monoFamily}; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
  ${media.belowDesktop} { padding: var(--gh-spacing-3) ${({ theme }) => theme.layout.sectionPadding}; }
  ${media.desktop} { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gh-spacing-3) var(--gh-spacing-6); }
`;

export const EventLink = styled(ButtonLink)`
  && { color: ${({ theme }) => theme.color.link}; min-block-size: var(--form-control-height); font-size: ${({ theme }) => theme.typography.scale.body}; }
  ${media.desktop} { && { flex: none; min-block-size: var(--form-control-height); font-size: var(--gh-font-body); } }
`;
