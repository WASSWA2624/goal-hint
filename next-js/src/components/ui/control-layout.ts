import { css } from "styled-components";

/** One inherited metric for every control, regardless of viewport or local density. */
export const controlMetrics = css`
  --form-control-height: 40px;
  --floating-label-space: 6px;
  @media (pointer: coarse) { --form-control-height: 44px; }
`;

/** Minimum size lets standalone actions grow when their text wraps. */
export const controlHeight = css`
  min-block-size: var(--form-control-height, 40px);
`;

/** The visible body excludes the floating label's six-pixel top reserve. */
export const controlBodyHeight = css`
  ${controlHeight}
  box-sizing: border-box;
  block-size: var(--form-control-height, 40px);
`;

/** Labels and messages never move neighbouring controls, including nested action groups. */
export const controlRow = css`
  align-items: start;
  --control-row-offset: 0px;
  &:has([data-control-field], [data-floating-field], [data-floating-control], [data-feed-search]) {
    --control-row-offset: var(--floating-label-space, 6px);
  }
  && > :not(button, a, [data-control-field], [data-floating-field], [data-floating-control], [data-feed-search]):not(:has([data-control-field], [data-floating-field], [data-floating-control], [data-select-trigger], [data-feed-search])):has(> button, > a) {
    margin-block-start: var(--control-row-offset);
  }
  && > button, && > a {
    ${controlBodyHeight}
    padding-block: 4px;
    margin-block-start: var(--control-row-offset);
    align-self: start;
  }
`;

/** Inline toolbars use the same geometry as form rows. */
export const inlineControlRow = controlRow;
