import "server-only";
import { execFile } from "node:child_process";

import { imageInputFormat } from "./image-format.ts";

const maximumBytes = 1024 * 1024;
type BadgeFormat = "png" | "jpeg";

export function badgeInputFormat(input: Buffer): BadgeFormat | null {
  return imageInputFormat(input, { formats: ["png", "jpeg"], maxBytes: maximumBytes, maxSide: 2048 });
}

export function badgeParameters(kind: string, id: string, size: string) {
  if (!/^(teams|leagues)$/u.test(kind) || !/^[1-9]\d{0,9}$/u.test(id) || !/^(32|48|64|96|128)\.webp$/u.test(size)) return null;
  return { source: `https://media.api-sports.io/football/${kind}/${id}.png`, width: Number.parseInt(size, 10) };
}

/** Only small provider rasters enter a bounded decoder; arbitrary URLs and redirects are forbidden. */
export async function loadProviderBadge(source: string, width: number,
  resize: typeof resizeBadge = resizeBadge): Promise<{ body: Buffer; contentType: `image/${BadgeFormat | "webp"}` }> {
  const response = await fetch(source, { redirect: "error", signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!response.ok || !["image/png", "image/jpeg"].includes(response.headers.get("content-type")?.split(";", 1)[0] ?? "")
    || Number(response.headers.get("content-length")) > maximumBytes || !response.body) throw new Error("Provider badge unavailable.");
  const reader = response.body.getReader(), parts: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maximumBytes) throw new Error("Provider badge exceeds its size limit.");
      parts.push(value);
    }
  } finally { await reader.cancel(); }
  const body = Buffer.concat(parts), format = badgeInputFormat(body);
  if (!format) throw new Error("Provider badge is not a bounded PNG or JPEG.");
  try {
    return { body: await resize(body, width, format), contentType: "image/webp" };
  } catch {
    // Keep delivery first-party even on a host without a working WebP codec.
    return { body, contentType: `image/${format}` };
  }
}

export async function resizeBadge(input: Buffer, width: number, format = badgeInputFormat(input)): Promise<Buffer> {
  if (!format) throw new Error("Provider badge is not a bounded PNG or JPEG.");
  try {
    const { default: sharp } = await import("sharp");
    return await sharp(input, { limitInputPixels: 2048 * 2048 }).resize(width, width, { fit: "inside", withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
  } catch (error) {
    // Keep the runtime query opaque to a cross-platform bundler's OS folding.
    const runtimeOS = globalThis.process.getBuiltinModule("os") as typeof import("node:os");
    if (runtimeOS.platform() !== "linux") throw error;
  }
  // Portable cPanel bundles use the host's bounded ImageMagick installation.
  return new Promise((resolve, reject) => {
    const child = execFile("/usr/bin/convert", ["-limit", "memory", "16MiB", "-limit", "map", "32MiB", "-limit", "disk", "0",
      "-limit", "time", "3", `${format}:-`, "-thumbnail", `${width}x${width}>`, "-strip", "-quality", "75", "webp:-"],
    { encoding: "buffer", timeout: 5000, maxBuffer: 128 * 1024 }, (error, output) => error ? reject(error) : resolve(output));
    child.stdin?.on("error", () => { /* execFile reports decoder failures through its callback. */ });
    child.stdin?.end(input);
  });
}
