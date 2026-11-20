"use client";

import { useEffect, useRef } from "react";
import { nativeAppIdentity } from "@/domain/app-download-presentation";
import type { ReportingDate } from "@/domain/calendar";
import { startLiveRefresh } from "@/domain/live-refresh";

/** `interval` may be a function, read when each wait is armed, so clock-based cadence stays current. */
export function useLiveRefresh(options: { today: ReportingDate; enabled: boolean; interval: number | (() => number);
  zone?: string | null; refresh(): Promise<unknown>; rollover(today: ReportingDate): void }) {
  const latest = useRef(options);
  useEffect(() => { latest.current = options; });
  useEffect(() => {
    if (!options.enabled) return;
    return startLiveRefresh({ today: options.today, zone: options.zone ?? null, interval: () => {
      const { interval } = latest.current;
      return typeof interval === "function" ? interval() : interval;
    },
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
  }, [options.enabled, options.today, options.zone]);
}

const matchesRefreshEvent = "goalhint:matches-refresh";
const pullDistance = 96, pullSlop = 12;
const editable = "textarea, select, input:not([type=button], [type=checkbox], [type=radio], [type=submit]), [contenteditable=true]";
const displacement = (touch: Touch, origin: Touch) =>
  ({ x: Math.abs(touch.clientX - origin.clientX), y: touch.clientY - origin.clientY });

/** Native Android transports the gesture. Other touch surfaces use the same foreground read. */
export function useMatchesPullToRefresh(enabled: boolean, refresh: () => Promise<unknown>) {
  useEffect(() => {
    if (!enabled) return;
    const eligible = () => window.scrollY <= 0 && !document.querySelector("dialog[open]") &&
      !document.activeElement?.matches(editable);
    const foreground = () => { if (eligible()) void refresh(); };
    document.addEventListener(matchesRefreshEvent, foreground);
    if (nativeAppIdentity(navigator.userAgent)?.platform === "android") {
      return () => document.removeEventListener(matchesRefreshEvent, foreground);
    }

    let pull: Touch | null = null;
    const start = (event: TouchEvent) => {
      const touch = event.touches[0];
      pull = event.touches.length === 1 && touch && eligible() &&
        !(event.target instanceof Element && event.target.closest(`[role=dialog], ${editable}`)) ? touch : null;
    };
    const move = (event: TouchEvent) => {
      if (!pull) return;
      const touch = event.touches[0];
      if (event.touches.length !== 1 || touch?.identifier !== pull.identifier || !eligible()) { pull = null; return; }
      const { x, y } = displacement(touch, pull);
      if (y < -pullSlop || x > pullSlop && x > y) pull = null;
    };
    const cancel = () => { pull = null; };
    const end = (event: TouchEvent) => {
      if (!pull) return;
      const origin = pull;
      const touch = Array.from(event.changedTouches).find(({ identifier }) => identifier === origin.identifier);
      const delta = touch && displacement(touch, origin);
      cancel();
      if (event.touches.length === 0 && delta && delta.y >= pullDistance && delta.y > delta.x * 1.5) foreground();
    };
    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchmove", move, { passive: true });
    document.addEventListener("touchend", end, { passive: true });
    document.addEventListener("touchcancel", cancel, { passive: true });
    return () => {
      document.removeEventListener(matchesRefreshEvent, foreground);
      document.removeEventListener("touchstart", start);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", cancel);
    };
  }, [enabled, refresh]);
}
