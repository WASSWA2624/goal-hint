"use client";

import styled from "styled-components";
import { media } from "@/styles/theme";

/** Phones give long labels the wider column; short values take the rest. */
export const DefinitionList = styled.dl`
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: 6px 12px;
  line-height: 1.35;
  dt, dd { min-inline-size: 0; overflow-wrap: anywhere; }
  dd { margin: 0; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  ${media.desktop} {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: ${({ theme }) => theme.space.sm};
    line-height: inherit;
  }
`;

export const DataTableRegion = styled.div`
  max-inline-size: 100%;
  overflow-x: auto;
  &:focus-visible { outline: ${({ theme }) => `${theme.border.focusWidth} solid ${theme.color.focus}`}; }
`;

/** A readable scrolling minimum: 34rem with 12px cells on phones, 40rem on desktop. */
export const DataTable = styled.table`
  border-collapse: collapse;
  inline-size: 100%;
  min-inline-size: 34rem;
  caption { text-align: start; font-weight: ${({ theme }) => theme.typography.weight.bold}; padding-block: 6px; }
  th, td {
    text-align: start;
    vertical-align: top;
    padding: 6px 8px;
    border: ${({ theme }) => `${theme.border.width} solid ${theme.color.border}`};
    font-size: ${({ theme }) => theme.typography.scale.secondary};
    line-height: 1.35;
  }
  th { background: ${({ theme }) => theme.color.surfaceMuted}; }
  td { white-space: nowrap; }
  ${media.desktop} {
    min-inline-size: 40rem;
    caption { padding-block: ${({ theme }) => theme.space.sm}; }
    th, td { padding: ${({ theme }) => theme.space.sm}; font-size: inherit; line-height: inherit; }
  }
`;
