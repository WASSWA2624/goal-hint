"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import styled, { css } from "styled-components";
import { ChevronDownIcon, CloseIcon } from "@/components/ui/icons";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { isSafeRemoteImageUrl } from "@/domain/remote-image";
import type { FilterOption } from "@/domain/feed-presentation";
import type { AccentName } from "@/styles/theme";

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
  @media (min-width: ${({ theme }) => theme.breakpoint.lg}) { min-block-size: 1.75rem; font-size: 0.75rem; }
  font-weight: ${({ theme, $selected }) => $selected ? theme.typography.weight.bold : theme.typography.weight.body};
  line-height: 1.2;
  white-space: nowrap;
  text-decoration: none;
  cursor: pointer;
  > svg { flex: none; font-size: 0.8125rem; }
  > img { flex: none; inline-size: 14px; block-size: 14px; object-fit: contain; }
  &:hover { border-color: ${({ theme, $selected, $accent = "teal" }) => $selected ? theme.color.accent[$accent].solid : theme.color.border}; }
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
    <OptionLogo url={logoUrl} />{children ?? label}{selected && <CloseIcon />}
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
  font-size: 1.25rem;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.color.surfaceMuted}; }
  &:disabled { color: ${({ theme }) => theme.color.disabledText}; cursor: not-allowed; }
  ${focusRing}
`;

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
  border-radius: 12px;
  box-shadow: ${({ theme }) => theme.shadow.cardHover};
`;
const PickerSearch = styled.input`
  min-block-size: 2.5rem;
  padding-inline: ${({ theme }) => theme.space.sm};
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
  border-radius: 8px;
  font: inherit;
  font-size: 0.9375rem;
  ${focusRing}
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
    gap: ${({ theme }) => theme.space.sm};
    min-block-size: 2.5rem;
    padding-inline: ${({ theme }) => theme.space.sm};
    border-radius: 8px;
    font-size: 0.9375rem;
    cursor: pointer;
    &:hover { background: ${({ theme }) => theme.color.rowHover}; }
    > input { flex: none; inline-size: 1.125rem; block-size: 1.125rem; accent-color: ${({ theme }) => theme.color.brand}; }
    > img { flex: none; inline-size: 20px; block-size: 20px; object-fit: contain; }
    > span { min-inline-size: 0; flex: 1; }
    > small { color: ${({ theme }) => theme.color.mutedText}; font-variant-numeric: tabular-nums; }
  }
`;
const PickerEmpty = styled.p`
  padding: ${({ theme }) => theme.space.sm};
  color: ${({ theme }) => theme.color.mutedText};
  font-size: 0.875rem;
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

export const Segmented = styled.div`
  display: inline-grid;
  grid-auto-columns: minmax(0, 1fr);
  grid-auto-flow: column;
  padding: 3px;
  background: ${({ theme }) => theme.color.surfaceMuted};
  border-radius: 12px;
  > a {
    display: grid;
    place-items: center;
    min-block-size: 1.75rem;
    padding-inline: 11px;
    color: ${({ theme }) => theme.color.text};
    border-radius: 7px;
    font-size: 0.6875rem;
    font-weight: ${({ theme }) => theme.typography.weight.medium};
    white-space: nowrap;
    text-decoration: none;
    ${focusRing}
    &[aria-current="true"] { color: ${({ theme }) => theme.color.onBrand}; background: ${({ theme }) => theme.gradient.action}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  }
`;

const SliderRoot = styled.div<{ $disabled: boolean; $accent: AccentName }>`
  position: relative;
  block-size: 1.5rem;
  opacity: ${({ $disabled }) => $disabled ? 0.55 : 1};
  > input {
    position: absolute;
    inset: 0;
    inline-size: 100%;
    margin: 0;
    background: none;
    pointer-events: none;
    appearance: none;
    &::-webkit-slider-thumb {
      appearance: none;
      inline-size: 18px;
      block-size: 18px;
      background: ${({ theme }) => theme.color.surface};
      border: 3px solid ${({ theme, $accent }) => theme.color.accent[$accent].solid};
      border-radius: 50%;
      pointer-events: auto;
      cursor: pointer;
    }
    &::-moz-range-thumb {
      inline-size: 12px;
      block-size: 12px;
      background: ${({ theme }) => theme.color.surface};
      border: 3px solid ${({ theme, $accent }) => theme.color.accent[$accent].solid};
      border-radius: 50%;
      pointer-events: auto;
      cursor: pointer;
    }
    &:focus-visible { outline: none; }
    &:focus-visible::-webkit-slider-thumb { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
    &:focus-visible::-moz-range-thumb { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
    &:disabled::-webkit-slider-thumb { cursor: not-allowed; }
  }
`;
const SliderTrack = styled.span<{ $accent: AccentName }>`
  position: absolute;
  inset-inline: 9px;
  inset-block-start: 50%;
  block-size: 4px;
  transform: translateY(-50%);
  background: ${({ theme }) => theme.color.border};
  border-radius: 2px;
  > span { position: absolute; inset-block: 0; background: ${({ theme, $accent }) => theme.color.accent[$accent].gradient}; border-radius: 2px; }
`;

/** Two native range inputs over one track; each keeps its own accessible name. */
export function RangeSlider({ min, max, step, low, high, onChange, lowLabel, highLabel, disabled = false, accent = "teal" }: {
  min: number; max: number; step: number; low: number; high: number; onChange: (low: number, high: number) => void;
  lowLabel: string; highLabel: string; disabled?: boolean; accent?: AccentName;
}) {
  const percent = (value: number) => ((value - min) / (max - min)) * 100;
  return <SliderRoot $disabled={disabled} $accent={accent}>
    <SliderTrack aria-hidden="true" $accent={accent}><span style={{ insetInlineStart: `${percent(low)}%`, insetInlineEnd: `${100 - percent(high)}%` }} /></SliderTrack>
    <input type="range" min={min} max={max} step={step} value={low} disabled={disabled} aria-label={lowLabel}
      onChange={(event) => onChange(Math.min(Number(event.target.value), high), high)} />
    <input type="range" min={min} max={max} step={step} value={high} disabled={disabled} aria-label={highLabel}
      onChange={(event) => onChange(low, Math.max(Number(event.target.value), low))} />
  </SliderRoot>;
}
