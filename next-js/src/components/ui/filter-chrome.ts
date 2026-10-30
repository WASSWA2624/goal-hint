"use client";

import { css } from "styled-components";
import { media } from "@/styles/theme";

export const focusRing = css`
  &:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: 2px;
  }
`;

/** Shared Matches and Slip Builder filter palette; fields remain distinct from the page. */
export const filterPanelColors = css`
  --filter-panel-background: color-mix(in srgb, ${({ theme }) => theme.color.surfaceMuted} 55%, ${({ theme }) => theme.color.page});
  --filter-field-background: color-mix(in srgb, ${({ theme }) => theme.color.surface} 20%, ${({ theme }) => theme.color.page});
  --filter-field-border: color-mix(in srgb, ${({ theme }) => theme.color.controlBorder} 97%, ${({ theme }) => theme.color.surfaceMuted});
`;

/** Outer phone filter groups share the page edges; individual input boundaries remain visible. */
export const mobileFilterPanel = css`
  ${media.belowDesktop} {
    && { border: 0; border-radius: ${({ theme }) => theme.radius.none}; padding-inline: 0; box-shadow: none; }
  }
`;

export const filterControlColors = css`
  background: var(--filter-field-background, ${({ theme }) => theme.color.surface});
  border-color: var(--filter-field-border, ${({ theme }) => theme.color.controlBorder});
`;

export const filterButtonColors = css`
  background: var(--filter-field-background, ${({ theme }) => theme.color.surface});
  border-color: ${({ theme }) => theme.mode === "dark" ? theme.color.buttonBorder
    : `var(--filter-field-border, ${theme.color.buttonBorder})`};
`;

export const controlFeedback = css`
  transition: border-color 120ms ease, background-color 120ms ease;
  ${media.hover} { &:hover:not([aria-pressed="true"]):not([aria-expanded="true"]) { border-color: ${({ theme }) => theme.color.controlBorder}; } }
  &:focus-within { border-color: ${({ theme }) => theme.color.brand}; }
`;
