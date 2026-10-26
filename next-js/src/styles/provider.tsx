"use client";

import { useContext, useSyncExternalStore, type ReactNode } from "react";
import { ThemeContext, ThemeProvider } from "styled-components";
import { GlobalStyle } from "./global-style";
import { StyledComponentsRegistry } from "./registry";
import { darkTheme, lightTheme } from "./theme";
import { getServerThemeSnapshot, getThemeSnapshot, subscribeThemePreference, type ThemeMode } from "./theme-preference";
import { webAppearance } from "./web-appearance";

/** Root-only provider; route Server Components remain server-rendered children. */
export function StyleProvider({ children }: { children: ReactNode }) {
  // Server HTML cannot know this profile's preference. Publish metadata only
  // with the resolved client snapshot, so native chrome never adopts SSR light.
  const resolved = useSyncExternalStore<ThemeMode | null>(subscribeThemePreference, getThemeSnapshot, () => null);
  const mode = resolved ?? getServerThemeSnapshot();
  const theme = mode === "dark" ? darkTheme : lightTheme;
  return (
    <StyledComponentsRegistry>
      <ThemeProvider theme={theme}>
        {resolved !== null && <>
          <meta name="goal-hint-appearance" content={JSON.stringify(webAppearance(theme))} />
          <meta name="color-scheme" content={mode} />
          <meta name="theme-color" content={theme.header.background} />
        </>}
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
