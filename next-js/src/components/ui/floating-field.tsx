"use client";

import { Children, Fragment, cloneElement, isValidElement, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState,
  type AriaAttributes, type ComponentPropsWithRef, type ComponentPropsWithoutRef, type JSXElementConstructor, type ReactElement, type ReactNode } from "react";
import styled from "styled-components";
import { FloatingOutline } from "./floating-outline";
import { SelectMenu, type SelectMenuOption } from "./select-menu";
import { useClientReady } from "./use-client-ready";
import { selectSurface, textFieldSurface } from "./filled-surfaces";
import { floatingControl, floatingFieldState, floatingLabel, floatingOutline } from "./floating-field-styles";

type ControlProps = Pick<ComponentPropsWithoutRef<"input">, "id" | "value" | "defaultValue" | "placeholder" | "type">
  & Pick<AriaAttributes, "aria-describedby" | "aria-invalid">;
type FloatingFieldProps = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  label: ReactNode; children: ReactElement<ControlProps>; action?: ReactNode;
  leading?: ReactNode; trailing?: ReactNode; hint?: ReactNode; error?: ReactNode; description?: ReactNode;
  enhanceSelect?: boolean;
};
type NativeSelectProps = ComponentPropsWithRef<"select"> & Record<`data-${string}`, unknown>;
type NativeSelect = ReactElement<NativeSelectProps>;

function optionText(children: ReactNode): string | null {
  let text = "";
  let valid = true;
  Children.forEach(children, child => {
    if (typeof child === "string" || typeof child === "number" || typeof child === "bigint") text += child;
    else if (child != null) valid = false;
  });
  return valid ? text : null;
}

function singleSelectOptions(select: NativeSelect): readonly SelectMenuOption[] | null {
  if (select.props.multiple || (select.props.size ?? 1) > 1 || select.props.hidden) return null;
  const options: SelectMenuOption[] = [];
  const values = new Set<string>();
  let valid = true;
  function collect(children: ReactNode) {
    Children.forEach(children, child => {
      if (child == null) return;
      if (!isValidElement<ComponentPropsWithoutRef<"option">>(child)) { valid = false; return; }
      if (child.type === Fragment) { collect(child.props.children); return; }
      const text = optionText(child.props.children);
      if (child.type !== "option" || text === null || child.props.hidden || child.props.selected) { valid = false; return; }
      const normalized = text.replace(/[\t\n\f\r ]+/gu, " ").replace(/^ | $/gu, "");
      const value = String(child.props.value ?? normalized);
      if (values.has(value)) { valid = false; return; }
      values.add(value);
      options.push({ value, label: child.props.label || normalized, disabled: child.props.disabled === true });
    });
  }
  collect(select.props.children);
  return valid && options.length ? options : null;
}

/** Enhance the shared single-select fields while retaining native form controls on the server. */
export function FloatingField({ enhanceSelect = false, ...props }: FloatingFieldProps) {
  const select = props.children as NativeSelect;
  const options = (enhanceSelect || props.children.type === "select") && !props.leading && !props.trailing && !props.action
    ? singleSelectOptions(select) : null;
  return options ? <FloatingSelectField key={select.key} {...props} options={options}>{select}</FloatingSelectField> : <NativeFloatingField {...props} />;
}

function FloatingSelectField({ children, label, hint, error, options, ...props }: Omit<FloatingFieldProps, "children"> & {
  children: NativeSelect; options: readonly SelectMenuOption[];
}) {
  const native = children.props, enhanced = useClientReady(), generated = useId(), id = native.id ?? generated;
  const selectRef = useRef<HTMLSelectElement>(null), triggerRef = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState<string | null>(null), [invalid, setInvalid] = useState("");
  const [initialDefault] = useState(native.defaultValue);
  useImperativeHandle(native.ref, () => selectRef.current!, []);
  const requested = native.value ?? draft ?? initialDefault;
  const selected = (requested !== undefined && options.find(option => option.value === String(requested)))
    || options.find(option => !option.disabled) || options[0];
  const validation = error || invalid;
  const describedBy = [native["aria-describedby"], hint ? `${id}-hint` : undefined, validation ? `${id}-error` : undefined].filter(Boolean).join(" ") || undefined;
  useLayoutEffect(() => {
    if (enhanced && document.activeElement === selectRef.current) triggerRef.current?.focus({ preventScroll: true });
  }, [enhanced]);
  useEffect(() => {
    const form = selectRef.current?.form;
    let frame = 0;
    const reset = (event: Event) => {
      cancelAnimationFrame(frame);
      // The reset event runs before the browser restores the native values.
      frame = requestAnimationFrame(() => {
        if (!event.defaultPrevented) { setDraft(selectRef.current?.value ?? null); setInvalid(""); }
      });
    };
    form?.addEventListener("reset", reset);
    return () => { cancelAnimationFrame(frame); form?.removeEventListener("reset", reset); };
  }, [native.form]);

  const SelectControl = children.type as "select" | JSXElementConstructor<NativeSelectProps>;
  const select = <SelectControl {...native} id={id} ref={selectRef} tabIndex={enhanced ? -1 : native.tabIndex}
    aria-hidden={enhanced ? true : native["aria-hidden"]}
    onChange={event => {
      setDraft(event.currentTarget.value);
      if (event.currentTarget.validity.valid) setInvalid("");
      native.onChange?.(event);
    }}
    onFocus={event => {
      native.onFocus?.(event);
      if (enhanced) triggerRef.current?.focus({ preventScroll: true });
    }}
    onInvalid={event => {
      native.onInvalid?.(event);
      if (enhanced && !event.defaultPrevented) {
        event.preventDefault(); setInvalid(event.currentTarget.validationMessage);
        triggerRef.current?.focus();
      }
    }}
    {...(enhanced ? Object.fromEntries(Object.keys(native).filter(key => key.startsWith("data-")).map(key => [key, undefined])) : {})} />;
  const data = Object.fromEntries(Object.entries(native).filter(([key]) => key.startsWith("data-")));
  const menu = enhanced && selected && <SelectMenu {...data} id={`${id}-trigger`} ref={triggerRef}
    label={label} value={selected.value} options={options} matchTriggerWidth title={native.title} tabIndex={native.tabIndex}
    disabled={native.disabled} aria-label={native["aria-label"]} aria-labelledby={native["aria-labelledby"]}
    aria-describedby={describedBy} aria-invalid={validation ? true : native["aria-invalid"]} aria-required={native.required}
    data-select-empty={selected.value === "" ? "" : undefined}
    onValueChange={value => {
      const control = selectRef.current;
      if (!control || control.matches(":disabled")) return;
      control.value = value;
      // Use real events so existing React handlers receive the native select and its form value.
      control.dispatchEvent(new Event("input", { bubbles: true }));
      control.dispatchEvent(new Event("change", { bubbles: true }));
    }} />;
  return <NativeFloatingField {...props} label={label} hint={hint} error={validation} replacement={menu}>{select}</NativeFloatingField>;
}

/** Labels float into the top border on focus or value, including native and uncontrolled fields. */
function NativeFloatingField({ label, children, action, leading, trailing, hint, error, description, replacement, ...props }:
  FloatingFieldProps & { replacement?: ReactNode }) {
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
  return <Root {...props} data-floating-field data-enhanced-select={replacement ? "" : undefined}>
    <Frame ref={frame} data-native-select-bridge={replacement ? "" : undefined} aria-hidden={replacement ? true : undefined}
      data-floating-filled={replacement ? undefined : filled} onInput={event => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) setDraft(event.target.value);
    }} data-floating-control={replacement ? undefined : true} data-field-action={!!action} data-field-leading={!!leading} data-field-trailing={!!trailing}>
      <label id={`${id}-label`} htmlFor={id} title={typeof label === "string" ? label : undefined}>{label}</label>
      <FloatingOutline label={label} />
      {leading && <span data-field-leading aria-hidden="true">{leading}</span>}
      {/* A blank placeholder supports CSS state detection; the label supplies all visible text. */}
      {cloneElement(children, { id, placeholder: " ", "aria-describedby": describedBy, "aria-invalid": error ? true : children.props["aria-invalid"] })}
      {trailing && <div data-field-trailing>{trailing}</div>}
      {action && <div data-field-action>{action}</div>}
    </Frame>
    {replacement}
    {description}
    {hint && <Message id={`${id}-hint`}>{hint}</Message>}
    {error && <Message id={`${id}-error`} data-field-error>{error}</Message>}
  </Root>;
}

const Root = styled.div`
  display: grid; align-self: start; align-content: start; gap: var(--gh-spacing-1_25); inline-size: 100%; min-inline-size: 0; max-inline-size: 100%;
  &[data-enhanced-select] { position: relative; }
`;
const Frame = styled.div`
  position: relative; min-inline-size: 0; margin-block-start: var(--floating-label-space);
  &[data-native-select-bridge] {
    position: absolute; inset-block-start: 0; inset-inline-start: 0;
    inline-size: var(--gh-size-0_25); block-size: var(--gh-size-0_25); margin: 0; overflow: hidden;
    clip-path: inset(50%); pointer-events: none;
  }
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
