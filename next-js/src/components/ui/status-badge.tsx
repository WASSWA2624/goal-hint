"use client";

import styled from "styled-components";

/** Mobile match and slip badges share a compact, fixed-width alignment column. */
export const mobileStatusWidth = "min(8rem, 128px)";

/** Uniform status geometry; each caller supplies its semantic ink and faint fill. */
export const StatusBadge = styled.span`
  display: inline-flex; flex: none; align-items: center; justify-content: center;
  inline-size: 5.75rem; max-inline-size: 100%; min-block-size: 1.5rem; padding: 3px 5px; box-sizing: border-box;
  border: 1px solid color-mix(in srgb, var(--status-ink) 30%, transparent); border-radius: ${({ theme }) => theme.radius.small};
  background: var(--status-fill); color: var(--status-ink);
  font-size: 0.75rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; line-height: 1.2; text-align: center; white-space: nowrap;
`;
