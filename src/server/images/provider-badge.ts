import "server-only";
import { execFile } from "node:child_process";

const maximumBytes = 1024 * 1024;
const frameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
const boundedDimensions = (width: number, height: number) => width > 0 && height > 0 && width <= 2048 && height <= 2048;

/** Some provider .png URLs serve JPEG bytes with a PNG Content-Type. Trust bounded raster signatures. */
export function badgeInputFormat(input: Buffer): "png" | "jpeg" | null {
  if (input.length > maximumBytes) return null;
  if (input.length >= 24 && input.subarray(0, 8).toString("hex") === "89504e470d0a1a0a"
    && input.subarray(12, 16).toString("ascii") === "IHDR") {
    return boundedDimensions(input.readUInt32BE(16), input.readUInt32BE(20)) ? "png" : null;
  }
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 <= input.length) {
    if (input[offset++] !== 0xff) return null;
    while (input[offset] === 0xff) offset++;
    const marker = input[offset++];
    if (marker === undefined || marker === 0xda || marker === 0xd9) return null;
    if (marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > input.length) return null;
    const length = input.readUInt16BE(offset);
    if (length < 2 || offset + length > input.length) return null;
    if (frameMarkers.has(marker)) {
      return length >= 8 && boundedDimensions(input.readUInt16BE(offset + 5), input.readUInt16BE(offset + 3)) ? "jpeg" : null;
    }
    offset += length;
  }
  return null;
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
