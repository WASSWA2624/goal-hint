import "server-only";
import { headers } from "next/headers.js";
import { isBotUserAgent } from "../../domain/analytics-classify.ts";

/** A failed stored read on an indexable page answers 5xx before streaming: crawlers keep the indexed URL and retry,
 * whereas 200 + noindex drops it. Rate-limited reads, variants and client navigations keep the in-page retry state. */
export class PublicReadUnavailableError extends Error {
  constructor() { super("Stored public data is temporarily unavailable."); this.name = "PublicReadUnavailableError"; }
}

/** Next 16.4 hides its own `rsc` flight header from headers() and drops `next-url` on ordinary routes, so client navigations
 * are recognised by the browser's fetch metadata: the router's fetch() sends `Sec-Fetch-Dest: empty`, address-bar loads
 * send `document`, and crawlers send none. */
export async function isDocumentRequest(read: () => Promise<Pick<Headers, "get">> = headers): Promise<boolean> {
  const request = await read();
  return request.get("rsc") === null && request.get("sec-fetch-dest") !== "empty";
}

/** The rolling Matches shell can stream on top-level browser and Chromium audit requests. */
export async function isBrowserDocumentRequest(read: () => Promise<Pick<Headers, "get">> = headers): Promise<boolean> {
  const request = await read();
  const userAgent = request.get("user-agent");
  // Lighthouse uses a real Chromium navigation. Preserve any independent crawler marker.
  const browserAgent = userAgent && /\b(?:HeadlessChrome|Chrome)\/\d/u.test(userAgent)
    ? userAgent.replace(/\bHeadlessChrome(?=\/\d)/gu, "Chrome").replace(/\b(?:Chrome-Lighthouse|PageSpeed Insights)\b/giu, "")
    : userAgent;
  if (request.get("rsc") !== null || isBotUserAgent(browserAgent)) return false;
  const destination = request.get("sec-fetch-dest"), mode = request.get("sec-fetch-mode");
  if (destination === "document" && mode === "navigate") return true;
  // The installed worker forwards navigations with an abort signal. Chromium
  // recalculates Fetch Metadata but keeps the browser's original HTML Accept.
  return destination === "empty" && mode === "same-origin" && request.get("sec-fetch-site") === "same-origin"
    && /(?:^|,)\s*text\/html(?=\s*(?:[;,]|$))/iu.test(request.get("accept") ?? "");
}
