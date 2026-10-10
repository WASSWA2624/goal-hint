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

export const NavigationList = styled.ul`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space.sm};
  margin: 0;
  padding: 0;
  list-style: none;

  > li { min-inline-size: 0; max-inline-size: 100%; }
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

const topLink = css`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding-inline: 12px;
  color: ${({ theme }) => theme.color.text};
  border-block-end: 3px solid transparent;
  white-space: nowrap;
  font-size: 0.9375rem;
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  text-decoration: none;
  cursor: pointer;
  &:hover { color: ${({ theme }) => theme.color.accent.blue.solid}; }
  &[aria-current="page"] {
    color: ${({ theme }) => theme.color.brand};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    background: ${({ theme }) => theme.gradient.action} bottom / 100% 3px no-repeat;
  }
  ${focusRing}
`;
export const TopNavLink = styled(Link)`${topLink}`;

export const MoreMenu = styled.details`
  display: flex;
  > summary { ${topLink} list-style: none; &::-webkit-details-marker { display: none; } > svg { font-size: 1rem; } }
  &[open] > summary > svg { transform: rotate(180deg); }
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
  border-radius: 12px;
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

export const Footer = styled.footer`
  padding-block: ${({ theme }) => theme.space.lg} calc(${({ theme }) => theme.space.lg} + 3.25rem + env(safe-area-inset-bottom));
  border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  ${desktop} { padding-block-end: ${({ theme }) => theme.space.lg}; }

  a[aria-current="page"] {
    color: ${({ theme }) => theme.color.text};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    text-decoration-thickness: 0.15em;
  }
`;
