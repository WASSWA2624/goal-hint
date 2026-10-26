import "server-only";

type Format = "png" | "jpeg";
const frames = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
export function imageDimensions(input: Buffer): { format: Format; width: number; height: number } | null {
  if (input.length >= 24 && input.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" && input.subarray(12, 16).toString("ascii") === "IHDR")
    return { format: "png", width: input.readUInt32BE(16), height: input.readUInt32BE(20) };
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 <= input.length) {
    if (input[offset++] !== 0xff) return null;
    while (input[offset] === 0xff) offset++;
    const marker = input[offset++];
    if (marker === undefined || marker === 0xda || marker === 0xd9) return null;
    if (marker === 0x01 || marker === 0xd8 || marker >= 0xd0 && marker <= 0xd7) continue;
    if (offset + 2 > input.length) return null;
    const length = input.readUInt16BE(offset);
    if (length < 2 || offset + length > input.length) return null;
    if (frames.has(marker)) return length >= 8 ? { format: "jpeg", width: input.readUInt16BE(offset + 5), height: input.readUInt16BE(offset + 3) } : null;
    offset += length;
  }
  return null;
}
/** Trust raster signatures and bounded dimensions, never a client Content-Type. */
export function imageInputFormat(input: Buffer, rules: Readonly<{ formats: readonly Format[]; maxBytes: number; minSide?: number; maxSide: number; maxPixels?: number }>): Format | null {
  if (input.length > rules.maxBytes) return null;
  const image = imageDimensions(input), minimum = rules.minSide ?? 1;
  return image && rules.formats.includes(image.format) && Math.min(image.width, image.height) >= minimum
    && Math.max(image.width, image.height) <= rules.maxSide && image.width * image.height <= (rules.maxPixels ?? rules.maxSide ** 2) ? image.format : null;
}
