import { css } from "styled-components";
import { controlBodyHeight } from "./control-layout";

/** Shared outlined-field geometry; labels use the border margin only when active. */
export const floatingLabel = css`
  position: absolute; z-index: var(--gh-layer-content); inset-block-start: 50%; inset-inline-start: var(--gh-spacing-2_5);
  transform: translateY(-50%); max-inline-size: calc(100% - var(--gh-size-5)); margin: 0;
  padding-inline: var(--gh-spacing-0_75); color: ${({ theme }) => theme.color.mutedText};
  font-size: var(--gh-font-section); font-weight: ${({ theme }) => theme.typography.weight.medium}; line-height: var(--gh-leading-heading);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: text;
  transition: inset-block-start var(--gh-duration-surface) var(--gh-easing), font-size var(--gh-duration-surface) var(--gh-easing);
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;

export const floatingControl = css`
  box-sizing: border-box; inline-size: 100%; min-inline-size: 0; ${controlBodyHeight}
  padding-block: var(--gh-spacing-2); font-size: var(--gh-font-section); line-height: var(--gh-leading-heading);
`;

export const raisedFloatingLabel = css`
  inset-block-start: 0; inset-inline-start: var(--gh-spacing-2_5); transform: translateY(-50%); font-size: var(--gh-font-caption);
`;

/** A native fieldset/legend creates a real notch without painting behind the label. */
export const floatingOutline = css`
  position: absolute; inset: calc(-1 * var(--gh-spacing-1_75)) 0 0; min-inline-size: 0; margin: 0; padding: 0 var(--gh-spacing-1_75);
  border: var(--gh-stroke-thin) solid ${({ theme }) => theme.textField.borderColor}; border-radius: ${({ theme }) => theme.radius.control};
  pointer-events: none;
  > legend {
    display: block; inline-size: auto; max-inline-size: var(--gh-size-0_0025); block-size: var(--gh-size-3_5);
    margin: 0; padding: 0; overflow: hidden; visibility: hidden;
    font-size: var(--gh-font-caption); font-weight: ${({ theme }) => theme.typography.weight.medium}; line-height: var(--gh-size-3_5);
    white-space: nowrap;
    > span { display: inline-block; padding-inline: var(--gh-spacing-1_25); }
  }
`;

/** Focus retains the same single thin outline, with a quiet palette accent. */
export const floatingOutlineFocus = css`
  border-width: var(--gh-stroke-thin);
  border-color: ${({ theme }) => theme.textField.focusBorderColor};
`;

export const floatingFieldState = css`
  &:is(:focus-within, [data-floating-filled="true"],
    :has(> input:not(:placeholder-shown):not([type="date"], [type="time"], [type="datetime-local"], [type="month"], [type="week"], [type="file"], [type="hidden"])),
    :has(> textarea:not(:placeholder-shown)), :has(> select option:checked:not([value=""])), :has(> input:autofill)) {
    > label { ${raisedFloatingLabel} }
    > [data-floating-outline] > legend:not([data-empty="true"]) { max-inline-size: 100%; }
  }
  &:focus-within > label { color: ${({ theme }) => theme.color.link}; }
  &:focus-within > [data-floating-outline] { ${floatingOutlineFocus} }
  &:has([aria-invalid="true"]) {
    > label { color: ${({ theme }) => theme.color.outcome.incorrect.text}; }
    > [data-floating-outline] { border-color: color-mix(in srgb, ${({ theme }) => theme.color.outcome.incorrect.text} 45%, ${({ theme }) => theme.textField.background}); }
  }
  &:has(:disabled) > label { color: ${({ theme }) => theme.color.disabledText}; }
  && > input::placeholder, && > textarea::placeholder { opacity: 0; }
`;
