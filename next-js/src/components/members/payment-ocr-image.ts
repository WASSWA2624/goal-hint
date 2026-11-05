import { mediaTokens } from "../../styles/theme-tokens.ts";

const maxEdge = 2600, maxPixels = 4_000_000;
export type PaymentOcrEnhancement = "contrast" | "threshold";
const check = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException("Image reading cancelled.", "AbortError"); };
const yieldToBrowser = async (signal?: AbortSignal) => { await new Promise<void>(resolve => setTimeout(resolve, 0)); check(signal); };

export function paymentOcrDimensions(width: number, height: number, enlarge = false) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error("Choose a readable image.");
  const scale = Math.min(enlarge ? 2 : 1, maxEdge / width, maxEdge / height, Math.sqrt(maxPixels / (width * height)));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}

/** Decode the source before upload compression; bound the working pixels without changing evidence. */
export async function preparePaymentOcrImage(image: Blob, signal?: AbortSignal): Promise<HTMLCanvasElement> {
  check(signal);
  let source: ImageBitmap | HTMLImageElement;
  try { source = await createImageBitmap(image); }
  catch {
    check(signal);
    const url = URL.createObjectURL(image), fallback = new Image();
    try { fallback.src = url; await fallback.decode(); source = fallback; }
    finally { URL.revokeObjectURL(url); }
  }
  try {
    check(signal);
    const size = paymentOcrDimensions(source instanceof HTMLImageElement ? source.naturalWidth : source.width,
      source instanceof HTMLImageElement ? source.naturalHeight : source.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width; canvas.height = size.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("This browser cannot prepare the image.");
    context.fillStyle = mediaTokens.paper; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally { if ("close" in source) source.close(); }
}

/** Contrast recovery and isolated-noise removal; a second variant handles uneven illumination. */
export async function enhancePaymentOcrPixels(pixels: Uint8ClampedArray, width: number, height: number,
  mode: PaymentOcrEnhancement, signal?: AbortSignal): Promise<Uint8ClampedArray> {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width * height > maxPixels
    || pixels.length !== width * height * 4) throw new RangeError("Invalid OCR image dimensions.");
  check(signal);
  const grey = new Uint8Array(width * height), histogram = new Uint32Array(256);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x, p = i * 4;
      const value = Math.round(0.2126 * pixels[p]! + 0.7152 * pixels[p + 1]! + 0.0722 * pixels[p + 2]!);
      grey[i] = value; histogram[value] = histogram[value]! + 1;
    }
    if (y % 64 === 63) await yieldToBrowser(signal);
  }
  const percentile = (share: number) => {
    let sum = 0;
    for (let value = 0; value < 256; value++) { sum += histogram[value]!; if (sum >= grey.length * share) return value; }
    return 255;
  };
  const low = percentile(0.01), high = percentile(0.99), invert = percentile(0.5) < 128;
  const gain = high - low < 12 ? 1 : Math.min(4, 255 / (high - low));
  const offset = high - low < 12 ? 0 : low, normalized = new Uint8Array(grey.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let value = grey[i]!;
      if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
        const a = grey[i - 1]!, b = grey[i + 1]!, c = grey[i - width]!, d = grey[i + width]!;
        const average = (a + b + c + d) / 4;
        if (Math.max(a, b, c, d) - Math.min(a, b, c, d) < 20 && Math.abs(value - average) > 45) value = average;
      }
      const contrast = Math.max(0, Math.min(255, (value - offset) * gain));
      normalized[i] = invert ? 255 - contrast : contrast;
    }
    if (y % 64 === 63) await yieldToBrowser(signal);
  }
  const result = new Uint8ClampedArray(pixels.length);
  let integral: Uint32Array | undefined;
  const stride = width + 1;
  if (mode === "threshold") {
    integral = new Uint32Array(stride * (height + 1));
    for (let y = 0; y < height; y++) {
      let row = 0;
      for (let x = 0; x < width; x++) {
        row += normalized[y * width + x]!;
        integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1]! + row;
      }
      if (y % 64 === 63) await yieldToBrowser(signal);
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x, p = i * 4;
      let value = normalized[i]!;
      if (integral) {
        const left = Math.max(0, x - 16), right = Math.min(width, x + 17), top = Math.max(0, y - 16), bottom = Math.min(height, y + 17);
        const total = integral[bottom * stride + right]! - integral[top * stride + right]!
          - integral[bottom * stride + left]! + integral[top * stride + left]!;
        value = value < total / ((right - left) * (bottom - top)) - 10 ? 0 : 255;
      } else if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
        const blur = (normalized[i - 1]! + normalized[i + 1]! + normalized[i - width]! + normalized[i + width]!) / 4;
        value += (value - blur) * 0.5;
      }
      result[p] = value; result[p + 1] = value; result[p + 2] = value; result[p + 3] = 255;
    }
    if (y % 64 === 63) await yieldToBrowser(signal);
  }
  check(signal);
  return result;
}

export async function enhancePaymentOcrImage(source: HTMLCanvasElement, mode: PaymentOcrEnhancement, signal?: AbortSignal): Promise<HTMLCanvasElement> {
  check(signal);
  const dimensions = paymentOcrDimensions(source.width, source.height, true), canvas = document.createElement("canvas");
  canvas.width = dimensions.width; canvas.height = dimensions.height;
  try {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("This browser cannot enhance the image.");
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    pixels.data.set(await enhancePaymentOcrPixels(pixels.data, canvas.width, canvas.height, mode, signal));
    context.putImageData(pixels, 0, 0);
    return canvas;
  } catch (error) { canvas.width = 0; canvas.height = 0; throw error; }
}
