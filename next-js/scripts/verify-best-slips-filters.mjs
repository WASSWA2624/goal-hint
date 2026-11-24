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
      assert((await trigger.innerText()).trim() === "Filters" && await trigger.locator("svg").count() === 1, "The Filters action uses the shared label and icon");
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
        assert((await page.locator("[data-best-slips-band-count]").innerText()).trim() === "3 of 10 slips published",
          "The published band count stays independent of the active filters on every screen");
        const matching = page.locator("[data-best-slips-match-count]");
        if (count === 3) assert(await matching.count() === 0, "The full band count is displayed once");
        else assert((await matching.innerText()).includes(`of ${count} ${count === 1 ? "slip" : "slips"}`), "The result count reflects the applied filters");
      };
      await checkCount(3);
      assert((await bar.innerText()).includes("2.50–5.00"), "The default odds retain two decimal places");
      if (width < 1024) {
        const text = await bar.innerText();
        assert(text.includes("13-Oct-2026") && !text.includes("All slips") && !text.includes("EAT") && !text.includes("Browsing"), "The mobile summary keeps the applied date without repeating the browsing and All labels");
        assert(geometry.background === "rgba(0, 0, 0, 0)" && geometry.summaryPaddingEnd === 0 && geometry.firstSlipGap <= 2.5 && geometry.firstSlipGap >= 0, "The mobile summary sits on the body background directly above the first slip");
      }
      await page.locator("[data-best-slips-filters]").screenshot({ path: `output/playwright/best-slips-${mode}-${width}${geometry.coarse ? "-touch" : ""}.png` });
      const original = await bar.innerText(), requests = [];
      const record = request => { if (request.url().includes("/api/best-slips?")) requests.push(new URL(request.url())); };
      page.on("request", record);
      try {
        const dialog = page.getByRole("dialog", { name: "Filters", exact: true });
        const open = async () => { await trigger.click(); await dialog.waitFor(); };
        const apply = () => dialog.getByRole("button", { name: "Apply Filters", exact: true }).click();
        const settled = () => page.waitForFunction(() => document.querySelector("[data-best-slips-filters]")?.getAttribute("aria-busy") === "false", null, { timeout: 15_000 });
        const chooseOdds = label => dialog.getByText(label, { exact: true }).click();
        const selected = label => dialog.getByRole("radio", { name: label, exact: true }).isChecked();
        await open();
        assert(await dialog.locator('[name="period"]').count() === 1, "Best Slips Filters includes one publication date control");
        {
          const group = dialog.getByRole("group", { name: "Combined odds", exact: true });
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
        assert(await page.locator("[data-whole-slip-probability]").count() === 0
          && await page.getByText("Average pick probability", { exact: false }).count() >= 3,
        "Hourly slips label their average and omit any unavailable whole-slip estimate");
        if (width === 390 || width === 1440) {
          await open();
          const choose = async (name, label) => {
            await dialog.getByRole("combobox", { name: new RegExp(`^${name}:`) }).click();
            await dialog.getByRole("option", { name: label, exact: true }).click();
          };
          await choose("Slip date", "Yesterday");
          await choose("Status", "Lost");
          await dialog.locator('[name="probMin"]').fill("80");
          await dialog.locator('[name="matchesMin"]').fill("2");
          await apply(); await settled();
          assert(new URL(page.url()).searchParams.get("period") === "yesterday", "Applying the date updates the shareable URL");
          assert(new URL(page.url()).searchParams.get("probMin") === "80" && new URL(page.url()).searchParams.get("matchesMin") === "2", "The URL pins the numeric filters");
          assert((await bar.innerText()).includes("12-Oct-2026") && (await bar.innerText()).includes("Lost"), "The results bar reports the applied archive date and status");
          await checkCount(1);
          assert(await page.locator("[data-whole-slip-probability]").count() === 1, "The archived model-backed slip retains its original estimate");
          assert(await page.locator('[data-summary-count="all"]').innerText() === "2", "The date and range restrictions apply before result drilldown counts");
          await page.reload(); await checkCount(1);
          await open(); await dialog.locator("[data-dialog-reset]").click(); await apply(); await settled();
          assert(new URL(page.url()).search === "", "Resetting and applying restores the clean today URL");
          await page.goBack(); await settled(); await checkCount(1);
          assert(new URL(page.url()).searchParams.get("status") === "lost", "Back restores the audited query and its count");
          await page.goto(`${origin}/best-slips/browse?period=all`);
          await page.getByRole("button", { name: "Older slips" }).click(); await settled();
          assert(new URL(page.url()).searchParams.has("cursor"), "Archive continuation is addressable");
          await page.getByRole("button", { name: "First archive page" }).click(); await settled();
          assert(!new URL(page.url()).searchParams.has("cursor"), "The first archive page removes the cursor");
          await page.goto(`${origin}/best-slips/browse`);
        }
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

/** The shared Matches calendar follows Best Slips publication dates in both layouts. */
export async function verifyBestSlipsCalendar(page, origin, widths = [390, 1440]) {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const results = [];
  for (const mode of ["light", "dark"]) for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/best-slips/browse?period=today&status=lost&oddsBand=5-10&probMin=80&matchesMin=2`);
    await page.evaluate(mode => localStorage.setItem("goal-hint-theme", mode), mode);
    await page.reload();
    await page.waitForFunction(mode => document.querySelector('meta[name="color-scheme"]')?.content === mode, mode);
    const strip = page.getByRole("navigation", { name: "Slip date", exact: true });
    const picker = strip.locator('[aria-haspopup="dialog"]');
    const calendar = page.getByRole("dialog", { name: "Choose dates", exact: true });
    const date = day => calendar.locator('button[aria-pressed]').filter({ hasText: new RegExp(`^${day}$`) });
    const openCalendar = async () => { await picker.click(); await calendar.waitFor(); };
    const selectDates = async (from, to = from) => {
      await openCalendar();
      await date(from).click();
      if (from !== to) await date(to).click();
      await calendar.getByRole("button", { name: "Apply dates", exact: true }).click();
      await page.waitForURL(url => url.searchParams.get("from") === `2026-10-${from}` && url.searchParams.get("to") === `2026-10-${to}`);
      const query = new URL(page.url()).searchParams;
      assert(query.get("period") === "custom" && query.get("status") === "lost" && query.get("oddsBand") === "5-10"
        && query.get("probMin") === "80" && query.get("matchesMin") === "2" && query.get("page") === "1" && !query.has("cursor"),
      "Selecting dates preserves the active odds, outcome and eligibility filters and starts on page one");
    };
    assert(await strip.locator('li[data-date="2026-10-13"] > a[aria-current="date"]').count() === 1, "Today is marked before a date is changed");
    await openCalendar();
    const geometry = await calendar.evaluate(element => ({ tag: element.tagName, fits: document.documentElement.scrollWidth <= innerWidth,
      inside: element.getBoundingClientRect().width <= innerWidth, background: getComputedStyle(element).backgroundColor }));
    assert(geometry.tag === (width >= 1024 ? "DIALOG" : "DIV") && geometry.fits && geometry.inside, "The shared calendar fits as a desktop dialog and phone sheet");
    if (mode === "dark") assert(geometry.background !== results.find(result => result.width === width).background, "Calendar surfaces follow the selected theme");
    await page.screenshot({ path: `output/playwright/best-slips-calendar-${mode}-${width}.png`, animations: "disabled" });
    const original = page.url();
    await date(12).click();
    await calendar.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.matches('nav[aria-label="Slip date"] [aria-haspopup="dialog"]'));
    assert(page.url() === original, "Cancelling restores the picker focus and leaves the active date unchanged");
    await selectDates(12);
    await strip.locator('li[data-date="2026-10-12"] > a[aria-current="date"]').waitFor();
    await selectDates(12, 14);
    await page.goBack();
    await strip.locator('li[data-date="2026-10-12"] > a[aria-current="date"]').waitFor();
    await strip.locator('li[data-date="2026-10-13"] > a').click();
    await page.waitForURL(url => url.searchParams.get("period") === "today" && !url.searchParams.has("from"));
    results.push({ mode, width, ...geometry });
  }
  return results;
}
