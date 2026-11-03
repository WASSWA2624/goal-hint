/** Browser acceptance against /best-slips/browse in the synthetic slip rendering fixture. */
export async function verifyBestSlipsFilters(page, origin, widths = [320, 390, 1024, 1440]) {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const results = [], errors = [];
  const recordError = error => errors.push(error.message);
  page.on("pageerror", recordError);
  try {
    for (const mode of ["light", "dark"]) for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${origin}/best-slips/browse`);
      await page.evaluate(mode => localStorage.setItem("goal-hint-theme", mode), mode);
      await page.reload();
      await page.waitForFunction(mode => document.querySelector('meta[name="color-scheme"]')?.content === mode, mode, { timeout: 15_000 });
      await page.evaluate(() => document.fonts.ready);
      if (width >= 1024) await page.waitForFunction(() => document.querySelector("[data-performance-period]")?.textContent.includes("11:00 EAT"), null, { timeout: 15_000 });
      const trigger = page.locator("[data-best-slips-filter-trigger]"), bar = page.locator("[data-best-slips-applied]");
      const geometry = await trigger.evaluate(button => {
        const summary = button.closest("[data-performance-summary]"), cards = summary.querySelector("[data-performance-figures]").getBoundingClientRect();
        const action = button.getBoundingClientRect(), bar = document.querySelector("[data-best-slips-applied]"), bounds = bar.getBoundingClientRect();
        const selection = bar.querySelector("[data-applied-selection]"), count = bar.querySelector("[data-best-slips-summary]").getBoundingClientRect();
        const heading = summary.querySelector("[data-performance-heading]"), title = heading.querySelector("h2").getBoundingClientRect();
        return { beside: Math.abs(action.top - cards.top) < 1 && Math.abs(action.height - cards.height) < 1 && action.left > cards.right,
          below: action.top >= cards.bottom && Math.abs(action.left - cards.left) < 1 && Math.abs(action.right - cards.right) < 1,
          separation: bounds.top - cards.bottom, countAtEnd: bounds.right - count.right <= 9,
          firstSlipGap: document.querySelector("[data-slip-list]").getBoundingClientRect().top - bounds.bottom,
          summaryPaddingEnd: parseFloat(getComputedStyle(bar).paddingBottom),
          headingGap: cards.top - heading.getBoundingClientRect().bottom,
          headingPaddingStart: parseFloat(getComputedStyle(heading).paddingTop),
          headingPaddingEnd: parseFloat(getComputedStyle(heading).paddingBottom),
          fits: document.documentElement.scrollWidth <= innerWidth, coarse: matchMedia("(pointer: coarse)").matches,
          height: action.height, controlHeight: parseFloat(getComputedStyle(button).getPropertyValue("--form-control-height")),
          background: getComputedStyle(bar).backgroundColor, titleAligned: Math.abs(title.left - cards.left) < 1,
          labelsAligned: Math.abs(selection.getBoundingClientRect().left - cards.left) < 1,
          title: heading.querySelector("h2").textContent, period: summary.querySelector("[data-performance-period]").textContent };
      });
      assert(width >= 1024 ? geometry.beside : geometry.below, `${mode}/${width}: responsive filter action ${JSON.stringify(geometry)}`);
      assert(geometry.fits && geometry.countAtEnd && geometry.height >= geometry.controlHeight, "Controls and result counts fit shared metrics");
      assert(geometry.title === "Today’s performance" && geometry.titleAligned && geometry.labelsAligned, "Section labels align with the outer card rail");
      assert(geometry.headingGap <= 1.5 && geometry.headingGap >= 0 && geometry.headingPaddingEnd === 0, "The heading and date sit directly above the performance cards");
      assert(geometry.headingPaddingStart === (width >= 1024 ? 2 : 8), "Top spacing above the heading is preserved");
      assert(await page.locator("[data-best-slips-publication]").count() === 0, "The duplicate publication date is removed");
      if (width >= 1024) {
        assert(geometry.background === "rgba(0, 0, 0, 0)" && geometry.separation >= 15.5, "Desktop browsing labels sit on the page with a distinct gap below cards");
        assert(geometry.period === "13-Oct-2026 · 11:00 EAT", "Today's cards show the actual 24-hour EAT snapshot time");
      }
      const checkCount = async count => {
        const label = await page.locator("[data-best-slips-summary]").innerText();
        assert(label.includes(`of ${count} slips`), "The count includes the visible range, total and slips label on every screen");
      };
      await checkCount(3);
      assert((await bar.innerText()).includes("2.50–5.00"), "The default odds retain two decimal places");
      if (width < 1024) {
        const text = await bar.innerText();
        assert(text.includes("Today’s best slips") && !text.includes("All slips") && !text.includes("EAT") && !text.includes("Browsing") && !text.includes("Oct"), "The mobile summary replaces browsing dates and result labels with today's title");
        assert(geometry.background === "rgba(0, 0, 0, 0)" && geometry.summaryPaddingEnd === 0 && geometry.firstSlipGap <= 2.5 && geometry.firstSlipGap >= 0, "The mobile summary sits on the body background directly above the first slip");
      }
      await page.locator("[data-best-slips-filters]").screenshot({ path: `output/playwright/best-slips-${mode}-${width}${geometry.coarse ? "-touch" : ""}.png` });
      const original = await bar.innerText(), requests = [];
      const record = request => { if (request.url().includes("/api/best-slips?")) requests.push(new URL(request.url())); };
      page.on("request", record);
      try {
        const dialog = page.locator("dialog[open]");
        const open = async () => { await trigger.click(); await dialog.waitFor(); };
        const apply = () => dialog.getByRole("button", { name: "Apply Filters", exact: true }).click();
        const settled = () => page.waitForFunction(() => document.querySelector("[data-best-slips-filters]")?.getAttribute("aria-busy") === "false", null, { timeout: 15_000 });
        const chooseOdds = label => dialog.getByText(label, { exact: true }).click();
        const selected = label => dialog.getByRole("radio", { name: label, exact: true }).isChecked();
        await open();
        assert(await dialog.locator('input[type="date"], [data-slip-period-select]').count() === 0, "Advanced Filters contains no date controls");
        {
          const group = dialog.getByRole("group", { name: "Total odds", exact: true });
          assert(await group.getByRole("radio").count() === 6, "Every odds band is listed");
          assert(await group.evaluate(element => Math.abs(element.querySelector("legend").getBoundingClientRect().left - element.querySelector("label").getBoundingClientRect().left) < 1), "The odds section label aligns with its option edges");
          const radio = group.getByRole("radio", { name: "2.50–5.00", exact: true });
          await radio.focus(); await radio.press("ArrowRight");
          assert(await selected("5.00–10.00"), "Native arrow keys change the odds choice");
        }
        await dialog.screenshot({ path: `output/playwright/best-slips-dialog-${mode}-${width}${geometry.coarse ? "-touch" : ""}.png` });
        assert(requests.length === 0 && await bar.innerText() === original, "Odds edits remain local until Apply");
        await page.keyboard.press("Escape");
        await page.waitForFunction(() => document.activeElement?.matches("[data-best-slips-filter-trigger]"), null, { timeout: 15_000 });
        await open(); assert(await selected("2.50–5.00"), "Reopening restores the applied odds");
        await chooseOdds("5.00–10.00"); await apply(); await settled();
        assert(requests.some(url => url.searchParams.get("period") === "today" && url.searchParams.get("oddsBand") === "5-10" && url.searchParams.get("page") === "1"), "Apply keeps today's date and restarts pagination");
        assert((await bar.innerText()).includes("5.00–10.00"), "The applied odds show today's selected band");
        await checkCount(3);
        await page.locator('[data-slip-result="won"]').click(); await settled();
        await checkCount(1);
        assert(await page.locator('[data-summary-count="all"]').innerText() === "3", "Today's performance denominator stays independent of the selected result");
        await page.locator('[data-slip-result="all"]').click(); await settled();
        await open(); await dialog.locator("[data-dialog-reset]").click();
        assert(await selected("2.50–5.00"), "Reset changes only the draft odds");
        const beforeReset = requests.length;
        await page.keyboard.press("Escape"); assert(requests.length === beforeReset, "Discarding Reset preserves the applied band");
        await open(); assert(await selected("5.00–10.00"), "Discard restores the selected band");
        await dialog.locator("[data-dialog-reset]").click(); await apply(); await settled();
        assert((await bar.innerText()).includes("2.50–5.00"), "Reset applies default odds to today's slips");
        await checkCount(3);
        assert(requests.every(url => url.searchParams.get("period") === "today" && !url.searchParams.has("from") && !url.searchParams.has("to")), "Every UI request remains limited to today");
        const retained = await bar.innerText();
        let releaseResponse;
        const heldResponse = new Promise(resolve => { releaseResponse = resolve; });
        await page.route("**/api/best-slips?**", async route => { await heldResponse; await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"unavailable"}' }); });
        try {
          await open(); await chooseOdds("5.00–10.00"); await apply();
          await page.waitForFunction(() => document.querySelector("[data-best-slips-filters]")?.getAttribute("aria-busy") === "true", null, { timeout: 15_000 });
          assert(await page.locator("[data-best-slips-updating]").count() === 0 && !(await bar.innerText()).includes("Updating slips"), "No inline updating message appears while the top loader owns loading feedback");
          releaseResponse(); await settled();
          assert(await bar.innerText() === retained, "A failed update retains the confirmed slips and applied labels");
          assert(await page.locator("[data-best-slips-update-failed]").count() === 0, "The update-failure message is removed");
          assert(await page.getByRole("button", { name: "Try again", exact: true }).count() === 0, "No retry button appears above retained slips");
        } finally { releaseResponse(); await page.unroute("**/api/best-slips?**"); }
      } finally { page.off("request", record); }
      results.push({ mode, width, ...geometry });
    }
  } finally { page.off("pageerror", recordError); }
  assert(errors.length === 0, `Browser errors: ${errors.join("; ")}`);
  return results;
}
