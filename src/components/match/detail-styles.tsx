"use client";

import styled, { css } from "styled-components";
import { Stack, Surface } from "@/components/ui/layout";

const disclosureTreatment = css`
  summary {
    min-block-size: ${({ theme }) => theme.control.minHeight};
    padding-block: ${({ theme }) => theme.space.sm};
    cursor: pointer;
    font-weight: ${({ theme }) => theme.typography.weight.bold};
  }
  summary:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: ${({ theme }) => theme.border.focusOffset};
  }
`;
export const DetailArticle = styled(Stack).attrs({ as: "article" })`
  overflow-wrap: anywhere;
`;
export const DetailMarket = styled(Stack)`
  border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  padding-block-start: ${({ theme }) => theme.space.md};
  ${disclosureTreatment}
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
export const SourceDisclosure = styled(Surface).attrs({ as: "details" })`
  ${disclosureTreatment}
`;
