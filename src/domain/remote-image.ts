/** Structural safety only. Trusted server catalog authority must approve display rights. */
export function isSafeRemoteImageUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048 || /[\u0000-\u0020\u007f\\]/u.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}
