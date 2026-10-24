// Copies the on-device text reader (tesseract.js) into public/ocr/ so a payment screenshot is read in the browser from this
// site, never a CDN. Runs after every install, including the release build's `npm ci`; public/ocr/ is not committed.
// The packages are build-time devDependencies: an install without them (`--omit=dev`) has no page to serve and skips this.
import { existsSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";

const root = new URL("../", import.meta.url), target = new URL("public/ocr/", root);
const files = [
  "tesseract.js/dist/worker.min.js",
  // LSTM-only cores, with and without SIMD; the page picks one per device and the core finds its .wasm beside the worker.
  "tesseract.js-core/tesseract-core-simd-lstm.js", "tesseract.js-core/tesseract-core-simd-lstm.wasm",
  "tesseract.js-core/tesseract-core-lstm.js", "tesseract.js-core/tesseract-core-lstm.wasm",
  "@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
];

if (!files.every((file) => existsSync(new URL(`node_modules/${file}`, root)))) {
  console.warn("ocr-assets: tesseract.js is not installed (dev dependencies omitted); public/ocr/ was not refreshed.");
} else {
  await mkdir(target, { recursive: true });
  for (const file of files) await copyFile(new URL(`node_modules/${file}`, root), new URL(file.split("/").pop(), target));
}
