"use client";

import styled from "styled-components";
import { media } from "@/styles/theme";

export const PerformanceFilters = styled.form`
  display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr)); gap: 12px;
  align-items: end; min-inline-size: 0;
  > button { align-self: end; }
`;
export const MetricList = styled.dl`
  display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 135px), 1fr)); gap: 12px;
  margin: 0; min-inline-size: 0; font-variant-numeric: tabular-nums;
  > div { min-inline-size: 0; padding-inline-start: 10px; border-inline-start: 2px solid ${({ theme }) => theme.color.border}; }
  dt { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; line-height: 1.4; }
  dd { margin: 2px 0 0; font-size: 1.125rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; overflow-wrap: anywhere; }
`;
export const MarketGrid = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px;
  ${media.desktop} { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
`;
export const TableFrame = styled.div`
  max-inline-size: 100%; min-inline-size: 0; overflow-x: auto;
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
`;
export const PerformanceTable = styled.table`
  inline-size: 100%; border-collapse: collapse; font-size: 0.75rem; font-variant-numeric: tabular-nums;
  th, td { padding: 6px; border-block-end: 1px solid ${({ theme }) => theme.color.border}; text-align: end; white-space: nowrap; }
  th:first-child, td:first-child { text-align: start; }
  th { background: ${({ theme }) => theme.color.surfaceMuted}; }
`;
export const EvidenceList = styled.ul`
  display: flex; flex-direction: column; gap: 6px; margin: 0; padding-inline-start: 20px;
  font-size: 0.8125rem; overflow-wrap: anywhere;
`;
export const PublicationHeader = styled.div`
  display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px 16px; margin-block-end: 6px;
  > time { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; }
`;
