import { css } from "styled-components";
import { controlHeight } from "./control-layout";

/** Shared outlined-field geometry; labels use the border margin only when active. */
export const floatingLabel = css`
  position: absolute; z-index: 1; inset-block-start: 50%; inset-inline-start: 10px;
  transform: translateY(-50%); max-inline-size: calc(100% - 20px); margin: 0;
  padding-inline: 3px; color: ${({ theme }) => theme.color.mutedText};
  font-size: 1rem; font-weight: ${({ theme }) => theme.typography.weight.medium}; line-height: 1.25;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: text;
  transition: inset-block-start 160ms ease, font-size 160ms ease;
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;

export const floatingControl = css`
  box-sizing: border-box; inline-size: 100%; min-inline-size: 0; ${controlHeight}
  block-size: var(--form-control-height); padding-block: 8px; font-size: 1rem; line-height: 1.25;
`;

export const raisedFloatingLabel = css`
  inset-block-start: 0; inset-inline-start: 10px; transform: translateY(-50%); font-size: 0.6875rem;
`;

/** A native fieldset/legend creates a real notch without painting behind the label. */
export const floatingOutline = css`
  position: absolute; inset: -7px 0 0; min-inline-size: 0; margin: 0; padding: 0 7px;
  border: 1px solid ${({ theme }) => theme.color.controlBorder}; border-radius: ${({ theme }) => theme.radius.control};
  pointer-events: none;
  > legend {
    display: block; inline-size: auto; max-inline-size: 0.01px; block-size: 14px;
    margin: 0; padding: 0; overflow: hidden; visibility: hidden;
    font-size: 0.6875rem; font-weight: ${({ theme }) => theme.typography.weight.medium}; line-height: 14px;
    white-space: nowrap;
    > span { display: inline-block; padding-inline: 5px; }
  }
`;

export const floatingFieldState = css`
  &:is(:focus-within, [data-floating-filled="true"],
    :has(> input:not(:placeholder-shown):not([type="date"], [type="time"], [type="datetime-local"], [type="month"], [type="week"], [type="file"], [type="hidden"])),
    :has(> textarea:not(:placeholder-shown)), :has(> select option:checked:not([value=""])), :has(> input:autofill)) {
    > label { ${raisedFloatingLabel} }
    > [data-floating-outline] > legend:not([data-empty="true"]) { max-inline-size: 100%; }
  }
  &:focus-within > label { color: ${({ theme }) => theme.color.link}; }
  &:focus-within > [data-floating-outline] { border-width: 2px; border-color: ${({ theme }) => theme.color.focus}; }
  &:has([aria-invalid="true"]) {
    > label { color: ${({ theme }) => theme.color.outcome.incorrect.text}; }
    > [data-floating-outline] { border-color: ${({ theme }) => theme.color.outcome.incorrect.text}; }
  }
  &:has(:disabled) > label { color: ${({ theme }) => theme.color.disabledText}; }
  && > input::placeholder, && > textarea::placeholder { opacity: 0; }
`;
