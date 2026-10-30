import { css } from "styled-components";
/** Numbered links and scroll-only arrow buttons share the theme's compact control treatment. */
export const paginationControlStyles = css`
  display: grid;
  place-items: center;
  inline-size: 100%;
  block-size: var(--pagination-cell-height);
  padding: 0;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.control};
  font: inherit;
  font-variant-numeric: tabular-nums;
  line-height: 1.25;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  &:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: -3px;
  }
  @media (hover: hover) {
    &:hover:not(:disabled):not([aria-current="page"]) {
      color: ${({ theme }) => theme.color.link};
      border-color: ${({ theme }) => theme.color.brand};
    }
  }
  &[aria-current="page"] {
    color: ${({ theme }) => theme.color.onAction};
    background: ${({ theme }) => theme.gradient.action};
    border-color: transparent;
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    &:focus-visible { outline-color: ${({ theme }) => theme.color.onAction}; }
  }
  &:disabled { cursor: not-allowed; }
  &:disabled:not([aria-current="page"]) { color: ${({ theme }) => theme.color.disabledText}; }
  svg { font-size: 1.125rem; }
`;
