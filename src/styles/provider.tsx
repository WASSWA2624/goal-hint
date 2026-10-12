"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { ThemeProvider } from "styled-components";
import { GlobalStyle } from "./global-style";
import { StyledComponentsRegistry } from "./registry";
import { darkTheme, lightTheme } from "./theme";
import { getServerThemeSnapshot, getThemeSnapshot, subscribeThemePreference } from "./theme-preference";

/** Root-only provider; route Server Components remain server-rendered children. */
export function StyleProvider({ children }: { children: ReactNode }) {
  const mode = useSyncExternalStore(subscribeThemePreference, getThemeSnapshot, getServerThemeSnapshot);
  return (
    <StyledComponentsRegistry>
      <ThemeProvider theme={mode === "dark" ? darkTheme : lightTheme}>
        <GlobalStyle />
        {children}
      </ThemeProvider>
    </StyledComponentsRegistry>
  );
}
