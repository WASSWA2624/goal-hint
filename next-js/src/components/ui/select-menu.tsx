"use client";

import { useCallback, useId, useLayoutEffect, useRef, useState, type ComponentPropsWithoutRef, type KeyboardEvent } from "react";
import styled from "styled-components";
import { CheckIcon, ChevronDownIcon } from "./icons";
import { controlFeedback, filterControlColors, focusRing } from "./filter-chrome";
import { useOutsideDismiss } from "./use-outside-dismiss";

export type SelectMenuOption = Readonly<{ value: string; label: string; disabled?: boolean }>;
export type SelectMenuProps = Readonly<{
  value: string; options: readonly SelectMenuOption[]; label: string; onValueChange: (value: string) => void;
}> & Omit<ComponentPropsWithoutRef<"button">, "children" | "value" | "onChange" | "onClick" | "onKeyDown" | "onSelect" | "role">;
const Root = styled.div`
  position: relative; min-inline-size: 0; max-inline-size: 100%;
`;
const Trigger = styled.button`
  display: inline-flex; align-items: center; justify-content: space-between; gap: 12px;
  inline-size: 100%; min-inline-size: 0; min-block-size: 34px; padding: 6px 10px;
  color: ${({ theme }) => theme.color.text}; border: 1px solid ${({ theme }) => theme.color.controlBorder};
  border-radius: ${({ theme }) => theme.radius.control}; font: inherit; font-size: 0.75rem; text-align: start; cursor: pointer;
  ${filterControlColors} ${controlFeedback} ${focusRing}
  > span { display: grid; min-inline-size: 0; }
  > span > span { grid-area: 1 / 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  > span > span:not([data-current]) { visibility: hidden; }
  > svg { flex: none; color: ${({ theme }) => theme.color.brand}; }
  &[aria-expanded="true"] { border-color: ${({ theme }) => theme.color.brand}; }
  &:disabled { color: ${({ theme }) => theme.color.disabledText}; cursor: default; }
  @media (pointer: coarse) { min-block-size: 44px; }
`;
const Options = styled.ul`
  position: absolute; inset-inline-start: 0; inset-block-start: calc(100% + 6px); z-index: 50;
  display: grid; gap: 2px; inline-size: max(100%, 11rem); max-inline-size: calc(100vw - 32px);
  max-block-size: min(20rem, 50dvh); overflow-y: auto; overscroll-behavior: contain;
  margin: 0; padding: 4px; list-style: none; box-sizing: border-box;
  color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surface};
  border: 1px solid ${({ theme }) => theme.color.border}; border-radius: ${({ theme }) => theme.radius.overlay};
  box-shadow: ${({ theme }) => theme.shadow.popover}; scrollbar-width: thin;
  > li {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    min-block-size: 34px; padding: 7px 10px; border: 1px solid transparent; border-radius: ${({ theme }) => theme.radius.small};
    font-size: 0.75rem; line-height: 1.35; cursor: pointer;
    > svg { flex: none; inline-size: 14px; block-size: 14px; visibility: hidden; }
    &[aria-selected="true"] {
      color: ${({ theme }) => theme.color.brand}; background: ${({ theme }) => theme.color.brandSoft};
      font-weight: ${({ theme }) => theme.typography.weight.bold};
      > svg { visibility: visible; }
    }
    &[data-active="true"] { border-color: ${({ theme }) => theme.color.brand}; }
    &[data-active="true"]:not([aria-selected="true"]) { background: ${({ theme }) => theme.color.rowHover}; }
    &[aria-disabled="true"] { color: ${({ theme }) => theme.color.disabledText}; cursor: default; }
    @media (pointer: coarse) { min-block-size: 44px; }
  }
`;

/** Single-choice menu with themed options, keyboard navigation and selection committed only on activation. */
export function SelectMenu({ value, options, label, onValueChange, className, disabled = false, ...attributes }: SelectMenuProps) {
  const [open, setOpen] = useState(false), [activeValue, setActiveValue] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLUListElement>(null);
  const search = useRef({ text: "", at: 0 }), id = useId();
  const enabled = options.filter((option) => !option.disabled), current = options.find((option) => option.value === value);
  const active = enabled.find((option) => option.value === activeValue) ?? enabled.find((option) => option.value === value) ?? enabled[0];
  const activeIndex = options.findIndex((option) => option.value === active?.value);
  const close = useCallback(() => { setOpen(false); search.current = { text: "", at: 0 }; }, []);
  useOutsideDismiss({ enabled: open, root, onDismiss: close });
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
    <Trigger {...attributes} ref={trigger} type="button" role="combobox" data-select-trigger disabled={disabled || !enabled.length}
      aria-label={`${label}: ${current?.label ?? value}`} aria-haspopup="listbox" aria-expanded={open}
      aria-controls={open ? id : undefined} aria-activedescendant={open && activeIndex >= 0 ? `${id}-${activeIndex}` : undefined}
      onKeyDown={keyboard} onClick={() => { if (open) close(); else show(); }}>
      <span aria-hidden="true">{options.map((option) => <span key={option.value} data-current={option.value === value || undefined}>{option.label}</span>)}</span>
      <ChevronDownIcon />
    </Trigger>
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
