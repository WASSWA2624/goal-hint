"use client";

import Link from "next/link";
import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import styled, { css } from "styled-components";
import { TextLink } from "@/components/ui/controls";
import { Container } from "@/components/ui/layout";
import { useOutsideDismiss } from "@/components/ui/use-outside-dismiss";
import { media, type AccentName } from "@/styles/theme";

const desktop = media.desktop;
const focusRing = css`
  &:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: ${({ theme }) => theme.border.focusOffset};
  }
`;
/** On the dark bar the ring is inverse teal (5:1 on every stop), drawn inside so the bar never clips it. */
const headerFocus = css`
  &:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.header.accent};
    outline-offset: -4px;
  }
`;

export const ShellFrame = styled.div`
  display: flex;
  flex-direction: column;
  min-block-size: 100dvh;

  > main { flex: 1; }
`;

export const SkipLink = styled.a`
  display: inline-flex;
  align-items: center;
  min-block-size: ${({ theme }) => theme.control.minHeight};
  max-inline-size: calc(100% - 32px);
  position: fixed;
  inset-block-start: ${({ theme }) => theme.space.sm};
  inset-inline-start: ${({ theme }) => theme.space.md};
  z-index: 30;
  padding: ${({ theme }) => theme.space.sm};
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};

  /* A navy ring inside the white box reads on the dark bar and on the light page alike. */
  &:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: -6px;
    box-shadow: 0 0 0 3px ${({ theme }) => theme.header.accent};
  }

  &:not(:focus) {
    clip-path: inset(50%);
    inline-size: 1px;
    block-size: 1px;
    min-block-size: 0;
    overflow: hidden;
    white-space: nowrap;
  }
`;

/**
 * The branded bar: solid navy/charcoal behind the inverse logo, with the teal brand edge along
 * the bottom. App pages own their phone bar (same fill), so this one is desktop-only there.
 */
export const Header = styled.header<{ $app?: boolean }>`
  position: sticky;
  inset-block-start: 0;
  z-index: 20;
  display: ${({ $app }) => $app ? "none" : "block"};
  color: ${({ theme }) => theme.header.text};
  background: ${({ theme }) => theme.header.background};
  border-block-end: 2px solid ${({ theme }) => theme.header.accent};
  box-shadow: ${({ theme }) => theme.header.shadow};
  ${desktop} { display: block; }
`;

export const HeaderContent = styled(Container)`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.sm};
  min-block-size: ${({ theme }) => theme.header.phoneHeight};
  ${desktop} { flex-wrap: nowrap; gap: 12px; min-block-size: 4rem; }
  ${media.wide} { gap: ${({ theme }) => theme.space.md}; }
`;

export const HeaderActions = styled.div`
  display: flex;
  flex: none;
  margin-inline-start: auto;
`;

/**
 * Desktop keeps the logo's 12px clear space, and the focus ring sits inside it. Below desktop the
 * logo sits at the brand-kit minimum (160px) on the page gutter, like the feed's phone bar: the
 * artwork's own margin plus the bar's 7.5px above and below exceed a quarter of the displayed mark.
 */
export const HomeLink = styled(TextLink)`
  flex: none;
  display: inline-flex;
  text-decoration: none;
  /* Doubled to win over the shared link's navy ring. */
  &&:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.header.accent};
    outline-offset: -6px;
  }
  ${media.belowDesktop} {
    > span { padding: 0; }
    > span > img { inline-size: 160px; }
    &&:focus-visible { outline-offset: 2px; }
  }
`;

/** A stable header width lets adaptive destinations use More without moving the other controls. */
export const DesktopNav = styled.nav`
  display: none;
  flex: 1 1 0;
  max-inline-size: 100%;
  min-inline-size: 0;
  align-self: stretch;
  ${desktop} { display: flex; }
`;

export const TopNavList = styled.ul`
  display: flex;
  flex-wrap: nowrap;
  align-items: stretch;
  gap: ${({ theme }) => theme.space.xs};
  margin: 0;
  padding: 0;
  list-style: none;
  block-size: 100%;
  > li { display: flex; position: relative; }
`;

/**
 * Light links on the dark bar; each section's icon keeps its own hue as a light tint, matching the
 * phone tab bar. The current page turns white and bold over a 3px inverse-teal indicator that rests
 * on the brand edge; hover previews a faint one.
 */
const topLink = css<{ $tone?: AccentName }>`
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding-inline: 12px;
  color: ${({ theme }) => theme.header.mutedText};
  border-block-end: 3px solid transparent;
  white-space: nowrap;
  font-size: 0.9375rem;
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  text-decoration: none;
  cursor: pointer;
  > svg:first-child { flex: none; font-size: 1.125rem; color: ${({ theme, $tone = "teal" }) => theme.header.tone[$tone]}; }
  &::after {
    content: "";
    position: absolute;
    inset-inline: 12px;
    inset-block-end: -1px;
    block-size: 3px;
    border-radius: 0;
  }
  ${media.hover} {
    &:hover { color: ${({ theme }) => theme.header.text}; }
    &:hover::after { background: ${({ theme }) => theme.header.controlBorder}; }
  }
  &[aria-current="page"] {
    color: ${({ theme }) => theme.header.text};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    &::after { background: ${({ theme }) => theme.header.accent}; }
  }
  ${headerFocus}
`;
export const TopNavLink = styled(Link)<{ $tone?: AccentName }>`${topLink}`;
/** Noninteractive intrinsic-width measurements reuse the actual link typography and padding. */
export const TopNavMeasure = styled.span<{ $tone?: AccentName }>`flex: none; ${topLink}`;

/** Shared by primary destination links and the native More disclosure in the equally spaced phone bar. */
const tabLink = css`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  min-block-size: 2.625rem;
  padding: 3px 4px;
  color: ${({ theme }) => theme.header.text};
  font-size: 0.625rem;
  line-height: 1.25;
  text-align: center;
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  text-decoration: none;
  > svg { flex: none; font-size: 1.125rem; }
  > span { min-inline-size: 0; overflow-wrap: anywhere; }
  &[aria-current="page"] {
    color: ${({ theme }) => theme.header.accent};
    background: transparent;
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    &::before {
      content: "";
      position: absolute;
      inset-block-start: 0;
      inset-inline: 10%;
      block-size: 2px;
      background: ${({ theme }) => theme.header.accent};
    }
  }
  ${focusRing}
  &:focus-visible { outline-color: ${({ theme }) => theme.header.accent}; outline-offset: -4px; }
`;
export const TabMeasure = styled.span<{ $tone?: AccentName }>`
  ${tabLink}
  flex: none; min-inline-size: 2.75rem; inline-size: max-content;
  > span { white-space: nowrap; }
`;

/** The summary sits on the bar; its popup stays a light surface with dark links. */
const MoreMenuDetails = styled.details<{ $tone?: AccentName; $mobile?: boolean }>`
  position: relative;
  display: flex;
  ${({ $mobile }) => $mobile && css`inline-size: 100%;`}
  > summary {
    ${({ $mobile }) => $mobile ? tabLink : topLink}
    ${({ $mobile }) => $mobile && css`inline-size: 100%;`}
    list-style: none;
    &::-webkit-details-marker { display: none; }
  }
  &[open] > summary { color: ${({ theme }) => theme.header.text}; }
`;

/** Keep native summary toggling, with the same dismissal behavior as the filter popovers. */
export function MoreMenu({ children, label, current = false, $tone = "blue", $mobile = false }: {
  children: ReactNode; label: ReactNode; current?: boolean; $tone?: AccentName; $mobile?: boolean;
}) {
  const root = useRef<HTMLDetailsElement>(null);
  const popupId = useId();
  const [open, setOpen] = useState(false);
  const dismiss = useCallback(() => {
    const menu = root.current;
    if (!menu) return;
    const trigger = menu.querySelector("summary");
    const restoreFocus = menu.contains(menu.ownerDocument.activeElement) && menu.ownerDocument.activeElement !== trigger;
    menu.open = false;
    setOpen(false);
    if (restoreFocus) trigger?.focus({ preventScroll: true });
  }, []);
  useOutsideDismiss({ enabled: open, root, onDismiss: dismiss });
  return <MoreMenuDetails ref={root} $tone={$tone} $mobile={$mobile} onToggle={(event) => setOpen(event.currentTarget.open)}
    onKeyDown={(event) => {
      if (event.key !== "Escape" || !root.current?.open) return;
      event.preventDefault();
      event.stopPropagation();
      dismiss();
      root.current.querySelector("summary")?.focus({ preventScroll: true });
    }}
    onClick={(event) => { if (event.target instanceof Element && event.target.closest("a")) dismiss(); }}>
    <summary aria-controls={popupId} aria-current={current ? "page" : undefined}>{label}</summary>
    <div id={popupId}>{children}</div>
  </MoreMenuDetails>;
}
export const MoreList = styled.ul<{ $mobile?: boolean }>`
  position: absolute;
  inset-block-start: ${({ $mobile }) => $mobile ? "auto" : "calc(100% + 4px)"};
  inset-block-end: ${({ $mobile }) => $mobile ? "calc(100% + 4px)" : "auto"};
  inset-inline-end: 0;
  z-index: 25;
  min-inline-size: min(12rem, calc(100vw - 16px));
  max-inline-size: calc(100vw - 16px);
  ${({ $mobile }) => $mobile && css`inline-size: min(16rem, calc(100vw - 16px));`}
  max-block-size: calc(100dvh - 4rem - env(safe-area-inset-bottom));
  overflow-y: auto;
  margin: 0;
  padding: ${({ theme }) => theme.space.xs};
  list-style: none;
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: 0;
  box-shadow: ${({ theme }) => theme.shadow.cardHover};
  a {
    display: flex;
    min-inline-size: 0;
    min-block-size: 2.5rem;
    align-items: center;
    gap: 8px;
    padding-inline: ${({ theme }) => theme.space.md};
    color: ${({ theme }) => theme.color.text};
    border-radius: 0;
    text-decoration: none;
    overflow-wrap: anywhere;
    > svg { flex: none; inline-size: 1.125rem; block-size: 1.125rem; }
    > span { min-inline-size: 0; }
    ${media.hover} { &:hover { background: ${({ theme }) => theme.color.rowHover}; } }
    &[aria-current="page"] { color: ${({ theme }) => theme.color.brand}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
    ${focusRing}
  }
`;

/**
 * A square search field on the bar. White text and the placeholder keep 4.5:1 over the teal stop at
 * rest and when focused; focus draws a 2px inverse-teal ring. Dark color-scheme lightens the native
 * clear button.
 */
export const HeaderSearch = styled.form`
  display: none;
  ${desktop} {
    display: flex;
    flex: 0 1 14rem;
    max-inline-size: 26rem;
    min-inline-size: 6rem;
    align-items: center;
    gap: ${({ theme }) => theme.space.sm};
    margin-inline-start: auto;
    padding-inline: ${({ theme }) => theme.space.md};
    min-block-size: 2.5rem;
    color: ${({ theme }) => theme.header.mutedText};
    background: ${({ theme }) => theme.header.fieldFill};
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.header.controlBorder};
    border-radius: 0;
    transition: background-color 120ms ease, border-color 120ms ease;
    &:focus-within {
      color: ${({ theme }) => theme.header.text};
      background: ${({ theme }) => theme.header.fieldFillActive};
      border-color: ${({ theme }) => theme.header.accent};
      box-shadow: 0 0 0 1px ${({ theme }) => theme.header.accent};
    }
    > svg { flex: none; font-size: 1.125rem; }
    > input {
      flex: 1;
      min-inline-size: 0;
      border: 0;
      background: none;
      color: ${({ theme }) => theme.header.text};
      caret-color: ${({ theme }) => theme.header.accent};
      color-scheme: dark;
      font: inherit;
      font-size: 0.9375rem;
      outline: none;
      &::placeholder { color: ${({ theme }) => theme.header.placeholder}; opacity: 1; }
    }
  }
  ${media.hover} { &:hover { background: ${({ theme }) => theme.header.fieldFillActive}; } }
`;

/** Phone app sections, fixed to the bottom edge. */
export const TabBar = styled.nav`
  position: fixed;
  inset-inline: 0;
  inset-block-end: 0;
  z-index: 20;
  padding-block-end: env(safe-area-inset-bottom);
  background: ${({ theme }) => theme.header.background};
  border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.header.controlBorder};
  box-shadow: none;
  ${desktop} { display: none; }
`;
export const TabList = styled.ul`
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  margin: 0;
  padding: 0;
  list-style: none;
`;
/** A distinct 42px bar keeps the generated primary destinations and More available. */
export const TabLink = styled(Link)<{ $tone: AccentName }>`${tabLink}`;

/** A quiet surface with compact links; its bottom clearance matches the slim phone tab bar. */
export const Footer = styled.footer`
  padding-block: 10px calc(10px + 2.625rem + env(safe-area-inset-bottom));
  color: ${({ theme }) => theme.color.mutedText};
  background: ${({ theme }) => theme.color.surface};
  border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  font-size: 0.75rem;
  line-height: 1.4;
  ${desktop} { padding-block: 14px; font-size: 0.8125rem; }
`;
export const FooterContent = styled(Container)`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  justify-items: start;
  gap: 6px;
  ${media.tablet} {
    grid-template-columns: auto auto minmax(0, 1fr);
    align-items: center;
    gap: 8px 24px;
  }
`;
export const FooterBrand = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: ${({ theme }) => theme.color.text};
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  white-space: nowrap;
  > span:first-child { padding: 0 4px 0 0; }
  > span:first-child > img { inline-size: 20px; block-size: 20px; }
`;
export const FooterLinks = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 2px 4px;
  margin: 0 0 0 -8px;
  padding: 0;
  list-style: none;
`;
export const FooterLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  min-block-size: 1.75rem;
  padding-inline: 8px;
  color: ${({ theme }) => theme.color.mutedText};
  border-radius: 4px;
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  text-decoration: none;
  ${media.hover} { &:hover { color: ${({ theme }) => theme.color.accent.blue.solid}; background: ${({ theme }) => theme.color.surfaceMuted}; } }
  &[aria-current="page"] { color: ${({ theme }) => theme.color.brand}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  ${focusRing}
`;
export const FooterNote = styled.p`
  margin: 0;
  ${media.tablet} { justify-self: end; text-align: end; }
`;
