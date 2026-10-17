"use client";

import Link from "@/components/navigation/navigation-link";
import {
  useCallback, useId, useMemo, useRef, useState, type ComponentPropsWithoutRef, type MouseEvent, type ReactNode,
} from "react";
import styled, { css } from "styled-components";
import { ChevronDownIcon, CloseIcon } from "@/components/ui/icons";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { useOutsideDismiss } from "@/components/ui/use-outside-dismiss";
import { isSafeRemoteImageUrl } from "@/domain/remote-image";
import { providerImageSource } from "@/components/ui/provider-image";
import { isLocalCountryFlagAsset } from "@/domain/country-flag";
import type { FilterOption } from "@/domain/feed-presentation";
import { prepareFootballSearch } from "@/domain/football-search";
import { media, type AccentName } from "@/styles/theme";

export const focusRing = css`
  &:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: 2px;
  }
`;

/** Shared feedback for compact themed controls, without changing their dimensions. */
export const controlFeedback = css`
  transition: border-color 120ms ease, background-color 120ms ease;
  ${media.hover} { &:hover:not([aria-pressed="true"]):not([aria-expanded="true"]) { border-color: ${({ theme }) => theme.color.controlBorder}; } }
  &:focus-within { border-color: ${({ theme }) => theme.color.brand}; }
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
  border-radius: 0;
  font-size: 0.6875rem;
  ${media.desktop} { min-block-size: 1.75rem; border-radius: 7px; font-size: 0.75rem; }
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
/** Approved catalog logos and bundled country flags load directly; failures simply disappear. */
export function OptionLogo({ url }: { url: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!url || failedUrl === url || !(isLocalCountryFlagAsset(url) || isSafeRemoteImageUrl(url))) return null;
  return <LogoImage src={providerImageSource(url, 18)} alt="" width={18} height={18} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)} />;
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
  border-radius: 0;
  /* 16px glyphs sit with the 11px phone controls; desktop keeps 20px. */
  font-size: 1rem;
  cursor: pointer;
  ${media.desktop} { border-radius: 10px; font-size: 1.25rem; }
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
  border-radius: 0;
  font-size: 0.6875rem;
  font-weight: ${({ theme }) => theme.typography.weight.body};
  ${controlFeedback}
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
  > svg { position: absolute; inset-inline-end: 8px; inset-block-start: 50%; transform: translateY(-50%); color: ${({ theme }) => theme.color.brand}; pointer-events: none; }
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
/** A labelled alternative to the icon trigger, for narrow filter panels without duplicate chips. */
const PickerSummary = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  inline-size: 100%;
  min-inline-size: 0;
  min-block-size: 2rem;
  padding: 4px 8px;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: 0;
  font: inherit;
  font-size: 0.75rem;
  line-height: 1.25;
  text-align: start;
  cursor: pointer;
  ${controlFeedback}
  > [data-picker-label] { flex: none; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
  > [data-picker-value] { flex: 1; min-inline-size: 0; color: ${({ theme }) => theme.color.mutedText}; text-align: end; }
  > svg { flex: none; font-size: 1rem; }
  &[aria-expanded="true"] { border-color: ${({ theme }) => theme.color.brand}; background: ${({ theme }) => theme.color.brandSoft}; }
  ${media.hover} { &:hover { background: ${({ theme }) => theme.color.rowHover}; } }
  ${focusRing}
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
  border-radius: 0;
  box-shadow: ${({ theme }) => theme.shadow.cardHover};
  ${media.desktop} { border-radius: 6px; }
`;
/** Phones list compact 36px rows at 13px; desktop keeps its 40px rows at 15px. */
const PickerSearch = styled.input`
  min-block-size: 2.25rem;
  padding-inline: ${({ theme }) => theme.space.sm};
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
  border-radius: 0;
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
    border-radius: 0;
    font-size: 0.8125rem;
    cursor: pointer;
    ${media.hover} { &:hover { background: ${({ theme }) => theme.color.rowHover}; } }
    &:has(input:checked) { color: ${({ theme }) => theme.color.accent.teal.text}; background: ${({ theme }) => theme.color.brandSoft}; }
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
export function OptionPicker({ title, options, selected, onToggle, findLabel, emptyLabel, searchable = true, trigger, summary, className }: {
  title: string; options: readonly FilterOption[]; selected: readonly string[]; onToggle: (value: string) => void;
  findLabel: string; emptyLabel: string; searchable?: boolean; trigger?: ReactNode; summary?: ReactNode; className?: string;
}) {
  const [open, setOpen] = useState(false), [filter, setFilter] = useState("");
  const root = useRef<HTMLDivElement>(null), button = useRef<HTMLButtonElement>(null), panelId = useId();
  const close = useCallback(() => setOpen(false), []);
  useOutsideDismiss({ enabled: open, root, onDismiss: close });
  const needle = filter.trim();
  const search = useMemo(() => prepareFootballSearch(needle), [needle]);
  const visible = useMemo(() => {
    if (!needle) return options;
    return options.map((option, index) => ({
      option, index,
      score: Math.max(search.score(option.label), option.detail ? search.score(option.detail) : 0,
        option.detail ? search.score(`${option.label} ${option.detail}`) : 0),
    })).filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .map(({ option }) => option);
  }, [needle, options, search]);
  const Trigger = summary ? PickerSummary : IconButton;
  return <PickerRoot className={className} ref={root} onKeyDown={(event) => {
    if (event.key === "Escape" && open) { event.stopPropagation(); setOpen(false); button.current?.focus(); }
  }}>
    <Trigger ref={button} type="button" aria-expanded={open} aria-controls={panelId} aria-label={title} title={title}
      onClick={() => setOpen(!open)}>{summary ?? trigger}{(summary || !trigger) && <ChevronDownIcon />}</Trigger>
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
