import "server-only";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";

import { imageInputFormat } from "./image-format.ts";

const maximumBytes = 1024 * 1024;
const maximumSide = 2048;
type BadgeFormat = "png" | "jpeg" | "gif";
const graphicsMagick = "/usr/bin/gm";

/** Accept a single bounded GIF image, including provider GIFs labeled as PNG. */
function isStaticGif(input: Buffer): boolean {
  if (input.length < 14 || input.length > maximumBytes || !["GIF87a", "GIF89a"].includes(input.toString("ascii", 0, 6))) return false;
  const width = input.readUInt16LE(6), height = input.readUInt16LE(8);
  if (!width || !height || width > maximumSide || height > maximumSide) return false;
  const tableBytes = (packed: number) => packed & 128 ? 3 * 2 ** ((packed & 7) + 1) : 0;
  let offset = 13 + tableBytes(input[10]!), image = false;
  while (offset < input.length) {
    const marker = input[offset++];
    if (marker === 0x3b) return image && offset === input.length;
    if (marker === 0x21) {
      offset++; // Extension label. Its data is stored in size-prefixed sub-blocks.
    } else if (marker === 0x2c && !image && offset + 9 < input.length) {
      const left = input.readUInt16LE(offset), top = input.readUInt16LE(offset + 2);
      const imageWidth = input.readUInt16LE(offset + 4), imageHeight = input.readUInt16LE(offset + 6);
      if (!imageWidth || !imageHeight || left + imageWidth > width || top + imageHeight > height) return false;
      offset += 9 + tableBytes(input[offset + 8]!);
      const codeSize = input[offset++];
      if (codeSize === undefined || codeSize < 2 || codeSize > 8) return false;
      image = true;
    } else return false;
    for (;;) {
      const size = input[offset++];
      if (size === undefined) return false;
      if (size === 0) break;
      offset += size;
    }
  }
  return false;
}

export function badgeInputFormat(input: Buffer): BadgeFormat | null {
  return imageInputFormat(input, { formats: ["png", "jpeg"], maxBytes: maximumBytes, maxSide: maximumSide })
    ?? (isStaticGif(input) ? "gif" : null);
}

export function badgeParameters(kind: string, id: string, size: string) {
  if (!/^(teams|leagues)$/u.test(kind) || !/^[1-9]\d{0,9}$/u.test(id) || !/^(32|48|64|96|128)\.webp$/u.test(size)) return null;
  return { source: `https://media.api-sports.io/football/${kind}/${id}.png`, width: Number.parseInt(size, 10) };
}

/** Only small provider rasters enter a bounded decoder; arbitrary URLs and redirects are forbidden. */
export async function loadProviderBadge(source: string, width: number,
  resize: typeof resizeBadge = resizeBadge): Promise<{ body: Buffer; contentType: `image/${BadgeFormat | "webp"}` }> {
  const response = await fetch(source, { redirect: "error", signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!response.ok || !["image/png", "image/jpeg", "image/gif"].includes(response.headers.get("content-type")?.split(";", 1)[0] ?? "")
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
  if (!format) throw new Error("Provider badge is not a bounded PNG, JPEG or static GIF.");
  try {
    return { body: await resize(body, width, format), contentType: "image/webp" };
  } catch {
    // Keep delivery first-party even on a host without a working WebP codec.
    return { body, contentType: `image/${format}` };
  }
}

export async function resizeBadge(input: Buffer, width: number, format = badgeInputFormat(input)): Promise<Buffer> {
  if (!format) throw new Error("Provider badge is not a bounded PNG, JPEG or static GIF.");
  try {
    const { default: sharp } = await import("sharp");
    return await sharp(input, { limitInputPixels: maximumSide ** 2 }).resize(width, width, { fit: "inside", withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
  } catch (error) {
    // Keep the runtime query opaque to a cross-platform bundler's OS folding.
    const runtimeOS = globalThis.process.getBuiltinModule("os") as typeof import("node:os");
    if (runtimeOS.platform() !== "linux") throw error;
  }
  // Portable Linux bundles use the host's image codec.
  const useGraphicsMagick = existsSync(graphicsMagick);
  const executable = useGraphicsMagick ? graphicsMagick : "/usr/bin/convert";
  const command = useGraphicsMagick ? ["convert", "-limit", "threads", "1"] : ["-limit", "time", "3"];
  return new Promise((resolve, reject) => {
    const child = execFile(executable, [...command, "-limit", "memory", "16MiB", "-limit", "map", "32MiB", "-limit", "disk", "0",
      `${format}:-`, "-thumbnail", `${width}x${width}>`, "-strip", "-quality", "75", "webp:-"],
    { encoding: "buffer", timeout: 5000, maxBuffer: 128 * 1024 }, (error, output) => error ? reject(error) : resolve(output));
    child.stdin?.on("error", () => { /* execFile reports decoder failures through its callback. */ });
    child.stdin?.end(input);
  });
}
