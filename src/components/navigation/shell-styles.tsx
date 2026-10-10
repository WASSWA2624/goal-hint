"use client";

import Link from "next/link";
import styled, { css } from "styled-components";
import { TextLink } from "@/components/ui/controls";
import { Container } from "@/components/ui/layout";
import type { AccentName } from "@/styles/theme";

const desktop = css`@media (min-width: ${({ theme }) => theme.breakpoint.lg})`;
const focusRing = css`
  &:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: ${({ theme }) => theme.border.focusOffset};
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

  &:not(:focus) {
    clip-path: inset(50%);
    inline-size: 1px;
    block-size: 1px;
    min-block-size: 0;
    overflow: hidden;
    white-space: nowrap;
  }
`;

/** App pages own their phone heading, so the bar is desktop-only there. */
export const Header = styled.header<{ $app?: boolean }>`
  position: sticky;
  inset-block-start: 0;
  z-index: 20;
  display: ${({ $app }) => $app ? "none" : "block"};
  background: ${({ theme }) => theme.gradient.edge} bottom / 100% 2px no-repeat, ${({ theme }) => theme.color.surface};
  ${desktop} { display: block; }
`;

export const HeaderContent = styled(Container)`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.lg};
  min-block-size: 3.5rem;
  ${desktop} { gap: ${({ theme }) => theme.space.xl}; min-block-size: 4rem; }
`;

export const HomeLink = styled(TextLink)`
  flex: none;
  display: inline-flex;
  text-decoration: none;
`;

export const DesktopNav = styled.nav`
  display: none;
  align-self: stretch;
  min-inline-size: 0;
  ${desktop} { display: flex; }
`;

export const TopNavList = styled.ul`
  display: flex;
  align-items: stretch;
  gap: ${({ theme }) => theme.space.xs};
  margin: 0;
  padding: 0;
  list-style: none;
  > li { display: flex; position: relative; }
`;

/** Each section's icon carries its own accent, matching the phone tab bar. */
const topLink = css<{ $tone?: AccentName }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding-inline: 12px;
  color: ${({ theme }) => theme.color.text};
  border-block-end: 3px solid transparent;
  white-space: nowrap;
  font-size: 0.9375rem;
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  text-decoration: none;
  cursor: pointer;
  > svg:first-child { flex: none; font-size: 1.125rem; color: ${({ theme, $tone = "teal" }) => theme.color.accent[$tone].solid}; }
  &:hover { color: ${({ theme }) => theme.color.accent.blue.solid}; }
  &[aria-current="page"] {
    color: ${({ theme }) => theme.color.brand};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    background: ${({ theme }) => theme.gradient.action} bottom / 100% 3px no-repeat;
  }
  ${focusRing}
`;
export const TopNavLink = styled(Link)<{ $tone?: AccentName }>`${topLink}`;

export const MoreMenu = styled.details<{ $tone?: AccentName }>`
  display: flex;
  > summary { ${topLink} list-style: none; &::-webkit-details-marker { display: none; } > svg:last-child { font-size: 1rem; } }
  &[open] > summary > svg:last-child { transform: rotate(180deg); }
`;
export const MoreList = styled.ul`
  position: absolute;
  inset-block-start: calc(100% + 4px);
  inset-inline-start: 0;
  z-index: 25;
  min-inline-size: 12rem;
  margin: 0;
  padding: ${({ theme }) => theme.space.xs};
  list-style: none;
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: 6px;
  box-shadow: ${({ theme }) => theme.shadow.cardHover};
  a {
    display: flex;
    min-block-size: 2.5rem;
    align-items: center;
    padding-inline: ${({ theme }) => theme.space.md};
    color: ${({ theme }) => theme.color.text};
    border-radius: 8px;
    text-decoration: none;
    &:hover { background: ${({ theme }) => theme.color.rowHover}; }
    &[aria-current="page"] { color: ${({ theme }) => theme.color.brand}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
    ${focusRing}
  }
`;

export const HeaderSearch = styled.form`
  display: none;
  ${desktop} {
    display: flex;
    flex: 0 1 26rem;
    align-items: center;
    gap: ${({ theme }) => theme.space.sm};
    margin-inline-start: auto;
    padding-inline: ${({ theme }) => theme.space.md};
    min-block-size: 2.5rem;
    color: ${({ theme }) => theme.color.mutedText};
    background: ${({ theme }) => theme.color.surface};
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    border-radius: 10px;
    &:focus-within { border-color: ${({ theme }) => theme.color.brand}; }
    > svg { flex: none; font-size: 1.125rem; }
    > input {
      flex: 1;
      min-inline-size: 0;
      border: 0;
      background: none;
      color: ${({ theme }) => theme.color.text};
      font: inherit;
      font-size: 0.9375rem;
      outline: none;
    }
  }
`;

/** Phone app sections, fixed to the bottom edge. */
export const TabBar = styled.nav`
  position: fixed;
  inset-inline: 0;
  inset-block-end: 0;
  z-index: 20;
  padding-block-end: env(safe-area-inset-bottom);
  background: ${({ theme }) => theme.color.surface};
  border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  box-shadow: 0 -4px 16px rgb(11 31 51 / 6%);
  ${desktop} { display: none; }
`;
export const TabList = styled.ul`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 0;
  padding: 0;
  list-style: none;
`;
/** Each section lights up in its own colour when current. */
export const TabLink = styled(Link)<{ $tone: AccentName }>`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-block-size: 3.125rem;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: 0.625rem;
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  text-decoration: none;
  > svg { font-size: 1.25rem; }
  &[aria-current="page"] {
    color: ${({ theme, $tone }) => theme.color.accent[$tone].solid};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    &::before {
      content: "";
      position: absolute;
      inset-block-start: 0;
      inset-inline: 30%;
      block-size: 3px;
      background: ${({ theme, $tone }) => theme.color.accent[$tone].gradient};
      border-radius: 0 0 3px 3px;
    }
  }
  ${focusRing}
  &:focus-visible { outline-offset: -4px; }
`;

/** Matches the header: white surface, multicolour edge, compact muted links; clears the phone tab bar. */
export const Footer = styled.footer`
  padding-block: 12px calc(12px + 3.25rem + env(safe-area-inset-bottom));
  color: ${({ theme }) => theme.color.mutedText};
  background: ${({ theme }) => theme.gradient.edge} top / 100% 2px no-repeat, ${({ theme }) => theme.color.surface};
  font-size: 0.75rem;
  line-height: 1.4;
  ${desktop} { padding-block: 14px; font-size: 0.8125rem; }
`;
export const FooterContent = styled(Container)`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  justify-items: start;
  gap: 6px;
  @media (min-width: ${({ theme }) => theme.breakpoint.md}) {
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
  &:hover { color: ${({ theme }) => theme.color.accent.blue.solid}; background: ${({ theme }) => theme.color.surfaceMuted}; }
  &[aria-current="page"] { color: ${({ theme }) => theme.color.brand}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  ${focusRing}
`;
export const FooterNote = styled.p`
  margin: 0;
  @media (min-width: ${({ theme }) => theme.breakpoint.md}) { justify-self: end; text-align: end; }
`;
