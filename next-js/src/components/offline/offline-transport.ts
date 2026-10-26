import { OfflineRefreshError, readOfflineReply, type OfflineReply } from "../../domain/offline-refresh.ts";

type WorkerContainer = Pick<ServiceWorkerContainer, "getRegistration" | "register" | "ready">;
const abortError = () => new DOMException("Offline request canceled.", "AbortError");

/** Registration cannot be canceled, but no preparation starts after this owner has left. */
function bounded<T>(promise: Promise<T>, signal: AbortSignal, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", canceled);
      callback();
    };
    const canceled = () => finish(() => reject(abortError()));
    const timer = setTimeout(() => finish(() => reject(new OfflineRefreshError("worker-unavailable"))), milliseconds);
    signal.addEventListener("abort", canceled, { once: true });
    void promise.then((value) => finish(() => resolve(value)), () => finish(() => reject(new OfflineRefreshError("worker-unavailable"))));
    if (signal.aborted) canceled();
  });
}

/** Every caller owns one port lease; cancellation cannot stop another visible caller's update. */
export function requestOfflineWorker(worker: ServiceWorker, type: "STATUS" | "PREPARE", signal: AbortSignal,
  createChannel = () => new MessageChannel(), timeoutMs = type === "PREPARE" ? 55_000 : 10_000): Promise<OfflineReply> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(abortError()); return; }
    const channel = createChannel();
    let settled = false, closeTimer: ReturnType<typeof setTimeout> | undefined;
    const close = () => { clearTimeout(closeTimer); channel.port1.close(); channel.port2.close(); };
    const finish = (callback: () => void, cancel = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", canceled);
      if (cancel && type === "PREPARE") {
        try { channel.port1.postMessage({ type: "CANCEL" }); } catch { /* A terminated worker owns no further work. */ }
        closeTimer = setTimeout(close, 250);
      } else close();
      callback();
    };
    const canceled = () => finish(() => reject(abortError()), true);
    const timer = setTimeout(() => finish(() => reject(new OfflineRefreshError("preparation-timeout")), true), timeoutMs);
    channel.port1.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (settled) { close(); return; }
      try { const reply = readOfflineReply(data); finish(() => resolve(reply)); }
      catch { finish(() => reject(new OfflineRefreshError("unexpected-response")), true); }
    };
    channel.port1.onmessageerror = () => finish(() => reject(new OfflineRefreshError("unexpected-response")), true);
    signal.addEventListener("abort", canceled, { once: true });
    try { worker.postMessage({ type }, [channel.port2]); }
    catch { finish(() => reject(new OfflineRefreshError("worker-unavailable"))); }
  });
}

export function createOfflineTransport(container: WorkerContainer = navigator.serviceWorker) {
  let registration: Promise<ServiceWorkerRegistration> | undefined;
  const active = async (signal: AbortSignal, network: boolean): Promise<ServiceWorker | null> => {
    if (signal.aborted) throw abortError();
    const existing = await bounded(container.getRegistration("/"), signal, 10_000);
    if (signal.aborted) throw abortError();
    if (existing?.active) {
      if (network) void existing.update().catch(() => {});
      return existing.active;
    }
    if (!network) return null;
    if (!registration) {
      const registering = container.register("/offline-worker.js", { scope: "/", updateViaCache: "none" });
      registration = registering;
      const release = () => { if (registration === registering) registration = undefined; };
      void registering.then(release, release);
    }
    const pending = registration;
    let selected: ServiceWorkerRegistration;
    try { selected = await bounded(pending, signal, 15_000); }
    catch (error) { if (registration === pending) registration = undefined; throw error; }
    if (signal.aborted) throw abortError();
    const ready = selected.active ? selected : await bounded(container.ready, signal, 15_000);
    if (signal.aborted) throw abortError();
    if (!ready.active) throw new OfflineRefreshError("worker-unavailable");
    return ready.active;
  };
  return {
    async inspect(signal: AbortSignal): Promise<OfflineReply> {
      const worker = await active(signal, false);
      return worker ? requestOfflineWorker(worker, "STATUS", signal) : { ok: false, error: "cache-unavailable" };
    },
    async prepare(signal: AbortSignal): Promise<OfflineReply> {
      const worker = await active(signal, true);
      if (!worker) throw new OfflineRefreshError("worker-unavailable");
      return requestOfflineWorker(worker, "PREPARE", signal);
    },
  };
}
