import assert from "node:assert/strict";

/** Run against a fixed-clock acceptance collection with at least three pages.
 * Page jumps must win even when revealing pagination also reveals the load-more observer. */
export async function verifySlipBrowseControls(page) {
  const rows = page.locator("[data-slip-key]"), summary = page.locator("[data-best-slips-summary]");
  assert.equal(await rows.count(), 20);
  await page.locator("[data-load-more]").scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelectorAll("[data-slip-key]").length === 40);
  assert.match(await summary.innerText(), /1–40/);
  await page.locator('[data-best-slips-pagination] [data-pagination-page="3"]').click();
  await page.waitForFunction(() => document.querySelectorAll("[data-slip-key]").length === 20
    && document.querySelector("[data-best-slips-summary]")?.textContent.includes("41–60"));
  assert.equal(await rows.count(), 20);
  assert.equal(await page.locator("[data-numbered-pagination]").getAttribute("data-current-page"), "3");
}

export async function verifyMatchBrowseControls(page) {
  assert.equal(await page.locator("[data-fixture-id]").count(), 20);
  await page.locator("[data-load-more]").scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelectorAll("[data-fixture-id]").length === 40);
  assert.match(await page.locator("[data-feed-pagination] > p").first().innerText(), /1–40/);
  assert.equal(await page.locator("[data-feed-pages]").getAttribute("data-first-page"), "1");
  assert.equal(await page.locator("[data-feed-pages]").getAttribute("data-last-page"), "2");
}
