/** Browser acceptance: replace a stale controlling worker, then open the real development app. */
import assert from "node:assert/strict";
import { createServer } from "node:http";

export async function verifyDevelopmentOfflineWorker(page, { origin = "http://localhost:3000" } = {}) {
  const response = await fetch(`${origin}/offline-worker.js`);
  assert.equal(response.status, 200);
  const replacement = await response.text();
  assert.match(replacement, /skipWaiting/);
  const savedDocument = "<html><head><title>Saved matches | Goal Hint</title></head><body><h1>Saved matches</h1></body></html>";
  const onlineDocument = "<html><head><title>Online development fixture</title></head><body><h1>Online development fixture</h1></body></html>";
  const legacyWorker = `
    self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
    self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
    self.addEventListener("fetch", event => {
      if (event.request.mode === "navigate") event.respondWith(
        caches.open("goal-hint-offline-bundle-v1-stale").then(cache => cache.match("/saved-document")));
    });`;
  let retire = false, workerRequests = 0;
  const server = createServer((request, reply) => {
    if (request.url === "/offline-worker.js") {
      workerRequests++;
      reply.writeHead(200, { "Content-Type": "application/javascript", "Cache-Control": "no-store", "Service-Worker-Allowed": "/" });
      reply.end(retire ? replacement : legacyWorker);
    } else {
      reply.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" });
      reply.end(onlineDocument);
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const fixtureOrigin = `http://127.0.0.1:${server.address().port}`;
  const context = await page.context().browser().newContext({ serviceWorkers: "allow" });
  try {
    const fixture = await context.newPage();
    await fixture.goto(fixtureOrigin);
    await fixture.evaluate(async (html) => {
      document.cookie = "development-recovery=preserved; path=/";
      localStorage.setItem("development-recovery", "preserved");
      await (await caches.open("unrelated-cache")).put("/sentinel", new Response("preserved"));
      await caches.open("goal-hint-offline-meta-v1");
      await (await caches.open("goal-hint-offline-bundle-v1-stale"))
        .put("/saved-document", new Response(html, { headers: { "Content-Type": "text/html" } }));
      await navigator.serviceWorker.register("/offline-worker.js", { scope: "/", updateViaCache: "none" });
      await navigator.serviceWorker.ready;
    }, savedDocument);
    await fixture.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await fixture.goto(`${fixtureOrigin}/en?preserved=1`);
    assert.equal(await fixture.title(), "Saved matches | Goal Hint", "Reproduce the cached document at the normal URL");
    retire = true;
    // A normal navigation must recover even though the saved HTML contains no app JavaScript.
    await fixture.reload({ waitUntil: "domcontentloaded" });
    await fixture.waitForFunction(() => document.title === "Online development fixture", null, { timeout: 30_000 });
    const state = await fixture.evaluate(async () => ({
      registrations: (await navigator.serviceWorker.getRegistrations()).length,
      caches: await caches.keys(), cookie: document.cookie,
      local: localStorage.getItem("development-recovery"),
      sentinel: await (await (await caches.open("unrelated-cache")).match("/sentinel")).text(),
      path: location.pathname + location.search,
    }));
    assert.equal(state.registrations, 0);
    assert.deepEqual(state.caches, ["unrelated-cache"]);
    assert.match(state.cookie, /development-recovery=preserved/);
    assert.equal(state.local, "preserved");
    assert.equal(state.sentinel, "preserved");
    assert.equal(state.path, "/en?preserved=1");
    await fixture.reload();
    assert.equal(await fixture.title(), "Online development fixture", "Recovery does not loop back to saved HTML");
    assert.ok(workerRequests >= 2, "The browser fetched replacement code from the existing worker URL");
  } finally {
    await context.close();
    await new Promise((resolve) => server.close(resolve));
  }

  await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator("[data-app-header]").waitFor();
  assert.equal(new URL(page.url()).pathname, "/en");
  assert.match(await page.title(), /Best Slips/);
  assert.equal(await page.getByRole("heading", { name: "Saved matches", exact: true }).count(), 0);
  assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0);
  return { passed: true, reproducedSavedPage: true, recoveredWithoutAppJavaScript: true,
    storagePreserved: true, title: await page.title(), url: page.url(), workerRequests };
}
