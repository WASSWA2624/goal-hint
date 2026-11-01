"use client";

import { css } from "styled-components";
import { media } from "@/styles/theme";

export const focusRing = css`
  &:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: 2px;
  }
`;

/** Shared Matches and Slip Builder palette; filled fields remain distinct from their panel. */
export const filterPanelColors = css`
  --filter-panel-background: ${({ theme }) => theme.color.surfaceMuted};
  --filter-field-background: ${({ theme }) => theme.color.field};
`;

/** Outer phone filter groups share the page edges; individual input boundaries remain visible. */
export const mobileFilterPanel = css`
  ${media.belowDesktop} {
    && { border: 0; border-radius: ${({ theme }) => theme.radius.none}; padding-inline: 0; box-shadow: none; }
  }
`;

/** Desktop toolbars stay below the app header and above scrolling result cards. */
export const desktopStickyFilters = css`
  ${media.desktop} {
    position: sticky;
    inset-block-start: var(--app-header-height, 3rem);
    z-index: 15;
  }
`;

export const filterControlColors = css`
  border: 0;
  background: var(--filter-field-background, ${({ theme }) => theme.color.field});
`;

export const filterButtonColors = css`
  color: ${({ theme }) => theme.color.link};
  background: ${({ theme }) => theme.color.brandSoft};
  border: 0;
  box-shadow: none;
`;

export const controlFeedback = css`
  transition: background-color ${({ theme }) => theme.motion.fast} ${({ theme }) => theme.motion.easing};
  ${media.hover} { &:hover:not(:disabled):not([aria-pressed="true"]):not([aria-expanded="true"]) { background: ${({ theme }) => theme.color.fieldHover}; } }
  &:focus-within { background: ${({ theme }) => theme.color.fieldHover}; }
`;
