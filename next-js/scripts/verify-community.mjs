import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const types = ["whatsapp-group", "whatsapp-channel", "telegram-channel", "tiktok", "x", "instagram"];
const externalHosts = new Set(["whatsapp.com", "www.whatsapp.com", "chat.whatsapp.com", "telegram.org", "t.me", "www.tiktok.com", "tiktok.com", "x.com", "www.instagram.com", "instagram.com"]);

async function scenario(page, origin, values) {
  const response = await page.request.post(`${origin}/api/fixture?${new URLSearchParams(values)}`);
  assert.equal(response.ok(), true, "fixture state update");
}

async function openCommunity(page, width) {
  const navigation = page.locator(`[data-responsive-navigation="${width < 1024 ? "mobile" : "desktop"}"]`).first();
  await navigation.locator("[data-nav-more] summary").click();
  await navigation.locator("[data-community-entry]").click();
  const dialog = page.getByRole("dialog", { name: "Join our community" });
  await dialog.waitFor({ state: "visible" });
  assert.equal(await dialog.getByRole("heading", { name: "Join our community" }).locator("svg").count(), 1, "community heading includes its icon");
  return dialog;
}

async function theme(page, mode) {
  await page.emulateMedia({ colorScheme: mode, reducedMotion: "reduce" });
  await page.evaluate(mode => {
    localStorage.setItem("goal-hint-theme", mode);
    dispatchEvent(new StorageEvent("storage", { key: "goal-hint-theme" }));
  }, mode);
  await page.waitForFunction(mode => document.querySelector('meta[name="color-scheme"]')?.getAttribute("content") === mode, mode);
}

async function save(page) {
  const result = page.waitForResponse(response => new URL(response.url()).pathname === "/api/admin/settings" && response.request().method() === "POST");
  await page.locator("[data-settings-save]").click();
  const response = await result;
  assert.equal(response.ok(), true, `save settings: ${await response.text()}`);
  await page.waitForFunction(() => document.querySelector("[data-settings-editor]")?.getAttribute("aria-busy") === "false");
  await page.waitForFunction(() => document.querySelector("[data-settings-save]")?.disabled === true);
}

async function openSettings(page, origin) {
  await scenario(page, origin, { role: "admin" });
  await page.goto(`${origin}/admin/settings`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector('meta[name="color-scheme"]'));
  await page.locator("#settings-tab-community").click();
  await page.locator("[data-community-settings]").waitFor({ state: "visible" });
}

async function publicConfiguration(page, origin) {
  const response = await page.request.get(`${origin}/api/community`);
  assert.equal(response.ok(), true);
  return response.json();
}

async function noOverflow(page, scope = "body") {
  const failures = await page.locator(scope).evaluate(root => {
    const elements = [root, ...root.querySelectorAll("input, a, button, label")];
    return elements.flatMap(element => {
      if (!element.checkVisibility({ visibilityProperty: true })) return [];
      const bounds = element.getBoundingClientRect();
      return bounds.width > 0 && (bounds.left < -1 || bounds.right > innerWidth + 1)
        ? [{ element: element.tagName, text: element.textContent?.trim(), left: bounds.left, right: bounds.right }] : [];
    });
  });
  assert.deepEqual(failures, [], "controls must fit the viewport");
}

/** Run against verify-community-alerts-rendering.py --serve. External links are intercepted, never joined. */
export async function verifyCommunity(page, origin, { widths = [320, 390, 1440], screenshotDirectory } = {}) {
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname), "Use the local fixture.");
  page.setDefaultTimeout(15_000);
  if (screenshotDirectory) await mkdir(screenshotDirectory, { recursive: true });
  const checks = [];
  const externalRoute = url => url.protocol === "https:" && externalHosts.has(url.hostname);
  const intercepted = [];
  const intercept = async route => {
    intercepted.push(route.request().url());
    await route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Fixture external destination</title><p>Synthetic platform destination.</p>" });
  };
  await page.context().route(externalRoute, intercept);
  try {
    for (const width of widths) {
      await page.setViewportSize({ width, height: 1000 });
      for (const mode of ["light", "dark"]) {
        await scenario(page, origin, { reset: "1", role: "visitor", scenario: "unconfigured" });
        await page.goto(origin, { waitUntil: "domcontentloaded" });
        await theme(page, mode);
        assert.equal(await page.locator("[data-settings-editor]").count(), 0, "public screen must not expose settings");
        const session = await (await page.request.get(`${origin}/api/account/session`)).json();
        assert.equal(session.phone, null, "community works logged out");
        const dialog = await openCommunity(page, width);
        const rows = dialog.locator("[data-community-type]");
        const destinations = await rows.evaluateAll(elements => elements.map(element => ({
          type: element.dataset.communityType, tag: element.tagName, href: element.getAttribute("href"),
          tabindex: element.getAttribute("tabindex"), tabIndex: element.tabIndex,
          interactiveChildren: element.querySelectorAll('a, button, input, select, textarea, [tabindex], [data-community-action]').length,
          text: element.textContent, icon: Boolean(element.querySelector("svg")), height: element.getBoundingClientRect().height,
        })));
        assert.deepEqual(destinations.map(link => link.type).sort(), [...types].sort());
        for (const link of destinations) {
          assert.equal(link.tag, "DIV", `${link.type}: unconfigured channels are plain rows`);
          assert.equal(link.href, null);
          assert.equal(link.tabindex, null);
          assert.equal(link.tabIndex, -1, `${link.type}: coming-soon rows are not focus targets`);
          assert.equal(link.interactiveChildren, 0);
          assert.match(link.text, /Coming soon/u);
          assert.doesNotMatch(link.text, /Open website|Join|Follow|Link not added yet/iu);
          assert.equal(link.icon, true, `${link.type}: platform icon`);
          assert.ok(link.height >= 39, `${link.type}: full control height`);
        }
        assert.equal(await dialog.locator("a").count(), 0, "unconfigured channels have no external links");
        await noOverflow(page, "dialog[open]");
        if (screenshotDirectory) await page.screenshot({ path: resolve(screenshotDirectory, `community-${mode}-${width}.png`) });
        const beforeClick = { url: page.url(), pages: page.context().pages().length, requests: intercepted.length };
        await rows.first().click();
        assert.equal(page.url(), beforeClick.url, "coming-soon rows do not navigate");
        assert.equal(page.context().pages().length, beforeClick.pages, "coming-soon rows do not open a popup");
        assert.equal(intercepted.length, beforeClick.requests, "coming-soon rows do not request a platform");
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });

        await openSettings(page, origin);
        await theme(page, mode);
        const editor = page.locator("[data-community-settings]");
        assert.equal(await editor.locator('input[type="url"]').count(), 6);
        assert.equal(await page.locator("#setting-communityVisible").isChecked(), true);
        assert.equal(await page.locator("[data-settings-save]").isDisabled(), true, "defaults are not unsaved changes");
        await noOverflow(page, "[data-community-settings]");
        if (screenshotDirectory) await page.screenshot({ path: resolve(screenshotDirectory, `community-settings-${mode}-${width}.png`) });
        await editor.locator('[data-community-type="x"] input[type="url"]').fill("https://x.com/gh_fixture");
        await editor.locator('[data-community-type="instagram"] input[type="checkbox"]').uncheck();
        await page.getByRole("button", { name: "Undo", exact: true }).click();
        assert.equal(await editor.locator('[data-community-type="x"] input[type="url"]').inputValue(), "");
        assert.equal(await editor.locator('[data-community-type="instagram"] input[type="checkbox"]').isChecked(), true);
        assert.equal(await page.locator("[data-settings-save]").isDisabled(), true, "undo restores the saved configuration");
        await editor.locator('[data-community-type="x"] input[type="url"]').fill("https://x.com/gh_fixture");
        await editor.locator('[data-community-type="instagram"] input[type="checkbox"]').uncheck();
        await save(page);
        let configuration = await publicConfiguration(page, origin);
        assert.equal(configuration.visible, true);
        assert.equal(configuration.links.length, 5);
        assert.equal(configuration.links.find(link => link.type === "x").url, "https://x.com/gh_fixture");
        assert.equal(configuration.links.some(link => link.type === "instagram"), false, "hidden destination is omitted from the public API");
        const updatedDialog = await openCommunity(page, width);
        await page.waitForFunction(() => document.querySelectorAll("dialog[open] [data-community-type]").length === 5
          && document.querySelectorAll("dialog[open] a[data-community-type]").length === 1);
        assert.equal(await updatedDialog.locator("[data-community-type]").count(), 5, "save refreshes the public panel in the same page");
        assert.equal(await updatedDialog.locator("div[data-community-type]").count(), 4, "remaining blank channels stay non-interactive");
        const configuredLink = updatedDialog.locator('a[data-community-type="x"]');
        assert.equal(await configuredLink.getAttribute("href"), "https://x.com/gh_fixture");
        assert.equal(await configuredLink.getAttribute("target"), "_blank");
        assert.match(await configuredLink.getAttribute("rel"), /noopener/u);
        assert.match(await configuredLink.textContent(), /Follow/u);
        assert.doesNotMatch(await configuredLink.textContent(), /Coming soon/u);
        const popupPromise = page.waitForEvent("popup");
        await configuredLink.click();
        const popup = await popupPromise;
        await popup.waitForLoadState("domcontentloaded");
        assert.equal(popup.url(), "https://x.com/gh_fixture", "configured links open outside the app");
        await popup.close();
        await page.keyboard.press("Escape");
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => document.querySelector('meta[name="color-scheme"]'));
        await page.locator("#settings-tab-community").click();
        assert.equal(await editor.locator('[data-community-type="x"] input[type="url"]').inputValue(), "https://x.com/gh_fixture");
        assert.equal(await editor.locator('[data-community-type="instagram"] input[type="checkbox"]').isChecked(), false);
        await page.locator("#setting-communityVisible").uncheck();
        await save(page);
        configuration = await publicConfiguration(page, origin);
        assert.deepEqual(configuration, { visible: false, links: [] }, "master visibility hides links from public responses");
        await scenario(page, origin, { role: "visitor" });
        const publicResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/community");
        await page.goto(origin, { waitUntil: "domcontentloaded" });
        await publicResponse;
        await page.waitForFunction(() => !document.querySelector("[data-community-entry]"));
        checks.push({ mode, width, channels: destinations.length, comingSoon: true, nonInteractive: true,
          publicAccess: true, saveAndReload: true, undo: true, immediateRefresh: true, visibility: true });
      }
    }

    await scenario(page, origin, { reset: "1", scenario: "configured", role: "active" });
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    const configuredDialog = await openCommunity(page, widths.at(-1));
    const configuredLinks = await configuredDialog.locator("a[data-community-type]").evaluateAll(elements => elements.map(element => ({ href: element.href, text: element.textContent })));
    assert.equal(configuredLinks.length, 6, "signed-in visitors see configured channels");
    assert.ok(configuredLinks.every(link => /TEST_ONLY_FIXTURE|gh_fixture/u.test(link.href) && !/Coming soon/iu.test(link.text)));
    await page.keyboard.press("Escape");

    await scenario(page, origin, { scenario: "all-hidden", role: "visitor" });
    assert.deepEqual(await publicConfiguration(page, origin), { visible: true, links: [] });
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    const emptyDialog = await openCommunity(page, widths.at(-1));
    assert.equal(await emptyDialog.locator("[data-community-type]").count(), 0, "disabled channels never reappear as defaults");
    await page.keyboard.press("Escape");

    await scenario(page, origin, { scenario: "unconfigured", role: "visitor" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${origin}/navigation-fit`, { waitUntil: "domcontentloaded" });
    const shortNavigation = page.locator("[data-community-short-navigation]");
    await shortNavigation.locator("[data-nav-more] summary").click();
    await shortNavigation.locator("[data-community-entry]").click();
    assert.equal(await page.getByRole("dialog", { name: "Join our community" }).locator("div[data-community-type]").count(), 6,
      "Community remains available when every normal navigation item fits");
    assert.ok(intercepted.length >= widths.length * 2, "platform navigation was exercised");
    return { passed: true, checks, configuredAccess: true, allHidden: true, noOverflowMenu: true, externalOpens: intercepted.length };
  } finally {
    await page.context().unroute(externalRoute, intercept);
  }
}
