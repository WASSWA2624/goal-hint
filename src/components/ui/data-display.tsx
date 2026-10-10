"use client";

import styled from "styled-components";

export const DefinitionList = styled.dl`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: ${({ theme }) => theme.space.sm};
  dt, dd { min-inline-size: 0; overflow-wrap: anywhere; }
  dd { margin: 0; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
`;

export const DataTableRegion = styled.div`
  max-inline-size: 100%;
  overflow-x: auto;
  &:focus-visible { outline: ${({ theme }) => `${theme.border.focusWidth} solid ${theme.color.focus}`}; }
`;

export const DataTable = styled.table`
  border-collapse: collapse;
  inline-size: 100%;
  min-inline-size: 40rem;
  caption { text-align: start; font-weight: ${({ theme }) => theme.typography.weight.bold}; padding-block: ${({ theme }) => theme.space.sm}; }
  th, td { text-align: start; vertical-align: top; padding: ${({ theme }) => theme.space.sm}; border: ${({ theme }) => `${theme.border.width} solid ${theme.color.border}`}; }
  th { background: ${({ theme }) => theme.color.surfaceMuted}; }
  td { white-space: nowrap; }
`;
