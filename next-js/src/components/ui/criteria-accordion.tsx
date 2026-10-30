"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styled, { useTheme } from "styled-components";
import { media } from "@/styles/theme";
import { ChevronDownIcon } from "./icons";

const Disclosure = styled.details`
  min-inline-size: 0;
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.buttonBorder};
  border-radius: ${({ theme }) => theme.radius.surface};
  background: ${({ theme }) => theme.color.surfaceMuted};
  > summary {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    min-block-size: 3rem; padding: 7px 9px; list-style: none; cursor: pointer;
    &::-webkit-details-marker { display: none; }
    > span { display: grid; gap: 3px; min-inline-size: 0; }
    strong { font-size: 0.875rem; }
    small { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; line-height: 1.4; overflow-wrap: anywhere; }
    > svg { flex: none; font-size: 1rem; transition: transform 120ms ease; }
    &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
  }
  &[open] > summary > svg { transform: rotate(180deg); }
  > div { padding: 2px 9px 9px; }
  ${media.belowDesktop} {
    > div > fieldset > legend { position: absolute; inline-size: 1px; block-size: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
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
