"use client";

import { css } from "styled-components";
import { media } from "@/styles/theme";

/** Shared Codes presentation used by the live workspace and every design study. */
export const codePresentation = css`
  [data-code-form-stack] { gap: var(--gh-spacing-4_5); }
  [data-grant-section] { display: grid; min-inline-size: 0; gap: var(--gh-spacing-3_5); }
  [data-grant-payment] { border-block-start: 0; padding-block-start: var(--gh-spacing-2); }
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
    [data-code-form-stack] { max-inline-size: var(--gh-size-224); margin-inline: auto; padding: var(--gh-spacing-2_5); }
    [data-grant-section="reason"] { padding-block-start: var(--gh-spacing-1_5); }
  }
  @container balanced-code-form (max-width: ${({ theme }) => theme.viewport[28]}) {
    [data-grant-section="account"] { grid-template-columns: minmax(0, 1fr); }
  }
`;
