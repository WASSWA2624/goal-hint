import { css } from "styled-components";
import { media } from "@/styles/theme";

/** Mobile slots fill the container; desktops retain compact pagination on one row. */
export const paginationListStyles = css`
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 2.25rem);
  inline-size: max-content;
  max-inline-size: 100%;
  min-inline-size: 0;
  align-items: center;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.8125rem;
  ${media.belowDesktop} {
    grid-auto-columns: minmax(1.5rem, 1fr);
    inline-size: 100%;
  }
  @media (max-width: 20rem) { gap: 2px; }
  @media (max-width: 18.75rem) { gap: 0; }
  ${media.desktop} { gap: 6px; font-size: 0.875rem; }
  > li { min-inline-size: 0; }
  > li > a, > li > button, > li > span {
    display: grid;
    place-items: center;
    inline-size: 100%;
    block-size: 2rem;
    padding: 0;
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.surface};
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    border-radius: 0;
    font: inherit;
    font-variant-numeric: tabular-nums;
    line-height: 1.25;
    text-decoration: none;
    white-space: nowrap;
    &:focus-visible {
      outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
      outline-offset: 2px;
    }
    ${media.desktop} { block-size: 2.25rem; }
  }
  > li > a, > li > button { cursor: pointer; }
  ${media.hover} {
    > li > a:hover:not([aria-current="page"]), > li > button:hover:not(:disabled):not([aria-current="page"]) {
      color: ${({ theme }) => theme.color.link};
      border-color: ${({ theme }) => theme.color.brand};
    }
  }
  > li > [aria-current="page"] {
    color: ${({ theme }) => theme.color.onAction};
    background: ${({ theme }) => theme.gradient.action};
    border-color: transparent;
    font-weight: ${({ theme }) => theme.typography.weight.bold};
  }
  > li > span[data-gap] { background: none; border: 0; color: ${({ theme }) => theme.color.mutedText}; }
  > li > :disabled, > li > [aria-disabled="true"] { color: ${({ theme }) => theme.color.disabledText}; cursor: not-allowed; }
  svg { font-size: 1.125rem; }
`;
