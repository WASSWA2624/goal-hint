import styled, { css } from "styled-components";

/** Keep page navigation clearly separated from the results above it. */
export const PagePaginationSection = styled.div.attrs<{ "data-page-pagination"?: string }>({ "data-page-pagination": "" })`
  min-inline-size: 0;
  margin-block-start: ${({ theme }) => theme.space.lg};
`;

/** Numbered links and scroll-only arrow buttons share the theme's compact control treatment. */
export const paginationControlStyles = css`
  display: grid;
  place-items: center;
  inline-size: 100%;
  block-size: var(--pagination-cell-height);
  padding: 0;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.brandSoft};
  border: 0;
  border-radius: ${({ theme }) => theme.radius.control};
  font: inherit;
  font-variant-numeric: tabular-nums;
  line-height: var(--gh-leading-heading);
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  &:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: calc(-1 * var(--gh-size-0_75));
  }
  @media (hover: hover) {
    &:hover:not(:disabled):not([aria-current="page"]) {
      color: ${({ theme }) => theme.color.link};
      background: ${({ theme }) => theme.color.fieldHover};
    }
  }
  &[aria-current="page"] {
    color: ${({ theme }) => theme.color.onAction};
    background: ${({ theme }) => theme.gradient.action};

    font-weight: ${({ theme }) => theme.typography.weight.bold};
    &:focus-visible { outline-color: ${({ theme }) => theme.color.onAction}; }
  }
  &:disabled { cursor: not-allowed; }
  &:disabled:not([aria-current="page"]) { color: ${({ theme }) => theme.color.disabledText}; }
  svg { font-size: var(--gh-font-title); }
`;
