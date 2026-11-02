import { css } from "styled-components";
import { media } from "@/styles/theme";

/** The approved Quiet controls surface is shared by public, app and match-detail headers. */
export const compactHeaderSurface = css`
  color: ${({ theme }) => theme.header.text};
  background: ${({ theme }) => theme.header.gradient};
  border-block-end: 0;
`;

/** Keep enlarged controls readable by allowing the header to grow onto another row. */
export const compactHeaderRow = css`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gh-spacing-1_5);
  min-inline-size: 0;
`;

/** Compact actions remain centered inside the existing header rail. */
export const compactHeaderControl = css`
  --header-control-height: calc(var(--form-control-height) - 2 * var(--gh-headerControl-blockInset));
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  gap: var(--gh-spacing-1);
  min-inline-size: var(--header-control-height);
  min-block-size: var(--header-control-height);
  block-size: var(--header-control-height);
  padding: 0 var(--gh-spacing-1_5);
  border: 0;
  border-radius: ${({ theme }) => theme.radius.control};
  font: inherit;
  font-size: var(--gh-font-secondary);
  line-height: var(--gh-leading-heading);
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  white-space: nowrap;
  cursor: pointer;
  > svg { flex: none; font-size: var(--gh-font-section); }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.header.accent}; outline-offset: var(--gh-size-0_5); }
  ${media.desktop} {
    padding-inline: var(--gh-spacing-2_25);
    font-size: var(--gh-font-body);
  }
`;

/** Borderless app-bar actions share a quiet fill and clear pointer/keyboard feedback. */
export const compactHeaderIconControl = css`
  ${compactHeaderControl}
  inline-size: var(--header-control-height);
  padding: 0 var(--gh-spacing-1);
  border: 0;
  color: ${({ theme }) => theme.header.accent};
  background: ${({ theme }) => theme.action.headerBackground};
  transition: background-color ${({ theme }) => theme.motion.feedback} ${({ theme }) => theme.motion.easing}, color ${({ theme }) => theme.motion.feedback} ${({ theme }) => theme.motion.easing};
  ${media.hover} { &:hover { background: ${({ theme }) => theme.header.controlHover}; color: ${({ theme }) => theme.header.accent}; } }
  &:active, &:focus-visible { background: ${({ theme }) => theme.header.controlHover}; color: ${({ theme }) => theme.header.accent}; }
  &:focus-visible { outline-offset: calc(-1 * var(--gh-size-0_75)); }
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;

/** Brand home links keep a small leading inset and a full tap target. */
export const compactHeaderBrand = css`
  display: inline-flex;
  flex: none;
  align-items: center;
  min-inline-size: 0;
  min-block-size: var(--form-control-height);
  margin-inline-start: ${({ theme }) => theme.space.sm};
  padding: 0;
  text-decoration: none;
  > span { padding: 0; }
`;
