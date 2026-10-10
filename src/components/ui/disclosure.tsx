"use client";

import styled, { css } from "styled-components";
import { Surface } from "./layout";

/** Native expanded state and Enter/Space navigation also work before hydration. */
export const Disclosure = styled(Surface).attrs({ as: "details" })<{ $plain?: boolean }>`
  ${({ $plain }) => $plain && css`
    padding: 0;
    border: 0;
    background: transparent;
  `}
  > summary {
    min-block-size: ${({ theme }) => theme.control.minHeight};
    padding-block: ${({ theme }) => theme.space.sm};
    cursor: pointer;
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    overflow-wrap: anywhere;
  }
  > summary:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: ${({ theme }) => theme.border.focusOffset};
  }
  > summary + * { margin-block-start: ${({ theme }) => theme.space.md}; }
`;
