"use client";

import styled, { useTheme } from "styled-components";
import { MoonIcon, SunIcon } from "./icons";
import { setThemePreference } from "@/styles/theme-preference";
import { media } from "@/styles/theme";

const Toggle = styled.button`
  display: inline-grid;
  flex: none;
  place-items: center;
  inline-size: 1.75rem;
  block-size: 1.75rem;
  padding: 0;
  color: ${({ theme }) => theme.header.text};
  background: transparent;
  border: 0;
  border-radius: 0;
  font-size: 0.875rem;
  cursor: pointer;
  ${media.desktop} { inline-size: 2rem; block-size: 2rem; font-size: 1rem; }
  ${media.hover} { &:hover { background: ${({ theme }) => theme.header.controlHover}; } }
  &:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.header.accent};
    outline-offset: -4px;
  }
`;

/** One shared title-bar toggle; the provider persists it without wrapping server-rendered content in state. */
export function ThemeToggle() {
  const { mode } = useTheme();
  const label = mode === "dark" ? "Switch to light theme" : "Switch to dark theme";
  return <Toggle type="button" aria-label={label} title={label}
    onClick={() => setThemePreference(mode === "dark" ? "light" : "dark")}>
    {mode === "dark" ? <SunIcon /> : <MoonIcon />}
  </Toggle>;
}
