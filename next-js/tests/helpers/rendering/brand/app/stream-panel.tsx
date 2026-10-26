"use client";
import styled from "styled-components";
import { Surface } from "@/components/ui/layout";
export const StreamPanel = styled(Surface)`
  --brand-stream-proof: delivered;
  border-inline-start: 7px solid ${({ theme }) => theme.color.text};
`;

