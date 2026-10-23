"use client";

import styled from "styled-components";
import { Panel } from "@/components/analytics/dashboard/dashboard-styles";

export const AuditLayout = styled.div`display: grid; gap: 14px; min-inline-size: 0;`;

export const AuditToolbar = styled(Panel)`
  display: grid; gap: 12px; padding: 14px; border-radius: 0;
  label { font-size: 0.8125rem; }
  input, select, button { min-block-size: 44px; border-radius: 0; }
  input, select { font-size: 16px; }
`;

export const AuditSearchRow = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 12px; min-inline-size: 0;
  > * { min-inline-size: 0; }
  @media(max-width: 480px) { grid-template-columns: minmax(0, 1fr); > button { inline-size: 100%; } }
`;

export const AuditFilters = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; min-inline-size: 0;
  > * { min-inline-size: 0; }
  > :first-child { grid-column: 1 / -1; }
  @media(min-width: 640px) { grid-template-columns: repeat(3, minmax(0, 1fr)); > :first-child { grid-column: auto; } }
`;

export const AuditSummary = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 12px;
  min-inline-size: 0; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem;
  p { margin: 0; }
`;

export const AuditFeed = styled.section`
  display: grid; gap: 0; min-inline-size: 0; border: 1px solid ${({ theme }) => theme.color.border}; border-radius: 0;
  background: ${({ theme }) => theme.color.surface};
  scroll-margin-block-start: calc(var(--app-header-content-height, 4rem) + 16px);
`;

export const AuditDay = styled.h2`
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 12px;
  min-inline-size: 0; margin: 0; padding: 10px 14px; color: ${({ theme }) => theme.color.mutedText};
  background: ${({ theme }) => theme.color.surfaceMuted}; font-size: 0.75rem; font-weight: 500;
`;

export const AuditEvent = styled.details`
  min-inline-size: 0; border-block-end: 1px solid ${({ theme }) => theme.color.border};
  &:last-child { border-block-end: 0; }
  > summary { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px;
    min-inline-size: 0; min-block-size: 72px; padding: 12px 14px; list-style: none; cursor: pointer; }
  > summary::-webkit-details-marker { display: none; }
  > summary:hover { background: ${({ theme }) => theme.color.rowHover}; }
  > summary:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: -2px; }
  > summary > :last-child > svg:last-child { inline-size: 18px; block-size: 18px; flex: none; }
  &[open] > summary > :last-child > svg:last-child { transform: rotate(180deg); }
`;

export const EventIcon = styled.span<{ $category: string }>`
  display: grid; place-items: center; inline-size: 32px; block-size: 32px; flex: none; border-radius: 0;
  background: ${({ theme, $category }) => $category === "payments" ? theme.color.accent.emerald.soft
    : $category === "security" ? theme.color.accent.amber.soft : theme.color.brandSoft};
  color: ${({ theme, $category }) => $category === "payments" ? theme.color.accent.emerald.text
    : $category === "security" ? theme.color.accent.amber.text : theme.color.link};
  svg { inline-size: 18px; block-size: 18px; }
`;

export const EventMain = styled.div`
  display: flex; align-items: center; gap: 10px; min-inline-size: 0;
  > div { display: grid; gap: 4px; min-inline-size: 0; }
  strong { font-size: 0.875rem; font-weight: 500; overflow-wrap: anywhere; }
  > div > span { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; overflow-wrap: anywhere; }
`;

export const EventWhen = styled.div`
  display: flex; align-items: center; gap: 10px; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem;
  time { white-space: nowrap; font-variant-numeric: tabular-nums; }
`;

export const EventDetails = styled.div`
  display: grid; gap: 12px; min-inline-size: 0; padding: 0 14px 14px;
  a { min-block-size: 44px; border-radius: 0; }
`;

export const AuditFacts = styled.dl`
  display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; min-inline-size: 0; margin: 0;
  > div { display: grid; gap: 4px; min-inline-size: 0; }
  dt { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; }
  dd { min-inline-size: 0; margin: 0; font-size: 0.875rem; overflow-wrap: anywhere; }
  @media(min-width: 640px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;

export const AuditEmpty = styled.div`
  display: grid; justify-items: center; align-content: center; gap: 10px; min-block-size: 100px; padding: 24px 14px;
  color: ${({ theme }) => theme.color.mutedText}; text-align: center; font-size: 0.875rem;
  > svg { inline-size: 28px; block-size: 28px; }
  h2, p { margin: 0; }
`;

export const AuditPagination = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; min-inline-size: 0;
  button { min-block-size: 44px; border-radius: 0; }
`;
