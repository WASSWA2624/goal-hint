import { localePath } from "./navigation-paths.ts";

/** Browser-facing identity and display rules do not need the release-catalog validation runtime. */
export const appPlatforms = ["android", "windows", "ios", "macos", "linux"] as const;
export type AppPlatform = typeof appPlatforms[number];
export type AppChannel = "development" | "production";
export const appVersionPattern = /^\d+\.\d+\.\d+$/;
export type AppDownload = Readonly<{
  platform: AppPlatform; kind: "file" | "store" | "testflight"; version: string | null; build: number | null;
  href: string; size: number | null; sha256: string | null;
}>;
export type AppDownloads = Readonly<{ channel: AppChannel; releases: readonly AppDownload[] }>;
export type NativeAppIdentity = Readonly<{ platform: AppPlatform; version: string; build: number; channel: AppChannel }>;

export function detectAppPlatform(userAgent: string): AppPlatform | null {
  if (/Android/i.test(userAgent)) return "android";
  if (/Windows NT/i.test(userAgent)) return "windows";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Macintosh/i.test(userAgent)) return "macos";
  if (/Linux/i.test(userAgent) && !/CrOS/i.test(userAgent)) return "linux";
  return null;
}

/** Native hosts append their installed package identity; no install probe or device tracking. */
export function nativeAppIdentity(userAgent: string): NativeAppIdentity | null {
  const [, platform, version, build, channel] = /\bGoalHintNative\/(android|windows|ios|macos|linux)\/(\d+\.\d+\.\d+|unknown)\/(\d+)\/(development|production)\b/i.exec(userAgent) ?? [];
  const installedBuild = Number(build);
  if (!platform || !version || !channel || !Number.isSafeInteger(installedBuild) || installedBuild < 0) return null;
  return { platform: platform.toLowerCase() as AppPlatform, version: version === "unknown" ? "0.0.0" : version, build: installedBuild, channel: channel.toLowerCase() as AppChannel };
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
  if (previous[0] === channel && previous[1] === release.platform && previous[2] && appVersionPattern.test(previous[2])
    && Number(previous[3]) > 0 && !isNewerAppRelease(release, { version: previous[2], build: Number(previous[3]) })) return false;
  return memory.dismissed !== key || typeof memory.dismissedAt !== "number" || now - memory.dismissedAt >= appPromptCooldown;
}

export function appDownloadsHref(locale: string): string { return `${localePath(locale)}/download`; }

export function checkedPlayStoreUrl(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && url.hostname === "play.google.com" && !url.username && !url.password && !url.port
      && url.pathname === "/store/apps/details" && !!url.searchParams.get("id") ? url.href : null;
  } catch { return null; }
}

export function checkedIosDistribution(value: string | undefined): { href: string; kind: "store" | "testflight" } | null {
  try {
    const url = new URL(value?.trim() ?? "");
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    if (url.hostname === "apps.apple.com" && /^\/(?:[a-z]{2}\/)?app\/(?:[a-z0-9-]+\/)?id\d+$/i.test(url.pathname)) {
      return { href: url.href, kind: "store" };
    }
    if (url.hostname === "testflight.apple.com" && /^\/join\/[a-z0-9]+$/i.test(url.pathname)) {
      return { href: url.href, kind: "testflight" };
    }
    return null;
  } catch { return null; }
}
