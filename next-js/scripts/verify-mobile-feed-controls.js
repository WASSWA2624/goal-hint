/* eslint-disable @typescript-eslint/no-unused-vars -- Playwright CLI evaluates this function through run-code --filename. */
/** Run against the full-access SQL-backed feed fixture after its SSR checks pass. */
async function verifyMobileFeedControls(page) {
  const address = new URL(page.url());
  if (!["127.0.0.1", "localhost", "[::1]"].includes(address.hostname)) throw new Error("Use the local full-access feed acceptance fixture.");
  const require = (condition, message) => { if (!condition) throw new Error(message); };
  const base = `${address.origin}/en/matches?pageSize=30&picks=all`;
  const panel = page.locator("[data-mobile-compact-filters]");
  const choices = panel.locator("[data-phone-query-filters]");
  const date = choices.locator("[data-mobile-date-filter]");
  const status = choices.locator("[data-feed-status]");
  const filters = panel.getByRole("button", { name: /^Advanced filters/ });
  const badge = filters.locator("b");
  const settled = () => page.waitForFunction(() => !document.querySelector('[data-feed-results][aria-busy="true"]'));
  const errors = [], requests = [], layouts = [], enlargedText = [], immediateSearchSubmissions = [];
  const onError = (error) => errors.push(error.message);
  const onRequest = (request) => {
    const url = new URL(request.url());
    if (url.origin === address.origin && ["/en/matches", "/api/matches"].includes(url.pathname)) requests.push(url.href);
  };
  const openDates = async () => {
    await date.click();
    const editor = page.locator("[data-mobile-date-editor]");
    await editor.waitFor({ state: "visible" });
    return editor;
  };
  const openFilters = async () => {
    await filters.click();
    const editor = page.getByRole("dialog");
    await editor.waitFor({ state: "visible" });
    require(await editor.locator('input[type="date"]').count() === 0, "Advanced filters must not duplicate date editing.");
    return editor;
  };
  const closeFilters = (editor) => editor.getByRole("button", { name: "Close advanced filters", exact: true }).click();
  const geometry = () => panel.evaluate((element) => {
    const search = element.querySelector("[data-feed-search]");
    const row = element.querySelector("[data-phone-query-filters]");
    const date = row?.querySelector("[data-mobile-date-filter]");
    const status = row?.querySelector("[data-feed-status]");
    const toggle = row?.querySelector('[aria-haspopup="dialog"]:not([data-mobile-date-filter])');
    if (!search || !row || !date || !status || !toggle) return { missing: true };
    const controls = [date, status, toggle], boxes = controls.map((control) => control.getBoundingClientRect());
    const searchBox = search.getBoundingClientRect(), rowBox = row.getBoundingClientRect();
    const panelStyle = getComputedStyle(element), rowStyle = getComputedStyle(row);
    const minimalSpacing = parseFloat(panelStyle.paddingInlineStart) === 0 && parseFloat(panelStyle.paddingInlineEnd) === 0
      && parseFloat(panelStyle.rowGap) === 4 && parseFloat(rowStyle.columnGap) === 4;
    const square = [search, ...controls].every((control) => {
      const style = getComputedStyle(control);
      return [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomLeftRadius, style.borderBottomRightRadius]
        .every((radius) => parseFloat(radius) === 0);
    });
    const fits = document.documentElement.scrollWidth <= innerWidth && boxes.every((box) => box.left >= -1 && box.right <= innerWidth + 1);
    const noOverlap = boxes.every((box, index) => boxes.slice(index + 1).every((other) => box.right <= other.left + 1 || other.right <= box.left + 1));
    const oneRow = boxes.every((box) => Math.abs(box.y + box.height / 2 - boxes[0].y - boxes[0].height / 2) <= 1);
    const ordered = boxes[0].x < boxes[1].x && boxes[1].x < boxes[2].x;
    const targets = searchBox.height >= 44 && boxes.every((box) => box.height >= 44 && box.width >= 44);
    return {
      missing: false, square, fits, noOverlap, oneRow, ordered, targets, minimalSpacing,
      height: Math.round(element.getBoundingClientRect().height),
      twoRows: searchBox.bottom <= rowBox.top + 1 && rowBox.bottom - searchBox.top <= 104,
      duplicatedPeriod: element.querySelectorAll("[data-feed-period]").length,
      oldToolbar: element.querySelectorAll("[data-phone-filter-toolbar]").length,
      font: getComputedStyle(search).fontFamily,
      cardFont: document.querySelector("[data-fixture-id]") ? getComputedStyle(document.querySelector("[data-fixture-id]")).fontFamily : null,
    };
  });
  page.on("pageerror", onError);
  try {
    for (const theme of ["light", "dark"]) {
      for (const width of [320, 360, 390, 430, 1023]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(base);
        await page.evaluate((mode) => localStorage.setItem("goal-hint-theme", mode), theme);
        await page.reload();
        await panel.waitFor({ state: "visible" });
        await settled();
        await page.evaluate(() => document.fonts.ready);
        const result = await geometry();
        require(!result.missing && result.oneRow && result.ordered && result.twoRows, `Compact stack must retain search then Date/Status/Filters at ${width}px/${theme}.`);
        require(result.fits && result.noOverlap, `Mobile controls must fit without page overflow or overlap at ${width}px/${theme}.`);
        require(result.targets && result.square, `Mobile controls need square edges and at least 44px targets at ${width}px/${theme}.`);
        require(result.minimalSpacing, `Compact stack must use zero outer inline padding and 4px row/control gaps at ${width}px/${theme}.`);
        require(result.duplicatedPeriod === 0 && result.oldToolbar === 0, "The enhanced phone must remove its duplicated period selector and old toolbar.");
        require(!result.cardFont || result.font === result.cardFont, "Mobile search and match cards must use the same font family.");
        require(await page.locator("[data-desktop-feed-filters]").count() === 0, "The desktop toolbar must remain outside mobile rendering.");
        layouts.push({ width, theme, height: result.height });
      }
    }

    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base);
      await panel.waitFor({ state: "visible" });
      await settled();
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      const result = await geometry();
      require(!result.missing && result.fits && result.noOverlap && result.oneRow && result.ordered,
        `The compact toolbar must fit without overlap at ${width}px with 200% text.`);
      require(result.targets && result.square, "Enlarged text must retain usable square controls.");
      require(result.minimalSpacing, "Enlarged text must retain the requested minimal padding and 4px gaps.");
      require((await date.getAttribute("aria-label")).includes((await date.textContent()).trim()),
        "A truncated date label must retain its complete accessible name at 200% text.");
      enlargedText.push({ width, height: result.height });
    }
    await page.evaluate(() => document.documentElement.style.removeProperty("font-size"));

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base);
    await panel.waitFor();
    await settled();
    require(await badge.textContent() === "1", "The applied badge must include the nondefault All fixtures choice inside Filters.");
    const beforeDates = page.url();
    let editor = await openDates();
    const originalFrom = await editor.locator('input[type="date"]').nth(0).inputValue();
    const originalTo = await editor.locator('input[type="date"]').nth(1).inputValue();
    require(await editor.locator('input[type="date"]').count() === 2, "The single date editor must keep custom date ranges.");
    page.on("request", onRequest);
    await editor.getByRole("button", { name: "Tomorrow", exact: true }).click();
    require(page.url() === beforeDates && requests.length === 0, "Date presets must remain local until Apply dates.");
    await editor.getByRole("button", { name: "Cancel", exact: true }).click();
    require(await date.evaluate((button) => button === document.activeElement), "Cancel must restore date-trigger focus.");
    editor = await openDates();
    require(await editor.locator('input[type="date"]').nth(0).inputValue() === originalFrom
      && await editor.locator('input[type="date"]').nth(1).inputValue() === originalTo, "Cancel must discard date edits.");
    await editor.getByRole("button", { name: "Tomorrow", exact: true }).click();
    await page.keyboard.press("Escape");
    require(await page.getByRole("dialog").count() === 0 && await date.evaluate((button) => button === document.activeElement), "Escape must dismiss dates and restore focus.");
    require(requests.length === 0, "Canceled date edits must not request matches.");
    editor = await openDates();
    const from = editor.locator('input[type="date"]').nth(0), to = editor.locator('input[type="date"]').nth(1);
    await from.fill("2026-10-10");
    await to.fill("2026-10-09");
    require(await editor.getByRole("button", { name: "Apply dates", exact: true }).isDisabled(), "Reversed custom date ranges must disable Apply dates.");
    await from.fill("2026-10-08");
    await to.fill("2026-10-10");
    require(await editor.getByRole("button", { name: "Apply dates", exact: true }).isEnabled(), "A valid custom date range must remain editable.");
    await editor.getByRole("button", { name: "Cancel", exact: true }).click();
    require(page.url() === beforeDates && requests.length === 0, "Custom range editing and Cancel must not request matches or change the applied dates.");
    editor = await openDates();
    require(await editor.locator('input[type="date"]').nth(0).inputValue() === originalFrom
      && await editor.locator('input[type="date"]').nth(1).inputValue() === originalTo, "Custom range Cancel must restore the applied endpoints.");
    await page.keyboard.press("Escape");

    editor = await openFilters();
    const sort = editor.getByRole("combobox", { name: "Sort by", exact: true });
    require(await sort.inputValue() === "kickoff-desc", "Mobile sorting retains the existing Latest first default.");
    await sort.selectOption("kickoff-asc");
    require(page.url() === beforeDates && requests.length === 0, "Mobile sorting is a draft inside Advanced filters.");
    await closeFilters(editor);
    editor = await openFilters();
    require(await editor.getByRole("combobox", { name: "Sort by", exact: true }).inputValue() === "kickoff-desc", "Closing Advanced filters must discard its sort draft.");
    await editor.getByRole("combobox", { name: "Sort by", exact: true }).selectOption("kickoff-asc");
    page.off("request", onRequest);
    await editor.getByRole("button", { name: "Apply filters", exact: true }).click();
    await page.waitForURL((url) => url.searchParams.get("dir") === "asc");
    await settled();
    require(await page.locator("[data-fixture-id]").count() > 0, "Sort Apply must load the captured Earliest first projection.");
    require(await badge.textContent() === "2", "The applied badge must count both All fixtures and Earliest first inside Filters.");
    editor = await openFilters();
    require(await editor.getByRole("combobox", { name: "Sort by", exact: true }).inputValue() === "kickoff-asc", "Applied sorting must restore when reopening filters.");
    await editor.getByRole("button", { name: "Reset filters", exact: true }).click();
    await page.waitForURL((url) => !url.searchParams.has("dir") && !url.searchParams.has("q"));
    await settled();
    require(await badge.count() === 0, "Reset must clear the compact badge when Picks and sorting return to page defaults.");
    editor = await openFilters();
    require(await editor.getByRole("combobox", { name: "Sort by", exact: true }).inputValue() === "kickoff-desc", "Reset must restore Latest first.");
    require(await editor.getByRole("checkbox", { name: "Predictions only", exact: true }).isChecked(), "Reset retains the full-access Predictions only default.");
    await page.keyboard.press("Escape");

    // These URLs match stored SQL projections; no synthetic browser response is used.
    await page.goto(base);
    await panel.waitFor();
    editor = await openDates();
    await editor.getByRole("button", { name: "Today", exact: true }).click();
    await editor.getByRole("button", { name: "Apply dates", exact: true }).click();
    await page.waitForURL((url) => url.searchParams.get("when") === "today");
    await settled();
    require((await date.textContent()).includes("Today") && await page.locator("[data-fixture-id]").count() > 0,
      "Apply dates must load the captured Today projection and update its trigger.");
    await status.selectOption("live");
    await page.waitForURL((url) => url.searchParams.get("status") === "live" && url.searchParams.get("when") === "today");
    await settled();
    require(await date.isDisabled() && (await date.textContent()).includes("Today"), "Live must select Today and disable date editing.");
    const live = await page.locator("[data-fixture-id]").evaluateAll((cards) => cards.map((card) => card.getAttribute("data-status")));
    require(live.every((value) => value === "live"), "Every displayed fixture must honor the applied Live status.");
    // The SQL status-live-today capture has 32 known fixtures, zero matching
    // records, and state no-filter-matches; preserve that genuine empty result.
    require(live.length === 0 && await page.getByRole("heading", { name: "No matches for these filters", exact: true }).isVisible(),
      "The captured Live/Today query must show its genuine no-filter-matches state.");
    await status.selectOption("all");
    await page.waitForURL((url) => !url.searchParams.has("status") && url.searchParams.get("when") === "today");
    await settled();
    require(await date.isEnabled(), "Leaving Live must re-enable dates.");

    await filters.click();
    const sheet = page.getByRole("dialog");
    await sheet.waitFor();
    await page.keyboard.press("Tab");
    require(await sheet.evaluate((element) => element.contains(document.activeElement)), "Keyboard focus must remain in the open sheet.");
    await page.keyboard.press("Escape");
    require(await filters.evaluate((button) => button === document.activeElement), "Escape must restore the filter trigger focus.");

    for (let attempt = 1; attempt <= 3; attempt++) {
      await page.goto(base);
      await panel.waitFor();
      // Submit as soon as the enhanced controls appear. A pending mount-state
      // synchronization must never replace this freshly typed search draft.
      const search = panel.locator('input[name="q"]');
      await search.fill("CANONICAL LEAGUE");
      await search.press("Enter");
      await page.waitForURL((url) => url.searchParams.get("q") === "CANONICAL LEAGUE");
      await settled();
      const rows = await page.locator("[data-fixture-id]").count();
      require(rows > 0, `Immediate search/Enter attempt ${attempt} must load the captured league search projection.`);
      require(await search.inputValue() === "CANONICAL LEAGUE", `Immediate search attempt ${attempt} must retain the applied input.`);
      immediateSearchSubmissions.push({ attempt, rows });
    }
    require(errors.length === 0, `Mobile browser exceptions: ${errors.join("; ")}`);
    await page.screenshot({ path: "output/playwright/mobile-compact-stack-390.png", fullPage: true });
    return { passed: true, layouts, enlargedText, minimalSpacing: { outerInlinePadding: 0, rowGap: 4, controlGap: 4 }, immediateSearchSubmissions,
      dateOwner: true, dateCancel: true, customRangeValidation: true, dateApply: true,
      escapeFocus: true, sortDraft: true, sortApply: true, compactBadge: true,
      resetDefaults: true, liveToday: true, searchSubmit: true, draftRequests: requests.length, browserErrors: errors };
  } finally {
    page.off("pageerror", onError);
    page.off("request", onRequest);
  }
}
