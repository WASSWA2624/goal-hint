import { z } from "zod";
import { homeHref } from "./navigation-paths.ts";

export const appPlatforms = ["android", "windows"] as const;
export type AppPlatform = typeof appPlatforms[number];
export type AppChannel = "development" | "production";
export const appVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/);
export const appReleaseSchema = z.object({
  platform: z.enum(appPlatforms), version: appVersionSchema, build: z.number().int().positive(),
  fileName: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]+\.(apk|exe)$/),
  size: z.number().int().positive(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const appReleaseCatalogSchema = z.object({
  schema: z.literal(1), channel: z.enum(["development", "production"]), releases: z.array(appReleaseSchema).max(2),
}).refine(value => new Set(value.releases.map(release => release.platform)).size === value.releases.length);
export type AppFileRelease = z.infer<typeof appReleaseSchema>;
export type AppDownload = Readonly<{
  platform: AppPlatform; kind: "file" | "store"; version: string | null; build: number | null;
  href: string; size: number | null; sha256: string | null;
}>;
export type AppDownloads = Readonly<{ channel: AppChannel; releases: readonly AppDownload[] }>;
export type NativeAppIdentity = Readonly<{ platform: AppPlatform; version: string; build: number; channel: AppChannel }>;

export function detectAppPlatform(userAgent: string): AppPlatform | null {
  if (/Android/i.test(userAgent)) return "android";
  return /Windows NT/i.test(userAgent) ? "windows" : null;
}

/** Native hosts append their installed package identity; no install probe or device tracking. */
export function nativeAppIdentity(userAgent: string): NativeAppIdentity | null {
  const match = /\bGoalHintNative\/(android|windows)\/(\d+\.\d+\.\d+|unknown)\/(\d+)\/(development|production)\b/.exec(userAgent);
  if (!match?.[2] || !Number.isSafeInteger(Number(match[3])) || Number(match[3]) < 0) return null;
  return { platform: match[1] as AppPlatform, version: match[2] === "unknown" ? "0.0.0" : match[2], build: Number(match[3]), channel: match[4] as AppChannel };
}

export function isNewerAppRelease(release: Pick<AppDownload, "version" | "build">, installed: Pick<NativeAppIdentity, "version" | "build">): boolean {
  if (release.version === null || release.build === null || installed.build < 1) return false;
  const next = release.version.split(".").map(Number), current = installed.version.split(".").map(Number);
  for (let index = 0; index < 3; index++) {
    const candidate = next[index] ?? 0, previous = current[index] ?? 0;
    if (candidate !== previous) return candidate > previous;
  }
  return release.build > installed.build;
}

export function appReleaseKey(channel: AppChannel, release: AppDownload): string {
  return `${channel}:${release.platform}:${release.version ?? "store"}:${release.build ?? "current"}`;
}

export type AppPromptMemory = Readonly<{ acknowledged?: string; dismissed?: string; dismissedAt?: number }>;
export const appPromptCooldown = 7 * 24 * 60 * 60 * 1000;
export function shouldOfferAppDownload(channel: AppChannel, release: AppDownload, memory: AppPromptMemory, now: number, installed: NativeAppIdentity | null): boolean {
  if (installed && (installed.channel !== channel || installed.platform !== release.platform || !isNewerAppRelease(release, installed))) return false;
  const key = appReleaseKey(channel, release);
  if (memory.acknowledged === key) return false;
  const previous = typeof memory.acknowledged === "string" ? memory.acknowledged.split(":") : [];
  if (previous[0] === channel && previous[1] === release.platform && previous[2] && appVersionSchema.safeParse(previous[2]).success
    && Number(previous[3]) > 0 && !isNewerAppRelease(release, { version: previous[2], build: Number(previous[3]) })) return false;
  return memory.dismissed !== key || typeof memory.dismissedAt !== "number" || now - memory.dismissedAt >= appPromptCooldown;
}

export function appDownloadsHref(locale: string): string { return `${homeHref(locale)}/download`; }

export function checkedPlayStoreUrl(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && url.hostname === "play.google.com" && !url.username && !url.password && !url.port
      && url.pathname === "/store/apps/details" && !!url.searchParams.get("id") ? url.href : null;
  } catch { return null; }
}
