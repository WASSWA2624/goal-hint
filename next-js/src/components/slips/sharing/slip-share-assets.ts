"use client";

import type { SlipShareImagePage } from "../../../domain/slip-share-image.ts";
import { isSafeRemoteImageUrl } from "../../../domain/remote-image.ts";
import { providerImageSource } from "../../ui/provider-image.ts";

export const slipShareBrandAsset = "/brand/goal-hint-logo-inverse.png";
const assetRules = Object.freeze({ concurrency: 6, attempts: 2, timeoutMs: 15_000 });

export class SlipShareLogoError extends Error {
  readonly reason: "invalid" | "unavailable";
  constructor(reason: "invalid" | "unavailable") {
    super("Required slip logos are unavailable.");
    this.name = "SlipShareLogoError";
    this.reason = reason;
  }
}

/** Keep the UI and canvas on the same assets, with no silent omission of remote sources. */
export function requiredSlipShareAssets(pages: readonly SlipShareImagePage[]): readonly string[] {
  const sources = new Set([slipShareBrandAsset]);
  for (const page of pages) for (const row of page.rows) for (const value of [row.homeLogo, row.awayLogo, row.competitionLogo]) {
    if (value === null) continue; // The catalog has no logo for this particular entity.
    const source = providerImageSource(value, 48);
    if (!(source.startsWith("/") && !source.startsWith("//") && !/[\\\u0000-\u0020\u007f]/u.test(source)) && !isSafeRemoteImageUrl(source)) {
      throw new SlipShareLogoError("invalid");
    }
    sources.add(source);
  }
  return [...sources];
}

function decodedImage(source: string, signal: AbortSignal): Promise<HTMLImageElement> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const element = new Image();
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      element.onload = element.onerror = null;
      if (error !== undefined) { element.src = ""; reject(error); } else resolve(element);
    };
    const abort = () => finish(signal.reason);
    const timer = setTimeout(() => finish(new SlipShareLogoError("unavailable")), assetRules.timeoutMs);
    signal.addEventListener("abort", abort, { once: true });
    // A remote logo must opt into CORS before src is assigned, keeping the PNG canvas origin-clean.
    element.crossOrigin = "anonymous";
    element.referrerPolicy = "no-referrer";
    element.onload = () => {
      void element.decode().then(() => {
        if (element.naturalWidth > 0 && element.naturalHeight > 0) finish();
        else finish(new SlipShareLogoError("unavailable"));
      }, () => finish(new SlipShareLogoError("unavailable")));
    };
    element.onerror = () => finish(new SlipShareLogoError("unavailable"));
    element.src = source;
  });
}

/** All required logos must decode; one exhausted asset cancels the remaining queue. */
export async function loadSlipShareAssets(pages: readonly SlipShareImagePage[], signal?: AbortSignal,
  onProgress?: (done: number, total: number) => void): Promise<ReadonlyMap<string, HTMLImageElement>> {
  signal?.throwIfAborted();
  const sources = requiredSlipShareAssets(pages), controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  const assets = new Map<string, HTMLImageElement>();
  let next = 0;
  onProgress?.(0, sources.length);
  try {
    await Promise.all(Array.from({ length: Math.min(assetRules.concurrency, sources.length) }, async () => {
      while (next < sources.length) {
        controller.signal.throwIfAborted();
        const source = sources[next++]!;
        for (let attempt = 0; attempt < assetRules.attempts; attempt++) {
          try {
            const image = await decodedImage(source, controller.signal);
            assets.set(source, image);
            onProgress?.(assets.size, sources.length);
            break;
          } catch (error) {
            controller.signal.throwIfAborted();
            if (attempt + 1 === assetRules.attempts) { controller.abort(error); throw error; }
          }
        }
      }
    }));
    signal?.throwIfAborted();
    return assets;
  } finally {
    controller.abort();
    signal?.removeEventListener("abort", abort);
  }
}
