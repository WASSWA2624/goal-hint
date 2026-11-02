"use client";

import { controlRow } from "@/components/ui/control-layout";
import { filledTableRows } from "@/components/ui/filled-surfaces";
import styled from "styled-components";
import { media } from "@/styles/theme";
import { joinedDesktopSections, Stack, Surface } from "@/components/ui/layout";
import { mobileFilterPanel } from "@/components/ui/filter-chrome";

export const PerformanceFilterPanel = styled(Surface)`${mobileFilterPanel}`;
export const PerformanceSections = styled(Stack)`${joinedDesktopSections}`;

export const PerformanceFilters = styled.form`
  display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--gh-size-40)), 1fr)); gap: var(--gh-spacing-3);
  align-items: end; min-inline-size: 0;
  ${controlRow}
  > button { align-self: start; }
`;
export const MetricList = styled.dl`
  display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--gh-size-33_75)), 1fr)); gap: var(--gh-spacing-3);
  margin: 0; min-inline-size: 0; font-variant-numeric: tabular-nums;
  > div { min-inline-size: 0; padding-inline-start: var(--gh-spacing-2_5); border-inline-start: 0; }
  dt { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); line-height: var(--gh-leading-compact); }
  dd { margin: var(--gh-spacing-0_5) 0 0; font-size: var(--gh-font-title); font-weight: ${({ theme }) => theme.typography.weight.bold}; overflow-wrap: anywhere; }
`;
export const MarketGrid = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--gh-spacing-3);
  ${media.desktop} { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gh-spacing-4); }
`;
export const TableFrame = styled.div`
  max-inline-size: 100%; min-inline-size: 0; overflow-x: auto;
  &:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; outline-offset: var(--gh-size-0_5); }
`;
export const PerformanceTable = styled.table`
  ${filledTableRows}
  inline-size: 100%; border-collapse: collapse; font-size: var(--gh-font-secondary); font-variant-numeric: tabular-nums;
  th, td { padding: var(--gh-spacing-1_5); border-block-end: 0; text-align: end; white-space: nowrap; }
  th:first-child, td:first-child { text-align: start; }
  th { background: ${({ theme }) => theme.color.surfaceMuted}; }
`;
export const EvidenceList = styled.ul`
  display: flex; flex-direction: column; gap: var(--gh-spacing-1_5); margin: 0; padding-inline-start: var(--gh-spacing-5);
  font-size: var(--gh-font-body); overflow-wrap: anywhere;
`;
export const PublicationHeader = styled.div`
  display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--gh-spacing-1_5) var(--gh-spacing-4); margin-block-end: var(--gh-spacing-1_5);
  > time { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); }
`;
