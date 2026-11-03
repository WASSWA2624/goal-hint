import assert from "node:assert/strict";

/** Run against a fixed-clock collection with at least three pages. Scrolling never appends records. */
export async function verifySlipBrowseControls(page) {
  const rows = page.locator("[data-slip-key]"), summary = page.locator("[data-best-slips-summary]");
  assert.equal(await rows.count(), 20);
  assert.equal(await page.locator("[data-load-more]").count(), 0);
  await page.locator("[data-best-slips-pagination]").scrollIntoViewIfNeeded();
  assert.equal(await rows.count(), 20);
  await page.locator('[data-best-slips-pagination] [data-pagination-page="3"]').click();
  await page.waitForFunction(() => document.querySelectorAll("[data-slip-key]").length === 20
    && document.querySelector("[data-best-slips-summary]")?.textContent.includes("41–60"));
  assert.equal(await rows.count(), 20);
  assert.match(await summary.innerText(), /41–60/);
  assert.equal(await page.locator("[data-numbered-pagination]").getAttribute("data-current-page"), "3");
}

export async function verifyMatchBrowseControls(page) {
  assert.equal(await page.locator("[data-fixture-id]").count(), 20);
  assert.equal(await page.locator("[data-load-more]").count(), 0);
  await page.locator('[data-feed-pagination] [data-pagination-page="2"]').click();
  await page.waitForFunction(() => document.querySelector("[data-feed-pages]")?.getAttribute("data-first-page") === "2");
  assert.equal(await page.locator("[data-fixture-id]").count(), 20);
  assert.match(await page.locator("[data-feed-pagination] > p").first().innerText(), /21–40/);
  assert.equal(await page.locator("[data-feed-pages]").getAttribute("data-first-page"), "2");
  assert.equal(await page.locator("[data-feed-pages]").getAttribute("data-last-page"), "2");
}
