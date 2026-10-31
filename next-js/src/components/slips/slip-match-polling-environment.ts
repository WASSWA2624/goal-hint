"use client";

import type { SlipMatchPollingEnvironment } from "@/domain/slip-match-polling";

/** Phone browsers/WebViews may freeze or cache a page before reporting a visibility change. */
export function slipMatchPollingEnvironment(): SlipMatchPollingEnvironment {
  let suspended = false;
  const available = () => !suspended && document.visibilityState === "visible" && navigator.onLine
    && !document.querySelector("[data-navigation-pending]");
  return {
    available, schedule: (callback, delay) => window.setTimeout(callback, delay), cancel: timer => window.clearTimeout(timer as number),
    listen(callback) {
      let previous = available();
      const changed = () => { const next = available(); if (next !== previous) { previous = next; callback(); } };
      const pause = () => { suspended = true; changed(); };
      const resume = () => { suspended = false; changed(); };
      const restored = (event: PageTransitionEvent) => {
        if (!event.persisted) return;
        suspended = false; previous = available(); callback();
      };
      const navigation = new MutationObserver(changed);
      navigation.observe(document.documentElement, { attributes: true, attributeFilter: ["data-navigation-pending"], childList: true, subtree: true });
      document.addEventListener("visibilitychange", changed);
      document.addEventListener("freeze", pause); document.addEventListener("resume", resume);
      window.addEventListener("pagehide", pause); window.addEventListener("pageshow", restored);
      window.addEventListener("online", changed); window.addEventListener("offline", changed);
      return () => {
        navigation.disconnect(); document.removeEventListener("visibilitychange", changed);
        document.removeEventListener("freeze", pause); document.removeEventListener("resume", resume);
        window.removeEventListener("pagehide", pause); window.removeEventListener("pageshow", restored);
        window.removeEventListener("online", changed); window.removeEventListener("offline", changed);
      };
    },
  };
}
