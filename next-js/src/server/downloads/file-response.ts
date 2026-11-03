import "server-only";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { appReleaseFile, readAppFileReleases } from "./catalog.ts";

/** Public installer streams support interrupted-download resumption without buffering binaries. */
export async function appDownloadResponse(request: Request, platform: string): Promise<Response> {
  const url = new URL(request.url);
  const release = (await readAppFileReleases()).find(candidate => candidate.platform === platform);
  if (!release) return new Response("This download is not available yet.", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (url.searchParams.get("version") !== release.version || url.searchParams.get("build") !== String(release.build)) {
    return new Response("A new release is available. Refresh the download page.", { status: 409, headers: { "Cache-Control": "no-store" } });
  }
  const file = await appReleaseFile(release).catch(() => null);
  if (!file) return new Response("This download is temporarily unavailable.", { status: 404 });
  const headers = new Headers({ "Content-Type": platform === "android" ? "application/vnd.android.package-archive" : "application/octet-stream",
    "Content-Disposition": `attachment; filename="${release.fileName}"`, "Cache-Control": "no-store", "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff", ETag: `"${release.sha256}"` });
  const range = request.headers.get("range");
  const ifRange = request.headers.get("if-range");
  let start = 0, end = release.size - 1, partial = false;
  if (range && (!ifRange || ifRange === headers.get("etag"))) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) { headers.set("Content-Range", `bytes */${release.size}`); return new Response(null, { status: 416, headers }); }
    start = match[1] ? Number(match[1]) : Math.max(0, release.size - Number(match[2]));
    end = match[1] && match[2] ? Math.min(Number(match[2]), release.size - 1) : release.size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= release.size || (!match[1] && Number(match[2]) === 0)) {
      headers.set("Content-Range", `bytes */${release.size}`); return new Response(null, { status: 416, headers });
    }
    partial = true;
    headers.set("Content-Range", `bytes ${start}-${end}/${release.size}`);
  }
  headers.set("Content-Length", String(end - start + 1));
  if (request.method === "HEAD") return new Response(null, { status: partial ? 206 : 200, headers });
  const stream = createReadStream(file, { start, end, signal: request.signal });
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { status: partial ? 206 : 200, headers });
}
