"use client";

import { useEffect } from "react";
import { startOfflineRefresh } from "@/domain/offline-refresh";
import { createOfflineTransport } from "./offline-transport";
import { publishOfflineUpdate } from "./offline-update-store";
import { scheduleOfflineStartup } from "./schedule-offline-startup";

/** One shared controller; product data/authentication keep their existing refresh rules. */
export function OfflineBootstrap() {
  useEffect(() => {
    const root = document.documentElement;
    if (process.env.NODE_ENV !== "production" || !window.isSecureContext || !("serviceWorker" in navigator)) {
      root.dataset.offlineCache = "unavailable";
      return;
    }
    let pageActive = true, readyKey = "";
    return scheduleOfflineStartup(() => startOfflineRefresh({ ...createOfflineTransport(), publish: (state) => {
      publishOfflineUpdate(state);
      root.dataset.offlineCache = state.cache ? "ready" : state.phase === "checking" ? "preparing" : "unavailable";
      root.dataset.offlineConnection = state.connection;
      root.dataset.offlineUpdate = state.phase;
      root.dataset.offlineAttempts = String(state.attempts);
      if (state.cache) root.dataset.offlineVersion = state.cache.version;
      else delete root.dataset.offlineVersion;
      if (state.problem) root.dataset.offlineProblem = state.problem;
      else delete root.dataset.offlineProblem;
      if (state.retryAt !== null) root.dataset.offlineRetryAt = String(state.retryAt);
      else delete root.dataset.offlineRetryAt;
      const key = state.cache ? `${state.cache.version}:${state.cache.capturedAt}:${state.cache.expiresAt}` : "";
      if (key && key !== readyKey) window.dispatchEvent(new Event("goal-hint-offline-ready"));
      readyKey = key;
    } }, {
      now: Date.now, visible: () => pageActive && document.visibilityState === "visible", onlineHint: () => navigator.onLine,
      schedule: (callback, delay) => window.setTimeout(callback, delay), cancel: (timer) => window.clearTimeout(timer as number),
      listen: (callback) => {
        const hint = () => callback();
        const manual = () => callback("manual");
        const leave = () => { pageActive = false; callback(); };
        const restore = () => { pageActive = true; callback(); };
        document.addEventListener("visibilitychange", hint);
        window.addEventListener("online", hint);
        window.addEventListener("offline", hint);
        window.addEventListener("goal-hint-offline-check", manual);
        window.addEventListener("pagehide", leave);
        window.addEventListener("pageshow", restore);
        return () => {
          document.removeEventListener("visibilitychange", hint);
          window.removeEventListener("online", hint);
          window.removeEventListener("offline", hint);
          window.removeEventListener("goal-hint-offline-check", manual);
          window.removeEventListener("pagehide", leave);
          window.removeEventListener("pageshow", restore);
        };
      },
    }));
  }, []);
  return null;
}
