"use client";

import styled, { useTheme } from "styled-components";
import { createMessages } from "@/i18n/messages";
import { MoonIcon, SunIcon } from "./icons";
import { setThemePreference } from "@/styles/theme-preference";
import { media } from "@/styles/theme";

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
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
  border-radius: 0;
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
  &[aria-pressed="true"] { color: ${({ theme }) => theme.color.onBrand}; background: ${({ theme }) => theme.color.brand}; border-color: ${({ theme }) => theme.color.brand}; }
  ${media.hover} { &:hover:not([aria-pressed="true"]) { background: ${({ theme }) => theme.color.rowHover}; } }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
`;

/** Appearance stays in the shared menu and preserves the existing persisted preference. */
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
