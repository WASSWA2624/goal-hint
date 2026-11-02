"use client";

import Link from "@/components/navigation/navigation-link";
import {
  useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type ComponentPropsWithoutRef, type MouseEvent, type ReactNode,
} from "react";
import { controlBodyHeight } from "@/components/ui/control-layout";
import { FloatingOutline } from "@/components/ui/floating-outline";
import { selectSurface } from "@/components/ui/filled-surfaces";
import { floatingLabel, raisedFloatingLabel, floatingOutline, floatingOutlineFocus } from "@/components/ui/floating-field-styles";
import styled, { css } from "styled-components";
import { ChevronDownIcon, CloseIcon } from "@/components/ui/icons";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { useOutsideDismiss } from "@/components/ui/use-outside-dismiss";
import { isSafeRemoteImageUrl } from "@/domain/remote-image";
import { providerImageSource } from "@/components/ui/provider-image";
import { isLocalCountryFlagAsset } from "@/domain/country-flag";
import type { FilterOption } from "@/domain/feed-presentation";
import { searchFilterOptions } from "@/domain/filter-option-search";
import { media, type AccentName } from "@/styles/theme";
import { controlFeedback, filterButtonColors, filterControlColors, focusRing } from "@/components/ui/filter-chrome";

export { controlFeedback, filterButtonColors, filterControlColors, filterPanelColors, focusRing } from "@/components/ui/filter-chrome";

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
  gap: var(--gh-spacing-1_25);
  min-block-size: var(--form-control-height);
  padding-inline: var(--gh-spacing-2_25);
  color: ${({ theme, $selected, $accent = "teal" }) => $selected ? theme.color.accent[$accent].text : theme.color.text};
  background: ${({ theme, $selected, $accent = "teal" }) => $selected ? theme.color.accent[$accent].soft : theme.color.surfaceMuted};
  border: 0;
  border-radius: ${({ theme }) => theme.radius.control};
  font-size: var(--gh-font-caption);
  ${media.desktop} { min-block-size: var(--form-control-height); font-size: var(--gh-font-secondary); }
  font-weight: ${({ theme, $selected }) => $selected ? theme.typography.weight.bold : theme.typography.weight.body};
  line-height: var(--gh-leading-control);
  white-space: nowrap;
  text-decoration: none;
  cursor: pointer;
  > svg { flex: none; font-size: var(--gh-font-body); }
  > img { flex: none; inline-size: var(--gh-size-3_5); block-size: var(--gh-size-3_5); object-fit: contain; }
  > span { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; }
  ${media.hover} {
    &:hover { background: ${({ theme }) => theme.color.fieldHover}; }
  }
  &[aria-disabled="true"] { cursor: not-allowed; opacity: var(--gh-opacity-60); }
  ${focusRing}
`;
const ChipAnchor = styled(Link)<{ $selected?: boolean; $accent?: AccentName }>`${chipStyles}`;
export const ChipText = styled.span<{ $selected?: boolean; $accent?: AccentName }>`${chipStyles} cursor: default;`;

const LogoImage = styled.img`
  flex: none;
  inline-size: var(--gh-size-4_5);
  block-size: var(--gh-size-4_5);
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
  ${controlBodyHeight}
  inline-size: var(--form-control-height);
  padding: 0;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.brandSoft};
  border: 0;
  border-radius: ${({ theme }) => theme.radius.control};
  /* 16px glyphs sit with the 11px phone controls; desktop keeps 20px. */
  font-size: var(--gh-font-section);
  cursor: pointer;
  ${media.desktop} { font-size: var(--gh-font-heading); }
  ${media.hover} { &:hover { background: ${({ theme }) => theme.color.surfaceMuted}; } }
  &:disabled { color: ${({ theme }) => theme.color.disabledText}; cursor: not-allowed; }
  ${focusRing}
`;

/**
 * Phone select. A compact face shows the current choice; the transparent native select over it
 * stays at 16px, so iOS opens its picker without zooming the page. Every label shares one grid
 * cell, so the face keeps the widest option's width, as a native select does.
 */
const SelectFace = styled.div`
  --select-surface: ${({ theme }) => theme.color.brandSoft};
  position: relative;
  display: inline-flex;
  align-items: center;
  min-inline-size: 0;
  min-block-size: var(--form-control-height);
  padding-inline: var(--gh-spacing-2) var(--gh-spacing-5_5);
  color: ${({ theme }) => theme.color.text};
  border: 0;
  ${selectSurface}
  border-radius: ${({ theme }) => theme.radius.control};
  font-size: var(--gh-font-caption);
  font-weight: ${({ theme }) => theme.typography.weight.body};
  > span { display: grid; min-inline-size: 0; }
  > span > span { grid-area: 1 / 1; min-inline-size: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  > span > span:not([data-current]) { visibility: hidden; }
  border: var(--gh-stroke-thin) solid transparent;
  ${controlBodyHeight} margin-block-start: var(--floating-label-space); padding-block: var(--gh-spacing-2);
  > [data-floating-outline] { ${floatingOutline} > legend { max-inline-size: 100%; } }
  > label { ${floatingLabel} ${raisedFloatingLabel} max-inline-size: calc(100% - var(--gh-size-7_5)); }
  &:focus-within > label { color: ${({ theme }) => theme.color.link}; }
  > select {
    position: absolute;
    inset: 0;
    inline-size: 100%;
    block-size: 100%;
    opacity: 0;
    font-size: var(--gh-font-section);
    appearance: none;
    cursor: pointer;
    &:disabled { cursor: not-allowed; }
  }
  > svg { position: absolute; inset-inline-end: var(--gh-spacing-2); inset-block-start: 50%; transform: translateY(-50%); color: ${({ theme }) => theme.color.brand}; pointer-events: none; }
  &:has(select:focus-visible) > [data-floating-outline] { ${floatingOutlineFocus} }
  &:has(select:disabled) { color: ${({ theme }) => theme.color.disabledText}; background: ${({ theme }) => theme.color.disabledSurface}; }
`;
export type CompactSelectOption = Readonly<{ value: string; label: string; disabled?: boolean }>;
export function CompactSelect({ options, value, className, ...props }: Omit<ComponentPropsWithoutRef<"select">, "children" | "value"> & {
  options: readonly CompactSelectOption[]; value: string;
}) {
  const id = useId();
  return <SelectFace className={className} data-floating-control>
    <label htmlFor={props.id ?? id}>{props["aria-label"]}</label>
    <FloatingOutline label={props["aria-label"]} />
    <span aria-hidden="true">{options.map((option) => <span key={option.value} data-current={option.value === value || undefined}>{option.label}</span>)}</span>
    <select value={value} {...props} id={props.id ?? id}>{options.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}</select>
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
  gap: var(--gh-spacing-2);
  inline-size: 100%;
  min-inline-size: 0;
  min-block-size: var(--form-control-height);
  padding: var(--gh-spacing-1) var(--gh-spacing-2);
  color: ${({ theme }) => theme.color.text};
  border: 0;
  ${filterButtonColors}
  border-radius: ${({ theme }) => theme.radius.control};
  font: inherit;
  font-size: var(--gh-font-secondary);
  line-height: var(--gh-leading-heading);
  text-align: start;
  cursor: pointer;
  ${controlFeedback}
  > [data-picker-label] { flex: none; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
  > [data-picker-value] { flex: 1; min-inline-size: 0; color: ${({ theme }) => theme.color.mutedText}; text-align: end; }
  > svg { flex: none; font-size: var(--gh-font-section); }
  &[aria-expanded="true"] {  background: ${({ theme }) => theme.color.brandSoft}; }
  ${media.hover} { &:hover { background: ${({ theme }) => theme.color.rowHover}; } }
  ${focusRing}
  ${controlBodyHeight}
`;
const PickerPanel = styled.div`
  position: absolute;
  inset-block-start: calc(100% + var(--gh-spacing-1_5));
  inset-inline-end: 0;
  z-index: var(--gh-layer-toolbar);
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${({ theme }) => theme.space.sm};
  inline-size: min(var(--gh-size-80), var(--picker-max-width, calc(100vw - var(--gh-size-8))));
  padding: ${({ theme }) => theme.space.sm};
  background: var(--filter-panel-background, ${({ theme }) => theme.color.surface});
  border: 0;
  border-radius: ${({ theme }) => theme.radius.overlay};
  box-shadow: ${({ theme }) => theme.shadow.cardHover};
  transition-property: none;
  &[data-picker-floating] {
    max-block-size: var(--picker-max-height);
    overflow-y: auto;
    overscroll-behavior: contain;
    transform: translateX(var(--picker-offset-x, 0px));
  }
  &[data-picker-placement="above"] { inset-block-start: auto; inset-block-end: calc(100% + var(--gh-spacing-1_5)); }
`;
/** Phones list compact 36px rows at 13px; desktop keeps its 40px rows at 15px. */
const PickerSearch = styled.input`
  min-inline-size: 0;
  min-block-size: var(--form-control-height);
  padding-inline: ${({ theme }) => theme.space.sm};
  color: ${({ theme }) => theme.color.text};
  border: 0;
  ${filterControlColors}
  border-radius: ${({ theme }) => theme.radius.control};
  font: inherit;
  font-size: var(--gh-font-body);
  ${controlFeedback}
  ${focusRing}
  ${media.desktop} { min-block-size: var(--form-control-height); font-size: var(--gh-font-reading); }
`;
const PickerList = styled.ul`
  min-inline-size: 0;
  min-block-size: 0;
  max-block-size: var(--gh-size-64);
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
  > li > label {
    display: flex;
    align-items: center;
    gap: var(--gh-spacing-1_5);
    min-block-size: var(--form-control-height);
    padding-inline: ${({ theme }) => theme.space.sm};
    border-radius: ${({ theme }) => theme.radius.small};
    font-size: var(--gh-font-body);
    cursor: pointer;
    ${media.hover} { &:hover { background: ${({ theme }) => theme.color.rowHover}; } }
    &:has(input:checked) { color: ${({ theme }) => theme.color.accent.teal.text}; background: ${({ theme }) => theme.color.brandSoft}; }
    > input { flex: none; inline-size: var(--gh-size-4); block-size: var(--gh-size-4); accent-color: ${({ theme }) => theme.color.brand}; }
    > img { flex: none; inline-size: var(--gh-size-4); block-size: var(--gh-size-4); object-fit: contain; }
    > span { min-inline-size: 0; flex: 1; overflow-wrap: anywhere; }
    > small { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-caption); font-variant-numeric: tabular-nums; }
    ${media.desktop} {
      gap: ${({ theme }) => theme.space.sm};
      min-block-size: var(--form-control-height);
      font-size: var(--gh-font-reading);
      > input { inline-size: var(--gh-size-4_5); block-size: var(--gh-size-4_5); }
      > img { inline-size: var(--gh-size-5); block-size: var(--gh-size-5); }
      > small { font-size: smaller; }
    }
  }
`;
const PickerEmpty = styled.p`
  padding: ${({ theme }) => theme.space.sm};
  color: ${({ theme }) => theme.color.mutedText};
  font-size: var(--gh-font-secondary);
  ${media.desktop} { font-size: var(--gh-font-emphasis); }
`;
const PickerHeading = styled.li`
  padding: var(--gh-spacing-2) var(--gh-spacing-1) var(--gh-spacing-0_5);
  color: ${({ theme }) => theme.color.mutedText};
  font-size: var(--gh-font-secondary);
  font-weight: ${({ theme }) => theme.typography.weight.bold};
`;

/** Full option list behind a chevron: searchable checkboxes, Escape and outside clicks close it. A text filter lists
 * direct matches first and spelling-tolerant ones under `similarLabel`. */
export function OptionPicker({ title, options, selected, onToggle, findLabel, emptyLabel, noMatchLabel, similarLabel, searchable = true, trigger, summary, className }: {
  title: string; options: readonly FilterOption[]; selected: readonly string[]; onToggle: (value: string) => void;
  findLabel: string; emptyLabel: string; noMatchLabel?: string; similarLabel?: string; searchable?: boolean; trigger?: ReactNode;
  summary?: ReactNode; className?: string;
}) {
  const [open, setOpen] = useState(false), [filter, setFilter] = useState("");
  const root = useRef<HTMLDivElement>(null), button = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null), panelId = useId(), similarId = useId();
  const close = useCallback(() => setOpen(false), []);
  useOutsideDismiss({ enabled: open, root, onDismiss: close });
  useLayoutEffect(() => {
    const element = panel.current, anchor = button.current;
    if (!open || !element || !anchor) return;
    const headers = [...document.querySelectorAll<HTMLElement>("[data-app-header]")];
    let frame: number | null = null;
    const update = () => {
      frame = null;
      // PhonePicker deliberately expands in the sheet's normal flow.
      if (getComputedStyle(element).position !== "absolute") {
        delete element.dataset.pickerFloating;
        delete element.dataset.pickerPlacement;
        for (const property of ["--picker-max-width", "--picker-max-height", "--picker-offset-x"]) element.style.removeProperty(property);
        return;
      }
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? document.documentElement.clientWidth, height = viewport?.height ?? window.innerHeight;
      const trigger = anchor.getBoundingClientRect();
      const bottom = top + height;
      const safeTop = headers.reduce((boundary, header) => {
        const bounds = header.getBoundingClientRect(), position = getComputedStyle(header).position;
        return bounds.width > 0 && bounds.height > 0 && bounds.bottom > top && bounds.top < bottom &&
          (position === "sticky" || position === "fixed") ? Math.max(boundary, Math.min(bottom, bounds.bottom)) : boundary;
      }, top);
      if (trigger.bottom <= safeTop || trigger.top >= bottom || trigger.right <= left || trigger.left >= left + width) {
        close();
        return;
      }
      const gutter = 16, gap = 6;
      element.dataset.pickerFloating = "";
      element.style.setProperty("--picker-max-width", `${Math.max(0, width - gutter * 2)}px`);
      // Recover the preferred list height without expanding a scrolled panel and resetting its scroll position.
      const list = element.querySelector("ul");
      const listHeight = list ? Math.min(list.scrollHeight, Number.parseFloat(getComputedStyle(list).maxBlockSize) || list.scrollHeight) : 0;
      const naturalHeight = element.scrollHeight + element.offsetHeight - element.clientHeight + (list ? listHeight - list.clientHeight : 0);
      const below = Math.max(0, bottom - gutter - trigger.bottom - gap);
      const above = Math.max(0, trigger.top - safeTop - gutter - gap);
      const placement = naturalHeight > below && above > below ? "above" : "below";
      element.dataset.pickerPlacement = placement;
      element.style.setProperty("--picker-max-height", `${placement === "above" ? above : below}px`);
      const bounds = element.getBoundingClientRect();
      const previousOffset = Number.parseFloat(element.style.getPropertyValue("--picker-offset-x")) || 0;
      const naturalLeft = bounds.left - previousOffset;
      const clampedLeft = Math.max(left + gutter, Math.min(naturalLeft, left + width - gutter - bounds.width));
      element.style.setProperty("--picker-offset-x", `${clampedLeft - naturalLeft}px`);
    };
    const schedule = () => { if (frame === null) frame = requestAnimationFrame(update); };
    update();
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    observer.observe(anchor);
    for (const header of headers) observer.observe(header);
    if (root.current) observer.observe(root.current);
    if (root.current?.parentElement) observer.observe(root.current.parentElement);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    document.fonts.addEventListener("loadingdone", schedule);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      document.fonts.removeEventListener("loadingdone", schedule);
    };
  }, [open, close]);
  const needle = filter.trim();
  const { exact, similar } = useMemo(() => searchFilterOptions(options, needle), [needle, options]);
  // Tabbing between checkboxes skips the heading, so each similar option is described by it.
  const row = (option: FilterOption, similarOption = false) => <li key={option.value}><label>
    <input type="checkbox" checked={selected.includes(option.value)} onChange={() => onToggle(option.value)}
      aria-describedby={similarOption && similarLabel ? similarId : undefined} />
    <OptionLogo url={option.logoUrl} />
    <span>{option.label}{option.detail && <VisuallyHidden>, {option.detail}</VisuallyHidden>}</span>
    {option.fixtures > 0 && <small aria-hidden="true">{option.fixtures}</small>}
  </label></li>;
  const Trigger = summary ? PickerSummary : IconButton;
  return <PickerRoot className={className} ref={root} onKeyDown={(event) => {
    if (event.key === "Escape" && open) { event.stopPropagation(); setOpen(false); button.current?.focus(); }
  }}>
    <Trigger ref={button} type="button" aria-expanded={open} aria-controls={panelId} aria-label={title} title={title}
      onClick={() => setOpen(!open)}>{summary ?? trigger}{(summary || !trigger) && <ChevronDownIcon />}</Trigger>
    {open && <PickerPanel ref={panel} id={panelId} role="group" aria-label={title} data-option-picker-panel>
      {searchable && <PickerSearch type="search" value={filter} onChange={(event) => setFilter(event.target.value)}
        aria-label={findLabel} placeholder={findLabel} autoFocus />}
      {exact.length + similar.length === 0 ? <PickerEmpty>{needle && noMatchLabel ? noMatchLabel : emptyLabel}</PickerEmpty> : <PickerList>
        {exact.map((option) => row(option))}
        {similar.length > 0 && similarLabel && <PickerHeading id={similarId}>{similarLabel}</PickerHeading>}
        {similar.map((option) => row(option, true))}
      </PickerList>}
    </PickerPanel>}
  </PickerRoot>;
}
