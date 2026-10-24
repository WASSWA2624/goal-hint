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
  require(JSON.stringify(periods) === JSON.stringify(["Last 30 days", "Last 7 days", "Last 3 days", "Yesterday", "Today", "Tomorrow", "Custom dates"]),
    "The desktop period options and order must match the selected design.");
  const geometry = await form.locator("[data-desktop-filter-actions]").evaluate((row) => {
    const children = Array.from(row.children), boxes = children.map((child) => child.getBoundingClientRect());
    return children.length === 4 && children[0].hasAttribute("data-picks") && children[1].querySelector('[name="sort"]') !== null
      && children[2].getAttribute("type") === "reset" && children[3].getAttribute("type") === "submit"
      && boxes.every((box) => Math.abs(box.y + box.height / 2 - boxes[0].y - boxes[0].height / 2) < 1);
  });
  require(geometry, "Picks only, Sort by, Reset and Apply must share one desktop row in that order.");
  const search = form.locator('[name="q"]'), sort = form.locator('[name="sort"]');
  const picks = form.getByRole("checkbox", { name: "Picks only", exact: true });
  require(await picks.isEnabled(), "Use the full-access acceptance fixture for draft-preservation checks.");
  const open = async (section) => {
    await form.locator(`[data-filter-section="${section}"]`).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible" });
    require(await dialog.getByRole("button", { name: "Reset", exact: true }).isVisible(), "Every filter dialog needs its own Reset.");
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

    dialog = await open("competitions");
    const league = dialog.locator('input[name="league"]').first(), country = dialog.locator('input[name="country"]').first();
    require(await league.count() === 1 && await country.count() === 1, "The SQL capture must provide selectable leagues and countries.");
    await league.check(); await country.check();
    const selectedLeagues = await selected(dialog, "league"), selectedCountries = await selected(dialog, "country");
    await done(dialog);
    dialog = await open("limits");
    await dialog.locator('[name="probMin"]').fill("70");
    await done(dialog);

    dialog = await open("dates");
    const next = new Date(defaultFrom + "T12:00:00Z"); next.setUTCDate(next.getUTCDate() + 1);
    const customFrom = next.toISOString().slice(0, 10);
    await dialog.locator('[name="from"]').fill(customFrom);
    await dialog.locator('[name="timeFrom"]').fill("08:00");
    await dialog.locator('[name="timeTo"]').fill("18:00");
    await done(dialog);
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
    require(await dialog.locator('[name="probMin"]').inputValue() === "70", "Date Reset must not change another dialog's limits.");
    await cancel(dialog);

    dialog = await open("competitions");
    require(JSON.stringify(await selected(dialog, "league")) === JSON.stringify(selectedLeagues)
      && JSON.stringify(await selected(dialog, "country")) === JSON.stringify(selectedCountries), "Date Reset must preserve competitions.");
    await localReset(dialog);
    require(await dialog.isVisible() && (await selected(dialog, "league")).length === 0 && (await selected(dialog, "country")).length === 0,
      "Competition Reset must restore all leagues/countries without closing.");
    await cancel(dialog);
    dialog = await open("competitions");
    require(JSON.stringify(await selected(dialog, "league")) === JSON.stringify(selectedLeagues), "Cancel must undo a local competition Reset.");
    await localReset(dialog); await done(dialog);

    dialog = await open("limits");
    require(await dialog.locator('[name="probMin"]').inputValue() === "70", "Competition Reset must preserve limits.");
    await localReset(dialog);
    require(await dialog.isVisible() && await dialog.locator('[name="probMin"]').inputValue() === ""
      && await dialog.locator('[name="probMax"]').inputValue() === "" && (await selected(dialog, "market")).length === 4,
      "Limit Reset must restore Any and all four markets without closing.");
    await cancel(dialog);
    dialog = await open("limits");
    require(await dialog.locator('[name="probMin"]').inputValue() === "70", "Cancel must undo a local limit Reset.");
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
    require(await search.inputValue() === "" && !await picks.isChecked() && await sort.inputValue() === "kickoff-desc", "Main Reset must restore all essentials.");
    await sort.selectOption("kickoff-asc");
    await form.getByRole("button", { name: "Apply filters", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/en/matches" && url.searchParams.get("dir") === "asc");
    await form.waitFor({ state: "visible" });
    await settled();
    require(await sort.inputValue() === "kickoff-asc", "Apply must navigate with the complete sort draft.");
    await page.goBack();
    await page.waitForURL((url) => url.pathname === "/en/matches" && !url.searchParams.has("dir"));
    await form.waitFor({ state: "visible" });
    await settled();
    await page.waitForFunction(() => document.querySelector('[data-desktop-feed-filters] [name="sort"]')?.value === "kickoff-desc");
    require(await sort.inputValue() === "kickoff-desc", "Back must restore controls to the applied query.");
    return { passed: true, dialogs: 3, localReset: true, cancelRollback: true, unrelatedDraftsPreserved: true,
      draftRequests: requests.length, completeApply: true, queryRestoration: true };
  } finally {
    page.off("request", recordRequest);
  }
}
