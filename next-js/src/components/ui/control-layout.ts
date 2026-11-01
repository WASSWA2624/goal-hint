import { css } from "styled-components";

/** One row height, with the larger target retained on touch devices. */
export const controlHeight = css`
  --form-control-height: 40px;
  min-block-size: var(--form-control-height);
  @media (pointer: coarse) { --form-control-height: 44px; }
`;

/** Start controls together so hints/errors below one field cannot shift its neighbours. */
export const controlRow = css`
  align-items: start;
  > button, > a[role="button"] {
    ${controlHeight}
    box-sizing: border-box; block-size: var(--form-control-height); margin-block-start: 6px;
  }
`;
