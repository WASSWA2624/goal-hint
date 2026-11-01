import { css } from "styled-components";
import { media } from "@/styles/theme";

/** Shared by standalone fields and composite controls (search, phone, filters). */
export const filledField = css`
  border: 0;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.field};
  ${media.hover} { &:hover:not(:disabled) { background: ${({ theme }) => theme.color.fieldHover}; } }
  &:focus-within { background: ${({ theme }) => theme.color.fieldHover}; }
  &[aria-invalid="true"] {
    color: ${({ theme }) => theme.color.outcome.incorrect.text};
    background: ${({ theme }) => theme.color.outcome.incorrect.background};
  }
  &:disabled {
    color: ${({ theme }) => theme.color.disabledText};
    background: ${({ theme }) => theme.color.disabledSurface};
  }
`;

/** Quiet actions use the same readable tint as the approved header actions. */
export const filledAction = css`
  border: 0;
  color: ${({ theme }) => theme.color.link};
  background: ${({ theme }) => theme.color.brandSoft};
  ${media.hover} { &:hover:not(:disabled) { background: ${({ theme }) => theme.color.fieldHover}; } }
  &:disabled {
    color: ${({ theme }) => theme.color.disabledText};
    background: ${({ theme }) => theme.color.disabledSurface};
  }
`;

/** Dense tables retain row tracking without grid lines or accent rails. */
export const filledTableRows = css`
  tbody > tr:nth-child(even) { background: ${({ theme }) => theme.color.surfaceMuted}; }
  tbody > tr:hover { background: ${({ theme }) => theme.color.rowHover}; }
`;
