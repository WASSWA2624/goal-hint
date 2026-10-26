"use client";

import { useEffect } from "react";

type CacheReply = { ok: boolean; version?: string };
const versionPattern = /^[a-f0-9]{64}$/u;

function requestPreparation(worker: ServiceWorker): Promise<CacheReply> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(new Error("Offline preparation timed out.")); }, 65_000);
    channel.port1.onmessage = ({ data }: MessageEvent<CacheReply>) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(data);
    };
    worker.postMessage({ type: "PREPARE" }, [channel.port2]);
  });
}

/** Only an explicitly approved anonymous bundle is saved; normal page responses never enter it. */
export function OfflineBootstrap() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !window.isSecureContext || !("serviceWorker" in navigator)) {
      document.documentElement.dataset.offlineCache = "unavailable";
      return;
    }
    let disposed = false, pending = false, attemptedAt = 0;
    const prepare = async () => {
      if (disposed || pending || document.visibilityState !== "visible" || Date.now() - attemptedAt < 60_000) return;
      pending = true;
      attemptedAt = Date.now();
      const root = document.documentElement;
      if (!root.dataset.offlineVersion) root.dataset.offlineCache = "preparing";
      try {
        const registration = await navigator.serviceWorker.register("/offline-worker.js", { scope: "/", updateViaCache: "none" });
        const ready = registration.active ? registration : await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Offline worker unavailable.")), 15_000)),
        ]);
        const worker = ready.active;
        if (!worker) throw new Error("Offline worker unavailable.");
        const reply = await requestPreparation(worker);
        if (disposed) return;
        if (reply && typeof reply.version === "string" && versionPattern.test(reply.version)) {
          root.dataset.offlineVersion = reply.version;
          root.dataset.offlineCache = "ready";
          window.dispatchEvent(new Event("goal-hint-offline-ready"));
        } else {
          delete root.dataset.offlineVersion;
          root.dataset.offlineCache = "unavailable";
        }
      } catch {
        if (!disposed && !root.dataset.offlineVersion) root.dataset.offlineCache = "unavailable";
      } finally { pending = false; }
    };
    const resume = () => { void prepare(); };
    resume();
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      disposed = true;
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);
  return null;
}
