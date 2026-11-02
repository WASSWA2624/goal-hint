import { css } from "styled-components";

/** Theme-owned metrics shared by all controls, independent of viewport and local density. */
export const controlMetrics = css`
  --form-control-height: ${({ theme }) => theme.control.height};
  --floating-label-space: ${({ theme }) => theme.control.labelSpace};
  @media (pointer: coarse) { --form-control-height: ${({ theme }) => theme.control.touchHeight}; }
`;

/** Minimum size lets standalone actions grow when their text wraps. */
export const controlHeight = css`
  min-block-size: var(--form-control-height);
`;

/** The visible body excludes the floating label's six-pixel top reserve. */
export const controlBodyHeight = css`
  ${controlHeight}
  box-sizing: border-box;
  block-size: var(--form-control-height);
`;

/** Labels and messages never move neighbouring controls, including nested action groups. */
export const controlRow = css`
  align-items: start;
  --control-row-offset: 0;
  &:has([data-control-field], [data-floating-field], [data-floating-control], [data-feed-search]) {
    --control-row-offset: var(--floating-label-space);
  }
  && > :not(button, a, [data-control-field], [data-floating-field], [data-floating-control], [data-feed-search]):not(:has([data-control-field], [data-floating-field], [data-floating-control], [data-select-trigger], [data-feed-search])):has(> button, > a) {
    margin-block-start: var(--control-row-offset);
  }
  && > button, && > a {
    ${controlBodyHeight}
    flex-shrink: 0;
    padding-block: var(--gh-spacing-1);
    margin-block-start: var(--control-row-offset);
    align-self: start;
  }
`;

/** Inline toolbars use the same geometry as form rows. */
export const inlineControlRow = controlRow;
