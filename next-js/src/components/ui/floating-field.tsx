"use client";

import { cloneElement, useEffect, useId, useRef, useState, type AriaAttributes, type ComponentPropsWithoutRef, type ReactElement, type ReactNode } from "react";
import styled from "styled-components";
import { FloatingOutline } from "./floating-outline";
import { selectSurface, textFieldSurface } from "./filled-surfaces";
import { floatingControl, floatingFieldState, floatingLabel, floatingOutline } from "./floating-field-styles";

type ControlProps = { id?: string; value?: string | number | readonly string[]; defaultValue?: string | number | readonly string[]; placeholder?: string; type?: string } & Pick<AriaAttributes, "aria-describedby" | "aria-invalid">;
type FloatingFieldProps = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  label: ReactNode; children: ReactElement<ControlProps>; action?: ReactNode;
  leading?: ReactNode; trailing?: ReactNode; hint?: ReactNode; error?: ReactNode; description?: ReactNode;
};

/** Labels float into the top border on focus or value, including native and uncontrolled fields. */
export function FloatingField({ label, children, action, leading, trailing, hint, error, description, ...props }: FloatingFieldProps) {
  const generated = useId(), id = children.props.id ?? generated;
  const frame = useRef<HTMLDivElement>(null), [draft, setDraft] = useState<string | null>(null);
  const value = children.props.value ?? draft ?? children.props.defaultValue;
  const filled = (value !== undefined && value !== null && String(value) !== "") || children.props.type === "file";
  useEffect(() => {
    const form = frame.current?.closest("form");
    const reset = () => setDraft(null);
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, []);
  const describedBy = [children.props["aria-describedby"], hint ? `${id}-hint` : undefined, error ? `${id}-error` : undefined].filter(Boolean).join(" ") || undefined;
  return <Root {...props} data-floating-field>
    <Frame ref={frame} data-floating-filled={filled} onInput={event => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) setDraft(event.target.value);
    }} data-floating-control data-field-action={!!action} data-field-leading={!!leading} data-field-trailing={!!trailing}>
      <label id={`${id}-label`} htmlFor={id} title={typeof label === "string" ? label : undefined}>{label}</label>
      <FloatingOutline label={label} />
      {leading && <span data-field-leading aria-hidden="true">{leading}</span>}
      {/* A blank placeholder supports CSS state detection; the label supplies all visible text. */}
      {cloneElement(children, { id, placeholder: " ", "aria-describedby": describedBy, "aria-invalid": error ? true : children.props["aria-invalid"] })}
      {trailing && <div data-field-trailing>{trailing}</div>}
      {action && <div data-field-action>{action}</div>}
    </Frame>
    {description}
    {hint && <Message id={`${id}-hint`}>{hint}</Message>}
    {error && <Message id={`${id}-error`} data-field-error>{error}</Message>}
  </Root>;
}

const Root = styled.div`display: grid; align-self: start; align-content: start; gap: var(--gh-spacing-1_25); inline-size: 100%; min-inline-size: 0; max-inline-size: 100%;`;
const Frame = styled.div`
  position: relative; min-inline-size: 0; margin-block-start: var(--floating-label-space);
  && > label { ${floatingLabel} }
  &&& > input, &&& > select, &&& > textarea {
    ${floatingControl}
    color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.field};
    border: var(--gh-stroke-thin) solid transparent;
    display: block; padding-inline: var(--gh-spacing-2_5); border-radius: ${({ theme }) => theme.radius.control};
    font-family: inherit; font-weight: var(--gh-weight-body);
    &:focus-visible { outline: none; }
    &:disabled { cursor: not-allowed; }
    &::placeholder { color: ${({ theme }) => theme.color.mutedText}; opacity: 1; }
  }
  &&& > input, &&& > textarea {
    ${textFieldSurface}
    &, &[aria-invalid="true"] { border-color: transparent; }
  }
  &&& > select[data-feed-status] { border: 0; }
  &&& > select { ${selectSurface} padding-inline-end: var(--gh-spacing-6); }
  &&& > textarea { block-size: auto; min-block-size: var(--gh-size-22); resize: vertical; }
  &:has(> textarea) > label { inset-block-start: var(--gh-spacing-3); transform: none; }
  &&:not(:focus-within)[data-floating-filled="false"] > input:is([type="date"], [type="time"], [type="datetime-local"], [type="month"], [type="week"]) { color: transparent; }
  > select:has(option:checked[value=""]) { color: transparent; }
  > select option { color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.textField.background}; }
  &&[data-field-leading="true"] > label { inset-inline-start: var(--gh-spacing-9_5); max-inline-size: calc(100% - var(--gh-size-12)); }
  &&[data-field-leading="true"] > input { padding-inline-start: var(--gh-spacing-9_5); }
  &&[data-field-trailing="true"] > input { padding-inline-end: var(--gh-spacing-23); }
  > [data-field-leading] { position: absolute; inset-inline-start: var(--gh-spacing-3); inset-block-start: 50%; transform: translateY(-50%); display: flex; pointer-events: none; color: ${({ theme }) => theme.color.mutedText}; }
  > [data-field-leading] svg { inline-size: var(--gh-size-4_5); block-size: var(--gh-size-4_5); }
  > [data-field-trailing] { position: absolute; inset-block: var(--gh-spacing-1); inset-inline-end: var(--gh-spacing-1); display: flex; align-items: stretch; }
  > [data-field-trailing] > * { min-block-size: 0; }
  &&[data-field-action="true"] > textarea { padding-block-start: var(--gh-spacing-9); }
  &[data-field-action="true"] > label { max-inline-size: calc(100% - var(--gh-size-27_5)); }
  > [data-field-action] { position: absolute; inset-block-start: var(--gh-spacing-0_75); inset-inline-end: var(--gh-spacing-0_75); display: flex; align-items: center; gap: var(--gh-spacing-1); }
  > [data-field-action] button { min-block-size: var(--gh-size-7_5); padding: var(--gh-spacing-0_75) var(--gh-spacing-2); font-size: var(--gh-font-body); }
  > [data-field-action] svg { inline-size: var(--gh-size-4); block-size: var(--gh-size-4); }
  > [data-floating-outline] { ${floatingOutline} }
  ${floatingFieldState}
`;
const Message = styled.div`
  color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary}; line-height: var(--gh-leading-compact); overflow-wrap: anywhere;
  &[data-field-error] { color: ${({ theme }) => theme.color.outcome.incorrect.text}; }
`;
