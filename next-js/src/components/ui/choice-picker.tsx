"use client";

import { useCallback, useId, useRef, useState, useSyncExternalStore } from "react";
import { controlBodyHeight } from "./control-layout";
import styled from "styled-components";
import { ChevronDownIcon } from "./icons";
import { closeDetails, useOutsideDismiss } from "./use-outside-dismiss";
import { VisuallyHidden } from "./visually-hidden";
import { anchoredPanel, useAnchoredPanel } from "./anchored-panel";

type Option = Readonly<{ value: string; label: string }>;
const Root = styled.details`
  position: relative; min-inline-size: 0;
  > summary {
    display: flex; align-items: center; justify-content: space-between; gap: var(--gh-spacing-1_25);
    ${controlBodyHeight} padding: var(--gh-spacing-1) var(--gh-spacing-1_5); list-style: none;
    color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.brandSoft};
    border: 0;
    border-radius: ${({ theme }) => theme.radius.control};
    font-size: var(--gh-font-secondary); cursor: pointer;
    &::-webkit-details-marker { display: none; }
    > span { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    > svg { flex: none; }
    &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: var(--gh-size-0_5); }
  }
  &[data-disabled="true"] > summary { color: ${({ theme }) => theme.color.disabledText}; background: ${({ theme }) => theme.color.disabledSurface}; cursor: default; }
  > fieldset {
    ${anchoredPanel}
    --anchored-panel-gap: var(--gh-spacing-0_75);
    inline-size: 100%; z-index: var(--gh-layer-picker);
    margin: 0; padding: var(--gh-spacing-1); min-inline-size: 0; max-block-size: min(var(--gh-size-80), 60dvh, var(--anchored-panel-space, 100dvh)); overflow-y: auto;
    border: 0;
    border-radius: ${({ theme }) => theme.radius.overlay};
    background: ${({ theme }) => theme.color.surface}; box-shadow: ${({ theme }) => theme.shadow.popover};
    > label, > button { display: flex; align-items: center; gap: var(--gh-spacing-1_5); min-block-size: var(--form-control-height); padding: var(--gh-spacing-1); border-radius: ${({ theme }) => theme.radius.small}; font-size: var(--gh-font-secondary); cursor: pointer; }
    > button { inline-size: 100%; border: 0; background: ${({ theme }) => theme.color.brandSoft}; color: ${({ theme }) => theme.color.text}; }
    > button[aria-pressed="true"] { background: ${({ theme }) => theme.color.brandSoft}; }
    > p { font-size: var(--gh-font-caption); color: ${({ theme }) => theme.color.mutedText}; padding: var(--gh-spacing-1); }
    > label:has(input:checked) { background: ${({ theme }) => theme.color.brandSoft}; }
    input { flex: none; inline-size: var(--gh-size-4); block-size: var(--gh-size-4); accent-color: ${({ theme }) => theme.color.brand}; }
  }
`;
const InlineChoices = styled.fieldset`
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--gh-spacing-0_75) var(--gh-spacing-3_5);
  min-inline-size: 0; margin: 0; padding: 0; border: 0;
  > label {
    display: inline-flex; align-items: center; gap: var(--gh-spacing-1_5); min-block-size: var(--form-control-height);
    color: ${({ theme }) => theme.color.text}; font-size: var(--gh-font-secondary); cursor: pointer;
  }
  input {
    flex: none; inline-size: var(--gh-size-4); block-size: var(--gh-size-4); margin: 0;
    accent-color: ${({ theme }) => theme.color.brand};
    &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: var(--gh-size-0_5); }
  }
  &:disabled > label { color: ${({ theme }) => theme.color.disabledText}; cursor: default; }
  @media (pointer: coarse) { > label { min-block-size: var(--form-control-height); } }
`;
const subscribeNever = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

/** Native disclosure keeps named inputs available to GET forms, including without JavaScript. */
export function ChoicePicker({ name, label, automaticLabel, automaticHint, options, selected, onChange, disabled = false, invalid = false, describedBy, inline = false }: {
  name: string; label: string; automaticLabel: string; automaticHint: string; options: readonly Option[]; selected: readonly string[];
  onChange: (values: readonly string[]) => void; disabled?: boolean; invalid?: boolean; describedBy?: string; inline?: boolean;
}) {
  const root = useRef<HTMLDetailsElement>(null), panelId = useId(), [open, setOpen] = useState(false);
  const trigger = useRef<HTMLElement>(null), panel = useRef<HTMLFieldSetElement>(null);
  const hydrated = useSyncExternalStore(subscribeNever, clientReady, serverReady);
  const inactive = disabled && hydrated;
  const clearSelection = inline && inactive;
  const close = useCallback(() => closeDetails(root.current, () => setOpen(false)), []);
  useOutsideDismiss({ enabled: open && !inline, root, onDismiss: close });
  useAnchoredPanel({ open: open && !inline, anchor: trigger, panel });
  const summary = selected.length ? options.filter((option) => selected.includes(option.value)).map((option) => option.label).join(", ") : automaticLabel;
  const choices = options.map((option) => <label key={option.value}><input type="checkbox" name={name} value={option.value} checked={!clearSelection && selected.includes(option.value)}
    onChange={() => onChange(selected.includes(option.value) ? selected.filter((value) => value !== option.value) : [...selected, option.value])} />{option.label}</label>);
  if (inline) return <InlineChoices data-choice-inline disabled={inactive} aria-invalid={invalid || undefined}
    {...(describedBy ? { "aria-describedby": describedBy } : {})}>
    <legend><VisuallyHidden>{label}</VisuallyHidden></legend>
    <label><input type="checkbox" checked={!clearSelection && selected.length === 0} onChange={() => onChange([])} />{automaticLabel}</label>
    {choices}
  </InlineChoices>;
  return <Root ref={root} data-disabled={inactive} onToggle={(event) => setOpen(event.currentTarget.open)} onKeyDown={(event) => {
    if (event.key === "Escape" && root.current?.open) { event.preventDefault(); event.stopPropagation(); close(); root.current.querySelector("summary")?.focus(); }
  }}>
    <summary ref={trigger} aria-controls={panelId} aria-label={`${label}: ${summary}`} aria-disabled={inactive || undefined}
      aria-invalid={invalid || undefined} {...(describedBy ? { "aria-describedby": describedBy } : {})}
      onClick={(event) => { if (inactive) event.preventDefault(); }}><span>{summary}</span><ChevronDownIcon /></summary>
    <fieldset ref={panel} id={panelId} disabled={inactive}><legend><VisuallyHidden>{label}</VisuallyHidden></legend>
      {hydrated && <button type="button" aria-pressed={selected.length === 0} onClick={() => onChange([])}>{automaticLabel}</button>}
      <p>{automaticHint}</p>
      {choices}
    </fieldset>
  </Root>;
}
