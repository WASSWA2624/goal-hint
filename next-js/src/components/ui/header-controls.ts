import { css } from "styled-components";
import { media } from "@/styles/theme";

/** The approved Quiet controls surface is shared by public, app and match-detail headers. */
export const compactHeaderSurface = css`
  color: ${({ theme }) => theme.header.text};
  background: ${({ theme }) => theme.header.gradient};
  border-block-end: 1px solid ${({ theme }) => theme.header.border};
`;

/** Keep enlarged controls readable by allowing the header to grow onto another row. */
export const compactHeaderRow = css`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-inline-size: 0;
`;

/** Compact desktop controls keep comfortable, non-overlapping phone touch targets. */
export const compactHeaderControl = css`
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-inline-size: 2.75rem;
  min-block-size: 2.75rem;
  padding: 4px 6px;
  border: 1px solid transparent;
  border-radius: 0;
  font: inherit;
  font-size: 0.75rem;
  line-height: 1.25;
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  white-space: nowrap;
  cursor: pointer;
  > svg { flex: none; font-size: 1rem; }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.header.accent}; outline-offset: 2px; }
  ${media.desktop} {
    min-inline-size: 2rem;
    min-block-size: 2rem;
    padding-inline: 9px;
    font-size: 0.8125rem;
  }
`;

/** Branding has no padded clear space; its home link remains easy to tap. */
export const compactHeaderBrand = css`
  display: inline-flex;
  flex: none;
  align-items: center;
  min-inline-size: 0;
  min-block-size: 2.75rem;
  padding: 0;
  text-decoration: none;
  > span { padding: 0; }
`;
