import { css } from "styled-components";

/** One row height, with the larger target retained on touch devices. */
export const controlHeight = css`
  --form-control-height: 40px;
  min-block-size: var(--form-control-height);
  @media (pointer: coarse) { --form-control-height: 44px; }
`;

/** The visible body excludes the floating label's six-pixel top reserve. */
export const controlBodyHeight = css`
  ${controlHeight}
  box-sizing: border-box;
  block-size: var(--form-control-height);
`;

/** End-aligned toolbars can mix nested date pickers, selects, links and actions. */
export const inlineControlRow = css`
  align-items: end;
  && > button, && > a {
    ${controlBodyHeight}
    padding-block: 4px; align-self: end;
  }
`;

/** Start controls together so hints/errors below one field cannot shift its neighbours. */
export const controlRow = css`
  align-items: start;
  && > button, && > a {
    ${controlBodyHeight}
    padding-block: 4px; margin-block-start: 6px;
  }
`;
