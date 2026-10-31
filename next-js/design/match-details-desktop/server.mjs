import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fixtureForReview } from "./sample.mjs";

// Explicit allowlist: production configuration, source fixtures and credentials are never served.
const assets = new Map([
  ["/", ["./index.html", "text/html; charset=utf-8"]],
  ["/review.mjs", ["./review.mjs", "text/javascript; charset=utf-8"]],
  ["/catalog.mjs", ["./catalog.mjs", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["./styles.css", "text/css; charset=utf-8"]],
  ["/brand.css", ["../../public/brand/goal-hint-brand-tokens.css", "text/css; charset=utf-8"]],
  ["/Manrope.woff2", ["../../assets/brand/source/fonts/Manrope-wght-latin.woff2", "font/woff2"]],
  ["/logo.svg", ["../../public/brand/goal-hint-header-primary.svg", "image/svg+xml"]],
  ["/logo-inverse.svg", ["../../public/brand/goal-hint-header-inverse.svg", "image/svg+xml"]],
  ["/favicon.ico", ["../../public/brand/goal-hint-favicon.ico", "image/x-icon"]],
]);

export function createReviewServer() {
  return createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" };
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { ...headers, Allow: "GET, HEAD" }); response.end(); return;
    }
    try {
      if (url.pathname === "/api/fixture") {
        response.writeHead(200, { ...headers, "Content-Type": "application/json; charset=utf-8" });
        response.end(request.method === "HEAD" ? undefined : JSON.stringify(fixtureForReview(url.searchParams))); return;
      }
      const asset = assets.get(url.pathname);
      if (!asset) { response.writeHead(404, headers); response.end("Not found"); return; }
      const body = await readFile(fileURLToPath(new URL(asset[0], import.meta.url)));
      response.writeHead(200, { ...headers, "Content-Type": asset[1] }); response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      response.writeHead(500, headers); response.end("Preview unavailable. Restart the review server.");
    }
  });
}
