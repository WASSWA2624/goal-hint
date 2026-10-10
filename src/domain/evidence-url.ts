export const sensitiveEvidenceQuery = /token|secret|password|api.?key|authorization|credential|signature|^(?:key|auth|sig)$/i;
export const evidenceQueryName = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
export function isPublicEvidenceHostname(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 253 || value !== value.toLowerCase() ||
    /\.(?:localhost|local|internal|home|lan|test|invalid|onion)$/.test(value)) return false;
  const labels = value.split(".");
  return labels.length >= 2 && labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) &&
    /^[a-z][a-z0-9-]*$/.test(labels.at(-1) ?? "");
}


export function safeEvidenceLinkUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.length > 4096 || value !== value.trim() || /[\s\\\u0000-\u001f\u007f]/.test(value) ||
    !/^https:\/\//i.test(value) || /%(?:0[0-9a-f]|1[0-9a-f]|7f|25)/i.test(value)) return null;
  let url: URL;
  try { url = new URL(value); decodeURIComponent(url.pathname); decodeURIComponent(url.search); } catch { return null; }
  const authority = value.slice(value.indexOf("//") + 2).split(/[/?#]/, 1)[0] ?? "";
  if (url.protocol !== "https:" || url.username || url.password || authority.includes("@") || authority.includes("%") ||
    url.port && url.port !== "443" || url.hash || value.includes("#") || !isPublicEvidenceHostname(url.hostname)) return null;
  const names = [...url.searchParams.keys()];
  if (new Set(names).size !== names.length || names.some((name) => !evidenceQueryName.test(name) || sensitiveEvidenceQuery.test(name)) ||
    [...url.searchParams.values()].some((part) => /[\u0000-\u001f\u007f]/.test(part))) return null;
  return url;
}
/** Structural link rules do not authorize a source, extraction rights, or server I/O. */
export function isSafeEvidenceUrl(value: unknown): boolean { return safeEvidenceLinkUrl(value) !== null; }
