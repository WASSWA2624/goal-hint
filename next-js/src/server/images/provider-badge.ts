import "server-only";
import { execFile } from "node:child_process";

import { imageInputFormat } from "./image-format.ts";

const maximumBytes = 1024 * 1024;

export function badgeInputFormat(input: Buffer): "png" | "jpeg" | null {
  return imageInputFormat(input, { formats: ["png", "jpeg"], maxBytes: maximumBytes, maxSide: 2048 });
}

export function badgeParameters(kind: string, id: string, size: string) {
  if (!/^(teams|leagues)$/u.test(kind) || !/^[1-9]\d{0,9}$/u.test(id) || !/^(32|48|64|96|128)\.webp$/u.test(size)) return null;
  return { source: `https://media.api-sports.io/football/${kind}/${id}.png`, width: Number.parseInt(size, 10) };
}

/** Only small provider rasters enter a bounded decoder; arbitrary URLs and redirects are forbidden. */
export async function loadProviderBadge(source: string, width: number): Promise<Buffer> {
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
  return resizeBadge(Buffer.concat(parts), width);
}

export async function resizeBadge(input: Buffer, width: number): Promise<Buffer> {
  const format = badgeInputFormat(input);
  if (!format) throw new Error("Provider badge is not a bounded PNG or JPEG.");
  // Keep this runtime query opaque to the cross-platform bundler's OS folding.
  const runtimeOS = globalThis.process.getBuiltinModule("os") as typeof import("node:os");
  if (runtimeOS.platform() !== "linux") {
    const { default: sharp } = await import("sharp");
    return sharp(input, { limitInputPixels: 2048 * 2048 }).resize(width, width, { fit: "inside", withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
  }
  // This CloudLinux host lacks the CPU features required by Sharp and Wasm SIMD.
  // Its maintained system ImageMagick provides PNG/WebP without application installs.
  return new Promise((resolve, reject) => {
    const child = execFile("/usr/bin/convert", ["-limit", "memory", "16MiB", "-limit", "map", "32MiB", "-limit", "disk", "0",
      "-limit", "time", "3", `${format}:-`, "-thumbnail", `${width}x${width}>`, "-strip", "-quality", "75", "webp:-"],
    { encoding: "buffer", timeout: 5000, maxBuffer: 128 * 1024 }, (error, output) => error ? reject(error) : resolve(output));
    child.stdin?.on("error", () => { /* execFile reports decoder failures through its callback. */ });
    child.stdin?.end(input);
  });
}
