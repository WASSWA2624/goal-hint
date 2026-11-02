"use client";

import { css } from "styled-components";
import { media } from "@/styles/theme";
import { sectionSurface, nativeSelectSurface, nativeTextFieldSurface, textFieldSelector } from "./filled-surfaces";
import { contentGutter } from "./layout";

export const focusRing = css`
  &:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: var(--gh-size-0_5);
  }
`;

/** Shared Matches and Slip Builder palette; filled fields remain distinct from their panel. */
export const filterPanelColors = css`
  ${sectionSurface}
  --filter-panel-background: ${({ theme }) => theme.color.section};
  --filter-field-background: ${({ theme }) => theme.color.field};
`;

/** Filter sections share one inset on every screen; the shell owns the outer gutter. */
export const mobileFilterPanel = css`
  ${sectionSurface}
  &&& { padding: ${({ theme }) => theme.layout.sectionPadding}; }
  ${media.belowDesktop} {
    && { border: 0; border-radius: ${({ theme }) => theme.radius.none}; box-shadow: none; }
  }
`;

/** Page filters share the header's outer rails; standalone previews retain the themed gutter. */
export const pageFilterPanel = css`
  ${mobileFilterPanel}
  &&& { padding-inline: ${contentGutter}; }
`;

export const filterControlColors = css`
  border: 0;
  background: var(--filter-field-background, ${({ theme }) => theme.color.field});
  ${nativeTextFieldSurface}
  ${nativeSelectSurface}
`;

export const filterButtonColors = css`
  color: ${({ theme }) => theme.color.link};
  background: ${({ theme }) => theme.color.brandSoft};
  border: 0;
  box-shadow: none;
`;

export const controlFeedback = css`
  transition: background-color ${({ theme }) => theme.motion.fast} ${({ theme }) => theme.motion.easing};
  ${media.hover} { &:hover:not(:disabled):not([aria-pressed="true"]):not([aria-expanded="true"]):not(:is(${textFieldSelector}, select)) { background: ${({ theme }) => theme.color.fieldHover}; } }
  &:focus-within:not(:is(${textFieldSelector}, select)) { background: ${({ theme }) => theme.color.fieldHover}; }
`;
