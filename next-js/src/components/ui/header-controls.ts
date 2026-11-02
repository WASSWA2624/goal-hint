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
  gap: 6px;
  min-inline-size: 0;
`;

/** Compact actions remain centered inside the existing header rail. */
export const compactHeaderControl = css`
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-inline-size: var(--form-control-height, 40px);
  min-block-size: var(--form-control-height, 40px);
  padding: 0 6px;
  border: 0;
  border-radius: ${({ theme }) => theme.radius.control};
  font: inherit;
  font-size: 0.75rem;
  line-height: 1.25;
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  white-space: nowrap;
  cursor: pointer;
  > svg { flex: none; font-size: 1rem; }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.header.accent}; outline-offset: 2px; }
  ${media.desktop} {
    padding-inline: 9px;
    font-size: 0.8125rem;
  }
`;

/** Borderless app-bar actions share a quiet fill and clear pointer/keyboard feedback. */
export const compactHeaderIconControl = css`
  ${compactHeaderControl}
  inline-size: var(--form-control-height, 40px);
  padding: 0 4px;
  border: 0;
  color: ${({ theme }) => theme.header.accent};
  background: ${({ theme }) => theme.mode === "light" ? theme.color.field : theme.color.brandSoft};
  transition: background-color ${({ theme }) => theme.motion.feedback} ${({ theme }) => theme.motion.easing}, color ${({ theme }) => theme.motion.feedback} ${({ theme }) => theme.motion.easing};
  ${media.hover} { &:hover { background: ${({ theme }) => theme.header.controlHover}; color: ${({ theme }) => theme.header.accent}; } }
  &:active, &:focus-visible { background: ${({ theme }) => theme.header.controlHover}; color: ${({ theme }) => theme.header.accent}; }
  &:focus-visible { outline-offset: -3px; }
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;

/** Brand home links keep a small leading inset and a full tap target. */
export const compactHeaderBrand = css`
  display: inline-flex;
  flex: none;
  align-items: center;
  min-inline-size: 0;
  min-block-size: var(--form-control-height, 40px);
  margin-inline-start: ${({ theme }) => theme.space.sm};
  padding: 0;
  text-decoration: none;
  > span { padding: 0; }
`;
