"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styled, { useTheme } from "styled-components";
import { media } from "@/styles/theme";
import { ChevronDownIcon } from "./icons";
import { mobileFilterPanel } from "./filter-chrome";

const Disclosure = styled.details`
  ${mobileFilterPanel}
  min-inline-size: 0;
  border: 0;
  border-radius: ${({ theme }) => theme.radius.surface};
  background: ${({ theme }) => theme.color.surfaceMuted};
  > summary {
    display: flex; align-items: center; justify-content: space-between; gap: var(--gh-spacing-2);
    min-block-size: var(--form-control-height); padding: var(--gh-spacing-1_75) var(--gh-spacing-2_25); list-style: none; cursor: pointer;
    &::-webkit-details-marker { display: none; }
    > span { display: grid; gap: var(--gh-spacing-0_75); min-inline-size: 0; }
    strong { font-size: var(--gh-font-emphasis); }
    small { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); line-height: var(--gh-leading-compact); overflow-wrap: anywhere; }
    > svg { flex: none; font-size: var(--gh-font-section); transition: transform ${({ theme }) => theme.motion.fast} ${({ theme }) => theme.motion.easing}; }
    &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: var(--gh-size-0_5); }
  }
  &[open] > summary > svg { transform: rotate(180deg); }
  > div { padding: var(--gh-spacing-0_5) var(--gh-spacing-2_25) var(--gh-spacing-2_25); }
  ${media.belowDesktop} {
    > summary, > div { padding-inline: 0; }
    > div > fieldset > legend { position: absolute; inline-size: var(--gh-size-0_25); block-size: var(--gh-size-0_25); padding: 0; margin: calc(-1 * var(--gh-spacing-0_25)); overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  }
  ${media.desktop} {
    border: 0; background: transparent;
    > summary { display: none; }
    > div { padding: 0; }
    /* Modern native disclosures also expose the full form before hydration or without JavaScript. */
    &::details-content { content-visibility: visible; }
  }
`;

/** One native input tree: collapsible on mobile, expanded at the shared desktop breakpoint. */
export function CriteriaAccordion({ group, title, summary, children, defaultOpen = false, invalid = false, validationVersion = 0, resetVersion = 0 }: {
  group: string; title: string; summary: string; children: ReactNode;
  defaultOpen?: boolean; invalid?: boolean; validationVersion?: number; resetVersion?: number;
}) {
  const root = useRef<HTMLDetailsElement>(null), desktop = useRef(false), mobileOpen = useRef(defaultOpen || invalid);
  const previousReset = useRef(resetVersion);
  const [initialOpen] = useState(defaultOpen || invalid), theme = useTheme();
  useEffect(() => {
    const query = window.matchMedia(`(min-width: ${theme.breakpoint.lg})`);
    let firstSync = true;
    const sync = () => {
      const element = root.current;
      if (!element) return;
      // Keep native interactions made while the page was still hydrating.
      if (firstSync && !query.matches) mobileOpen.current = element.open;
      firstSync = false;
      const focusedSummary = element.ownerDocument.activeElement === element.querySelector("summary");
      desktop.current = query.matches;
      // Resizing must not hide a field that still holds keyboard focus.
      if (!query.matches && element.contains(element.ownerDocument.activeElement)) mobileOpen.current = true;
      element.open = query.matches || mobileOpen.current;
      if (query.matches && focusedSummary) element.querySelector<HTMLInputElement>('input:not([type="hidden"]):not(:disabled)')?.focus({ preventScroll: true });
    };
    sync(); query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [theme.breakpoint.lg]);
  useEffect(() => {
    if (previousReset.current === resetVersion) return;
    previousReset.current = resetVersion;
    mobileOpen.current = defaultOpen;
    if (root.current) root.current.open = desktop.current || defaultOpen;
  }, [resetVersion, defaultOpen]);
  useEffect(() => {
    if (!invalid) return;
    mobileOpen.current = true;
    if (root.current) root.current.open = true;
  }, [invalid, validationVersion, resetVersion]);
  return <Disclosure ref={root} open={initialOpen} suppressHydrationWarning data-slip-criteria-group={group}
    onToggle={(event) => { if (!desktop.current) mobileOpen.current = event.currentTarget.open; }}>
    <summary onClick={(event) => { if (desktop.current) event.preventDefault(); }}>
      <span><strong>{title}</strong><small>{summary}</small></span><ChevronDownIcon />
    </summary>
    <div>{children}</div>
  </Disclosure>;
}
