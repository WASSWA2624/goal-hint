import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

async function change(page, origin, body) {
  const response = await page.request.post(`${origin}/api/fixture`, { data: body });
  assert.equal(response.ok(), true, await response.text());
}

async function theme(page, mode) {
  await page.emulateMedia({ colorScheme: mode, reducedMotion: "reduce" });
  await page.evaluate(mode => {
    localStorage.setItem("goal-hint-theme", mode);
    dispatchEvent(new StorageEvent("storage", { key: "goal-hint-theme" }));
  }, mode);
  await page.waitForFunction(mode => document.querySelector('meta[name="color-scheme"]')?.content === mode, mode);
}

async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "No horizontal document overflow");
}

async function save(page) {
  const saved = page.waitForResponse(response => new URL(response.url()).pathname === "/api/admin/settings" && response.request().method() === "POST");
  await page.locator("[data-settings-save]").click();
  const response = await saved;
  assert.equal(response.ok(), true, await response.text());
  await page.waitForFunction(() => document.querySelector("[data-settings-editor]")?.getAttribute("aria-busy") === "false");
}

/** Run with an existing Playwright page; no external recipient is contacted. */
export async function verifyContactPage(page, origin, outputDirectory, { layoutsOnly = false } = {}) {
  const output = resolve(outputDirectory);
  await mkdir(output, { recursive: true });
  await change(page, origin, { reset: true });
  const failures = [];
  page.on("pageerror", error => failures.push(error.message));
  const admin = await page.context().newPage();
  admin.on("pageerror", error => failures.push(error.message));
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    await admin.setViewportSize({ width, height: 960 });
    await page.goto(`${origin}/en/contact`, { waitUntil: "domcontentloaded" });
    await admin.goto(`${origin}/admin/settings`, { waitUntil: "domcontentloaded" });
    await admin.locator("#settings-tab-support").click();
    for (const mode of ["light", "dark"]) {
      await theme(page, mode);
      await theme(admin, mode);
      assert.equal(await page.getByRole("link", { name: "Call Customer care" }).isVisible(), true, "Call visible on every viewport");
      assert.equal(await page.getByRole("link", { name: "WhatsApp Customer care" }).isVisible(), true, "WhatsApp visible on every viewport");
      const email = page.getByRole("link", { name: "support@example.test", exact: true });
      assert.equal(await email.isVisible(), true);
      assert.equal(decodeURIComponent(await email.getAttribute("href")), "mailto:support@example.test");
      assert.equal(await page.getByText("Checkout only", { exact: true }).count(), 0);
      assert.equal(await page.getByText("Hidden contact", { exact: true }).count(), 0);
      assert.equal(await admin.locator("#setting-contactPageEmail").isVisible(), true, "Editable email on every viewport");
      assert.equal(await admin.locator("#setting-contactPageEmailVisible").isVisible(), true);
      assert.equal(await admin.getByRole("checkbox", { name: "Show on Contact page", exact: true }).count(), 3);
      await noOverflow(page);
      await noOverflow(admin);
      await page.screenshot({ path: resolve(output, `contact-${width}-${mode}.png`), fullPage: true });
      await admin.screenshot({ path: resolve(output, `contact-settings-${width}-${mode}.png`), fullPage: true });
    }
  }

  if (layoutsOnly) {
    assert.deepEqual(failures, [], "No browser runtime errors");
    await admin.close();
    return { layouts: 8, errors: failures, output };
  }

  await admin.locator("#setting-contactPageEmail").fill("updated@example.test");
  await save(admin);
  await page.waitForFunction(() => [...document.querySelectorAll('a[href^="mailto:"]')].some(link => decodeURIComponent(link.getAttribute("href")) === "mailto:updated@example.test"), undefined, { timeout: 5_000 });
  await admin.getByLabel("Support contact 1", { exact: true }).getByRole("checkbox", { name: "Show on Contact page", exact: true }).uncheck();
  await save(admin);
  await page.waitForFunction(() => !document.querySelector('a[href="tel:+256772123456"]'), undefined, { timeout: 5_000 });
  const settings = await admin.request.get(`${origin}/api/contact`);
  assert.deepEqual((await settings.json()).supportContacts, [], "Page-only and global hidden contacts are absent");

  await page.bringToFront();
  const navigation = await page.evaluate(() => performance.timeOrigin);
  const started = Date.now();
  await change(page, origin, { changes: { contactPageEmail: "polled@example.test" } });
  await page.waitForFunction(() => [...document.querySelectorAll('a[href^="mailto:"]')].some(link => decodeURIComponent(link.getAttribute("href")) === "mailto:polled@example.test"), undefined, { timeout: 27_000 });
  const pollingMs = Date.now() - started;
  assert.ok(pollingMs < 30_000, `Automatic update arrived in ${pollingMs} ms`);
  assert.equal(await page.evaluate(() => performance.timeOrigin), navigation, "Automatic refresh does not reload the page");

  await change(page, origin, { unavailable: true });
  await page.waitForTimeout(16_000);
  assert.equal(await page.getByRole("link", { name: "polled@example.test", exact: true }).isVisible(), true, "Temporary outage retains confirmed contacts");
  await change(page, origin, { unavailable: false, changes: { contactPageEmailVisible: false, supportContacts: [] } });
  await page.waitForFunction(() => !document.querySelector('a[href^="mailto:"], a[href^="tel:"], a[href^="https://wa.me/"]'), undefined, { timeout: 27_000 });
  assert.ok((await page.locator("[data-contact-page]").innerText()).trim(), "All-hidden state has readable feedback");
  await page.screenshot({ path: resolve(output, "contact-empty.png"), fullPage: true });
  assert.equal(await page.evaluate(() => performance.timeOrigin), navigation);
  assert.deepEqual(failures, [], "No browser runtime errors");
  await admin.close();
  await change(page, origin, { reset: true });
  return { layouts: 8, pollingMs, liveAdminSave: "passed", outageRetention: "passed", allHidden: "passed", errors: failures, output };
}
