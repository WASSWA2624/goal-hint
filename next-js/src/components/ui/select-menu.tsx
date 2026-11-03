"use client";

import { useCallback, useId, useLayoutEffect, useRef, useState, type ComponentPropsWithoutRef, type KeyboardEvent } from "react";
import styled from "styled-components";
import { CheckIcon, ChevronDownIcon } from "./icons";
import { controlBodyHeight } from "./control-layout";
import { focusRing } from "./filter-chrome";
import { selectSurface } from "./filled-surfaces";
import { FloatingOutline } from "./floating-outline";
import { floatingLabel, raisedFloatingLabel, floatingOutline, floatingOutlineFocus } from "./floating-field-styles";
import { useOutsideDismiss } from "./use-outside-dismiss";
import { anchoredPanel, useAnchoredPanel } from "./anchored-panel";

export type SelectMenuOption = Readonly<{ value: string; label: string; disabled?: boolean }>;
export type SelectMenuProps = Readonly<{
  value: string; options: readonly SelectMenuOption[]; label: string; onValueChange: (value: string) => void;
  onOptionSelect?: (value: string, trigger: HTMLButtonElement) => void;
}> & Omit<ComponentPropsWithoutRef<"button">, "children" | "value" | "onChange" | "onClick" | "onKeyDown" | "onSelect" | "role">;
const Root = styled.div.attrs<{ "data-control-field"?: string }>({ "data-control-field": "" })`
  position: relative; min-inline-size: 0; max-inline-size: 100%; margin-block-start: var(--floating-label-space);
  > [data-floating-outline] { ${floatingOutline} > legend { max-inline-size: 100%; } }
  &:focus-within > [data-floating-outline] { ${floatingOutlineFocus} }
`;
const Trigger = styled.button`
  display: inline-flex; align-items: center; justify-content: space-between; gap: var(--gh-spacing-3);
  inline-size: 100%; min-inline-size: 0; min-block-size: var(--form-control-height); padding: var(--gh-spacing-1_5) var(--gh-spacing-2_5);
  color: ${({ theme }) => theme.color.text}; border: 0;
  border-radius: ${({ theme }) => theme.radius.control}; font: inherit; font-size: var(--gh-font-secondary); text-align: start; cursor: pointer;
  ${selectSurface} ${focusRing}
  > span { display: grid; min-inline-size: 0; }
  > span > span { grid-area: 1 / 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  > span > span:not([data-current]) { visibility: hidden; }
  > svg { flex: none; color: ${({ theme }) => theme.color.brand}; }
  &:disabled { color: ${({ theme }) => theme.color.disabledText}; cursor: default; }
  border: var(--gh-stroke-thin) solid transparent;
  &:focus-visible { outline: none; }
  position: relative; ${controlBodyHeight} padding-block: var(--gh-spacing-2);
  > [data-select-label] { ${floatingLabel} ${raisedFloatingLabel} max-inline-size: calc(100% - var(--gh-size-10)); }
  &:focus-within > [data-select-label] { color: ${({ theme }) => theme.color.link}; }
`;
const Options = styled.ul`
  ${anchoredPanel}
  z-index: var(--gh-layer-tooltip);
  display: grid; gap: var(--gh-spacing-0_5); inline-size: max(100%, var(--gh-size-44));
  max-block-size: min(var(--gh-size-80), 50dvh, var(--anchored-panel-space, 100dvh)); overflow-y: auto; overscroll-behavior: contain;
  margin: 0; padding: var(--gh-spacing-1); list-style: none; box-sizing: border-box;
  color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surface};
  border: 0; border-radius: ${({ theme }) => theme.radius.overlay};
  box-shadow: ${({ theme }) => theme.shadow.popover}; scrollbar-width: thin;
  > li {
    display: flex; align-items: center; justify-content: space-between; gap: var(--gh-spacing-3);
    min-block-size: var(--form-control-height); padding: var(--gh-spacing-1_75) var(--gh-spacing-2_5); border: 0; border-radius: ${({ theme }) => theme.radius.small};
    font-size: var(--gh-font-secondary); line-height: var(--gh-leading-caption); cursor: pointer;
    > svg { flex: none; inline-size: var(--gh-size-3_5); block-size: var(--gh-size-3_5); visibility: hidden; }
    &[aria-selected="true"] {
      color: ${({ theme }) => theme.color.brand}; background: ${({ theme }) => theme.color.brandSoft};
      font-weight: ${({ theme }) => theme.typography.weight.bold};
      > svg { visibility: visible; }
    }
    &[data-active="true"] { background: ${({ theme }) => theme.color.brandSoft}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
    &[data-active="true"]:not([aria-selected="true"]) { background: ${({ theme }) => theme.color.rowHover}; }
    &[aria-disabled="true"] { color: ${({ theme }) => theme.color.disabledText}; cursor: default; }
  }
`;

/** Single-choice menu with themed options, keyboard navigation and selection committed only on activation. */
export function SelectMenu({ value, options, label, onValueChange, onOptionSelect, className, disabled = false, ...attributes }: SelectMenuProps) {
  const [open, setOpen] = useState(false), [activeValue, setActiveValue] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLUListElement>(null);
  const search = useRef({ text: "", at: 0 }), id = useId();
  const enabled = options.filter((option) => !option.disabled), current = options.find((option) => option.value === value);
  const active = enabled.find((option) => option.value === activeValue) ?? enabled.find((option) => option.value === value) ?? enabled[0];
  const activeIndex = options.findIndex((option) => option.value === active?.value);
  const close = useCallback(() => { setOpen(false); search.current = { text: "", at: 0 }; }, []);
  useOutsideDismiss({ enabled: open, root, onDismiss: close });
  useAnchoredPanel({ open, anchor: trigger, panel });
  useLayoutEffect(() => {
    if (!open) return;
    const list = panel.current, item = list?.children[activeIndex] as HTMLElement | undefined;
    if (!list || !item) return;
    const bounds = item.getBoundingClientRect(), viewport = list.getBoundingClientRect();
    if (bounds.bottom > viewport.bottom - 4) list.scrollTop += bounds.bottom - viewport.bottom + 4;
    else if (bounds.top < viewport.top + 4) list.scrollTop -= viewport.top + 4 - bounds.top;
  }, [open, activeIndex]);

  function show(first = false) {
    setActiveValue((first ? enabled[0] : enabled.find((option) => option.value === value) ?? enabled[0])?.value ?? null);
    search.current = { text: "", at: 0 }; setOpen(true);
  }
  function choose(option = active) {
    if (!option || disabled) return;
    close();
    if (trigger.current) onOptionSelect?.(option.value, trigger.current);
    if (option.value !== value) onValueChange(option.value);
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled || !enabled.length) return;
    const { key } = event;
    if (key === "Tab") { if (open) choose(); return; }
    if (key === "Escape") {
      if (open) { event.preventDefault(); event.stopPropagation(); close(); }
      return;
    }
    if (key === "Enter" || key === " ") {
      event.preventDefault();
      if (!event.repeat) { if (open) choose(); else show(); }
      return;
    }
    if (key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End") {
      event.preventDefault();
      if (event.altKey && key === "ArrowUp") { close(); return; }
      if (!open && key !== "Home" && key !== "End") { show(); return; }
      const index = enabled.findIndex((option) => option.value === active?.value);
      const next = key === "Home" ? 0 : key === "End" ? enabled.length - 1
        : Math.max(0, Math.min(enabled.length - 1, index + (key === "ArrowDown" ? 1 : -1)));
      setActiveValue(enabled[next]!.value); setOpen(true); return;
    }
    if (key.length !== 1 || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const at = Date.now(), text = at - search.current.at < 600 ? search.current.text + key : key;
    search.current = { text, at };
    const needle = (/^(.)\1+$/u.test(text) ? key : text).toLocaleLowerCase();
    const start = Math.max(0, enabled.findIndex((option) => option.value === active?.value)) + (needle.length === 1 ? 1 : 0);
    const match = Array.from({ length: enabled.length }, (_, offset) => enabled[(start + offset) % enabled.length]!)
      .find((option) => option.label.toLocaleLowerCase().startsWith(needle));
    if (match) { setActiveValue(match.value); setOpen(true); }
  }
  return <Root className={className} ref={root} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) close();
  }}>
    <Trigger {...attributes} ref={trigger} type="button" role="combobox" data-select-trigger data-floating-control disabled={disabled || !enabled.length}
      aria-label={`${label}: ${current?.label ?? value}`} aria-haspopup="listbox" aria-expanded={open}
      aria-controls={open ? id : undefined} aria-activedescendant={open && activeIndex >= 0 ? `${id}-${activeIndex}` : undefined}
      onKeyDown={keyboard} onClick={() => { if (open) close(); else show(); }}>
      <span data-select-label aria-hidden="true">{label}</span>
      <span aria-hidden="true">{options.map((option) => <span key={option.value} data-current={option.value === value || undefined}>{option.label}</span>)}</span>
      <ChevronDownIcon />
    </Trigger>
    <FloatingOutline label={label} />
    {open && <Options ref={panel} id={id} role="listbox" aria-label={label} data-select-options>
      {options.map((option, index) => <li key={option.value} id={`${id}-${index}`} role="option" aria-selected={option.value === value}
        aria-disabled={option.disabled || undefined} data-active={!option.disabled && active?.value === option.value || undefined}
        onMouseDown={(event) => event.preventDefault()}
        onPointerMove={() => { if (!option.disabled) setActiveValue(option.value); }}
        onClick={() => { if (!option.disabled) { choose(option); trigger.current?.focus({ preventScroll: true }); } }}>
        <span>{option.label}</span><CheckIcon />
      </li>)}
    </Options>}
  </Root>;
}
