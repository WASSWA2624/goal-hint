import { css } from "styled-components";

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
    inline-size: var(--slip-chevron-size, 6px); block-size: var(--slip-chevron-size, 6px);
    border-inline-end: 3px solid currentColor; border-block-end: 3px solid currentColor;
    transform: rotate(var(--slip-chevron-rotation, -45deg));
  }
`;
