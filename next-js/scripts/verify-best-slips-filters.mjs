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
    await page.waitForFunction(mode => document.querySelector('meta[name="color-scheme"]')?.content === mode, mode, { timeout: 15_000 });
    await page.evaluate(() => document.fonts.ready);
    if (width >= 1024) await page.waitForFunction(() => document.querySelector("[data-performance-period]")?.textContent.includes("11:00 EAT"), null, { timeout: 15_000 });
    const trigger = page.locator("[data-best-slips-filter-trigger]");
    await trigger.waitFor();
    const geometry = await trigger.evaluate(button => {
      const summary = button.closest("[data-performance-summary]"), cards = summary.querySelector("[data-performance-figures]").getBoundingClientRect();
      const action = button.getBoundingClientRect(), bar = document.querySelector("[data-best-slips-applied]");
      const count = bar.querySelector("[data-best-slips-summary]").getBoundingClientRect(), bounds = bar.getBoundingClientRect();
      const selection = bar.querySelector("[data-applied-selection]"), publication = bar.querySelector("[data-best-slips-publication]");
      return { beside: Math.abs(action.top - cards.top) < 1 && Math.abs(action.height - cards.height) < 1 && action.left > cards.right,
        below: action.top >= cards.bottom && Math.abs(action.left - cards.left) < 1 && Math.abs(action.right - cards.right) < 1,
        countAtEnd: bounds.right - count.right <= 9, fits: document.documentElement.scrollWidth <= innerWidth,
        coarse: matchMedia("(pointer: coarse)").matches, height: action.height,
        controlHeight: parseFloat(getComputedStyle(button).getPropertyValue("--form-control-height")),
        publicationVisible: getComputedStyle(publication).display !== "none", summaryBackground: getComputedStyle(bar).backgroundColor,
        summaryPadding: parseFloat(getComputedStyle(bar).paddingLeft), alignment: getComputedStyle(selection).justifyContent,
        leftAligned: Math.abs(selection.getBoundingClientRect().left - bounds.left) < 1,
        period: summary.querySelector("[data-performance-period]").textContent,
        headingPadding: parseFloat(getComputedStyle(summary.querySelector("[data-performance-heading]")).paddingTop) };
    });
    assert(width >= 1024 ? geometry.beside : geometry.below, `${mode}/${width}: responsive filter action ${JSON.stringify(geometry)}`);
    assert(geometry.fits && geometry.countAtEnd, "Results count stays at the far right without page overflow");
    assert(geometry.height >= geometry.controlHeight, "The filter action retains the shared control minimum");
    assert(geometry.publicationVisible === (width < 1024), "The standalone publication day is retained only on mobile");
    if (width >= 1024) {
      assert(geometry.summaryBackground === "rgba(0, 0, 0, 0)" && geometry.summaryPadding === 0, "Desktop summary has no fill or inset padding");
      assert(geometry.leftAligned && geometry.alignment === "flex-start", "Desktop browsing details align to the left rail");
      assert(geometry.period.includes("Data checked 13-Oct-2026 11:00 EAT"), "The period includes the snapshot's actual 24-hour EAT timestamp");
      assert(geometry.headingPadding <= 2, "The desktop performance heading uses compact spacing");
    } else assert(!geometry.period.includes("11:00"), "The mobile reporting label retains its existing date format");
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
    const choosePeriod = async label => {
      if (width >= 1024) await dialog.getByText(label, { exact: true }).click();
      else { await period.click(); await page.getByRole("option", { name: label, exact: true }).click(); }
    };
    const selectedPeriod = async label => width >= 1024 ? dialog.getByRole("radio", { name: label, exact: true }).isChecked()
      : (await period.getAttribute("aria-label")).includes(label);
    const apply = () => dialog.getByRole("button", { name: "Apply Filters", exact: true }).click();
    const settled = () => page.waitForFunction(() => document.querySelector("[data-best-slips-filters]")?.getAttribute("aria-busy") === "false");
    await open();
    if (width >= 1024) {
      assert(await dialog.getByRole("group", { name: "Slip date", exact: true }).getByRole("radio").count() === 11, "Every slip-date preset is listed");
      assert(await dialog.getByRole("group", { name: "Total odds", exact: true }).getByRole("radio").count() === 5, "Every total-odds band is listed");
      await dialog.screenshot({ path: `output/playwright/best-slips-dialog-${mode}-${width}${geometry.coarse ? "-touch" : ""}.png` });
    }
    await choosePeriod("Last 7 days");
    if (width >= 1024) {
      const radio = dialog.getByRole("radio", { name: "Last 7 days", exact: true });
      await radio.focus(); await radio.press("ArrowRight");
      assert(await selectedPeriod("Last 3 days"), "Native arrow keys change the selected preset");
      await choosePeriod("Last 7 days");
    }
    assert(requests.length === 0 && await page.locator("[data-applied-selection]").innerText() === original, "Draft edits do not change results");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.activeElement?.matches("[data-best-slips-filter-trigger]"));
    assert(await dialog.count() === 0 && await trigger.evaluate(button => button === document.activeElement), "Escape discards edits and restores focus");
    await open();
    assert(await selectedPeriod("Last 30 days"), "Reopening restores applied values");
    await choosePeriod("Last 7 days");
    if (width >= 1024) await dialog.getByText("5–10", { exact: true }).click();
    else { await dialog.locator("[data-slip-odds-band]").click(); await page.getByRole("option").nth(1).click(); }
    await apply(); await settled();
    assert(requests.some(url => url.includes("period=last7") && url.includes("oddsBand=5-10") && url.includes("page=1")), "Apply commits filters together and restarts pagination");
    assert((await page.locator("[data-applied-selection]").innerText()).includes("Last 7 days"), "The bar describes the applied scope");
    await open();
    await dialog.locator("[data-dialog-reset]").click();
    assert(await selectedPeriod("Last 30 days"), "Reset restores defaults in the draft");
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
    if (width >= 1024) assert(await page.locator("[data-performance-period]").innerText() === "13-Oct-2026 · 11:00 EAT", "Today's performance shows its own date and snapshot time");
    await open(); await dialog.locator("[data-dialog-reset]").click(); await apply(); await settled();
    assert((await page.locator("[data-applied-selection]").innerText()).includes("Last 30 days"), "Applying Reset restores the default browsing period");
    if (width >= 1024) assert(await page.locator("[data-performance-period]").innerText() === "12-Oct-2026 · Data checked 13-Oct-2026 11:00 EAT", "Yesterday's performance remains separate from the snapshot date");
    page.off("request", record);
    results.push({ mode, width, ...geometry });
  }
  page.off("pageerror", recordError);
  assert(errors.length === 0, `Browser errors: ${errors.join("; ")}`);
  return results;
}
