/* eslint-disable @typescript-eslint/no-unused-vars -- Playwright CLI evaluates this function through run-code --filename. */
/**
 * Open the local SQL-backed full-access feed fixture at /en/matches, then run:
 * playwright-cli run-code --filename scripts/verify-desktop-feed-controls.js
 * Captured default and Earliest first queries support the two navigation checks.
 */
async function verifyDesktopFeedControls(page) {
  const address = new URL(page.url());
  if (!["127.0.0.1", "localhost", "[::1]"].includes(address.hostname)) {
    throw new Error("Use a local full-access feed acceptance fixture.");
  }
  const require = (condition, message) => { if (!condition) throw new Error(message); };
  const requests = [];
  const recordRequest = (request) => {
    const url = new URL(request.url());
    if (url.origin === address.origin && (url.pathname === "/en/matches" || url.pathname === "/api/matches")) requests.push(url.href);
  };
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  const form = page.locator("[data-desktop-feed-filters]");
  const settled = () => page.waitForFunction(() => document.querySelector("[data-desktop-feed-filters]")?.getAttribute("aria-busy") === "false");
  await form.waitFor({ state: "visible" });
  require(await page.getByRole("heading", { level: 1 }).count() === 1, "Desktop must retain one main heading.");
  const periods = await form.locator('[name="when"] option').allTextContents();
  require(JSON.stringify(periods) === JSON.stringify(["Last 30 days", "Last 7 days", "Last 3 days", "Yesterday", "Today", "Tomorrow", "Next 3 days", "Next 7 days", "Next 30 days", "Custom dates"]),
    "The desktop period options and order must match the selected design.");
  const sections = ["dates", "leagues", "countries", "markets", "limits"];
  const control = (section) => form.locator(`[data-filter-section="${section}"]`);
  const count = async (section) => {
    const badge = control(section).locator("[data-section-label] + span");
    return await badge.count() ? await badge.textContent() : null;
  };
  const assertDesktopLayout = async (width) => {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await form.evaluate((element) => {
      const controls = Array.from(element.querySelectorAll("[data-filter-section]"));
      const searchRow = element.querySelector("[data-desktop-filter-search]");
      const optionsRow = element.querySelector("[data-desktop-filter-options]");
      const actionRow = element.querySelector("[data-desktop-filter-actions]");
      if (!searchRow || !optionsRow || !actionRow) return { missingRows: true };
      const fields = Array.from(searchRow.children);
      const submit = actionRow.querySelector("[data-filter-submit-actions]");
      const buttons = submit ? Array.from(submit.children) : [];
      const picks = actionRow.querySelector("[data-picks]");
      const bounds = (nodes) => nodes.map((node) => node.getBoundingClientRect());
      const sameRow = (nodes) => {
        const boxes = bounds(nodes);
        return boxes.length > 0 && boxes.every((box) => Math.abs(box.y + box.height / 2 - boxes[0].y - boxes[0].height / 2) < 1);
      };
      const secondRow = [...controls, ...(picks ? [picks] : []), ...buttons];
      const compactControls = [...fields, ...controls, ...buttons];
      const visible = (node) => { const box = node.getBoundingClientRect(); return box.width > 0 && box.height > 0; };
      const interactive = Array.from(element.querySelectorAll("[data-desktop-filter-search] input, [data-desktop-filter-search] button, [data-desktop-filter-search] select, [data-desktop-filter-options] input, [data-desktop-filter-options] button, [data-desktop-filter-options] select")).filter(visible);
      const boxes = bounds(interactive);
      const noOverlap = boxes.every((box, index) => boxes.slice(index + 1).every((other) =>
        Math.min(box.right, other.right) - Math.max(box.left, other.left) <= 1
        || Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top) <= 1));
      const rowStyle = getComputedStyle(optionsRow), rowChildren = Array.from(optionsRow.children);
      const available = optionsRow.clientWidth - parseFloat(rowStyle.paddingLeft) - parseFloat(rowStyle.paddingRight);
      const inlineWidth = bounds(rowChildren).reduce((total, box) => total + box.width, 0)
        + (parseFloat(rowStyle.columnGap) || 0) * Math.max(0, rowChildren.length - 1);
      const shouldFitSecondRow = inlineWidth <= available + 1;
      const fieldSelectors = ["[data-feed-search]", '[name="status"]', '[name="when"]', '[name="sort"]'];
      const orderedFields = fields.length === fieldSelectors.length && fields.every((field, index) =>
        field.matches(fieldSelectors[index]) || field.querySelector(fieldSelectors[index]) !== null);
      const finePointer = !matchMedia("(pointer: coarse)").matches;
      return {
        missingRows: false,
        sections: controls.map((control) => control.getAttribute("data-filter-section")),
        orderedFields,
        oneSearchRow: sameRow(fields),
        orderedOptions: rowChildren.length === controls.length + 1 && controls.every((control, index) => rowChildren[index] === control)
          && rowChildren[rowChildren.length - 1] === actionRow,
        orderedActions: actionRow.children.length === 2 && actionRow.firstElementChild === picks
          && actionRow.lastElementChild === submit && buttons.length === 2
          && buttons[0].getAttribute("type") === "reset" && buttons[1].getAttribute("type") === "submit",
        oneOptionsRowWhenItFits: !shouldFitSecondRow || sameRow(secondRow),
        fits: document.documentElement.scrollWidth <= innerWidth && [...controls, ...buttons].every((control) => control.scrollWidth <= control.clientWidth + 1)
          && controls.every((control) => { const label = control.querySelector("[data-section-label]"); return label && label.scrollWidth <= label.clientWidth + 1; }),
        noOverlap,
        compact: compactControls.every((control) => { const height = control.getBoundingClientRect().height; return finePointer ? Math.abs(height - 32) <= 1 : height >= 44; }),
        square: [element, ...compactControls].every((control) => {
          const style = getComputedStyle(control);
          return [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomLeftRadius, style.borderBottomRightRadius].every((radius) => parseFloat(radius) === 0);
        }),
        compactPanelWhenItFits: !shouldFitSecondRow || element.getBoundingClientRect().height <= (finePointer ? 100 : 128),
      };
    });
    require(!geometry.missingRows, "The desktop filters must expose the two Compact toolbar rows.");
    require(JSON.stringify(geometry.sections) === JSON.stringify(sections), "The five filter controls must retain the approved order.");
    require(geometry.orderedFields && geometry.oneSearchRow, `Search, status, period and sorting must share the first row at ${width}px.`);
    require(geometry.orderedOptions && geometry.orderedActions && geometry.oneOptionsRowWhenItFits, `The five filters, Predictions only, Reset and Apply must share the second row when space allows at ${width}px.`);
    require(geometry.fits && geometry.noOverlap, `Toolbar controls and labels must fit without overlap or clipping at ${width}px.`);
    require(geometry.compact && geometry.square && geometry.compactPanelWhenItFits, `The toolbar must retain square 32px controls and its compact two-row height at ${width}px.`);
    const checkbox = form.locator('[data-picks] input[type="checkbox"]');
    await checkbox.focus();
    require(await checkbox.evaluate((input) => input === document.activeElement), "Predictions only must remain keyboard focusable in the compact toolbar.");
  };
  for (const width of [1024, 1440]) await assertDesktopLayout(width);
  require(await count("markets") === "4" && await count("limits") === null, "Only Markets has a count by default: all four selected markets.");
  const search = form.locator('[name="q"]'), sort = form.locator('[name="sort"]');
  const picks = form.getByRole("checkbox", { name: "Predictions only", exact: true });
  require(await picks.isEnabled(), "Use the full-access acceptance fixture for draft-preservation checks.");
  const open = async (section) => {
    await control(section).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible" });
    require(await dialog.getByRole("button", { name: "Reset", exact: true }).isVisible(), "Every filter dialog needs its own Reset.");
    require(await dialog.locator(`[data-feed-dialog="${section}"]`).count() === 1, "Each control must open its own dialog.");
    if (section === "leagues") require(await dialog.locator('input[name="country"]').count() === 0, "Leagues must not contain countries.");
    if (section === "countries") require(await dialog.locator('input[name="league"]').count() === 0, "Countries must not contain leagues.");
    if (section === "markets") require(await dialog.locator('[name="probMin"], [name="probMax"]').count() === 0, "Markets must not contain limits.");
    if (section === "limits") require(await dialog.locator('input[name="market"]').count() === 0, "Limits must not contain markets.");
    return dialog;
  };
  const done = (dialog) => dialog.getByRole("button", { name: "Done", exact: true }).click();
  const cancel = (dialog) => dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  const localReset = (dialog) => dialog.getByRole("button", { name: "Reset", exact: true }).click();
  const selected = (dialog, name) => dialog.locator(`input[name="${name}"]:checked`).evaluateAll((inputs) => inputs.map((input) => input.value).sort());
  let dialog = await open("dates");
  const defaultFrom = await dialog.locator('[name="from"]').inputValue(), defaultTo = await dialog.locator('[name="to"]').inputValue();
  await cancel(dialog);
  page.on("request", recordRequest);
  try {
    await search.fill("  Keep this search  ");
    await picks.check();
    await sort.selectOption("kickoff-asc");
    const unchangedEssentials = async () => {
      require(await search.inputValue() === "  Keep this search  " && await picks.isChecked() && await sort.inputValue() === "kickoff-asc",
        "Local Reset must preserve search, Picks only and sorting drafts.");
    };

    dialog = await open("leagues");
    const league = dialog.locator('input[name="league"]').first();
    require(await league.count() === 1, "The SQL capture must provide a selectable league.");
    await league.check();
    const selectedLeagues = await selected(dialog, "league");
    await done(dialog);
    dialog = await open("countries");
    const country = dialog.locator('input[name="country"]').first();
    require(await country.count() === 1, "The SQL capture must provide a selectable country.");
    await country.check();
    const selectedCountries = await selected(dialog, "country");
    await done(dialog);
    dialog = await open("markets");
    await dialog.locator('input[name="market"]').first().uncheck();
    const selectedMarkets = await selected(dialog, "market");
    require(selectedMarkets.length === 3, "Markets must retain the unchanged selection behavior.");
    await done(dialog);
    dialog = await open("limits");
    await dialog.locator('[name="probMin"]').fill("70");
    await dialog.locator('[name="probMax"]').fill("95");
    await done(dialog);
    require(await count("markets") === "3" && await count("limits") === "2", "Market and configured limit counts must remain independent.");

    dialog = await open("dates");
    const next = new Date(defaultFrom + "T12:00:00Z"); next.setUTCDate(next.getUTCDate() + 1);
    const customFrom = next.toISOString().slice(0, 10);
    await dialog.locator('[name="from"]').fill(customFrom);
    await dialog.locator('[name="timeFrom"]').fill("08:00");
    await dialog.locator('[name="timeTo"]').fill("18:00");
    await done(dialog);
    require((await Promise.all(sections.map(count))).every((value) => value !== null), "All five controls must show their active counts for the narrow desktop check.");
    await assertDesktopLayout(1024);
    await page.setViewportSize({ width: 1440, height: 900 });
    dialog = await open("dates");
    await localReset(dialog);
    require(await dialog.isVisible() && await dialog.locator('[name="from"]').inputValue() === defaultFrom
      && await dialog.locator('[name="to"]').inputValue() === defaultTo && await dialog.locator('[name="timeFrom"]').inputValue() === "00:00"
      && await dialog.locator('[name="timeTo"]').inputValue() === "23:59", "Date Reset must restore its date/time defaults and keep the dialog open.");
    await unchangedEssentials();
    await cancel(dialog);
    dialog = await open("dates");
    require(await dialog.locator('[name="from"]').inputValue() === customFrom && await dialog.locator('[name="timeFrom"]').inputValue() === "08:00",
      "Cancel must undo a local date Reset.");
    await localReset(dialog); await done(dialog);
    dialog = await open("limits");
    require(await dialog.locator('[name="probMin"]').inputValue() === "70" && await dialog.locator('[name="probMax"]').inputValue() === "95",
      "Date Reset must not change another dialog's limits.");
    await cancel(dialog);

    dialog = await open("leagues");
    require(JSON.stringify(await selected(dialog, "league")) === JSON.stringify(selectedLeagues), "Date Reset must preserve leagues.");
    await localReset(dialog);
    require(await dialog.isVisible() && (await selected(dialog, "league")).length === 0, "League Reset must restore all leagues without closing.");
    await cancel(dialog);
    dialog = await open("leagues");
    require(JSON.stringify(await selected(dialog, "league")) === JSON.stringify(selectedLeagues), "Cancel must undo a local league Reset.");
    await localReset(dialog); await done(dialog);
    dialog = await open("countries");
    require(JSON.stringify(await selected(dialog, "country")) === JSON.stringify(selectedCountries), "League Reset must preserve countries.");
    await localReset(dialog);
    require(await dialog.isVisible() && (await selected(dialog, "country")).length === 0, "Country Reset must restore all countries without closing.");
    await cancel(dialog);
    dialog = await open("countries");
    require(JSON.stringify(await selected(dialog, "country")) === JSON.stringify(selectedCountries), "Cancel must undo a local country Reset.");
    await localReset(dialog); await done(dialog);

    dialog = await open("markets");
    require(JSON.stringify(await selected(dialog, "market")) === JSON.stringify(selectedMarkets), "Date and competition resets must preserve markets.");
    await localReset(dialog);
    require(await dialog.isVisible() && (await selected(dialog, "market")).length === 4, "Market Reset must restore all four markets without closing.");
    await cancel(dialog);
    dialog = await open("markets");
    require(JSON.stringify(await selected(dialog, "market")) === JSON.stringify(selectedMarkets), "Cancel must undo a local market Reset.");
    await localReset(dialog); await done(dialog);

    dialog = await open("limits");
    require(await dialog.locator('[name="probMin"]').inputValue() === "70" && await dialog.locator('[name="probMax"]').inputValue() === "95",
      "League, country and market resets must preserve limits.");
    await cancel(dialog);
    dialog = await open("markets");
    await dialog.locator('input[name="market"]').first().uncheck();
    await done(dialog);
    dialog = await open("limits");
    await localReset(dialog);
    require(await dialog.isVisible() && await dialog.locator('[name="probMin"]').inputValue() === ""
      && await dialog.locator('[name="probMax"]').inputValue() === "", "Limit Reset must restore Any bounds without closing.");
    await cancel(dialog);
    dialog = await open("limits");
    require(await dialog.locator('[name="probMin"]').inputValue() === "70" && await dialog.locator('[name="probMax"]').inputValue() === "95",
      "Cancel must undo a local limit Reset.");
    await localReset(dialog); await done(dialog);
    require(await count("limits") === null && await count("markets") === "3", "Limit Reset must clear its count and preserve the market count.");
    dialog = await open("markets");
    require(JSON.stringify(await selected(dialog, "market")) === JSON.stringify(selectedMarkets), "Limit Reset must preserve selected markets.");
    await localReset(dialog); await done(dialog);
    await unchangedEssentials();
    require(requests.length === 0, "Editing and local resets must not fetch the feed or navigate.");
    page.off("request", recordRequest);

    // Saving a time window may adopt an explicit device zone, which has no captured
    // SQL projection. Use the known default capture for the navigation checks.
    await page.goto(address.origin + "/en/matches?pageSize=30");
    await form.waitFor({ state: "visible" });
    await search.fill("Reset this draft"); await picks.check(); await sort.selectOption("kickoff-asc");
    await form.getByRole("button", { name: "Reset filters", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/en/matches" && !url.searchParams.has("q") && !url.searchParams.has("dir"));
    await form.waitFor({ state: "visible" });
    await settled();
    require(await search.inputValue() === "" && await picks.isChecked() && await sort.inputValue() === "kickoff-desc", "Main Reset must restore full-access prediction defaults and all essentials.");
    require(await count("leagues") === null && await count("countries") === null && await count("markets") === "4" && await count("limits") === null,
      "Main Reset must restore every independent section's default count.");
    const resetHref = page.url();
    await sort.selectOption("kickoff-asc");
    await form.getByRole("button", { name: "Apply filters", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/en/matches" && url.searchParams.get("dir") === "asc");
    await form.waitFor({ state: "visible" });
    await settled();
    require(await sort.inputValue() === "kickoff-asc", "Apply must navigate with the complete sort draft.");
    // App Router may replace a document load during history restoration. Trigger
    // native Back and verify the exact destination and restored controls instead.
    await page.evaluate(() => window.history.back());
    await page.waitForURL(resetHref, { waitUntil: "commit" });
    await form.waitFor({ state: "visible" });
    await settled();
    await page.waitForFunction(() => document.querySelector('[data-desktop-feed-filters] [name="sort"]')?.value === "kickoff-desc");
    require(await sort.inputValue() === "kickoff-desc", "Back must restore controls to the applied query.");
    await open("markets");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => !document.querySelector("[data-desktop-feed-filters]"));
    require(await page.getByRole("dialog").count() === 0, "Desktop dialogs must close when switching to mobile.");
    const mobileFilters = page.getByRole("button", { name: /^Advanced filters/ });
    await mobileFilters.click();
    await page.getByRole("dialog").waitFor({ state: "visible" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await form.waitFor({ state: "visible" });
    await settled();
    require(await page.getByRole("dialog").count() === 0, "The existing mobile sheet must close when switching to desktop.");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => !document.querySelector("[data-desktop-feed-filters]"));
    require(await mobileFilters.getAttribute("aria-expanded") === "false", "Returning to mobile must not reopen its old sheet.");
    require(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Mobile must retain its fitting layout.");
    await page.setViewportSize({ width: 1440, height: 900 });
    await form.waitFor({ state: "visible" });
    const status = form.locator('[name="status"]'), period = form.locator('[name="when"]');
    require(JSON.stringify(await status.locator("option").allTextContents()) === JSON.stringify(["All", "Upcoming", "Live", "Completed"]),
      "Matches must offer the four unified status filters with their public labels.");
    require(JSON.stringify(await status.locator("option").evaluateAll((options) => options.map((option) => option.value)))
      === JSON.stringify(["all", "scheduled", "live", "finished"]), "Status filters retain the existing transport codes.");
    page.on("request", recordRequest);
    await period.selectOption("last-7-days");
    dialog = await open("dates");
    await dialog.locator('[name="timeFrom"]').fill("08:00");
    await dialog.locator('[name="timeTo"]').fill("10:00");
    await done(dialog);
    dialog = await open("leagues");
    await dialog.locator('input[name="league"]').first().check();
    const statusLeagues = await selected(dialog, "league");
    await done(dialog);
    dialog = await open("markets");
    await dialog.locator('input[name="market"]').first().uncheck();
    const statusMarkets = await selected(dialog, "market");
    await done(dialog);
    dialog = await open("limits");
    await dialog.locator('[name="probMin"]').fill("70");
    await dialog.locator('[name="probMax"]').fill("95");
    await done(dialog);
    await search.fill("Keep status drafts"); await picks.check(); await sort.selectOption("probability-desc");
    await status.selectOption("live");
    require(await period.inputValue() === "today" && await period.isDisabled() && await control("dates").isDisabled(),
      "Selecting Live must immediately select Today and prevent incompatible period/calendar choices.");
    await status.selectOption("all");
    require(await period.inputValue() === "today" && await period.isEnabled() && await control("dates").isEnabled(),
      "Leaving Live must restore date controls while retaining Today.");
    dialog = await open("dates");
    require(await dialog.locator('[name="from"]').inputValue() === defaultTo && await dialog.locator('[name="to"]').inputValue() === defaultTo
      && await dialog.locator('[name="timeFrom"]').inputValue() === "00:00" && await dialog.locator('[name="timeTo"]').inputValue() === "23:59",
      "Live must use the current browsing day and clear a stale kickoff-time window.");
    await cancel(dialog);
    dialog = await open("leagues");
    require(JSON.stringify(await selected(dialog, "league")) === JSON.stringify(statusLeagues), "Status changes preserve compatible league choices.");
    await cancel(dialog);
    dialog = await open("markets");
    require(JSON.stringify(await selected(dialog, "market")) === JSON.stringify(statusMarkets), "Status changes preserve selected markets.");
    await cancel(dialog);
    dialog = await open("limits");
    require(await dialog.locator('[name="probMin"]').inputValue() === "70" && await dialog.locator('[name="probMax"]').inputValue() === "95",
      "Status changes preserve probability bounds.");
    await cancel(dialog);
    require(await search.inputValue() === "Keep status drafts" && await picks.isChecked() && await sort.inputValue() === "probability-desc",
      "Status changes preserve search, prediction choices and sorting.");
    await period.selectOption("last-7-days");
    await status.selectOption("scheduled");
    require(await period.inputValue() === "next-7-days" && await period.isEnabled(), "Upcoming synchronizes a past relative period to its future equivalent.");
    await status.selectOption("finished");
    require(await period.inputValue() === "last-7-days", "Completed synchronizes a future relative period to its past equivalent.");
    await status.selectOption("all");
    require(await period.inputValue() === "last-7-days", "All retains the selected compatible date period.");
    require(requests.length === 0, "Desktop status/date synchronization and compatible filter edits remain drafts until Apply.");
    page.off("request", recordRequest);
    await form.getByRole("button", { name: "Reset filters", exact: true }).click();
    await settled();
    require(await status.inputValue() === "all" && await period.inputValue() === "last-30-days" && await period.isEnabled(),
      "Main Reset restores All and Last 30 days, clearing the new status filter too.");
    return { passed: true, dialogs: 5, localReset: true, independentCounts: true, cancelRollback: true, unrelatedDraftsPreserved: true,
      draftRequests: requests.length, completeApply: true, queryRestoration: true, desktopWidths: [1024, 1440], mobileLifecycle: true,
      futurePeriods: true, unifiedStatuses: true, liveToday: true, staleTimesCleared: true, statusDateSync: true, statusReset: true };
  } finally {
    page.off("request", recordRequest);
  }
}
