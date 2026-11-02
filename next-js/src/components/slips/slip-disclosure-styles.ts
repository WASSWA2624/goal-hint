import { css } from "styled-components";

/** Embedded header actions share a smaller frame, with room above and below it. */
export const slipHeaderActionMetrics = css`
  --slip-header-action-inset: var(--gh-spacing-1_5);
  --slip-header-action-size: calc(var(--form-control-height) - 2 * var(--slip-header-action-inset));
`;

/** Matching compact frames for disclosure and Share, with independent hit targets. */
export const slipHeaderActionFrame = css`
  display: grid; place-items: center; box-sizing: border-box;
  color: ${({ theme }) => theme.color.accent.blue.text};
  background: ${({ theme }) => theme.color.accent.blue.soft};
  border: 0;
  border-radius: ${({ theme }) => theme.radius.control};
`;

/** A shared visual affordance inside the native summary, without a nested button. */
export const slipDisclosureIndicator = css`
  ${slipHeaderActionFrame}
  border-radius: ${({ theme }) => theme.radius.circle};
  &::after {
    content: ""; display: block;
    inline-size: var(--slip-chevron-size, var(--gh-size-1_5)); block-size: var(--slip-chevron-size, var(--gh-size-1_5));
    border-inline-end: var(--gh-stroke-focus) solid currentColor; border-block-end: var(--gh-stroke-focus) solid currentColor;
    transform: rotate(var(--slip-chevron-rotation, -45deg));
  }
`;
