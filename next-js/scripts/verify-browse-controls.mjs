import assert from "node:assert/strict";

/** Run against a fixed-clock collection with at least three pages. */
export async function verifySlipBrowseControls(page) {
  const rows = page.locator("[data-slip-key]"), summary = page.locator("[data-best-slips-summary]");
  const more = page.locator("[data-best-slips-pagination] [data-show-more]");
  const initial = await rows.evaluateAll((items) => items.map((item) => item.getAttribute("data-slip-key")));
  const href = page.url();
  assert.equal(await rows.count(), 20);
  await more.scrollIntoViewIfNeeded();
  assert.equal(await rows.count(), 20);
  const scroll = await page.evaluate(() => window.scrollY);
  await more.click();
  await page.waitForFunction(() => document.querySelectorAll("[data-slip-key]").length === 40);
  const loaded = await rows.evaluateAll((items) => items.map((item) => item.getAttribute("data-slip-key")));
  assert.deepEqual(loaded.slice(0, 20), initial);
  assert.equal(new Set(loaded).size, 40);
  assert.match(await summary.textContent(), /1–40/);
  assert.equal(page.url(), href);
  assert.equal(await more.evaluate((button) => document.activeElement === button), true);
  assert.ok(Math.abs(await page.evaluate(() => window.scrollY) - scroll) <= 2, "Appending changed the previous scroll position");
}

export async function verifyMatchBrowseControls(page, { initialSize = 50, total = 55 } = {}) {
  const rows = page.locator("[data-fixture-id]"), more = page.locator("[data-feed-pagination] [data-show-more]");
  const initial = await rows.evaluateAll((items) => items.map((item) => item.getAttribute("data-fixture-id")));
  const href = page.url();
  assert.equal(initial.length, initialSize);
  let requests = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const read = async (route) => {
    if (new URL(route.request().url()).searchParams.get("page") !== "2") return route.continue();
    requests++;
    if (requests === 1) { await gate; await route.fulfill({ status: 503, body: "Unavailable" }); }
    else await route.continue();
  };
  await page.route("**/api/matches?*", read);
  try {
    await more.click();
    await page.waitForFunction(() => document.querySelector("[data-show-more]")?.getAttribute("aria-busy") === "true");
    await more.evaluate((button) => button.click());
    assert.equal(await rows.count(), initialSize);
    release();
    await page.locator("[data-show-more-status]").waitFor();
    assert.equal(requests, 1);
    assert.equal(await rows.count(), initialSize);
    await more.click();
    await page.waitForFunction(() => document.querySelector("[data-feed-pages]")?.getAttribute("data-last-page") === "2");
  } finally {
    release();
    await page.unroute("**/api/matches?*", read);
  }
  const loaded = await rows.evaluateAll((items) => items.map((item) => item.getAttribute("data-fixture-id")));
  const displayed = Math.min(initialSize * 2, total);
  assert.deepEqual(loaded.slice(0, initialSize), initial);
  assert.equal(loaded.length, displayed);
  assert.equal(new Set(loaded).size, displayed);
  assert.ok((await page.locator("[data-feed-pagination] > p").first().innerText()).includes(`1–${displayed}`));
  assert.equal(await page.locator("[data-feed-pages]").getAttribute("data-first-page"), "1");
  assert.equal(await page.locator("[data-feed-pages]").getAttribute("data-last-page"), "2");
  assert.equal(page.url(), href);
  assert.equal(await more.count(), Number(displayed < total));
}
