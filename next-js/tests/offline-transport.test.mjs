import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { MessageChannel } from "node:worker_threads";
import test from "node:test";
import { createOfflineTransport, requestOfflineWorker } from "../src/components/offline/offline-transport.ts";

const reply = { ok: true, version: "a".repeat(64), refreshed: true, capturedAt: 1000, expiresAt: 2000, records: 1 };
const pause = (milliseconds = 10) => new Promise((resolve) => setTimeout(resolve, milliseconds));
function fakeWorker(t, handle) {
  const ports = [], messages = [], cancellations = [];
  let canceled;
  const cancellation = new Promise((resolve) => { canceled = resolve; });
  t.after(() => ports.forEach((port) => port.close()));
  return { scriptURL: "https://example.test/offline-worker.js", messages, cancellations,
    async waitForCancellation() {
      let timer;
      try { await Promise.race([cancellation, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Cancellation was not received")), 1_000); })]); }
      finally { clearTimeout(timer); }
    },
    postMessage(message, transfer) {
      messages.push(message);
      const port = transfer[0]; ports.push(port);
      port.onmessage = ({ data }) => {
        cancellations.push(data);
        canceled();
        port.postMessage({ ok: false, refreshed: false, error: "canceled" });
        port.close();
      };
      handle(message, (data) => { port.postMessage(data); });
    } };
}

test("public worker reply resolves and removes its abort listener", async (t) => {
  const worker = fakeWorker(t, (_, respond) => respond({ ...reply, private: "not-copied" }));
  const controller = new AbortController();
  const result = await requestOfflineWorker(worker, "PREPARE", controller.signal, () => new MessageChannel());
  assert.equal(result.version, reply.version); assert.equal("private" in result, false);
  assert.deepEqual(worker.messages, [{ type: "PREPARE" }]);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("abort releases exactly its own transferred port and ignores a late success", async (t) => {
  let respond;
  const worker = fakeWorker(t, (_, callback) => { respond = callback; });
  const controller = new AbortController();
  const pending = requestOfflineWorker(worker, "PREPARE", controller.signal, () => new MessageChannel());
  controller.abort();
  await assert.rejects(pending, (error) => error.name === "AbortError");
  await worker.waitForCancellation();
  assert.deepEqual(worker.cancellations, [{ type: "CANCEL" }]);
  respond(reply); await pause();
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("timeout cancels preparation instead of abandoning a background lease", async (t) => {
  const worker = fakeWorker(t, () => {}), controller = new AbortController();
  await assert.rejects(requestOfflineWorker(worker, "PREPARE", controller.signal, () => new MessageChannel(), 15),
    (error) => error.code === "preparation-timeout");
  await worker.waitForCancellation();
  assert.deepEqual(worker.cancellations, [{ type: "CANCEL" }]);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("an already disposed owner creates no channel or worker request", async (t) => {
  const worker = fakeWorker(t, () => {}), controller = new AbortController(); controller.abort();
  await assert.rejects(requestOfflineWorker(worker, "PREPARE", controller.signal, () => { throw new Error("Must not create a channel"); }),
    (error) => error.name === "AbortError");
  assert.equal(worker.messages.length, 0);
});

test("malformed worker metadata cannot report a fresh saved version", async (t) => {
  const worker = fakeWorker(t, (_, respond) => respond({ ok: true, version: "invalid" }));
  await assert.rejects(requestOfflineWorker(worker, "PREPARE", new AbortController().signal, () => new MessageChannel()),
    (error) => error.code === "unexpected-response");
  await worker.waitForCancellation(); assert.deepEqual(worker.cancellations, [{ type: "CANCEL" }]);
});

test("cached status inspection requires no registration update or network call", async (t) => {
  const worker = fakeWorker(t, (_, respond) => respond(reply));
  let updates = 0, registrations = 0;
  const transport = createOfflineTransport({ getRegistration: async () => ({ active: worker, update: async () => { updates++; } }),
    register: async () => { registrations++; }, ready: Promise.resolve() });
  assert.equal((await transport.inspect(new AbortController().signal)).version, reply.version);
  assert.equal(updates, 0); assert.equal(registrations, 0);
  assert.deepEqual(worker.messages, [{ type: "STATUS" }]);
});

test("leaving during browser registration cannot start preparation when it later resolves", async (t) => {
  const worker = fakeWorker(t, (_, respond) => respond(reply));
  let resolveRegistration;
  const registration = new Promise((resolve) => { resolveRegistration = resolve; });
  const controller = new AbortController(); let registered = 0;
  const transport = createOfflineTransport({ getRegistration: async () => undefined,
    register: () => { registered++; return registration; }, ready: Promise.resolve({ active: worker }) });
  const pending = transport.prepare(controller.signal);
  await pause(); assert.equal(registered, 1);
  controller.abort(); await assert.rejects(pending, (error) => error.name === "AbortError");
  resolveRegistration({ active: worker }); await pause();
  assert.equal(worker.messages.length, 0);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("post failure is bounded and removes listeners", async () => {
  const controller = new AbortController();
  const worker = { postMessage() { throw new Error("Stopped worker"); } };
  await assert.rejects(requestOfflineWorker(worker, "PREPARE", controller.signal, () => new MessageChannel()),
    (error) => error.code === "worker-unavailable");
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("an unregistered or evicted registration is created again instead of reusing a stale promise", async (t) => {
  const worker = fakeWorker(t, (_, respond) => respond(reply));
  let current, registrations = 0;
  const transport = createOfflineTransport({ getRegistration: async () => current,
    register: async () => { registrations++; current = { active: worker, update: async () => {} }; return current; },
    ready: Promise.resolve({ active: worker }) });
  await transport.prepare(new AbortController().signal);
  current = undefined;
  await transport.prepare(new AbortController().signal);
  assert.equal(registrations, 2); assert.equal(worker.messages.length, 2);
});
