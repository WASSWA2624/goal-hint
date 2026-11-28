"use client";

import { AppProviders } from "@/app/_components/app-providers";
import { OfflineView } from "@/components/offline/offline-view";
import { publicPolicy } from "@/domain/public-policy";

/** Next replaces the root layout here, so recreate the minimal themed frame. */
export default function GlobalError() {
  return <html lang={publicPolicy.defaultLocale} suppressHydrationWarning>
    <head><title>This page couldn’t load | Goal Hint</title></head>
    <body><AppProviders><OfflineView runtimeFailure /></AppProviders></body>
  </html>;
}
