"use client";

import { useSyncExternalStore } from "react";
import { publicPolicy } from "@/domain/public-policy";
import { createMessages } from "./messages";

let timeZone: string = publicPolicy.reportingTimeZone;
const listeners = new Set<() => void>();
let stop: (() => void) | null = null;

function refreshTimeZone() {
  const next = Intl.DateTimeFormat().resolvedOptions().timeZone || publicPolicy.reportingTimeZone;
  if (next === timeZone) return;
  timeZone = next;
  listeners.forEach((listener) => listener());
}

/** One browser subscription serves every timestamp, including memoized cards. */
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!stop) {
    refreshTimeZone();
    const visible = () => { if (document.visibilityState === "visible") refreshTimeZone(); };
    window.addEventListener("focus", refreshTimeZone);
    document.addEventListener("visibilitychange", visible);
    const timer = window.setInterval(visible, 60_000);
    stop = () => {
      window.removeEventListener("focus", refreshTimeZone);
      document.removeEventListener("visibilitychange", visible);
      window.clearInterval(timer);
    };
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) { stop?.(); stop = null; }
  };
}

const snapshot = () => timeZone;
const serverSnapshot = () => publicPolicy.reportingTimeZone;

export function useDeviceTimeZone() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/** SSR and hydration share a stable zone; mounted displays follow the device. */
export function useMessages(locale?: string) {
  const zone = useDeviceTimeZone();
  return createMessages(locale, undefined, zone);
}
