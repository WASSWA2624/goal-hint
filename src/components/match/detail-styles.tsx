"use client";

import styled from "styled-components";
import { Stack } from "@/components/ui/layout";
import { media } from "@/styles/theme";

/** Phones and tablets halve the spacing; desktop keeps the full space tokens. */
export const DetailMarket = styled(Stack)`
  border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  padding-block-start: ${({ theme }) => theme.space.sm};
  ${media.desktop} { padding-block-start: ${({ theme }) => theme.space.md}; }
`;
export const DetailMarketGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${({ theme }) => theme.space.sm};
  min-inline-size: 0;
  ${media.desktop} {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: ${({ theme }) => theme.space.md};
  }
`;
