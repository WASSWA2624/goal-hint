"use client";

import { css } from "styled-components";
import { media } from "@/styles/theme";

/** Shared Codes presentation used by the live workspace and every design study. */
export const codePresentation = css`
  && input, && button, && select, && textarea, && fieldset, && details, && [role="group"] { border-radius: 0; }
  [data-code-form-stack] { gap: 18px; }
  [data-grant-section] { display: grid; min-inline-size: 0; gap: 14px; }
  [data-grant-payment] { border-block-start: 1px solid ${({ theme }) => theme.color.border}; padding-block-start: 8px; }
  [data-code-facts] { background: ${({ theme }) => theme.color.surface}; }
  ${media.desktop} {
    [data-grant-section="account"] { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: end; }
    [data-grant-section="terms"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
`;

/** Approved sample 01: balanced field pairs with a restrained, centered form. */
export const balancedCodePresentation = css`
  [data-manual-code-form] { container: balanced-code-form / inline-size; }
  ${media.desktop} {
    [data-code-form-stack] { max-inline-size: 56rem; margin-inline: auto; padding: 10px; }
    [data-grant-section="reason"] { padding-block-start: 6px; }
  }
  @container balanced-code-form (max-width: 28rem) {
    [data-grant-section="account"] { grid-template-columns: minmax(0, 1fr); }
  }
`;
