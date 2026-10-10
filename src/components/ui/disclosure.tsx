"use client";

import styled, { css } from "styled-components";
import { media } from "@/styles/theme";
import { Surface } from "./layout";

const plain = css`
  padding: 0;
  border: 0;
  background: transparent;
`;

/** Below desktop the summary's own padding frames a closed panel, so it stays one compact row. */
const framed = css`
  ${media.belowDesktop} {
    padding-block: 2px;
    &[open] { padding-block-end: 12px; }
  }
`;

/** Native expanded state and Enter/Space navigation also work before hydration. */
export const Disclosure = styled(Surface).attrs({ as: "details" })<{ $plain?: boolean }>`
  ${({ $plain }) => $plain ? plain : framed}
  > summary {
    min-block-size: ${({ theme }) => theme.control.compactHeight};
    padding-block: 9px;
    cursor: pointer;
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    line-height: 1.35;
    overflow-wrap: anywhere;
    ${media.desktop} {
      min-block-size: ${({ theme }) => theme.control.minHeight};
      padding-block: ${({ theme }) => theme.space.sm};
      line-height: inherit;
    }
  }
  > summary:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: ${({ theme }) => theme.border.focusOffset};
  }
  > summary + * {
    margin-block-start: 8px;
    ${media.desktop} { margin-block-start: ${({ theme }) => theme.space.md}; }
  }
`;
