import type { ConsentChoice } from "./analytics-settings.ts";

export type ConsentState = ConsentChoice | "unset" | "signal" | "automation";

/** Pure functions also serialize into the tiny pre-paint check; keep them self-contained. */
export function hasBrowserPrivacySignal(browser: { globalPrivacyControl?: boolean; doNotTrack?: string | null; msDoNotTrack?: string },
  page: { doNotTrack?: string }): boolean {
  return browser.globalPrivacyControl === true || browser.doNotTrack === "1" || browser.msDoNotTrack === "1" || page.doNotTrack === "1";
}

export function resolveAnalyticsConsent({ stored, now, maxAgeMs, automated, signal }: {
  stored: unknown; now: number; maxAgeMs: number; automated: boolean; signal: boolean;
}): ConsentState {
  if (automated) return "automation";
  if (signal) return "signal";
  if (!stored || typeof stored !== "object") return "unset";
  const record = stored as { v?: unknown; choice?: unknown; at?: unknown };
  if (record.v !== 1 || (record.choice !== "granted" && record.choice !== "denied")
    || typeof record.at !== "number" || !Number.isFinite(record.at) || now - record.at > maxAgeMs) return "unset";
  return record.choice;
}
