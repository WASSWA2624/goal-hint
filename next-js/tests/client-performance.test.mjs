import assert from "node:assert/strict";
import test from "node:test";
import { getEventListeners } from "node:events";
import { startRequestDeadline } from "../src/domain/request-deadline.ts";
import { slipMatchStateForSelection, slipMatchStatesFromResults } from "../src/domain/slip-match-state.ts";
import { readJson } from "../src/state/refresh-base.ts";
import { getMemberSessionSnapshot, refreshMemberSession, subscribeMemberSession } from "../src/components/members/member-session.ts";
import { getPendingPaymentsSnapshot, refreshPendingPayments, subscribePendingPayments } from "../src/components/admin/pending-payments.ts";
import { getLiveVisitorsSnapshot, refreshLiveReport, subscribeLiveReport } from "../src/components/analytics/dashboard/live-report.ts";

const forecast = { cycleId: "cycle", revisionId: "revision", publishedAt: 1 };
const leg = (fixtureId, changes = {}) => ({ fixtureId, family: "match-result", selection: "home-win", forecast, ...changes });
const state = (fixtureId, changes = {}) => ({ ...leg(fixtureId), status: "live", outcome: "pending", score: { home: 1, away: 0 }, liveClock: null, ...changes });

test("slip observation joins are linear across a full list and retain exact original-pick matching", () => {
  let reads = 0;
  const count = 1_000;
  const states = Object.freeze(Array.from({ length: count }, (_, index) => Object.freeze({
    ...state(String(index)), get fixtureId() { reads++; return String(index); },
  })));
  for (let index = 0; index < count; index++) assert.equal(slipMatchStateForSelection(leg(String(index)), states), states[index]);
  assert.ok(reads <= count * 3, `${reads} fixture reads must stay linear rather than scanning 500,500 rows`);
  const first = states[0];
  const foreign = state("0", { forecast: { ...forecast, revisionId: "other" } });
  assert.equal(slipMatchStateForSelection(leg("0"), [foreign, first]), first);
  assert.equal(slipMatchStateForSelection(leg("0", { forecast: undefined }), [first]), undefined);
  assert.equal(slipMatchStateForSelection(leg("0", { family: "double-chance" }), [first]), undefined);
  assert.equal(slipMatchStateForSelection(leg("0", { selection: "away-win" }), [first]), undefined);
  const duplicate = state("0", { score: { home: 2, away: 0 } });
  assert.equal(slipMatchStateForSelection(leg("0"), [first, duplicate]), first, "first matching observation still wins");
  assert.equal(slipMatchStateForSelection(leg("0"), [duplicate]), duplicate, "a new snapshot replaces the old index");
});

test("result sidecars join only the matching fixture and original forecast without repeated full scans", () => {
  let reads = 0;
  const count = 1_000;
  const selections = Array.from({ length: count }, (_, index) => leg(String(index)));
  const results = selections.map((selection, index) => ({ ...selection,
    get fixtureId() { reads++; return String(index); }, status: "live", completed: false, regulationVerified: false,
    regulationHome: null, regulationAway: null, progress: { score: { home: index % 3, away: 0 }, liveClock: null },
  }));
  const observations = slipMatchStatesFromResults(selections, results);
  assert.equal(observations.length, count);
  assert.ok(reads < count * 8, `${reads} fixture reads must stay linear`);
  assert.equal(observations.at(-1).fixtureId, String(count - 1));
  assert.equal(observations.at(-1).outcome, "pending", "live scores never settle a pick early");
  assert.deepEqual(slipMatchStatesFromResults([leg("0", { forecast: { ...forecast, revisionId: "other" } })], results), []);
});

test("request deadlines abort slow body reads and release their own timer and listener", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const controller = new AbortController();
  startRequestDeadline(controller, 100);
  t.mock.timers.tick(99);
  assert.equal(controller.signal.aborted, false);
  t.mock.timers.tick(1);
  assert.equal(controller.signal.reason.name, "TimeoutError");
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  const finished = new AbortController(), dispose = startRequestDeadline(finished, 100);
  dispose(); t.mock.timers.tick(100);
  assert.equal(finished.signal.aborted, false);
  assert.equal(getEventListeners(finished.signal, "abort").length, 0);
});

test("completed feed/detail reads release abort relays and timers, while cancellation still reaches fetch", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const caller = new AbortController(), signals = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => { signals.push(options.signal); return Response.json({ accepted: true }); });
  for (let index = 0; index < 30; index++) assert.deepEqual(await readJson("/api/matches", caller.signal, 100), { accepted: true });
  assert.equal(getEventListeners(caller.signal, "abort").length, 0, "polling cannot accumulate abort listeners on older browsers");
  t.mock.timers.tick(100);
  assert.ok(signals.every(signal => !signal.aborted), "completed reads leave no active deadline");
  t.mock.method(globalThis, "fetch", (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
  }));
  const canceled = readJson("/api/matches", caller.signal, 100);
  caller.abort(new DOMException("Canceled", "AbortError"));
  await assert.rejects(canceled, { name: "AbortError" });
  assert.equal(getEventListeners(caller.signal, "abort").length, 0);
  const slow = readJson("/api/matches", new AbortController().signal, 100);
  t.mock.timers.tick(100);
  await assert.rejects(slow, { name: "TimeoutError" });
  t.mock.method(globalThis, "fetch", async (_url, options) => ({
    ok: true,
    text: () => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true })),
  }));
  const slowBody = readJson("/api/matches", new AbortController().signal, 100);
  await Promise.resolve();
  t.mock.timers.tick(100);
  await assert.rejects(slowBody, { name: "TimeoutError" }, "the deadline also covers a body stalled after response headers");
});

test("private shared polls recover from a hung request without changing confirmed values or overlapping consumers", async t => {
  for (const source of [
    { subscribe: subscribeMemberSession, refresh: refreshMemberSession, snapshot: getMemberSessionSnapshot,
      body: { phone: "+256700000001", administrator: false, subscription: null }, expected: "+256700000001" },
    { subscribe: subscribePendingPayments, refresh: refreshPendingPayments, snapshot: getPendingPaymentsSnapshot,
      body: { pendingCount: 7 }, expected: 7 },
    { subscribe: subscribeLiveReport, refresh: refreshLiveReport, snapshot: getLiveVisitorsSnapshot,
      body: { visitors: 4, visits: 4, pages: [], generatedAt: "2026-10-29T08:00:00Z" }, expected: 4 },
  ]) await t.test(source.refresh.name, async t => {
    t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
    const browser = new EventTarget(), document = new EventTarget();
    document.visibilityState = "visible";
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
    Object.defineProperty(globalThis, "document", { configurable: true, value: document });
    let unsubscribe = () => {};
    t.after(() => {
      unsubscribe();
      if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else delete globalThis.window;
      if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument); else delete globalThis.document;
    });
    let calls = 0;
    t.mock.method(globalThis, "fetch", (_url, options) => {
      calls++;
      if (calls === 1) return Promise.resolve(Response.json(source.body));
      return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true }));
    });
    unsubscribe = source.subscribe(() => {});
    await source.refresh();
    assert.equal(source.snapshot(), source.expected);
    const pending = source.refresh();
    assert.equal(source.refresh(), pending);
    await Promise.resolve();
    t.mock.timers.tick(15_000);
    await pending;
    assert.equal(source.snapshot(), source.expected, "timeouts retain the last confirmed display");
    t.mock.method(globalThis, "fetch", async () => Response.json(source.body));
    const recovered = source.refresh();
    assert.notEqual(recovered, pending, "a hung request cannot hold the deduplication lock forever");
    await recovered;
    assert.equal(source.snapshot(), source.expected);
  });
});
