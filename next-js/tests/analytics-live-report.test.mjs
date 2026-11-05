import assert from "node:assert/strict";
import test from "node:test";
import { getLivePagesSnapshot, getLiveReportSnapshot, getLiveVisitorsSnapshot, getServerLiveSnapshot, refreshLiveReport,
  subscribeLiveReport } from "../src/components/analytics/dashboard/live-report.ts";

const live = (visitors = 2) => ({ visitors, visits: visitors, pages: [{ path: "/en", title: "Matches", visitors }],
  generatedAt: "2026-10-25T08:00:00.000Z" });

function browserFor(t, visibility = "visible") {
  const browser = new EventTarget(), document = new EventTarget();
  let reloads = 0;
  browser.location = { reload() { reloads++; } };
  document.visibilityState = visibility;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: browser });
  Object.defineProperty(globalThis, "document", { configurable: true, writable: true, value: document });
  t.mock.timers.enable({ apis: ["setInterval"] });
  const requests = [], subscriptions = [];
  t.mock.method(globalThis, "fetch", (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })));
  t.after(() => {
    subscriptions.forEach(unsubscribe => unsubscribe());
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else delete globalThis.window;
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument); else delete globalThis.document;
  });
  return { document, requests, reloads: () => reloads,
    subscribe(listener = () => {}) {
      const unsubscribe = subscribeLiveReport(listener);
      subscriptions.push(unsubscribe);
      return unsubscribe;
    },
    async reply(body, status = 200, task = refreshLiveReport()) {
      await Promise.resolve();
      requests.at(-1).resolve(Response.json(body, { status }));
      await task;
    },
  };
}

test("analytics live displays share one private request and expose stable primitive count snapshots", async t => {
  const view = browserFor(t);
  await refreshLiveReport();
  assert.equal(view.requests.length, 0);
  assert.equal(getServerLiveSnapshot(), null);
  assert.equal(getLiveReportSnapshot(), null);
  assert.equal(getLiveVisitorsSnapshot(), null);
  const unsubscribe = view.subscribe();
  view.subscribe(); view.subscribe();
  const request = refreshLiveReport();
  assert.equal(refreshLiveReport(), request);
  await Promise.resolve();
  assert.equal(view.requests.length, 1, "header, summary and active pages share a single request");
  const { url, options } = view.requests[0];
  assert.equal(url, "/api/analytics/live");
  assert.equal(options.cache, "no-store");
  assert.equal(options.credentials, "same-origin");
  assert.ok(options.signal instanceof AbortSignal);
  await view.reply(live(), 200, request);
  const before = getLiveVisitorsSnapshot();
  assert.equal(before, 2);
  await view.reply({ ...live(), generatedAt: "2026-10-25T08:00:15.000Z" });
  assert.equal(getLiveVisitorsSnapshot(), before, "unchanged counts do not rerender count consumers");
  unsubscribe();
  await view.reply(live(0));
  assert.equal(getLiveVisitorsSnapshot(), 0);
});

test("live polling pauses when hidden, resumes once and never overlaps requests", async t => {
  const view = browserFor(t, "hidden");
  view.subscribe();
  t.mock.timers.tick(30_000);
  await Promise.resolve();
  assert.equal(view.requests.length, 0);
  view.document.visibilityState = "visible";
  view.document.dispatchEvent(new Event("visibilitychange"));
  const request = refreshLiveReport();
  t.mock.timers.tick(45_000);
  await Promise.resolve();
  assert.equal(view.requests.length, 1);
  await view.reply(live(), 200, request);
  t.mock.timers.tick(15_000);
  await Promise.resolve();
  assert.equal(view.requests.length, 2);
  await view.reply(live(3));
  assert.equal(getLiveVisitorsSnapshot(), 3);
});

test("live pages retain unchanged branches while report clocks and subscriber notifications remain fresh", async t => {
  const view = browserFor(t);
  const snapshots = [];
  view.subscribe(() => snapshots.push(getLiveReportSnapshot()));
  const body = { ...live(), pages: [...live().pages, { path: "/en/slips", title: "Slips", visitors: 1 }] };
  await view.reply(body);
  const first = getLiveReportSnapshot(), pages = getLivePagesSnapshot();
  const refreshed = { ...body, generatedAt: "2026-10-25T08:00:15.000Z" };
  await view.reply(refreshed);
  assert.notEqual(getLiveReportSnapshot(), first, "the full report advances with the fresh server timestamp");
  assert.deepEqual(getLiveReportSnapshot(), refreshed);
  assert.equal(getLivePagesSnapshot(), pages, "timestamp-only polls do not replace the active-pages snapshot");
  assert.equal(snapshots.length, 2, "full-report listeners are notified for each accepted response");
  assert.equal(snapshots.at(-1), getLiveReportSnapshot());
  const current = getLiveReportSnapshot();
  await view.reply(refreshed);
  assert.equal(getLiveReportSnapshot(), current, "an entirely unchanged report keeps its snapshot identity");
  assert.equal(snapshots.length, 3, "subscription notification behavior stays unchanged");
  const changed = { ...refreshed, pages: [body.pages[0], { ...body.pages[1], title: "Slip results", visitors: 3 }] };
  await view.reply(changed);
  assert.deepEqual(getLiveReportSnapshot(), changed);
  assert.notEqual(getLivePagesSnapshot(), pages);
  assert.equal(getLivePagesSnapshot()[0], pages[0], "untouched pages retain their existing reference");
  assert.notEqual(getLivePagesSnapshot()[1], pages[1]);
  await view.reply({ ...changed, pages: [] });
  assert.deepEqual(getLivePagesSnapshot(), [], "an empty response clears previously active pages");
});

test("unmount aborts polling, clears private values and ignores late response parsing after a remount", async t => {
  const view = browserFor(t);
  const unsubscribe = view.subscribe();
  const oldRequest = refreshLiveReport();
  await Promise.resolve();
  let finishBody;
  view.requests[0].resolve({ ok: true, status: 200, json: () => new Promise(resolve => { finishBody = resolve; }) });
  await Promise.resolve();
  unsubscribe();
  assert.equal(view.requests[0].options.signal.aborted, true);
  assert.equal(getLiveReportSnapshot(), null);
  assert.equal(getLivePagesSnapshot(), null);
  t.mock.timers.tick(60_000);
  assert.equal(view.requests.length, 1);
  view.subscribe();
  await view.reply(live(4));
  finishBody(live(99));
  await oldRequest;
  assert.equal(getLiveVisitorsSnapshot(), 4, "an old session's delayed body cannot replace the current report");
});

test("temporary failures retain live values while session expiry clears them and rechecks the server gate once", async t => {
  const view = browserFor(t);
  view.subscribe();
  await view.reply(live(5));
  await view.reply({ message: "Unavailable" }, 503);
  assert.equal(getLiveVisitorsSnapshot(), 5);
  await view.reply({ message: "Log in to view analytics." }, 401);
  assert.equal(getLiveReportSnapshot(), null);
  assert.equal(getLivePagesSnapshot(), null);
  assert.equal(view.reloads(), 1);
  const before = view.requests.length;
  t.mock.timers.tick(60_000);
  await refreshLiveReport();
  assert.equal(view.requests.length, before, "expired sessions stop polling while the login redirect loads");
});
