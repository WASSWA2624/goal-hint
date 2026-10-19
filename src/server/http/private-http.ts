import "server-only";

/**
 * Shared helpers for private endpoints: the analytics dashboard, the owner dashboard (`/admin`) and member routes.
 * Responses are never cached, indexed, framed or sent on as a referrer; `next.config.ts` adds the same headers by path.
 */
export const privateHeaders = Object.freeze({
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
  "Referrer-Policy": "same-origin",
});

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...privateHeaders, ...headers } });
export const empty = (status: number) => new Response(null, { status, headers: privateHeaders });
/** 303 to a fixed, site-relative location; the request never chooses it. */
export const redirect = (location: string, cookies: string[] = []) => {
  const headers = new Headers({ ...privateHeaders, Location: location });
  for (const value of cookies) headers.append("Set-Cookie", value);
  return new Response(null, { status: 303, headers });
};

export function readCookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name) {
      // A malformed escape still counts as present; the raw value never verifies as a session token.
      const raw = part.slice(index + 1).trim();
      try { return decodeURIComponent(raw); } catch { return raw; }
    }
  }
  return undefined;
}

/** A body still arriving when its deadline passed; the reader is cancelled, so a slow sender cannot hold the request open. */
export class BodyDeadlineError extends Error {
  constructor() { super("The request body did not arrive in time."); this.name = "BodyDeadlineError"; }
}

/**
 * Reads at most `limit` body bytes, or null when the body is larger; chunked requests carry no Content-Length to check first.
 * With `deadlineMs`, a body not fully received by then rejects with BodyDeadlineError.
 */
export async function readLimitedBody(request: Request, limit: number, { deadlineMs }: { deadlineMs?: number } = {}): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0, timer: ReturnType<typeof setTimeout> | undefined;
  const expired = deadlineMs === undefined ? null
    : new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new BodyDeadlineError()), deadlineMs); });
  try {
    while (true) {
      const { done, value } = await (expired ? Promise.race([reader.read(), expired]) : reader.read());
      if (done) break;
      size += value.byteLength;
      if (size > limit) return null;
      chunks.push(value);
    }
    return new Uint8Array(Buffer.concat(chunks));
  } finally { clearTimeout(timer); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

/** HttpOnly, Path=/ and Secure in production. Owner cookies stay Strict; member cookies use Lax so links from WhatsApp keep the session. */
export function cookie(config: Readonly<{ cookies: Readonly<{ secure: boolean }> }>, name: string, value: string, maxAgeSeconds: number,
  sameSite: "Strict" | "Lax" = "Strict"): string {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAgeSeconds}${config.cookies.secure ? "; Secure" : ""}`;
}

/** State-changing requests must come from this site's own pages (Fetch Metadata, then Origin). */
export function isSameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null) return site === "same-origin";
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin === null || host === null) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

/** The address seen by the nearest proxy (the last X-Forwarded-For entry); used only as an HMAC throttle key. */
export function clientAddress(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",").map((value) => value.trim()).filter(Boolean);
  return forwarded?.at(-1) ?? headers.get("x-real-ip")?.trim() ?? "unknown";
}
