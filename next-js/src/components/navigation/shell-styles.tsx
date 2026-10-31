"use client";

import Link from "@/components/navigation/navigation-link";
import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import styled, { css } from "styled-components";
import { TextLink } from "@/components/ui/controls";
import { Container, desktopContentPadding } from "@/components/ui/layout";
import { compactHeaderBrand, compactHeaderRow, compactHeaderSurface } from "@/components/ui/header-controls";
import { closeDetails, useOutsideDismiss } from "@/components/ui/use-outside-dismiss";
import { media, type AccentName } from "@/styles/theme";

const desktop = media.desktop;
const mobileTabHeight = "3rem";
const focusRing = css`
  &:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: ${({ theme }) => theme.border.focusOffset};
  }
`;
/** Keep the theme's header focus ring inside the bar so it never clips. */
const headerFocus = css`
  &:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.header.accent};
    outline-offset: -4px;
  }
`;

export const ShellFrame = styled.div`
  --app-mobile-tab-height: ${mobileTabHeight};
  --app-header-height: 3rem;
  --app-header-border-width: 1px;
  --app-header-content-height: calc(var(--app-header-height) - var(--app-header-border-width));
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
  /* Above the sticky phone brand bar (30); below the filter popovers (35) and sheets. */
  z-index: 31;
  padding: ${({ theme }) => theme.space.sm};
  border-radius: ${({ theme }) => theme.radius.control};
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};

  /* The inner ring stays visible on both the header and page surfaces. */
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
 * The shared theme surface with a quiet bottom edge. App pages own their phone bar
 * with the same fill, so this one is desktop-only there.
 */
export const Header = styled.header.attrs<{ "data-app-header"?: string }>({ "data-app-header": "" })<{ $app?: boolean }>`
  position: sticky;
  inset-block-start: 0;
  z-index: 20;
  display: ${({ $app }) => $app ? "none" : "block"};
  ${compactHeaderSurface}
  box-shadow: ${({ theme }) => theme.header.shadow};
  ${desktop} { display: block; }
`;

export const HeaderContent = styled(Container)`
  ${compactHeaderRow}
  min-block-size: ${({ theme }) => `calc(${theme.header.phoneHeight} - 1px)`};
  padding-inline: 8px;
  ${desktop} { flex-wrap: nowrap; gap: 16px; min-block-size: var(--app-header-content-height, calc(3rem - 1px)); }
  ${media.wide} { gap: ${({ theme }) => theme.space.md}; }
  ${desktopContentPadding()}
`;

export const HeaderActions = styled.div`
  display: flex;
  flex: 0 1 auto;
  min-inline-size: 0;
  max-inline-size: 100%;
  margin-inline-start: auto;
`;

/** All header variants share the approved compact brand spacing and home target. */
export const HomeLink = styled(TextLink)`
  ${compactHeaderBrand}
  /* Doubled to win over the shared link's page focus ring. */
  &&:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.header.accent};
    outline-offset: -6px;
  }
  ${media.belowDesktop} {
    &&:focus-visible { outline-offset: 2px; }
  }
`;

/** A stable header width lets adaptive destinations use More without moving the other controls. */
export const DesktopNav = styled.nav`
  display: none;
  flex: 1 1 0;
  max-inline-size: 100%;
  min-inline-size: min(6rem, 100%);
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
 * Header links and section icons share the phone tab bar's theme colors. The current
 * page uses stronger text and a 3px accent indicator; hover previews a faint one.
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
    border-radius: ${({ theme }) => theme.radius.control};
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
  gap: 2px;
  min-block-size: ${mobileTabHeight};
  padding: 4px 6px;
  color: ${({ theme }) => theme.header.mutedText};
  font-size: 0.6875rem;
  line-height: 1.25;
  text-align: center;
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  text-decoration: none;
  > svg { flex: none; font-size: 1.25rem; }
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
  flex: none; min-inline-size: 3.5rem; inline-size: max-content;
  > span { white-space: nowrap; }
`;

/** The summary sits on the header; its popup uses the theme's content surface. */
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
  const dismiss = useCallback(() => closeDetails(root.current, () => setOpen(false)), []);
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
  max-block-size: ${({ $mobile }) => $mobile
    ? `calc(100dvh - ${mobileTabHeight} - 9px - env(safe-area-inset-bottom))`
    : "calc(100dvh - var(--app-header-height, 3rem) - 4px - env(safe-area-inset-bottom))"};
  overflow-y: auto;
  margin: 0;
  padding: ${({ theme }) => theme.space.xs};
  list-style: none;
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.overlay};
  box-shadow: ${({ theme }) => theme.shadow.popover};
  a {
    display: flex;
    min-inline-size: 0;
    min-block-size: 2.5rem;
    align-items: center;
    gap: 8px;
    padding-inline: ${({ theme }) => theme.space.md};
    color: ${({ theme }) => theme.color.text};
    border-radius: ${({ theme }) => theme.radius.small};
    text-decoration: none;
    overflow-wrap: anywhere;
    > svg { flex: none; inline-size: 1.125rem; block-size: 1.125rem; }
    > span { min-inline-size: 0; }
    ${media.hover} { &:hover { background: ${({ theme }) => theme.color.rowHover}; } }
    &[aria-current="page"] { color: ${({ theme }) => theme.color.brand}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
    ${focusRing}
  }
  ${({ $mobile }) => $mobile && css`
    a {
      min-block-size: 2.75rem;
      font-size: 0.875rem;
      > svg { inline-size: 1.375rem; block-size: 1.375rem; }
    }
  `}
`;

/** Phone app sections, fixed to the bottom edge. */
export const TabBar = styled.nav`
  position: fixed;
  inset-inline: 0;
  inset-block-end: 0;
  z-index: 20;
  padding-block-end: env(safe-area-inset-bottom);
  background: ${({ theme }) => theme.header.navigationBackground};
  border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.header.border};
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
/** Compact phone targets keep primary destinations and More easy to tap. */
export const TabLink = styled(Link)<{ $tone: AccentName }>`${tabLink}`;

/** Footer clearance matches the phone tab targets, border and safe area. */
export const Footer = styled.footer`
  padding-block: 10px calc(10px + ${mobileTabHeight} + 1px + env(safe-area-inset-bottom));
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
  border-radius: ${({ theme }) => theme.radius.control};
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
