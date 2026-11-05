import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const expectedKeys = ["today", "best-slips", "slips", "community", "invite-friends", "performance", "download", "contact", "privacy", "terms"];
const settled = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

/** Exercise real navigation against the local community-alerts fixture, without following community links. */
export async function verifyNavigationMenu(page, { origin, outputDirectory } = {}) {
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname), "Use a local navigation fixture.");
  if (outputDirectory) await mkdir(outputDirectory, { recursive: true });
  const checks = [], errors = [], browser = page.context().browser();
  const setScenario = async (sample, scenario) => {
    const response = await sample.request.post(`${origin}/api/fixture?reset=1&role=visitor&scenario=${scenario}`, { timeout: 45_000 });
    assert.equal(response.ok(), true, "Synthetic community scenario is available.");
  };
  const navigation = (sample, width) => sample.locator(`[data-responsive-navigation="${width < 1024 ? "mobile" : "desktop"}"]`).first();
  const disclosure = nav => nav.locator("[data-nav-more] details");
  async function waitOpen(nav, expected) {
    await nav.page().waitForFunction(({ kind, expected }) => {
      const menu = document.querySelector(`[data-responsive-navigation="${kind}"] [data-nav-more] details`);
      return !!menu?.open === expected;
    }, { kind: await nav.getAttribute("data-responsive-navigation"), expected });
  }
  async function open(nav) {
    if (!await disclosure(nav).evaluate(menu => menu.open)) await nav.locator("[data-nav-more] summary").click();
    await waitOpen(nav, true);
  }
  async function order(nav, keys = expectedKeys) {
    assert.deepEqual(await nav.locator("[data-nav-key]").evaluateAll(elements => elements.map(element => element.dataset.navKey)), keys,
      "Primary destinations and More retain one exact logical order.");
    const home = nav.locator('[data-nav-key="today"]');
    if (await home.count()) {
      assert.equal(new URL(await home.getAttribute("href"), origin).pathname, "/en/matches", "Matches is the home destination.");
      assert.equal(await home.locator("svg").count(), 1, "Matches retains its home icon.");
    }
    assert.equal(await nav.locator('[data-nav-key="help"]').count(), 0, "Help remains outside the main menu.");
  }
  async function fit(sample) {
    assert.equal(await sample.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, "No horizontal page overflow.");
    const escaped = await sample.locator('[data-responsive-navigation] [data-nav-key], [data-nav-more] summary').evaluateAll(elements => elements.flatMap(element => {
      if (!element.checkVisibility({ visibilityProperty: true })) return [];
      const bounds = element.getBoundingClientRect();
      return bounds.width > 0 && (bounds.left < -1 || bounds.right > innerWidth + 1) ? [element.textContent] : [];
    }));
    assert.deepEqual(escaped, [], "Visible navigation targets fit the viewport.");
  }
  async function community(sample, nav) {
    const trigger = nav.locator("[data-community-entry]");
    if (!await trigger.isVisible()) await open(nav);
    assert.equal(await trigger.evaluate(element => element.tagName), "BUTTON", "Community is a dialog action.");
    assert.equal(await trigger.getAttribute("href"), null, "Community does not navigate to a separate page.");
    const wasInline = !await trigger.evaluate(element => !!element.closest("details"));
    await trigger.click();
    const dialog = sample.getByRole("dialog", { name: "Join our community", exact: true });
    await dialog.waitFor();
    assert.equal(await disclosure(nav).evaluate(menu => menu.open), false, "Opening Community closes More.");
    const links = await dialog.locator("a[data-community-type]").evaluateAll(elements => elements.map(element => ({
      href: element.href, target: element.target, rel: element.rel,
    })));
    assert.equal(links.length, 6, "Configured community channels remain available.");
    assert.ok(links.every(link => /TEST_ONLY_FIXTURE|gh_fixture/u.test(link.href) && link.target === "_blank" && link.rel.includes("noopener")));
    await sample.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await sample.waitForFunction(wasInline => wasInline ? document.activeElement?.hasAttribute("data-community-entry")
      : document.activeElement?.tagName === "SUMMARY", wasInline);
    assert.equal(await disclosure(nav).evaluate(menu => menu.open), false, "Closing Community does not reopen More.");
  }

  for (const width of [320, 390, 1440]) for (const theme of ["light", "dark"]) {
    const mobile = width < 1024;
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: mobile, colorScheme: theme, reducedMotion: "reduce" });
    const sample = await context.newPage();
    sample.setDefaultTimeout(15_000);
    sample.setDefaultNavigationTimeout(45_000);
    sample.on("pageerror", error => errors.push({ width, theme, message: error.message }));
    await context.addInitScript(theme => localStorage.setItem("goal-hint-theme", theme), theme);
    try {
      await setScenario(sample, "configured");
      await sample.goto(`${origin}/en/matches`, { waitUntil: "domcontentloaded" });
      const nav = navigation(sample, width), menu = disclosure(nav), summary = nav.locator("[data-nav-more] summary");
      await nav.locator("[data-community-entry]").waitFor({ state: "attached" });
      await sample.waitForFunction(theme => document.querySelector('meta[name="color-scheme"]')?.content === theme, theme);
      await sample.evaluate(() => document.fonts.ready); await settled(sample);
      await order(nav); await fit(sample);
      assert.equal(await sample.locator('footer a[href="/en/help"]').count(), 1, "Help remains in the footer.");
      for (let toggle = 0; toggle < 3; toggle++) {
        await summary.click(); await waitOpen(nav, true);
        await summary.click(); await waitOpen(nav, false);
      }
      // Native open can precede React's deferred toggle event; touch-down alone must dismiss it.
      await nav.evaluate(element => {
        element.querySelector("[data-nav-more] summary").click();
        document.querySelector("[data-community-fixture]").dispatchEvent(new PointerEvent("pointerdown", { pointerType: "touch", isPrimary: true, bubbles: true }));
      });
      await waitOpen(nav, false);
      await open(nav);
      if (mobile) {
        const cdp = await context.newCDPSession(sample);
        const bounds = await sample.locator("[data-community-fixture]").boundingBox();
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: bounds.x + 8, y: bounds.y + 8 }] });
        await waitOpen(nav, false);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await cdp.detach();
      } else {
        await sample.locator("[data-community-fixture]").click(); await waitOpen(nav, false);
      }
      await open(nav);
      await menu.locator('a, button[data-community-entry]').first().focus();
      await sample.keyboard.press("Escape"); await waitOpen(nav, false);
      assert.equal(await summary.evaluate(element => document.activeElement === element), true, "Escape returns focus to More.");
      await open(nav);
      const outside = sample.locator('footer a[href="/en/help"]');
      await outside.focus(); await waitOpen(nav, false);
      assert.equal(await outside.evaluate(element => document.activeElement === element), true, "Focus leave does not steal the next control's focus.");
      await community(sample, nav);
      await open(nav); await settled(sample); await fit(sample);
      if (outputDirectory) await sample.screenshot({ path: join(outputDirectory, `menu-${width}-${theme}.png`) });
      checks.push({ width, theme, logicalOrder: true, homeMatches: true, toggle: true, outsideTouchBeforeClick: true,
        escapeFocus: true, focusLeave: true, configuredCommunity: true, dialogFocus: true, noOverflow: true });

      if (theme === "dark") {
        await nav.locator('[data-nav-key="contact"]').click();
        await sample.waitForURL(url => url.pathname === "/en/contact");
        await waitOpen(nav, false);
        await open(nav); await settled(sample);
        await sample.evaluate(() => history.pushState(null, "", `${location.pathname}?menu-check=query`));
        await waitOpen(nav, false);
        await open(nav); await sample.goBack(); await waitOpen(nav, false);
        await open(nav); await sample.goForward(); await waitOpen(nav, false);
        await open(nav); await sample.evaluate(() => { location.hash = "menu-check"; }); await waitOpen(nav, false);
        checks.push({ width, theme, linkNavigation: true, queryNavigation: true, historyBack: true, historyForward: true, hashNavigation: true });
      }
      if (width === 390 && theme === "dark") {
        await sample.setViewportSize({ width, height: 280 }); await settled(sample); await open(nav);
        const popup = menu.locator("ul");
        assert.equal(await popup.evaluate(element => element.scrollHeight > element.clientHeight), true, "Short viewport requires internal menu scrolling.");
        await popup.hover(); await sample.mouse.wheel(0, 180);
        await sample.waitForFunction(() => document.querySelector('[data-responsive-navigation="mobile"] [data-nav-more] ul')?.scrollTop > 0);
        await waitOpen(nav, true); await fit(sample);
        if (outputDirectory) await sample.screenshot({ path: join(outputDirectory, "menu-internal-scroll-390-dark.png") });
        checks.push({ internalScrollPreservesOpenMenu: true, shortViewportFits: true });
      }
      if (width === 1440 && theme === "dark") {
        await open(nav); await summary.focus();
        await sample.setViewportSize({ width: 390, height: 900 });
        await sample.waitForFunction(() => !document.querySelector('[data-responsive-navigation="desktop"] details')?.open);
        const phone = navigation(sample, 390); await order(phone); await fit(sample);
        assert.equal(await phone.evaluate(element => element.contains(document.activeElement)), true, "Breakpoint change retains navigation focus.");
        await open(phone);
        await sample.setViewportSize({ width: 1440, height: 900 });
        await sample.waitForFunction(() => !document.querySelector('[data-responsive-navigation="mobile"] details')?.open);
        await order(nav); await fit(sample);
        checks.push({ desktopToPhoneDismissal: true, phoneToDesktopDismissal: true, breakpointFocus: true });
      }
    } catch (error) {
      if (outputDirectory) await sample.screenshot({ path: join(outputDirectory, `failure-${width}-${theme}.png`), fullPage: true });
      error.checks = checks;
      throw error;
    } finally { await context.close(); }
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const sample = await context.newPage(); sample.setDefaultTimeout(15_000); sample.setDefaultNavigationTimeout(45_000);
  sample.on("pageerror", error => errors.push({ scenario: "visibility", message: error.message }));
  try {
    await setScenario(sample, "hidden");
    const hiddenConfiguration = sample.waitForResponse(response => response.url().endsWith("/api/community"));
    await sample.goto(`${origin}/en/matches`, { waitUntil: "domcontentloaded" });
    await hiddenConfiguration;
    await settled(sample);
    await order(navigation(sample, 1440), expectedKeys.filter(key => key !== "community"));
    assert.equal(await sample.locator("[data-community-entry]").count(), 0, "Disabled Community stays hidden.");
    const desktop = navigation(sample, 1440), primary = desktop.locator(":scope > ul > li > [data-nav-key]");
    assert.equal(await primary.count(), 5, "The desktop focus fixture reaches the five-item primary limit.");
    const focusedKey = await primary.last().getAttribute("data-nav-key");
    await primary.last().focus();
    const refreshCommunity = () => sample.evaluate(() => {
      // Advance only this synthetic page's freshness clock; no real settings or polling delays are involved.
      window.__navigationDateNow ??= Date.now.bind(Date);
      window.__navigationTimeOffset = (window.__navigationTimeOffset ?? 0) + 60_000;
      Date.now = () => window.__navigationDateNow() + window.__navigationTimeOffset;
      window.dispatchEvent(new Event("focus"));
    });
    await setScenario(sample, "configured"); await refreshCommunity();
    await desktop.locator("[data-community-entry]").waitFor({ state: "attached" });
    await sample.waitForFunction(key => document.activeElement?.getAttribute("data-nav-key") === key, focusedKey);
    assert.equal(await desktop.locator(`[data-nav-key="${focusedKey}"]`).evaluate(element => !!element.closest("details")), true,
      "Adding Community moves the focused destination into More.");
    assert.equal(await disclosure(desktop).evaluate(menu => menu.open), true, "Moved focus stays reachable inside More.");
    const outside = sample.locator('footer a[href="/en/help"]'); await outside.focus();
    await setScenario(sample, "hidden"); await refreshCommunity();
    await desktop.locator("[data-community-entry]").waitFor({ state: "detached" }); await settled(sample);
    assert.equal(await outside.evaluate(element => document.activeElement === element), true, "Visibility changes do not steal outsider focus.");
    checks.push({ runtimeCommunityVisibility: true, focusedKey, focusMovesIntoMore: true, outsiderFocusPreserved: true });
    await setScenario(sample, "configured"); await refreshCommunity();
    const responsiveAction = desktop.locator("[data-community-entry]"); await responsiveAction.waitFor({ state: "visible" });
    await responsiveAction.click();
    const responsiveDialog = sample.getByRole("dialog", { name: "Join our community", exact: true }); await responsiveDialog.waitFor();
    await sample.setViewportSize({ width: 390, height: 900 }); await settled(sample);
    assert.equal(await responsiveDialog.isVisible(), true, "An open Community dialog survives a desktop-to-phone breakpoint.");
    await sample.keyboard.press("Escape"); await responsiveDialog.waitFor({ state: "hidden" }); await settled(sample);
    assert.equal(await sample.evaluate(() => {
      const active = document.activeElement;
      return active?.checkVisibility({ visibilityProperty: true })
        && active.closest('[data-responsive-navigation="mobile"]') !== null
        && (active.getAttribute("data-nav-key") === "community" || active.tagName === "SUMMARY");
    }), true, "Dialog dismissal returns focus to the visible Community action or More.");
    checks.push({ communityDialogSurvivesBreakpoint: true, dialogReturnsVisibleNavigationFocus: true });
    await sample.setViewportSize({ width: 320, height: 900 }); await settled(sample);
    const phone = navigation(sample, 320), phoneAction = phone.locator("[data-community-entry]");
    if (!await phoneAction.isVisible()) await open(phone);
    await phoneAction.click(); await responsiveDialog.waitFor();
    await sample.setViewportSize({ width: 1440, height: 900 }); await settled(sample);
    assert.equal(await responsiveDialog.isVisible(), true, "An open Community dialog survives a phone-to-desktop breakpoint.");
    await sample.keyboard.press("Escape"); await responsiveDialog.waitFor({ state: "hidden" }); await settled(sample);
    assert.equal(await desktop.locator("[data-community-entry]").evaluate(element => document.activeElement === element), true,
      "Phone-to-desktop dialog dismissal restores the visible Community action.");
    checks.push({ phoneToDesktopCommunityDialog: true, desktopCommunityFocusRestored: true });
    await setScenario(sample, "configured");
    await sample.setViewportSize({ width: 1440, height: 900 });
    await sample.goto(`${origin}/navigation-fit`, { waitUntil: "domcontentloaded" });
    const short = sample.locator("[data-community-short-navigation]");
    const action = short.locator("[data-community-entry]"); await action.waitFor(); await settled(sample);
    assert.equal(await short.locator("[data-nav-more]").count(), 0, "All-fit navigation does not force More.");
    assert.equal(await action.evaluate(element => element.tagName), "BUTTON");
    await action.click();
    const dialog = sample.getByRole("dialog", { name: "Join our community", exact: true }); await dialog.waitFor();
    assert.equal(await dialog.locator("a[data-community-type]").count(), 6);
    await sample.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
    assert.equal(await action.evaluate(element => document.activeElement === element), true, "All-fit dialog returns focus to its action.");
    checks.push({ communityVisibility: true, allFitNoMore: true, inlineCommunityDialog: true, inlineDialogFocus: true });
  } catch (error) {
    if (outputDirectory) await sample.screenshot({ path: join(outputDirectory, "failure-visibility.png"), fullPage: true });
    error.checks = checks;
    throw error;
  } finally { await context.close(); }
  assert.deepEqual(errors, [], "No browser runtime errors.");
  return { passed: true, checks, browserErrors: errors, externalLinksFollowed: 0 };
}
