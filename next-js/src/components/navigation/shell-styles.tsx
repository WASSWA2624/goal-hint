"use client";

import Link from "@/components/navigation/navigation-link";
import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import styled, { css } from "styled-components";
import { TextLink } from "@/components/ui/controls";
import { controlBodyHeight } from "@/components/ui/control-layout";
import { Container, contentGutter, desktopContentPadding } from "@/components/ui/layout";
import { compactHeaderBrand, compactHeaderRow, compactHeaderSurface } from "@/components/ui/header-controls";
import { closeDetails, useOutsideDismiss } from "@/components/ui/use-outside-dismiss";
import { media, type AccentName } from "@/styles/theme";

const desktop = media.desktop;
const mobileTabHeight = "var(--form-control-height)";
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
    outline-offset: calc(-1 * var(--gh-size-1));
  }
`;

export const ShellFrame = styled.div.attrs<{ "data-app-shell"?: string }>({ "data-app-shell": "" })`
  --app-content-gutter: 0px;
  --app-mobile-tab-height: ${mobileTabHeight};
  --app-header-height: ${({ theme }) => theme.header.phoneHeight};
  --app-header-border-width: ${({ theme }) => theme.border.width};
  --app-header-content-height: calc(var(--app-header-height) - var(--app-header-border-width));
  display: flex;
  flex-direction: column;
  min-block-size: 100dvh;
  min-inline-size: 0;
  padding-inline: ${({ theme }) => theme.layout.gutter};

  > main { flex: 1; }
  ${media.desktop} { --app-header-height: ${({ theme }) => theme.header.desktopHeight}; }
`;

export const SkipLink = styled.a`
  display: inline-flex;
  align-items: center;
  min-block-size: ${({ theme }) => theme.control.minHeight};
  max-inline-size: calc(100% - var(--gh-size-8));
  position: fixed;
  inset-block-start: ${({ theme }) => theme.space.sm};
  inset-inline-start: ${({ theme }) => theme.space.md};
  /* Above the sticky phone brand bar (30); below the filter popovers (35) and sheets. */
  z-index: var(--gh-layer-popoverControl);
  padding: ${({ theme }) => theme.space.sm};
  border-radius: ${({ theme }) => theme.radius.control};
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};

  /* The inner ring stays visible on both the header and page surfaces. */
  &:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: calc(-1 * var(--gh-size-1_5));
    box-shadow: 0 0 0 var(--gh-size-0_75) ${({ theme }) => theme.header.accent};
  }

  &:not(:focus) {
    clip-path: inset(50%);
    inline-size: var(--gh-size-0_25);
    block-size: var(--gh-size-0_25);
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
  z-index: var(--gh-layer-navigation);
  display: ${({ $app }) => $app ? "none" : "block"};
  ${compactHeaderSurface}
  box-shadow: ${({ theme }) => theme.header.shadow};
  ${desktop} { display: block; background: ${({ theme }) => theme.header.desktopBackground}; }
`;

export const HeaderContent = styled(Container)`
  ${compactHeaderRow}
  min-block-size: ${({ theme }) => theme.header.phoneHeight};
  padding-inline: ${contentGutter};
  ${desktop} { flex-wrap: nowrap; gap: var(--gh-spacing-4); min-block-size: var(--app-header-content-height, calc(var(--gh-size-12) - var(--gh-size-0_25))); }
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
    outline-offset: calc(-1 * var(--gh-size-1_5));
  }
  ${media.belowDesktop} {
    &&:focus-visible { outline-offset: var(--gh-size-0_5); }
  }
`;

/** A stable header width lets adaptive destinations use More without moving the other controls. */
export const DesktopNav = styled.nav`
  display: none;
  flex: 1 1 0;
  max-inline-size: 100%;
  min-inline-size: min(var(--gh-size-24), 100%);
  align-self: stretch;
  ${desktop} { display: flex; }
`;

export const TopNavList = styled.ul`
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: ${({ theme }) => theme.space.xs};
  margin: 0;
  padding: 0;
  list-style: none;
  block-size: 100%;
  > li { display: flex; position: relative; }
`;

/** One persistent selection treatment for primary, phone and overflow destinations. */
const currentNavigationItem = css`
  &[aria-current="page"] {
    color: ${({ theme }) => theme.color.link};
    background: ${({ theme }) => theme.color.brandSoft};
    font-weight: ${({ theme }) => theme.typography.weight.semibold};
    > svg:first-child { color: inherit; }
    &::after {
      content: "";
      position: absolute;
      inset-inline: ${({ theme }) => theme.space.sm};
      inset-block-end: 0;
      block-size: ${({ theme }) => theme.border.strong};
      background: currentColor;
    }
  }
`;

/** Header links and section icons share the phone tab bar's theme colors. */
const topLink = css<{ $tone?: AccentName }>`
  ${controlBodyHeight}
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--gh-spacing-1_5);
  padding-inline: var(--gh-spacing-3);
  color: ${({ theme }) => theme.header.mutedText};
  border-block-end: 0;
  white-space: nowrap;
  font-size: var(--gh-font-reading);
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  text-decoration: none;
  cursor: pointer;
  > svg:first-child { flex: none; font-size: var(--gh-font-title); color: ${({ theme, $tone = "teal" }) => theme.header.tone[$tone]}; }
  ${media.hover} {
    &:hover { color: ${({ theme }) => theme.header.text}; background: ${({ theme }) => theme.header.controlHover}; }
  }
  ${currentNavigationItem}
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
  gap: var(--gh-spacing-0_5);
  min-block-size: ${mobileTabHeight};
  padding: var(--gh-spacing-0_5) var(--gh-spacing-1_5);
  color: ${({ theme }) => theme.header.mutedText};
  font-size: var(--gh-font-caption);
  line-height: var(--gh-leading-heading);
  text-align: center;
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  text-decoration: none;
  > svg { flex: none; font-size: var(--gh-font-heading); }
  > span { min-inline-size: 0; overflow-wrap: anywhere; }
  ${currentNavigationItem}
  ${focusRing}
  &:focus-visible { outline-color: ${({ theme }) => theme.header.accent}; outline-offset: calc(-1 * var(--gh-size-1)); }
`;
export const TabMeasure = styled.span<{ $tone?: AccentName }>`
  ${tabLink}
  flex: none; min-inline-size: var(--gh-size-14); inline-size: max-content;
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
  &[open] > summary:not([aria-current="page"]) { color: ${({ theme }) => theme.header.text}; }
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
  inset-block-start: ${({ $mobile }) => $mobile ? "auto" : "calc(100% + var(--gh-size-1))"};
  inset-block-end: ${({ $mobile }) => $mobile ? "calc(100% + var(--gh-size-1))" : "auto"};
  inset-inline-end: 0;
  z-index: var(--gh-layer-menu);
  min-inline-size: min(var(--gh-size-48), calc(100vw - var(--gh-size-4)));
  max-inline-size: calc(100vw - var(--gh-size-4));
  ${({ $mobile }) => $mobile && css`inline-size: min(var(--gh-size-64), calc(100vw - var(--gh-size-4)));`}
  max-block-size: ${({ $mobile }) => $mobile
    ? `calc(100dvh - ${mobileTabHeight} - var(--gh-spacing-2_25) - env(safe-area-inset-bottom))`
    : "calc(100dvh - var(--app-header-height, var(--gh-size-12)) - var(--gh-size-1) - env(safe-area-inset-bottom))"};
  overflow-y: auto;
  margin: 0;
  padding: ${({ theme }) => theme.space.xs};
  list-style: none;
  background: ${({ theme }) => theme.color.surface};
  border: 0;
  border-radius: ${({ theme }) => theme.radius.overlay};
  box-shadow: ${({ theme }) => theme.shadow.popover};
  a, button[data-community-entry] {
    inline-size: 100%; border: 0; background: transparent; font: inherit; text-align: start; cursor: pointer;
    position: relative;
    display: flex;
    min-inline-size: 0;
    min-block-size: var(--form-control-height);
    align-items: center;
    gap: var(--gh-spacing-2);
    padding-inline: ${({ theme }) => theme.space.md};
    color: ${({ theme }) => theme.color.text};
    border-radius: ${({ theme }) => theme.radius.small};
    text-decoration: none;
    overflow-wrap: anywhere;
    > svg { flex: none; inline-size: var(--gh-size-4_5); block-size: var(--gh-size-4_5); }
    > span { min-inline-size: 0; }
    ${media.hover} { &:hover { background: ${({ theme }) => theme.color.rowHover}; } }
    ${currentNavigationItem}
    ${focusRing}
  }
  ${({ $mobile }) => $mobile && css`
    a, button[data-community-entry] {
      min-block-size: var(--form-control-height);
      font-size: var(--gh-font-emphasis);
      > svg { inline-size: var(--gh-size-5_5); block-size: var(--gh-size-5_5); }
    }
  `}
`;

/** Phone app sections, fixed to the bottom edge. */
export const TabBar = styled.nav`
  position: fixed;
  inset-inline: 0;
  inset-block-end: 0;
  z-index: var(--gh-layer-navigation);
  padding-block-end: env(safe-area-inset-bottom);
  background: ${({ theme }) => theme.header.navigationBackground};
  border-block-start: 0;
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
export const Footer = styled.footer.attrs<{ "data-app-footer"?: string }>({ "data-app-footer": "" })`
  padding-block: var(--gh-spacing-2_5) calc(var(--gh-spacing-2_5) + ${mobileTabHeight} + var(--gh-size-0_25) + env(safe-area-inset-bottom));
  color: ${({ theme }) => theme.footer.mutedText};
  background: ${({ theme }) => theme.footer.background};
  border-block-start: 0;
  font-size: var(--gh-font-secondary);
  line-height: var(--gh-leading-compact);
  ${desktop} { padding-block: var(--gh-spacing-3_5); font-size: var(--gh-font-body); }
`;
export const FooterContent = styled(Container)`
  padding-inline: ${({ theme }) => theme.layout.sectionPadding};
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  justify-items: start;
  gap: var(--gh-spacing-1_5);
  ${media.tablet} {
    grid-template-columns: auto auto minmax(0, 1fr);
    align-items: center;
    gap: var(--gh-spacing-2) var(--gh-spacing-6);
  }
`;
export const FooterBrand = styled.div`
  display: inline-flex;
  align-items: center;
  gap: var(--gh-spacing-0_5);
  color: ${({ theme }) => theme.footer.text};
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  white-space: nowrap;
  > span:first-child { padding: 0 var(--gh-spacing-1) 0 0; }
  > span:first-child > img { inline-size: var(--gh-size-5); block-size: var(--gh-size-5); }
`;
export const FooterLinks = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: var(--gh-spacing-0_5) var(--gh-spacing-1);
  margin: 0 0 0 calc(-1 * var(--gh-spacing-2));
  padding: 0;
  list-style: none;
`;
export const FooterLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  min-block-size: var(--form-control-height);
  padding-inline: var(--gh-spacing-2);
  color: ${({ theme }) => theme.footer.mutedText};
  border-radius: ${({ theme }) => theme.radius.control};
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  text-decoration: none;
  ${media.hover} { &:hover { color: ${({ theme }) => theme.footer.link}; background: ${({ theme }) => theme.footer.hoverBackground}; } }
  &[aria-current="page"] { color: ${({ theme }) => theme.footer.link}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  ${focusRing}
`;
export const FooterNote = styled.p`
  margin: 0;
  ${media.tablet} { justify-self: end; text-align: end; }
`;

/** Admin and member workspaces use the same header rail as the app. */
export const WorkspaceHeaderContent = styled(HeaderContent)`
  inline-size: 100%; max-inline-size: none;
  min-block-size: ${({ theme }) => theme.header.phoneHeight};
  padding-inline: ${contentGutter};
  ${media.belowDesktop} {
    > ${HomeLink} { flex: 1 1 0; min-inline-size: min(var(--gh-size-24), 100%);
      img { max-inline-size: 100%; block-size: auto; }
    }
  }
  ${media.desktop} { gap: var(--gh-spacing-4); min-block-size: var(--app-header-content-height, calc(var(--gh-size-12) - var(--gh-size-0_25))); }
`;
