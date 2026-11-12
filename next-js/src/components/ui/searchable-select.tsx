"use client";

import { memo, useCallback, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import styled from "styled-components";
import { searchFilterOptions } from "@/domain/filter-option-search";
import { indexSelectOptions } from "@/domain/select-options";
import { CheckIcon, ChevronDownIcon } from "./icons";
import { FloatingOutline } from "./floating-outline";
import { FloatingField } from "./floating-field";
import { SearchBar } from "./search-bar";
import { SelectMenuRoot, SelectMenuTrigger, SelectMenuOptions, useSelectOptionReveal } from "./select-menu";
import { useAnchoredPanel } from "./anchored-panel";
import { useOutsideDismiss } from "./use-outside-dismiss";

export type SearchableSelectOption = Readonly<{ value: string; label: string; detail?: string | null; icon?: ReactNode }>;
const Search = styled.div`
  padding-block-end: var(--gh-spacing-2); background: ${({ theme }) => theme.color.surface};
`;
const Popup = styled(SelectMenuOptions)<{ $searchable: boolean }>`
  grid-template-rows: ${({ $searchable }) => $searchable ? "auto minmax(0, 1fr)" : "minmax(0, 1fr)"};
  block-size: min(var(--gh-size-80), 50dvh, var(--anchored-panel-space, 100dvh)); overflow: hidden;
`;
const List = styled(SelectMenuOptions)`
  min-block-size: 0; block-size: 100%; overflow-y: auto; align-content: start;
`;
const Detail = styled.span`
  display: flex; align-items: center; gap: var(--gh-spacing-2); min-inline-size: 0;
  > span { min-inline-size: 0; overflow-wrap: anywhere; }
  small { display: block; color: ${({ theme }) => theme.color.mutedText}; font-weight: var(--gh-weight-body); }
`;
const Empty = styled.p`
  margin: 0; padding: var(--gh-spacing-2); color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary);
`;
const emptyValues: readonly string[] = [];
const subscribe = () => () => {};
const browserSnapshot = () => true, serverSnapshot = () => false;

/** Moving keyboard/pointer focus updates only the two affected rows, even in large league/team lists. */
const SearchableOption = memo(function SearchableOption({ option, id, selected, blocked, active, onChoose, onActive }: {
  option: SearchableSelectOption; id: string; selected: boolean; blocked: boolean; active: boolean;
  onChoose: (value: string) => void; onActive: (value: string) => void;
}) {
  return <li id={id} role="option" aria-selected={selected} aria-disabled={blocked || undefined}
    data-active={active || undefined} data-select-option={option.value}
    onPointerDown={event => event.preventDefault()} onPointerMove={event => { if (event.pointerType === "mouse" && !blocked) onActive(option.value); }}
    onClick={() => onChoose(option.value)}><Detail>{option.icon}<span>{option.label}{option.detail && <small>{option.detail}</small>}</span></Detail><CheckIcon /></li>;
});

/** One-click multi-selection with native form values, searchable options and local keyboard focus. */
export function SearchableSelect({ label, values, options, onValuesChange, allLabel, searchLabel, emptyLabel, name,
  maximum = Infinity, minimum = 0, allValues = emptyValues, searchable = true, disabled = false }: {
  label: string; values: readonly string[]; options: readonly SearchableSelectOption[]; onValuesChange: (values: string[]) => void;
  allLabel: string; searchLabel: string; emptyLabel: string; name?: string; maximum?: number; minimum?: number;
  allValues?: readonly string[]; searchable?: boolean; disabled?: boolean;
}) {
  const id = useId(), [open, setOpen] = useState(false), [search, setSearch] = useState(""), [active, setActive] = useState<string | null>(null);
  const enhanced = useSyncExternalStore(subscribe, browserSnapshot, serverSnapshot);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), popup = useRef<HTMLElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useOutsideDismiss({ enabled: open, root, onDismiss: close });
  useAnchoredPanel({ open, anchor: trigger, panel: popup });
  const optionsByValue = useMemo(() => indexSelectOptions(options), [options]);
  const available = useMemo<readonly SearchableSelectOption[]>(() => {
    const missing = values.filter(value => !optionsByValue.has(value)).map(value => ({ value, label: value }));
    return missing.length ? [...options, ...missing] : options;
  }, [options, optionsByValue, values]);
  const availableByValue = useMemo(() => available === options ? optionsByValue : indexSelectOptions(available), [available, options, optionsByValue]);
  const selectedValues = useMemo(() => new Set(values), [values]);
  const allSelected = useMemo(() => {
    const all = new Set(allValues);
    return values.length === allValues.length && values.every(value => all.has(value));
  }, [allValues, values]);
  const matches = useMemo(() => searchFilterOptions(available, search), [available, search]);
  const shown = useMemo(() => [...matches.exact, ...matches.similar], [matches]);
  const blocked = useCallback((value: string) => value !== "" && (selectedValues.has(value) ? values.length <= minimum : values.length >= maximum),
    [maximum, minimum, selectedValues, values.length]);
  const enabled = useMemo(() => ["", ...shown.filter(option => !blocked(option.value)).map(option => option.value)], [blocked, shown]);
  const enabledValues = useMemo(() => new Set(enabled), [enabled]);
  const activeValue = active !== null && enabledValues.has(active) ? active : search ? enabled[1] ?? "" : "";
  const display = useMemo(() => allSelected ? allLabel : values.map(value => availableByValue.get(value)?.option.label ?? value).join(", "),
    [allLabel, allSelected, availableByValue, values]);
  const optionId = (value: string) => `${id}-option-${value === "" ? 0 : (availableByValue.get(value)?.index ?? -1) + 1}`;
  const allOption = useMemo<SearchableSelectOption>(() => ({ value: "", label: allLabel }), [allLabel]);
  useLayoutEffect(() => { if (open && searchable) popup.current?.querySelector("input")?.focus({ preventScroll: true }); }, [open, searchable]);
  const activate = useSelectOptionReveal(list, open, activeValue, setActive);
  const hoverOption = useCallback((value: string) => activate(value, true), [activate]);
  const choose = useCallback((value: string) => {
    if (disabled || blocked(value)) return;
    onValuesChange(value === "" ? [...allValues] : selectedValues.has(value) ? values.filter(item => item !== value) : [...values, value].sort());
  }, [allValues, blocked, disabled, onValuesChange, selectedValues, values]);
  function keyboard(event: KeyboardEvent) {
    if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); close(); trigger.current?.focus(); return; }
    if (!open) {
      if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); setSearch(""); activate(null); setOpen(true); }
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      if (searchable && (event.key === "Home" || event.key === "End")) return;
      event.preventDefault();
      const index = enabled.indexOf(activeValue);
      activate(enabled[event.key === "Home" ? 0 : event.key === "End" ? enabled.length - 1
        : Math.max(0, Math.min(enabled.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))]!);
    } else if (event.key === "Enter" || !searchable && event.key === " ") { event.preventDefault(); choose(activeValue); }
  }
  if (!enhanced) return <FloatingField label={label}><select name={name} multiple required={minimum > 0} disabled={disabled}
    value={[...values]} onChange={event => onValuesChange(Array.from(event.target.selectedOptions, option => option.value))}>
    {available.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select></FloatingField>;
  return <SelectMenuRoot ref={root} data-searchable-select onKeyDown={keyboard} onFocusLeave={close}>
    {name && values.map(value => <input key={value} type="hidden" name={name} value={value} />)}
    <SelectMenuTrigger ref={trigger} type="button" data-select-trigger disabled={disabled}
      aria-label={`${label}: ${display}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { setSearch(""); activate(null); setOpen(value => !value); }}>
      <span data-select-label aria-hidden="true">{label}</span><span aria-hidden="true"><span data-current>{display}</span></span><ChevronDownIcon />
    </SelectMenuTrigger>
    <FloatingOutline label={label} />
    {open && <Popup as="div" $searchable={searchable} ref={element => { popup.current = element; }} id={id} role="dialog" aria-label={label} data-select-popup>
      {searchable && <Search data-select-search><SearchBar label={searchLabel} value={search} role="combobox" aria-expanded="true"
        aria-autocomplete="list" aria-controls={`${id}-list`} aria-activedescendant={optionId(activeValue)}
        onChange={event => { setSearch(event.target.value); activate(null); }} /></Search>}
      <List $inline ref={list} id={`${id}-list`} role="listbox" aria-label={label} aria-multiselectable="true">
        {[allOption, ...shown].map(option => <SearchableOption key={option.value} option={option} id={optionId(option.value)}
          selected={option.value === "" ? allSelected : selectedValues.has(option.value)} blocked={blocked(option.value)}
          active={activeValue === option.value} onChoose={choose} onActive={hoverOption} />)}
        {shown.length === 0 && <li role="presentation"><Empty>{emptyLabel}</Empty></li>}
      </List>
    </Popup>}
  </SelectMenuRoot>;
}
