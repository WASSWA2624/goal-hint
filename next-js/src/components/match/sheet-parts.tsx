"use client";

import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";
import styled, { css, keyframes } from "styled-components";
import { media } from "@/styles/theme";
import { IconButton } from "./filter-parts";

/** Phone bottom sheets: the filter editor and the date calendar. Desktop never shows them. */
const phoneMedia = media.belowDesktop.replace("@media ", "");
const focusable = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
const sheetIn = keyframes`from { transform: translateY(1.5rem); opacity: 0; }`;

export const SheetScrim = styled.div`
  position: fixed;
  inset: 0;
  z-index: 59;
  background: ${({ theme }) => theme.color.scrim};
  ${media.desktop} { display: none; }
`;
/** Fixed above the tab bar; no ancestor of a sheet may be a size container, which would trap it. */
export const sheetFrame = css`
  position: fixed;
  inset-inline: 0;
  inset-block-end: 0;
  z-index: 60;
  flex-direction: column;
  max-block-size: calc(100dvh - 3rem);
  max-inline-size: 40rem;
  margin-inline: auto;
  padding-block-end: env(safe-area-inset-bottom);
  background: ${({ theme }) => theme.color.surface};
  border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  box-shadow: ${({ theme }) => theme.shadow.popover};
  outline: none;
  animation: ${sheetIn} 180ms ease-out;
  @media (prefers-reduced-motion: reduce) { animation: none; }
`;
export const SheetHeader = styled.div`
  display: none;
  ${media.belowDesktop} {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 2px 2px 2px 14px;
    border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    > h2 { margin: 0; font-size: 1rem; font-weight: ${({ theme }) => theme.typography.weight.heavy}; line-height: 1.3; }
  }
`;
export const SheetClose = styled(IconButton)`
  inline-size: 2.75rem;
  block-size: 2.75rem;
  font-size: 1.25rem;
`;

/** Tab and Shift+Tab cycle within an open sheet. */
export function keepFocusInSheet(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>(focusable)].filter((item) => item.getClientRects().length > 0);
  const first = items[0], last = items.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

/**
 * While a sheet is open: focus moves into it, the page behind stops scrolling, and widening to
 * desktop closes it. `focusTarget` picks the first focused element; the sheet itself otherwise.
 */
export function usePhoneSheet(open: boolean, sheet: RefObject<HTMLElement | null>, onClose: () => void, focusTarget?: () => HTMLElement | null) {
  // Focus moves once per opening, so the latest callbacks are read without re-running the effect.
  const latest = useRef({ onClose, focusTarget });
  useEffect(() => { latest.current = { onClose, focusTarget }; });
  useEffect(() => {
    if (!open) return;
    const phone = window.matchMedia(phoneMedia);
    if (!phone.matches) { latest.current.onClose(); return; }
    (latest.current.focusTarget?.() ?? sheet.current)?.focus();
    const root = document.documentElement, overflow = root.style.overflow;
    root.style.overflow = "hidden";
    const widened = (event: MediaQueryListEvent) => { if (!event.matches) latest.current.onClose(); };
    phone.addEventListener("change", widened);
    return () => { root.style.overflow = overflow; phone.removeEventListener("change", widened); };
  }, [open, sheet]);
}
