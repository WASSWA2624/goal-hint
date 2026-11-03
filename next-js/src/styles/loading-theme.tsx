"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "styled-components";
import { cssColorTheme } from "./theme-css";
import { lightTheme } from "./theme";

const loadingTheme = cssColorTheme(lightTheme);

/** A Suspense fallback may remain unhydrated. Inherited color variables still follow the root theme immediately. */
export function LoadingTheme({ children }: { children: ReactNode }) {
  return <ThemeProvider theme={loadingTheme}>{children}</ThemeProvider>;
}
