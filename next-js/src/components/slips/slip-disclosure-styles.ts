import { css } from "styled-components";

/** A shared visual affordance inside the native summary, without a nested button. */
export const slipDisclosureIndicator = css`
  display: grid; place-items: center; box-sizing: border-box;
  color: ${({ theme }) => theme.color.accent.blue.text};
  background: ${({ theme }) => theme.color.accent.blue.soft};
  border: 1px solid color-mix(in srgb, ${({ theme }) => theme.color.accent.blue.text} 35%, ${({ theme }) => theme.color.border});
  border-radius: ${({ theme }) => theme.radius.circle};
  &::after {
    content: ""; display: block;
    inline-size: var(--slip-chevron-size, 6px); block-size: var(--slip-chevron-size, 6px);
    border-inline-end: 1.5px solid currentColor; border-block-end: 1.5px solid currentColor;
    transform: rotate(var(--slip-chevron-rotation, 45deg));
  }
`;
