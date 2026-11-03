import "server-only";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { appReleaseCatalogSchema, appVersionSchema, checkedPlayStoreUrl, type AppChannel, type AppDownload, type AppDownloads, type AppFileRelease } from "../../domain/app-downloads.ts";

export function appDownloadsChannel(): AppChannel {
  const environment = process.env.GOAL_HINT_DEPLOYMENT_ENVIRONMENT;
  if (environment === "development") return "development";
  return environment === "production" || process.env.NODE_ENV === "production" ? "production" : "development";
}

export function appDownloadsRoot(): string {
  return path.resolve(process.env.GOAL_HINT_APP_DOWNLOADS_ROOT || ".app-downloads");
}

export async function appReleaseFile(release: AppFileRelease): Promise<string | null> {
  const root = await realpath(appDownloadsRoot());
  const file = await realpath(path.join(root, "files", release.platform, `${release.version}-${release.build}`, release.fileName));
  const relative = path.relative(root, file);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) return null;
  const details = await stat(file);
  return details.isFile() && details.size === release.size ? file : null;
}

export async function readAppFileReleases(): Promise<readonly AppFileRelease[]> {
  try {
    const catalog = appReleaseCatalogSchema.parse(JSON.parse(await readFile(path.join(appDownloadsRoot(), "catalog.json"), "utf8")));
    if (catalog.channel !== appDownloadsChannel()) return [];
    const candidates = catalog.releases.filter(release => (release.platform === "android" ? release.fileName.endsWith(".apk") : release.fileName.endsWith(".exe"))
      && (catalog.channel !== "production" || release.platform === "windows"));
    const verified = await Promise.all(candidates.map(async release => await appReleaseFile(release).catch(() => null) ? release : null));
    return verified.filter(release => release !== null);
  } catch { return []; }
}

export async function getAppDownloads(): Promise<AppDownloads> {
  const channel = appDownloadsChannel();
  const releases: AppDownload[] = (await readAppFileReleases()).map(release => ({
    platform: release.platform, kind: "file", version: release.version, build: release.build, size: release.size, sha256: release.sha256,
    href: `/api/downloads/${release.platform}?version=${release.version}&build=${release.build}`,
  }));
  const store = checkedPlayStoreUrl(process.env.GOAL_HINT_ANDROID_PLAY_STORE_URL);
  if (channel === "production" && store) {
    const version = appVersionSchema.safeParse(process.env.GOAL_HINT_ANDROID_PLAY_STORE_VERSION);
    const build = Number(process.env.GOAL_HINT_ANDROID_PLAY_STORE_BUILD);
    const knownVersion = version.success && Number.isSafeInteger(build) && build > 0;
    releases.push({ platform: "android", kind: "store", href: store, version: knownVersion ? version.data : null,
      build: knownVersion ? build : null, size: null, sha256: null });
  }
  return { channel, releases };
}
