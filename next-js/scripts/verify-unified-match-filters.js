/* eslint-disable @typescript-eslint/no-unused-vars -- Playwright CLI evaluates this function through run-code --filename. */
/** Run against the local SQL-backed feed rendering fixture after its SSR checks pass. */
async function verifyUnifiedMatchFilters(page) {
  const origin = new URL(page.url()).origin;
  if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname)) throw new Error("Use the local acceptance fixture.");
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const form = page.locator("[data-desktop-feed-filters]");
  const phone = page.locator("[data-phone-query-filters]");
  const wait = async (status, period) => {
    try { await page.waitForURL((url) => (url.searchParams.get("status") ?? "all") === status && url.searchParams.get("when") === period); }
    catch { throw new Error(`Expected ${status}/${period} after Apply, got ${page.url()}`); }
    await page.waitForFunction(() => !document.querySelector('[data-feed-results][aria-busy="true"]'));
  };
  const checkRows = async (status) => {
    const rows = await page.locator("[data-fixture-id]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-status")));
    assert(rows.every((value) => status === "all" || (status === "finished" ? value.startsWith("finished-") : value === status)),
      `Every displayed record honors ${status}`);
    return rows.length;
  };
  const checks = [];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/en/matches?pageSize=30&picks=all`);
    const controls = width >= 1024 ? form : phone;
    await controls.waitFor();
    if (width < 1024) {
      // Wait for the Compact stack enhancement; the native SSR form retains
      // its period select until hydration replaces it with the date editor.
      await page.locator("[data-mobile-compact-filters]").waitFor();
      await page.getByRole("button", { name: /^Advanced filters/ }).click();
      await page.getByRole("dialog").waitFor();
      await page.getByRole("button", { name: "Close advanced filters", exact: true }).click();
    }
    const status = controls.locator("[data-feed-status]"), period = controls.locator("[data-feed-period]");
    const date = controls.locator("[data-mobile-date-filter]");
    const apply = async () => { if (width >= 1024) await form.getByRole("button", { name: "Apply filters", exact: true }).click(); };
    if (width >= 1024) assert(await period.locator("option").count() === 10, "All past, present, future and custom periods are available");
    else {
      await date.click();
      const editor = page.locator("[data-mobile-date-editor]");
      await editor.waitFor({ state: "visible" });
      for (const label of ["Last 30 days", "Last 7 days", "Last 3 days", "Yesterday", "Today", "Tomorrow", "Next 3 days", "Next 7 days", "Next 30 days"]) {
        assert(await editor.getByRole("button", { name: label, exact: true }).isVisible(), `Mobile dates retain the ${label} preset`);
      }
      assert(await editor.locator('input[type="date"]').count() === 2, "The single mobile date editor retains custom ranges");
      await editor.getByRole("button", { name: "Cancel", exact: true }).click();
      assert(await period.count() === 0, "Enhanced mobile dates have no duplicated period dropdown");
    }
    for (const value of ["live", "finished", "scheduled", "all"]) {
      await status.selectOption(value); await apply(); await wait(value, "today");
      await controls.waitFor();
      assert(await status.inputValue() === value, "Status controls and URL agree");
      if (width >= 1024) assert(await period.inputValue() === "today", "Desktop period and URL agree");
      else assert((await date.textContent()).includes("Today"), "Mobile date trigger and URL agree");
      assert(await (width >= 1024 ? period : date).isDisabled() === (value === "live"), "Only Live locks dates to Today");
      checks.push({ width, status: value, period: "today", rows: await checkRows(value) });
    }
    for (const value of ["next-3-days", "next-7-days", "next-30-days"]) {
      const label = { "next-3-days": "Next 3 days", "next-7-days": "Next 7 days", "next-30-days": "Next 30 days" }[value];
      if (width >= 1024) { await period.selectOption(value); await apply(); }
      else {
        await date.click();
        const editor = page.locator("[data-mobile-date-editor]");
        await editor.getByRole("button", { name: label, exact: true }).click();
        await editor.getByRole("button", { name: "Apply dates", exact: true }).click();
      }
      await wait("all", value); await controls.waitFor();
      assert(width >= 1024 ? await period.inputValue() === value : (await date.textContent()).includes(label), "Future period stays synchronized after reading stored results");
      assert(await checkRows("all") > 0, "Future ranges show genuine captured fixtures");
      checks.push({ width, status: "all", period: value });
    }
    assert(await page.getByRole("link", { name: "Live", exact: true }).count() === 0
      && await page.getByRole("link", { name: "Results", exact: true }).count() === 0, "One Matches navigation destination");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Filter layout fits the viewport");
    await page.screenshot({ path: `output/playwright/unified-matches-${width}.png`, fullPage: true });
  }
  // Use the real route with JavaScript disabled: the native period replaces old
  // dates, and legacy custom archive forms retain their original date range.
  const context = await page.context().browser().newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  try {
    const native = await context.newPage();
    await native.goto(`${origin}/en/matches?pageSize=30&picks=all`);
    await native.getByRole("combobox", { name: "Period", exact: true }).selectOption("next-7-days");
    await native.getByRole("button", { name: "Search", exact: true }).click();
    await native.waitForURL((url) => url.searchParams.get("when") === "next-7-days" && !url.searchParams.has("period"));
    assert(await native.locator("[data-fixture-id]").count() > 0, "Native future period reads stored records");
    await native.getByRole("combobox", { name: "Match status", exact: true }).selectOption("live");
    await native.getByRole("button", { name: "Search", exact: true }).click();
    await native.waitForURL((url) => url.searchParams.get("status") === "live" && url.searchParams.get("when") === "today");
    assert(await native.getByRole("combobox", { name: "Period", exact: true }).isDisabled(), "Native Live selects and locks Today");
    await native.goto(`${origin}/en/predictions/2026-09-10?to=2026-10-09&pageSize=30&picks=all`);
    await native.getByRole("button", { name: "Search", exact: true }).click();
    await native.waitForURL((url) => url.pathname === "/en/predictions/2026-09-10" && url.searchParams.get("to") === "2026-10-09" && !url.searchParams.has("period"));
    assert(await native.locator("[data-fixture-id]").count() > 0, "Native Custom retains historical data");
    checks.push({ nativePeriod: true, nativeLiveToday: true, nativeCustomArchive: true });
  } finally { await context.close(); }
  await page.evaluate((result) => { window.__unifiedMatchChecks = result; }, checks);
  return { passed: true, checks };
}
