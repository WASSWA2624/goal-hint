import "server-only";
import { headers } from "next/headers.js";

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
