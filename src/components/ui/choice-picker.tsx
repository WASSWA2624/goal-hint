"use client";

import { useCallback, useId, useRef, useState, useSyncExternalStore } from "react";
import styled from "styled-components";
import { ChevronDownIcon } from "./icons";
import { useOutsideDismiss } from "./use-outside-dismiss";
import { VisuallyHidden } from "./visually-hidden";

type Option = Readonly<{ value: string; label: string }>;
const Root = styled.details`
  position: relative; min-inline-size: 0;
  > summary {
    display: flex; align-items: center; justify-content: space-between; gap: 5px;
    min-block-size: 2rem; padding: 4px 6px; list-style: none;
    color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surface};
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
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
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
    background: ${({ theme }) => theme.color.surface}; box-shadow: 0 4px 12px #0002;
    > label, > button { display: flex; align-items: center; gap: 6px; min-block-size: 2rem; padding: 4px; font-size: 0.75rem; cursor: pointer; }
    > button { inline-size: 100%; border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder}; background: ${({ theme }) => theme.color.surface}; color: ${({ theme }) => theme.color.text}; }
    > button[aria-pressed="true"] { background: ${({ theme }) => theme.color.brandSoft}; }
    > p { font-size: 0.6875rem; color: ${({ theme }) => theme.color.mutedText}; padding: 4px; }
    > label:has(input:checked) { background: ${({ theme }) => theme.color.brandSoft}; }
    input { flex: none; inline-size: 1rem; block-size: 1rem; accent-color: ${({ theme }) => theme.color.brand}; }
  }
`;
const subscribeNever = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

/** Native disclosure keeps named inputs available to GET forms, including without JavaScript. */
export function ChoicePicker({ name, label, automaticLabel, automaticHint, options, selected, onChange, disabled = false, invalid = false, describedBy }: {
  name: string; label: string; automaticLabel: string; automaticHint: string; options: readonly Option[]; selected: readonly string[];
  onChange: (values: readonly string[]) => void; disabled?: boolean; invalid?: boolean; describedBy?: string;
}) {
  const root = useRef<HTMLDetailsElement>(null), panelId = useId(), [open, setOpen] = useState(false);
  const hydrated = useSyncExternalStore(subscribeNever, clientReady, serverReady);
  const inactive = disabled && hydrated;
  const close = useCallback(() => {
    const menu = root.current;
    if (!menu) return;
    const trigger = menu.querySelector("summary");
    const restoreFocus = menu.contains(menu.ownerDocument.activeElement) && menu.ownerDocument.activeElement !== trigger;
    menu.open = false; setOpen(false);
    if (restoreFocus) trigger?.focus({ preventScroll: true });
  }, []);
  useOutsideDismiss({ enabled: open, root, onDismiss: close });
  const summary = selected.length ? options.filter((option) => selected.includes(option.value)).map((option) => option.label).join(", ") : automaticLabel;
  return <Root ref={root} data-disabled={inactive} onToggle={(event) => setOpen(event.currentTarget.open)} onKeyDown={(event) => {
    if (event.key === "Escape" && root.current?.open) { event.preventDefault(); event.stopPropagation(); close(); root.current.querySelector("summary")?.focus(); }
  }}>
    <summary aria-controls={panelId} aria-label={`${label}: ${summary}`} aria-disabled={inactive || undefined}
      aria-invalid={invalid || undefined} {...(describedBy ? { "aria-describedby": describedBy } : {})}
      onClick={(event) => { if (inactive) event.preventDefault(); }}><span>{summary}</span><ChevronDownIcon /></summary>
    <fieldset id={panelId} disabled={inactive}><legend><VisuallyHidden>{label}</VisuallyHidden></legend>
      {hydrated && <button type="button" aria-pressed={selected.length === 0} onClick={() => onChange([])}>{automaticLabel}</button>}
      <p>{automaticHint}</p>
      {options.map((option) => <label key={option.value}><input type="checkbox" name={name} value={option.value} checked={selected.includes(option.value)}
        onChange={() => onChange(selected.includes(option.value) ? selected.filter((value) => value !== option.value) : [...selected, option.value])} />{option.label}</label>)}
    </fieldset>
  </Root>;
}
