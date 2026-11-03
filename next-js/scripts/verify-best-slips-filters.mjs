/** Browser acceptance against /best-slips/browse in the synthetic slip rendering fixture. */
export async function verifyBestSlipsFilters(page, origin, widths = [320, 390, 1024, 1440]) {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const results = [], errors = [];
  const recordError = error => errors.push(error.message);
  page.on("pageerror", recordError);
  for (const mode of ["light", "dark"]) for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/best-slips/browse`);
    await page.evaluate(mode => localStorage.setItem("goal-hint-theme", mode), mode);
    await page.reload();
    const trigger = page.locator("[data-best-slips-filter-trigger]");
    await trigger.waitFor();
    const geometry = await trigger.evaluate(button => {
      const summary = button.closest("[data-performance-summary]"), cards = summary.querySelector("[data-performance-figures]").getBoundingClientRect();
      const action = button.getBoundingClientRect(), bar = document.querySelector("[data-best-slips-applied]");
      const count = bar.querySelector("[data-best-slips-summary]").getBoundingClientRect(), bounds = bar.getBoundingClientRect();
      return { beside: Math.abs(action.top - cards.top) < 1 && Math.abs(action.height - cards.height) < 1 && action.left > cards.right,
        below: action.top >= cards.bottom && Math.abs(action.left - cards.left) < 1 && Math.abs(action.right - cards.right) < 1,
        countAtEnd: bounds.right - count.right <= 9, fits: document.documentElement.scrollWidth <= innerWidth,
        coarse: matchMedia("(pointer: coarse)").matches, height: action.height,
        controlHeight: parseFloat(getComputedStyle(button).getPropertyValue("--form-control-height")) };
    });
    assert(width >= 1024 ? geometry.beside : geometry.below, `${mode}/${width}: responsive filter action ${JSON.stringify(geometry)}`);
    assert(geometry.fits && geometry.countAtEnd, "Results count stays at the far right without page overflow");
    assert(geometry.height >= geometry.controlHeight, "The filter action retains the shared control minimum");
    assert(await page.locator("[data-best-slips-applied]").count() === 1 && await page.locator("[data-best-slips-publication]").count() === 1
      && await page.locator("[data-list-divider]").count() === 0, "One information bar replaces repeated day headings");
    await page.locator("[data-best-slips-filters]").screenshot({ path: `output/playwright/best-slips-${mode}-${width}${geometry.coarse ? "-touch" : ""}.png` });
    const original = await page.locator("[data-applied-selection]").innerText();
    const requests = [];
    const record = request => { if (request.url().includes("/api/best-slips?")) requests.push(request.url()); };
    page.on("request", record);
    const open = async () => { await trigger.click(); await page.locator("dialog[open]").waitFor(); };
    const dialog = page.locator("dialog[open]");
    const period = dialog.locator("[data-slip-period-select]");
    const choosePeriod = async label => { await period.click(); await page.getByRole("option", { name: label, exact: true }).click(); };
    const apply = () => dialog.getByRole("button", { name: "Apply Filters", exact: true }).click();
    const settled = () => page.waitForFunction(() => document.querySelector("[data-best-slips-filters]")?.getAttribute("aria-busy") === "false");
    await open();
    await choosePeriod("Last 7 days");
    assert(requests.length === 0 && await page.locator("[data-applied-selection]").innerText() === original, "Draft edits do not change results");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.activeElement?.matches("[data-best-slips-filter-trigger]"));
    assert(await dialog.count() === 0 && await trigger.evaluate(button => button === document.activeElement), "Escape discards edits and restores focus");
    await open();
    assert((await period.getAttribute("aria-label")).includes("Last 30 days"), "Reopening restores applied values");
    await choosePeriod("Last 7 days");
    await dialog.locator("[data-slip-odds-band]").click();
    await page.getByRole("option").nth(1).click();
    await apply(); await settled();
    assert(requests.some(url => url.includes("period=last7") && url.includes("page=1")), "Apply commits filters together and restarts pagination");
    assert((await page.locator("[data-applied-selection]").innerText()).includes("Last 7 days"), "The bar describes the applied scope");
    await open();
    await dialog.locator("[data-dialog-reset]").click();
    assert((await period.getAttribute("aria-label")).includes("Last 30 days"), "Reset restores defaults in the draft");
    const beforeReset = requests.length;
    await page.keyboard.press("Escape");
    assert(requests.length === beforeReset, "Dismissing a reset draft preserves applied filters");
    await open(); await choosePeriod("Custom date");
    const dates = dialog.locator('input[type="date"]'), end = await dates.nth(1).inputValue();
    const previous = new Date(Date.parse(`${end}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    await dates.nth(0).fill(end); await dates.nth(1).fill(previous);
    const beforeInvalid = requests.length;
    await apply(); await dialog.getByRole("alert").waitFor();
    assert(requests.length === beforeInvalid, "Invalid dates keep the dialog open without a request");
    await dates.nth(1).fill(end); await dates.nth(1).press("Enter"); await settled();
    assert(await dialog.count() === 0 && requests.some(url => url.includes("period=custom") && url.includes(`from=${end}`) && url.includes(`to=${end}`)), "Enter applies validated custom dates");
    await open(); await dialog.locator("[data-dialog-reset]").click(); await apply(); await settled();
    assert((await page.locator("[data-applied-selection]").innerText()).includes("Last 30 days"), "Applying Reset restores the default browsing period");
    page.off("request", record);
    results.push({ mode, width, ...geometry });
  }
  page.off("pageerror", recordError);
  assert(errors.length === 0, `Browser errors: ${errors.join("; ")}`);
  return results;
}
