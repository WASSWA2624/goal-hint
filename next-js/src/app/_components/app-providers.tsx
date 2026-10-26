"use client";

import { Suspense, type ReactNode } from "react";
import { MemberLoginNotice } from "@/components/members/member-login-notice";
import { StyleProvider } from "@/styles/provider";

/** Own global client UI within the persistent provider boundary. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <StyleProvider>
      {children}
      <Suspense fallback={null}><MemberLoginNotice /></Suspense>
    </StyleProvider>
  );
}
