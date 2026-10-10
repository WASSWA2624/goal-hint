"use client";

import { useEffect, useRef } from "react";
import type { ReportingDate } from "@/domain/calendar";
import { startLiveRefresh } from "@/domain/live-refresh";

export function useLiveRefresh(options: { today: ReportingDate; enabled: boolean; interval: number;
  refresh(): Promise<unknown>; rollover(today: ReportingDate): void }) {
  const latest = useRef(options);
  useEffect(() => { latest.current = options; });
  useEffect(() => {
    if (!options.enabled) return;
    return startLiveRefresh({ today: options.today, interval: () => latest.current.interval,
      refresh: () => latest.current.refresh(), rollover: (today) => latest.current.rollover(today) }, {
      now: Date.now, available: () => document.visibilityState === "visible" && navigator.onLine,
      schedule: (callback, delay) => window.setTimeout(callback, delay), cancel: (timer) => window.clearTimeout(timer as number),
      listen: (callback) => {
        const restored = (event: PageTransitionEvent) => { if (event.persisted) callback(); };
        document.addEventListener("visibilitychange", callback);
        for (const event of ["online", "offline"]) window.addEventListener(event, callback);
        window.addEventListener("pageshow", restored);
        return () => {
          document.removeEventListener("visibilitychange", callback);
          for (const event of ["online", "offline"]) window.removeEventListener(event, callback);
          window.removeEventListener("pageshow", restored);
        };
      },
    });
  }, [options.enabled, options.today]);
}
