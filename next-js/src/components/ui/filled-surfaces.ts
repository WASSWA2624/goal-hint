import { css } from "styled-components";
import { media } from "@/styles/theme";

/** Text entry keeps a visible boundary on a white canvas; composite fields frame their input once. */
export const textFieldSurface = css`
  transition: background-color ${({ theme }) => theme.motion.fast} ${({ theme }) => theme.motion.easing},
    border-color ${({ theme }) => theme.motion.fast} ${({ theme }) => theme.motion.easing};
  border: ${({ theme }) => theme.textField.borderWidth} solid ${({ theme }) => theme.color.controlBorder};
  background: ${({ theme }) => theme.textField.background};
  ${media.hover} {
    &:hover:not(:disabled):not([aria-invalid="true"]):not(:has(> input[aria-invalid="true"])) {
      background: ${({ theme }) => theme.textField.hoverBackground};
    }
  }
  &:focus-within:not([aria-invalid="true"]):not(:has(> input[aria-invalid="true"])) {
    background: ${({ theme }) => theme.textField.hoverBackground};
  }
  &[aria-invalid="true"], &:has(> input[aria-invalid="true"]) {
    border-color: ${({ theme }) => theme.color.outcome.incorrect.text};
    color: ${({ theme }) => theme.color.outcome.incorrect.text};
    background: ${({ theme }) => theme.color.outcome.incorrect.background};
  }
  &:disabled {
    color: ${({ theme }) => theme.color.disabledText};
    background: ${({ theme }) => theme.color.disabledSurface};
  }
`;

export const textFieldSelector = 'input:not([type="checkbox"], [type="radio"], [type="range"], [type="file"], [type="hidden"], [type="button"], [type="submit"], [type="reset"], [type="image"]), textarea';
export const nativeTextFieldSurface = css`&:is(${textFieldSelector}) { ${textFieldSurface} }`;

/** Selects share the text-entry fill; their native or floating frame owns the border. */
export const selectSurface = css`
  background: ${({ theme }) => theme.mode === "light" ? theme.textField.background : `var(--select-surface, ${theme.color.field})`};
  transition: background-color ${({ theme }) => theme.motion.fast} ${({ theme }) => theme.motion.easing};
  ${media.hover} { &:hover:not(:disabled):not([aria-invalid="true"]) { background: ${({ theme }) => theme.mode === "light" ? theme.textField.hoverBackground : `var(--select-hover-surface, ${theme.color.fieldHover})`}; } }
  &:focus-within:not([aria-invalid="true"]) { background: ${({ theme }) => theme.textField.hoverBackground}; }
  &[aria-expanded="true"] { background: ${({ theme }) => theme.mode === "light" ? theme.textField.hoverBackground : theme.color.brandSoft}; }
  &[aria-invalid="true"] {
    color: ${({ theme }) => theme.color.outcome.incorrect.text};
    background: ${({ theme }) => theme.color.outcome.incorrect.background};
  }
  &:disabled, &:has(> select:disabled) {
    color: ${({ theme }) => theme.color.disabledText};
    background: ${({ theme }) => theme.color.disabledSurface};
  }
`;
export const nativeSelectSurface = css`&:is(select) { ${selectSurface} }`;

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
  ${nativeTextFieldSurface}
  ${nativeSelectSurface}
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
