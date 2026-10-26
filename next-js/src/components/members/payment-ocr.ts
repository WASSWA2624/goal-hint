/**
 * Reads the text of a payment screenshot on this device with tesseract.js, loaded from this site's /ocr/ files (copied by
 * scripts/ocr-assets.mjs) only when a member picks an image. The image is not sent anywhere to be read, and nothing is kept in
 * browser storage: the language file comes from the browser's ordinary HTTP cache after the first use.
 */
// The SIMD probe from wasm-feature-detect: a one-instruction module that only validates when the engine has SIMD.
const simdProbe = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
// Restarted on every progress message. The first use downloads the core (about 2.9 MB) and the language data (about 3 MB)
// in steps that report no progress; at 20 KB/s the larger takes about 150 s, so a step may run 240 s before the read ends.
const stallMs = 240_000;

/** "preparing" loads the reader (a download the first time); "reading" recognizes the text. progress is 0–100 within it. */
export type ScreenshotProgress = Readonly<{ stage: "preparing" | "reading"; progress: number }>;
// Where each loading step sits in the preparing bar; the language data is the large first-time download.
const preparingSteps: Readonly<Record<string, readonly [number, number]>> = {
  "loading tesseract core": [0, 30], "initializing tesseract": [30, 35], "loading language traineddata": [35, 90], "initializing api": [90, 100],
};

/** Always settles: a worker error, a stall or `signal` rejects, and the Web Worker is closed whichever way the read ends. */
export async function readScreenshotText(image: Blob, onProgress: (progress: ScreenshotProgress) => void = () => {}, signal?: AbortSignal): Promise<string> {
  let fail: (reason: Error) => void = () => {}, timer: ReturnType<typeof setTimeout> | undefined, spawned: Worker | undefined;
  const failure = new Promise<never>((_, reject) => { fail = reject; });
  void failure.catch(() => {});
  const stall = () => { clearTimeout(timer); timer = setTimeout(() => fail(new Error("Reading the screenshot stalled.")), stallMs); };
  const stop = () => fail(new Error("Reading the screenshot was stopped."));
  if (signal?.aborted) throw new Error("Reading the screenshot was stopped.");
  signal?.addEventListener("abort", stop, { once: true });
  stall(); onProgress({ stage: "preparing", progress: 0 });
  try {
    const { createWorker, OEM } = await Promise.race([import("tesseract.js"), failure]);
    const core = WebAssembly.validate(simdProbe) ? "tesseract-core-simd-lstm.js" : "tesseract-core-lstm.js";
    // tesseract keeps its Web Worker to itself until start-up succeeds, so a failed start would leave it running. It creates
    // the worker before its first await, so a constructor that notes the instance, swapped in for this call only, catches it.
    const NativeWorker = globalThis.Worker;
    globalThis.Worker = new Proxy(NativeWorker, { construct: (target, args: ConstructorParameters<typeof Worker>) => (spawned = new target(...args)) });
    let starting: ReturnType<typeof createWorker>;
    try {
      // A same-origin worker script (no blob URL) lets the core find its .wasm beside it in /ocr/.
      starting = createWorker("eng", OEM.LSTM_ONLY, { workerPath: "/ocr/worker.min.js", corePath: `/ocr/${core}`, langPath: "/ocr", workerBlobURL: false,
        cacheMethod: "none", errorHandler: (error: unknown) => fail(new Error(String(error))),
        logger: ({ status, progress }) => {
          stall();
          const share = Math.min(1, Math.max(0, progress || 0)), step = preparingSteps[status];
          if (status === "recognizing text") onProgress({ stage: "reading", progress: Math.round(share * 100) });
          else if (step) onProgress({ stage: "preparing", progress: Math.round(step[0] + (step[1] - step[0]) * share) });
        } });
    } finally { globalThis.Worker = NativeWorker; }
    void starting.catch(() => {});
    const worker = await Promise.race([starting, failure]);
    return (await Promise.race([worker.recognize(image), failure])).data.text;
  } finally {
    clearTimeout(timer); signal?.removeEventListener("abort", stop);
    // Ending the Web Worker directly also covers a start that failed or never finished; a second terminate is a no-op.
    spawned?.terminate();
  }
}
