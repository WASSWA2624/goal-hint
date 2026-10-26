"use client";

import { useSyncExternalStore } from "react";
import { media } from "@/styles/theme";

const query = media.desktop.replace(/^@media\s+/u, "");
const serverSnapshot = () => false;
const snapshot = () => window.matchMedia(query).matches;
function subscribe(change: () => void) {
  const list = window.matchMedia(query);
  list.addEventListener("change", change);
  return () => list.removeEventListener("change", change);
}

/** Keep the server-rendered fallback until the browser can select one responsive interface. */
export function useDesktopLayout(): boolean {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
