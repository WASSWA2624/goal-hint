"use client";

import { type ReactNode } from "react";
import { StyleProvider } from "@/styles/provider";

/** Own global client UI within the persistent provider boundary. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <StyleProvider>
      {children}
    </StyleProvider>
  );
}
