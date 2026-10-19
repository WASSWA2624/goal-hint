export const accessCodeAlphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function normalizeCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 64) return null;
  const code = input.toUpperCase().replace(/[\s-]/gu, "").replace(/O/gu, "0").replace(/[IL]/gu, "1");
  return /^[0-9A-HJKMNP-TV-Z]{12}$/u.test(code) ? code : null;
}

export function formatCode(input: string): string {
  const code = normalizeCode(input);
  if (!code) throw new RangeError("A valid access code is required.");
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`;
}

/** Pasting the whole owner message takes its first complete dashed code, including a code in its link. */
export function extractCode(text: unknown): string | null {
  if (typeof text !== "string" || text.length > 4096) return null;
  const group = /(?<![A-Za-z0-9-])[0-9A-TV-Z]{4}-[0-9A-TV-Z]{4}-[0-9A-TV-Z]{4}(?![A-Za-z0-9-])/iu.exec(text)?.[0];
  return normalizeCode(group ?? text);
}

/** The fragment has exactly one code and no other fields; it is never sent to the server as a URL parameter. */
export function codeFromFragment(hash: unknown): string | null {
  if (typeof hash !== "string" || !hash.startsWith("#code=") || hash.length > 64) return null;
  try { return normalizeCode(decodeURIComponent(hash.slice(6))); } catch { return null; }
}
