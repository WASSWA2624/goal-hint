"use client";

import { useCallback, useId, useRef, useState, useSyncExternalStore } from "react";
import styled from "styled-components";
import { ChevronDownIcon } from "./icons";
import { closeDetails, useOutsideDismiss } from "./use-outside-dismiss";
import { VisuallyHidden } from "./visually-hidden";

type Option = Readonly<{ value: string; label: string }>;
const Root = styled.details`
  position: relative; min-inline-size: 0;
  > summary {
    display: flex; align-items: center; justify-content: space-between; gap: 5px;
    min-block-size: 2rem; padding: 4px 6px; list-style: none;
    color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surface};
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.buttonBorder};
    border-radius: ${({ theme }) => theme.border.radius};
    font-size: 0.75rem; cursor: pointer;
    &::-webkit-details-marker { display: none; }
    > span { min-inline-size: 0; overflow-wrap: anywhere; }
    > svg { flex: none; }
    &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
  }
  &[data-disabled="true"] > summary { color: ${({ theme }) => theme.color.disabledText}; background: ${({ theme }) => theme.color.disabledSurface}; cursor: default; }
  > fieldset {
    position: absolute; inset-inline: 0; inset-block-start: calc(100% + 3px); z-index: 35;
    margin: 0; padding: 4px; min-inline-size: 0; max-block-size: min(20rem, 60dvh); overflow-y: auto;
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    border-radius: ${({ theme }) => theme.border.radius};
    background: ${({ theme }) => theme.color.surface}; box-shadow: ${({ theme }) => theme.shadow.popover};
    > label, > button { display: flex; align-items: center; gap: 6px; min-block-size: 2rem; padding: 4px; font-size: 0.75rem; cursor: pointer; }
    > button { inline-size: 100%; border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.buttonBorder}; background: ${({ theme }) => theme.color.surface}; color: ${({ theme }) => theme.color.text}; }
    > button[aria-pressed="true"] { background: ${({ theme }) => theme.color.brandSoft}; }
    > p { font-size: 0.6875rem; color: ${({ theme }) => theme.color.mutedText}; padding: 4px; }
    > label:has(input:checked) { background: ${({ theme }) => theme.color.brandSoft}; }
    input { flex: none; inline-size: 1rem; block-size: 1rem; accent-color: ${({ theme }) => theme.color.brand}; }
  }
`;
const InlineChoices = styled.fieldset`
  display: flex; flex-wrap: wrap; align-items: center; gap: 3px 14px;
  min-inline-size: 0; margin: 0; padding: 0; border: 0;
  > label {
    display: inline-flex; align-items: center; gap: 6px; min-block-size: 2rem;
    color: ${({ theme }) => theme.color.text}; font-size: 0.75rem; cursor: pointer;
  }
  input {
    flex: none; inline-size: 1rem; block-size: 1rem; margin: 0;
    accent-color: ${({ theme }) => theme.color.brand};
    &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
  }
  &:disabled > label { color: ${({ theme }) => theme.color.disabledText}; cursor: default; }
  @media (pointer: coarse) { > label { min-block-size: 2.75rem; } }
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
  const hydrated = useSyncExternalStore(subscribeNever, clientReady, serverReady);
  const inactive = disabled && hydrated;
  const close = useCallback(() => closeDetails(root.current, () => setOpen(false)), []);
  useOutsideDismiss({ enabled: open && !inline, root, onDismiss: close });
  const summary = selected.length ? options.filter((option) => selected.includes(option.value)).map((option) => option.label).join(", ") : automaticLabel;
  const choices = options.map((option) => <label key={option.value}><input type="checkbox" name={name} value={option.value} checked={selected.includes(option.value)}
    onChange={() => onChange(selected.includes(option.value) ? selected.filter((value) => value !== option.value) : [...selected, option.value])} />{option.label}</label>);
  if (inline) return <InlineChoices data-choice-inline disabled={inactive} aria-invalid={invalid || undefined}
    {...(describedBy ? { "aria-describedby": describedBy } : {})}>
    <legend><VisuallyHidden>{label}</VisuallyHidden></legend>
    <label><input type="checkbox" checked={selected.length === 0} onChange={() => onChange([])} />{automaticLabel}</label>
    {choices}
  </InlineChoices>;
  return <Root ref={root} data-disabled={inactive} onToggle={(event) => setOpen(event.currentTarget.open)} onKeyDown={(event) => {
    if (event.key === "Escape" && root.current?.open) { event.preventDefault(); event.stopPropagation(); close(); root.current.querySelector("summary")?.focus(); }
  }}>
    <summary aria-controls={panelId} aria-label={`${label}: ${summary}`} aria-disabled={inactive || undefined}
      aria-invalid={invalid || undefined} {...(describedBy ? { "aria-describedby": describedBy } : {})}
      onClick={(event) => { if (inactive) event.preventDefault(); }}><span>{summary}</span><ChevronDownIcon /></summary>
    <fieldset id={panelId} disabled={inactive}><legend><VisuallyHidden>{label}</VisuallyHidden></legend>
      {hydrated && <button type="button" aria-pressed={selected.length === 0} onClick={() => onChange([])}>{automaticLabel}</button>}
      <p>{automaticHint}</p>
      {choices}
    </fieldset>
  </Root>;
}
