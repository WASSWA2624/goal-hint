/** Identify routable surfaces without copying arbitrary query data into history metadata. */
export function navigationSurface(url: URL): string | null {
  if (url.pathname === "/en/account") {
    if (url.searchParams.has("view")) return null;
    const section = url.searchParams.get("section");
    return section === "referrals" ? "referrals" : "account";
  }
  if (/^\/en\/matches\/[\w-]+\/[a-z0-9-]+$/u.test(url.pathname)) return url.pathname;
  if (/^\/s\/[a-f0-9]{32}$/u.test(url.pathname)) return "shared-slip";
  if (/^\/en(?:\/(?:matches|subscribe|slips|performance|help|privacy|terms|contact|download|how-it-works|predictions\/\d{4}-\d{2}-\d{2}|best-slips(?:\/\d{4}-\d{2}-\d{2}\/\d+)?))?$/u.test(url.pathname)) return url.pathname;
  return null;
}

export function contextReturnDistance(current: URL, previous: readonly string[]): number | null {
  const surface = navigationSurface(current);
  if (!surface) return null;
  for (let index = 0; index < previous.length; index++) {
    let candidate: URL;
    try { candidate = new URL(previous[index]!); } catch { return null; }
    const origin = navigationSurface(candidate);
    if (candidate.origin !== current.origin || !origin) return null;
    if (origin !== surface) return index + 1;
  }
  return null;
}
