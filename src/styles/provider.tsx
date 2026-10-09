"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "styled-components";
import { GlobalStyle } from "./global-style";
import { StyledComponentsRegistry } from "./registry";
import { lightTheme } from "./theme";

/** Root-only provider; route Server Components remain server-rendered children. */
export function StyleProvider({ children }: { children: ReactNode }) {
  return (
    <StyledComponentsRegistry>
      <ThemeProvider theme={lightTheme}>
        <GlobalStyle />
        {children}
      </ThemeProvider>
    </StyledComponentsRegistry>
  );
}
