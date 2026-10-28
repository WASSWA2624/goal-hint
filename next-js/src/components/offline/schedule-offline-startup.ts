type OfflineStartupHost = {
  document: Pick<Document, "readyState">;
  addEventListener(type: "load", listener: () => void, options: { once: true }): void;
  removeEventListener(type: "load", listener: () => void): void;
  requestIdleCallback?: (callback: () => void, options: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
  setTimeout(callback: () => void, delay: number): number;
  clearTimeout(handle: number): void;
};

/** Let the current page finish loading before offline downloads use the connection and main thread. */
export function scheduleOfflineStartup(start: () => () => void, host: OfflineStartupHost = window): () => void {
  let canceled = false, idle: number | undefined, timer: number | undefined, stop: (() => void) | undefined;
  const run = () => {
    idle = undefined;
    timer = undefined;
    if (!canceled) stop = start();
  };
  const loaded = () => {
    host.removeEventListener("load", loaded);
    if (canceled) return;
    if (host.requestIdleCallback && host.cancelIdleCallback) idle = host.requestIdleCallback(run, { timeout: 3_000 });
    else timer = host.setTimeout(run, 1_000);
  };
  if (host.document.readyState === "complete") loaded();
  else host.addEventListener("load", loaded, { once: true });
  return () => {
    if (canceled) return;
    canceled = true;
    host.removeEventListener("load", loaded);
    if (idle !== undefined) host.cancelIdleCallback?.(idle);
    if (timer !== undefined) host.clearTimeout(timer);
    stop?.();
  };
}
