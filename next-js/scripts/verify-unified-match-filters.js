/* eslint-disable @typescript-eslint/no-unused-vars -- Playwright CLI evaluates this function through run-code --filename. */
/** Run against a local feed or app-loading production rendering fixture. */
async function verifyUnifiedMatchFilters(page) {
  const origin = new URL(page.url()).origin;
  if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname)) throw new Error("Use a local acceptance fixture.");
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const results = [], errors = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const mode of ["light", "dark"]) for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/en/matches?when=today&picks=all`);
    await page.evaluate(value => localStorage.setItem("goal-hint-theme", value), mode);
    await page.reload();
    const form = page.locator("[data-feed-filters]"), opener = form.locator("[data-search-filters]");
    const dialog = form.locator("[data-criteria-dialog]");
    await dialog.locator("[data-feed-status]").waitFor({ state: "attached" });
    await page.waitForFunction(() => document.querySelector('[data-feed-filters] [data-criteria-dialog]')?.getAttribute('data-enhanced') === 'true');
    assert(await dialog.count() === 1, "Exactly one dialog serves every viewport");
    assert(await form.locator('input[type="date"]').count() === 2 && await form.locator('input[type="time"]').count() === 2, "Date/time fields are never duplicated");
    assert(await form.locator('select:not(dialog select)').count() === 0, "All filter selectors are inside the dialog");
    assert(!(await dialog.isVisible()), "Filters start closed");
    const before = page.url();
    await opener.click(); await dialog.waitFor({ state: "visible" });
    assert(await page.getByRole("dialog", { name: "Advanced Filters", exact: true }).count() === 1, "Dialog has the shared branded heading");
    assert(await dialog.locator('header img').count() === 1, "The dialog reuses the brand mark");
    const reset = dialog.getByRole("button", { name: "Reset Filters", exact: true });
    const apply = dialog.getByRole("button", { name: "Apply Filters", exact: true });
    assert(await dialog.locator('footer button').count() === 2, "Only Reset Filters and Apply Filters are in the footer");
    const resetBox = await reset.boundingBox(), applyBox = await apply.boundingBox();
    assert(resetBox.x < applyBox.x && Math.abs(resetBox.y - applyBox.y) < 1, "Reset stays left and Apply stays right");
    await dialog.locator('[data-feed-status]').selectOption("live");
    assert(await dialog.locator('[data-feed-period]').isDisabled(), "Live locks the period");
    assert(await dialog.locator('input[type="date"]').first().isDisabled(), "Live locks custom dates");
    assert(page.url() === before, "Editing does not apply filters");
    await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
    assert(await opener.evaluate(node => node === document.activeElement), "Dismissal restores opener focus");
    await opener.click();
    assert(await dialog.locator('[data-feed-status]').inputValue() === "all", "Dismissal rolls back the draft");
    const dates = dialog.locator('input[type="date"]');
    await dates.first().fill("2099-01-01");
    assert(await apply.isDisabled(), "Invalid date ranges cannot apply");
    await reset.click();
    assert(await dialog.isVisible() && page.url() === before, "Reset is a draft edit and keeps the dialog open");
    assert(!(await apply.isDisabled()), "Reset restores a valid draft");
    const geometry = await dialog.evaluate(node => {
      const body = node.querySelector('[data-feed-dialog]').parentElement, footer = node.querySelector('footer');
      const top = footer.getBoundingClientRect().top;
      body.scrollTop = body.scrollHeight;
      return { footerStable: Math.abs(footer.getBoundingClientRect().top - top) < 1,
        overflow: node.scrollWidth > node.clientWidth + 1, background: getComputedStyle(node).backgroundColor,
        fieldHeight: document.querySelector('[data-feed-search]').getBoundingClientRect().height,
        actionHeight: footer.querySelector('button').getBoundingClientRect().height };
    });
    assert(geometry.footerStable && !geometry.overflow, "The body scrolls without moving the footer or overflowing");
    assert(geometry.fieldHeight === geometry.actionHeight, "Search and footer buttons share the control height");
    await page.screenshot({ path: `output/playwright/match-filters-${mode}-${width}.png` });
    await page.keyboard.press("Escape");
    const count = page.locator('[data-match-count]');
    const visibleCount = await count.innerText();
    assert(width >= 1024 ? /^Showing .* matches$/.test(visibleCount) : !/Showing|matches/.test(visibleCount), "Result count uses the viewport's concise wording");
    const publication = page.locator('[data-prediction-publication]');
    if (await publication.count()) {
      const pattern = width < 1024 ? /^\d{2}-\d{2}-\d{4} \d{2}:\d{2} .+$/ : /^[A-Z]{3} \d{2}-[A-Za-z]{3}-\d{4} - \d{2}:\d{2} .+$/;
      assert(pattern.test(await publication.innerText()), "Publication label follows the viewport's compact format");
    }
    const header = await page.locator('[data-results-header]').evaluate(node => {
      const bounds = node.getBoundingClientRect(), title = node.querySelector('h2').getBoundingClientRect();
      const time = node.querySelector('time')?.getClientRects()[0];
      return { inset: title.left - bounds.left, inline: !time || Math.abs(time.top - title.top) <= 3 };
    });
    assert(header.inset >= 8 && header.inline, "The header has inner padding and starts the compact date beside its title");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "The page fits the viewport");
    await page.screenshot({ path: `output/playwright/match-header-${mode}-${width}.png` });
    // Apply and search each update the URL only when explicitly submitted.
    await opener.click();
    await dialog.locator('[data-feed-status]').selectOption("scheduled");
    await dialog.locator('[data-feed-period]').selectOption("next-7-days");
    await apply.click();
    await page.waitForURL(url => url.searchParams.get("status") === "scheduled" && url.searchParams.get("when") === "next-7-days");
    await form.locator('input[name="q"]').fill("Arsenal");
    await form.locator('[data-feed-search-submit]').click();
    await page.waitForURL(url => url.searchParams.get("q") === "Arsenal" && url.searchParams.get("status") === "scheduled");
    results.push({ mode, width, ...geometry, publication: await publication.count() > 0 });
  }
  assert(errors.length === 0, errors.join("; "));
  return { passed: results.length, results, pageErrors: errors };
}
