"use client";

import { useContext, useSyncExternalStore, type ReactNode } from "react";
import { ThemeContext, ThemeProvider } from "styled-components";
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

const subscribeNothing = () => () => {};
const themes = { light: lightTheme, dark: darkTheme };

/**
 * A streamed Suspense boundary can hydrate after the root has already switched to the visitor's theme. Its server
 * HTML carries server-theme class names, so it hydrates under the server theme and only then follows the root theme.
 */
export function ServerThemeUntilHydrated({ children }: { children: ReactNode }) {
  const hydrated = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const theme = useContext(ThemeContext);
  return <ThemeProvider theme={hydrated && theme ? theme : themes[getServerThemeSnapshot()]}>{children}</ThemeProvider>;
}

/**
 * Next renders the root not-found page without the root layout when it rejects a URL-encoded
 * Server Action request; supply the root provider only there, never a second one under the layout.
 */
export function FallbackStyleProvider({ children }: { children: ReactNode }) {
  return useContext(ThemeContext) ? children : <StyleProvider>{children}</StyleProvider>;
}
