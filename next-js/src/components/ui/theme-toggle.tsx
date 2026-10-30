"use client";

import styled, { useTheme } from "styled-components";
import { createMessages } from "@/i18n/messages";
import { MoonIcon, SunIcon } from "./icons";
import { setThemePreference } from "@/styles/theme-preference";
import { media } from "@/styles/theme";
import { compactHeaderControl } from "./header-controls";

const Appearance = styled.div`
  display: grid;
  gap: 6px;
  padding: 10px;
  font-size: 0.75rem;
  > span { color: ${({ theme }) => theme.color.mutedText}; }
  > div { display: flex; gap: 4px; }
`;
const Option = styled.button`
  display: inline-flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-block-size: 2.5rem;
  padding: 4px 8px;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.buttonBorder};
  border-radius: ${({ theme }) => theme.radius.control};
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
  &[aria-pressed="true"] { color: ${({ theme }) => theme.color.onBrand}; background: ${({ theme }) => theme.color.brand}; border-color: ${({ theme }) => theme.color.brand}; }
  ${media.hover} { &:hover:not([aria-pressed="true"]) { background: ${({ theme }) => theme.color.rowHover}; } }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
`;

const Toggle = styled.button`
  ${compactHeaderControl}
  inline-size: 2.75rem;
  padding: 4px;
  color: ${({ theme }) => theme.header.text};
  background: transparent;
  border-color: transparent;
  > svg { font-size: 1rem; }
  ${media.desktop} { inline-size: 2rem; }
  ${media.hover} { &:hover { background: ${({ theme }) => theme.header.controlHover}; } }
`;

/** One visible, named header action uses the same persisted theme preference on every screen. */
export function ThemeToggle({ locale = "en" }: { locale?: string }) {
  const { mode } = useTheme();
  const nextMode = mode === "light" ? "dark" : "light";
  const messages = createMessages(locale);
  const label = messages.text(nextMode === "light" ? "navigation.switchToLight" : "navigation.switchToDark");
  return <Toggle type="button" aria-label={label} title={label} onClick={() => setThemePreference(nextMode)} data-theme-toggle>
    {nextMode === "light" ? <SunIcon /> : <MoonIcon />}
  </Toggle>;
}

/** Retained for appearance settings outside the header. */
export function ThemeSelector({ locale = "en" }: { locale?: string }) {
  const { mode } = useTheme();
  const messages = createMessages(locale);
  const label = messages.text("navigation.appearance");
  return <Appearance>
    <span>{label}</span>
    <div role="group" aria-label={label}>
      <Option type="button" aria-pressed={mode === "light"} onClick={() => setThemePreference("light")}><SunIcon />{messages.text("navigation.themeLight")}</Option>
      <Option type="button" aria-pressed={mode === "dark"} onClick={() => setThemePreference("dark")}><MoonIcon />{messages.text("navigation.themeDark")}</Option>
    </div>
  </Appearance>;
}
