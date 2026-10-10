"use client";

import Link from "next/link";
import {
  useEffect, useId, useRef, useState, type ComponentPropsWithoutRef, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type ReactNode,
} from "react";
import styled, { css } from "styled-components";
import { ChevronDownIcon, CloseIcon } from "@/components/ui/icons";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { isSafeRemoteImageUrl } from "@/domain/remote-image";
import type { FilterOption } from "@/domain/feed-presentation";
import { media, type AccentName } from "@/styles/theme";

export const focusRing = css`
  &:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: 2px;
  }
`;

/** Plain left clicks are handled in the browser; modified clicks keep native link behaviour. */
export function plainClick(event: MouseEvent, action: () => void) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  action();
}

/** Selected chips take their filter's accent; unselected chips stay neutral so choices stand out. */
const chipStyles = css<{ $selected?: boolean; $accent?: AccentName }>`
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 5px;
  min-block-size: 1.625rem;
  padding-inline: 9px;
  color: ${({ theme, $selected, $accent = "teal" }) => $selected ? theme.color.accent[$accent].text : theme.color.text};
  background: ${({ theme, $selected, $accent = "teal" }) => $selected ? theme.color.accent[$accent].soft : theme.color.surfaceMuted};
  border: ${({ theme }) => theme.border.width} solid transparent;
  border-radius: 7px;
  font-size: 0.6875rem;
  ${media.desktop} { min-block-size: 1.75rem; font-size: 0.75rem; }
  font-weight: ${({ theme, $selected }) => $selected ? theme.typography.weight.bold : theme.typography.weight.body};
  line-height: 1.2;
  white-space: nowrap;
  text-decoration: none;
  cursor: pointer;
  > svg { flex: none; font-size: 0.8125rem; }
  > img { flex: none; inline-size: 14px; block-size: 14px; object-fit: contain; }
  > span { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; }
  ${media.hover} {
    &:hover { border-color: ${({ theme, $selected, $accent = "teal" }) => $selected ? theme.color.accent[$accent].solid : theme.color.border}; }
  }
  &[aria-disabled="true"] { cursor: not-allowed; opacity: 0.6; }
  ${focusRing}
`;
const ChipAnchor = styled(Link)<{ $selected?: boolean; $accent?: AccentName }>`${chipStyles}`;
export const ChipText = styled.span<{ $selected?: boolean; $accent?: AccentName }>`${chipStyles} cursor: default;`;

const LogoImage = styled.img`
  flex: none;
  inline-size: 18px;
  block-size: 18px;
  object-fit: contain;
`;
/** Approved remote catalog logos load directly, as on match cards; failures simply disappear. */
export function OptionLogo({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed || !isSafeRemoteImageUrl(url)) return null;
  return <LogoImage src={url} alt="" width={18} height={18} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

/** A filter value as a link: selected chips remove themselves, others add themselves. */
export function FilterChip({ label, selected, href, onSelect, logoUrl = null, actionLabel, accent = "teal", children }: {
  label: string; selected: boolean; href: string; onSelect: () => void; logoUrl?: string | null; actionLabel: string; accent?: AccentName; children?: ReactNode;
}) {
  return <ChipAnchor href={href} prefetch={false} scroll={false} $selected={selected} $accent={accent} aria-label={actionLabel}
    onClick={(event) => plainClick(event, onSelect)} data-chip-selected={selected}>
    <OptionLogo url={logoUrl} />{children ?? <span>{label}</span>}{selected && <CloseIcon />}
  </ChipAnchor>;
}

export const IconButton = styled.button`
  display: inline-grid;
  flex: none;
  place-items: center;
  inline-size: 1.875rem;
  block-size: 1.875rem;
  padding: 0;
  color: ${({ theme }) => theme.color.text};
  background: transparent;
  border: 0;
  border-radius: 10px;
  /* 16px glyphs sit with the 11px phone controls; desktop keeps 20px. */
  font-size: 1rem;
  cursor: pointer;
  ${media.desktop} { font-size: 1.25rem; }
  ${media.hover} { &:hover { background: ${({ theme }) => theme.color.surfaceMuted}; } }
  &:disabled { color: ${({ theme }) => theme.color.disabledText}; cursor: not-allowed; }
  ${focusRing}
`;

/**
 * Phone select. A compact face shows the current choice; the transparent native select over it
 * stays at 16px, so iOS opens its picker without zooming the page. Every label shares one grid
 * cell, so the face keeps the widest option's width, as a native select does.
 */
const SelectFace = styled.span`
  position: relative;
  display: inline-flex;
  align-items: center;
  min-inline-size: 0;
  min-block-size: 1.875rem;
  padding-inline: 8px 22px;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: 6px;
  font-size: 0.6875rem;
  font-weight: ${({ theme }) => theme.typography.weight.body};
  > span { display: grid; min-inline-size: 0; }
  > span > span { grid-area: 1 / 1; min-inline-size: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  > span > span:not([data-current]) { visibility: hidden; }
  > select {
    position: absolute;
    inset: 0;
    inline-size: 100%;
    block-size: 100%;
    opacity: 0;
    font-size: 16px;
    appearance: none;
    cursor: pointer;
    &:disabled { cursor: not-allowed; }
  }
  > svg { position: absolute; inset-inline-end: 8px; inset-block-start: 50%; transform: translateY(-50%); pointer-events: none; }
  &:has(select:focus-visible) {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: 2px;
  }
  &:has(select:disabled) { color: ${({ theme }) => theme.color.disabledText}; background: ${({ theme }) => theme.color.disabledSurface}; }
`;
export type CompactSelectOption = Readonly<{ value: string; label: string }>;
export function CompactSelect({ options, value, className, ...props }: Omit<ComponentPropsWithoutRef<"select">, "children" | "value"> & {
  options: readonly CompactSelectOption[]; value: string;
}) {
  return <SelectFace className={className}>
    <span aria-hidden="true">{options.map((option) => <span key={option.value} data-current={option.value === value || undefined}>{option.label}</span>)}</span>
    <select value={value} {...props}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
    <ChevronDownIcon />
  </SelectFace>;
}

const PickerRoot = styled.div`
  position: relative;
  flex: none;
`;
const PickerPanel = styled.div`
  position: absolute;
  inset-block-start: calc(100% + 6px);
  inset-inline-end: 0;
  z-index: 15;
  display: grid;
  gap: ${({ theme }) => theme.space.sm};
  inline-size: min(20rem, calc(100vw - 32px));
  padding: ${({ theme }) => theme.space.sm};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: 6px;
  box-shadow: ${({ theme }) => theme.shadow.cardHover};
`;
/** Phones list compact 36px rows at 13px; desktop keeps its 40px rows at 15px. */
const PickerSearch = styled.input`
  min-block-size: 2.25rem;
  padding-inline: ${({ theme }) => theme.space.sm};
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
  border-radius: 6px;
  font: inherit;
  font-size: 0.8125rem;
  ${focusRing}
  ${media.desktop} { min-block-size: 2.5rem; border-radius: 8px; font-size: 0.9375rem; }
`;
const PickerList = styled.ul`
  max-block-size: 16rem;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
  > li > label {
    display: flex;
    align-items: center;
    gap: 6px;
    min-block-size: 2.25rem;
    padding-inline: ${({ theme }) => theme.space.sm};
    border-radius: 6px;
    font-size: 0.8125rem;
    cursor: pointer;
    ${media.hover} { &:hover { background: ${({ theme }) => theme.color.rowHover}; } }
    > input { flex: none; inline-size: 1rem; block-size: 1rem; accent-color: ${({ theme }) => theme.color.brand}; }
    > img { flex: none; inline-size: 16px; block-size: 16px; object-fit: contain; }
    > span { min-inline-size: 0; flex: 1; }
    > small { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.6875rem; font-variant-numeric: tabular-nums; }
    ${media.desktop} {
      gap: ${({ theme }) => theme.space.sm};
      min-block-size: 2.5rem;
      border-radius: 8px;
      font-size: 0.9375rem;
      > input { inline-size: 1.125rem; block-size: 1.125rem; }
      > img { inline-size: 20px; block-size: 20px; }
      > small { font-size: smaller; }
    }
  }
`;
const PickerEmpty = styled.p`
  padding: ${({ theme }) => theme.space.sm};
  color: ${({ theme }) => theme.color.mutedText};
  font-size: 0.75rem;
  ${media.desktop} { font-size: 0.875rem; }
`;

/** Full option list behind a chevron: searchable checkboxes, Escape and outside clicks close it. */
export function OptionPicker({ title, options, selected, onToggle, findLabel, emptyLabel, searchable = true, trigger }: {
  title: string; options: readonly FilterOption[]; selected: readonly string[]; onToggle: (value: string) => void;
  findLabel: string; emptyLabel: string; searchable?: boolean; trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false), [filter, setFilter] = useState("");
  const root = useRef<HTMLDivElement>(null), button = useRef<HTMLButtonElement>(null), panelId = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const needle = filter.trim().toLocaleLowerCase();
  const visible = needle ? options.filter((option) => `${option.label} ${option.detail ?? ""}`.toLocaleLowerCase().includes(needle)) : options;
  return <PickerRoot ref={root} onKeyDown={(event) => {
    if (event.key === "Escape" && open) { event.stopPropagation(); setOpen(false); button.current?.focus(); }
  }}>
    <IconButton ref={button} type="button" aria-expanded={open} aria-controls={panelId} aria-label={title} title={title}
      onClick={() => setOpen(!open)}>{trigger ?? <ChevronDownIcon />}</IconButton>
    {open && <PickerPanel id={panelId} role="group" aria-label={title}>
      {searchable && <PickerSearch type="search" value={filter} onChange={(event) => setFilter(event.target.value)}
        aria-label={findLabel} placeholder={findLabel} autoFocus />}
      {visible.length === 0 ? <PickerEmpty>{emptyLabel}</PickerEmpty> : <PickerList>
        {visible.map((option) => <li key={option.value}><label>
          <input type="checkbox" checked={selected.includes(option.value)} onChange={() => onToggle(option.value)} />
          <OptionLogo url={option.logoUrl} />
          <span>{option.label}{option.detail && <VisuallyHidden>, {option.detail}</VisuallyHidden>}</span>
          {option.fixtures > 0 && <small aria-hidden="true">{option.fixtures}</small>}
        </label></li>)}
      </PickerList>}
    </PickerPanel>}
  </PickerRoot>;
}

/** 30px track, matching the date field and stepper beside it on phones. */
export const Segmented = styled.div`
  display: inline-grid;
  grid-auto-columns: minmax(0, 1fr);
  grid-auto-flow: column;
  padding: 2px;
  background: ${({ theme }) => theme.color.surfaceMuted};
  border-radius: 8px;
  > a {
    display: grid;
    place-items: center;
    min-block-size: 1.625rem;
    padding-inline: 9px;
    color: ${({ theme }) => theme.color.text};
    border-radius: 6px;
    font-size: 0.6875rem;
    font-weight: ${({ theme }) => theme.typography.weight.medium};
    white-space: nowrap;
    text-decoration: none;
    ${focusRing}
    &[aria-current="true"] { color: ${({ theme }) => theme.color.onBrand}; background: ${({ theme }) => theme.gradient.action}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  }
`;

const SliderRoot = styled.div<{ $disabled: boolean }>`
  position: relative;
  flex: 1;
  min-inline-size: 5rem;
  block-size: 1.75rem;
  cursor: ${({ $disabled }) => $disabled ? "not-allowed" : "pointer"};
  opacity: ${({ $disabled }) => $disabled ? 0.5 : 1};
  touch-action: none;
  user-select: none;
`;
const SliderRail = styled.span<{ $accent: AccentName }>`
  position: absolute;
  inset-inline: 8px;
  inset-block-start: calc(50% - 2px);
  block-size: 4px;
  background: ${({ theme }) => theme.color.border};
  border-radius: 2px;
  > span { position: absolute; inset-block: 0; background: ${({ theme, $accent }) => theme.color.accent[$accent].gradient}; border-radius: 2px; }
`;
const SliderThumb = styled.span<{ $accent: AccentName; $active: boolean }>`
  position: absolute;
  inset-block-start: calc(50% - 8px);
  inline-size: 16px;
  block-size: 16px;
  margin-inline-start: -8px;
  background: ${({ theme }) => theme.color.surface};
  border: 3px solid ${({ theme, $accent }) => theme.color.accent[$accent].solid};
  border-radius: 50%;
  box-shadow: ${({ $active }) => $active ? "0 0 0 5px rgb(11 31 51 / 12%)" : "0 1px 2px rgb(11 31 51 / 20%)"};
  transform: scale(${({ $active }) => $active ? 1.15 : 1});
  transition: box-shadow 120ms ease, transform 120ms ease;
  ${focusRing}
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;
/** Live value bubble above the thumb being dragged. */
const SliderBubble = styled.span<{ $accent: AccentName }>`
  position: absolute;
  inset-block-end: calc(50% + 12px);
  z-index: 1;
  padding: 2px 6px;
  color: ${({ theme }) => theme.color.onBrand};
  background: ${({ theme, $accent }) => theme.color.accent[$accent].solid};
  border-radius: 4px;
  font-size: 0.6875rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  transform: translateX(-50%);
  pointer-events: none;
`;

/**
 * Dual-thumb range with pointer capture: pressing anywhere on the track moves the nearest thumb,
 * dragging updates only this control, and the value commits once on release (or per key press).
 * Each thumb is an ARIA slider with keyboard support.
 */
export function RangeSlider({ min, max, step, low, high, onCommit, format = String, lowLabel, highLabel, disabled = false, accent = "teal" }: {
  min: number; max: number; step: number; low: number; high: number; onCommit: (low: number, high: number) => void;
  format?: (value: number) => string; lowLabel: string; highLabel: string; disabled?: boolean; accent?: AccentName;
}) {
  const [drag, setDrag] = useState<{ thumb: 0 | 1; values: [number, number] } | null>(null);
  // The rail is measured once per press and moves are applied once per frame, so dragging
  // never forces a layout read after each inline-style write.
  const rail = useRef<HTMLSpanElement>(null), box = useRef<DOMRect | null>(null);
  const frame = useRef<number | null>(null), pointerX = useRef(0);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);
  const values: [number, number] = drag?.values ?? [low, high];
  const percent = (value: number) => ((value - min) / (max - min)) * 100;
  const snap = (value: number) => Math.min(max, Math.max(min, Math.round((value - min) / step) * step + min));
  const at = (clientX: number) => {
    const rect = box.current;
    return rect && rect.width > 0 ? snap(min + ((clientX - rect.left) / rect.width) * (max - min)) : null;
  };
  const settle = () => { if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null; } };
  const place = (thumb: 0 | 1, value: number, current: [number, number]): [number, number] =>
    thumb === 0 ? [Math.min(value, current[1]), current[1]] : [current[0], Math.max(value, current[0])];
  const commit = (next: [number, number]) => { if (next[0] !== low || next[1] !== high) onCommit(next[0], next[1]); };
  function key(thumb: 0 | 1, event: ReactKeyboardEvent) {
    if (disabled) return;
    const big = Math.max(step, (max - min) / 10), current = values[thumb];
    const value = { ArrowLeft: current - step, ArrowDown: current - step, ArrowRight: current + step, ArrowUp: current + step,
      PageDown: current - big, PageUp: current + big, Home: min, End: max }[event.key];
    if (value === undefined) return;
    event.preventDefault();
    commit(place(thumb, snap(value), values));
  }
  const position = (value: number) => `calc(8px + (100% - 16px) * ${percent(value) / 100})`;
  return <SliderRoot $disabled={disabled}
    onPointerDown={(event) => {
      if (disabled || event.button !== 0) return;
      box.current = rail.current?.getBoundingClientRect() ?? null;
      const value = at(event.clientX);
      if (value === null) return;
      // The nearer thumb moves; ties favour the one that can travel in the pressed direction.
      const thumb: 0 | 1 = Math.abs(value - values[0]) < Math.abs(value - values[1]) || value < values[0] ? 0 : 1;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      (event.currentTarget.querySelectorAll<HTMLElement>("[role=slider]")[thumb])?.focus({ preventScroll: true });
      setDrag({ thumb, values: place(thumb, value, values) });
    }}
    onPointerMove={(event) => {
      if (!drag) return;
      pointerX.current = event.clientX;
      frame.current ??= requestAnimationFrame(() => {
        frame.current = null;
        const value = at(pointerX.current);
        if (value !== null) setDrag((current) => current && value !== current.values[current.thumb]
          ? { thumb: current.thumb, values: place(current.thumb, value, current.values) } : current);
      });
    }}
    onPointerUp={(event) => {
      if (!drag) return;
      // A move still waiting for its frame is part of the release position.
      settle();
      const value = at(event.clientX), final = value === null ? drag.values : place(drag.thumb, value, drag.values);
      commit(final); setDrag(null);
    }}
    onPointerCancel={() => { settle(); setDrag(null); }}>
    <SliderRail ref={rail} aria-hidden="true" $accent={accent}>
      <span style={{ insetInlineStart: `${percent(values[0])}%`, insetInlineEnd: `${100 - percent(values[1])}%` }} />
    </SliderRail>
    {([0, 1] as const).map((thumb) => <SliderThumb key={thumb} role="slider" tabIndex={disabled ? -1 : 0} $accent={accent} $active={drag?.thumb === thumb}
      aria-label={thumb === 0 ? lowLabel : highLabel} aria-valuemin={min} aria-valuemax={max} aria-valuenow={values[thumb]}
      aria-valuetext={format(values[thumb])} aria-disabled={disabled || undefined} onKeyDown={(event) => key(thumb, event)}
      style={{ insetInlineStart: position(values[thumb]) }} />)}
    {drag && <SliderBubble aria-hidden="true" $accent={accent} style={{ insetInlineStart: position(drag.values[drag.thumb]) }}>
      {format(drag.values[drag.thumb])}
    </SliderBubble>}
  </SliderRoot>;
}
