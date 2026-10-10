"use client";

import styled from "styled-components";
import { Stack } from "@/components/ui/layout";
export const DetailMarket = styled(Stack)`
  border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  padding-block-start: ${({ theme }) => theme.space.md};
`;
export const DetailMarketGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${({ theme }) => theme.space.md};
  min-inline-size: 0;
  @media (min-width: ${({ theme }) => theme.breakpoint.lg}) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;
