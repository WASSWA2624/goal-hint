import { css } from "styled-components";
import { media } from "@/styles/theme";

/** Compact, uniform controls leave the full brand name visible on the smallest header rail. */
export const compactHeaderControl = css`
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-inline-size: 2rem;
  min-block-size: 2rem;
  padding: 4px 6px;
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.header.controlBorder};
  border-radius: 0;
  font: inherit;
  font-size: 0.75rem;
  line-height: 1.25;
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  white-space: nowrap;
  cursor: pointer;
  > svg { flex: none; font-size: 0.9375rem; }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.header.text}; outline-offset: 2px; }
  ${media.desktop} {
    min-inline-size: 2.25rem;
    min-block-size: 2.25rem;
    padding-inline: 8px;
    font-size: 0.8125rem;
  }
`;

/** The wordmark always includes Goal Hint; only its scale changes on narrow phones. */
export const compactHeaderBrand = css`
  display: inline-flex;
  flex: none;
  align-items: center;
  min-inline-size: 0;
  text-decoration: none;
  > span { padding: 0; }
  img { display: block; inline-size: 160px; max-inline-size: 100%; block-size: auto; }
  @media (max-width: 479px) { img { inline-size: 128px; } }
  @media (max-width: 359px) { img { inline-size: 96px; } }
`;
