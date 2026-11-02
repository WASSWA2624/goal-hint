"use client";

import styled from "styled-components";

/** Mobile match and slip badges share a compact, fixed-width alignment column. */
export const mobileStatusWidth = "var(--gh-size-32)";

/** Uniform status geometry; each caller supplies its semantic ink and faint fill. */
export const StatusBadge = styled.span`
  display: inline-flex; flex: none; align-items: center; justify-content: center;
  inline-size: var(--gh-size-23); max-inline-size: 100%; min-block-size: var(--gh-size-6); padding: var(--gh-spacing-0_75) var(--gh-spacing-1_25); box-sizing: border-box;
  border: 0; border-radius: ${({ theme }) => theme.radius.small};
  background: var(--status-fill); color: var(--status-ink);
  font-size: var(--gh-font-secondary); font-weight: ${({ theme }) => theme.typography.weight.bold}; line-height: var(--gh-leading-control); text-align: center; white-space: nowrap;
`;
