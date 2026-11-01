/** Browser acceptance for the native match page using explicitly synthetic stored fixtures. */
export async function verifyMatchTabs(page, { origin = "http://127.0.0.1:3118", captureDirectory } = {}) {
  const failures = [], errors = [], checks = [];
  const check = (value, label) => { checks.push(label); if (!value) failures.push(label); };
  const onError = error => errors.push(String(error));
  const onConsole = message => { if (message.type() === "error") errors.push(message.text()); };
  page.on("pageerror", onError); page.on("console", onConsole);
  await page.addInitScript(() => { Date.now = () => Date.parse("2026-10-09T09:00:00Z"); delete Navigator.prototype.serviceWorker; });
  await page.setExtraHTTPHeaders({ "x-test-viewer": "anonymous" });
  await page.route("**/api/account/session", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ phone: null, administrator: false, subscription: null }) }));
  const path = "/en/matches/10000000-0000-4000-8000-000000000005/finished-regulation";
  const tabs = ["stats", "markets", "lineups", "form", "analysis", "events", "standings", "players", "news", "venue", "referee", "history"];
  const nav = page.getByRole("tablist", { name: "Match information", exact: true });
  const panel = page.locator("#match-information-panel");
  async function select(id) {
    await nav.locator(`[data-match-tab="${id}"]`).click();
    await page.locator(`[data-active-match-tab="${id}"]`).waitFor();
  }
  async function capture(name) {
    if (!captureDirectory) return;
    const viewport = page.viewportSize();
    await page.setViewportSize({ width: viewport.width, height: 3000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    const article = await page.locator("[data-match-detail]").boundingBox();
    await page.screenshot({ path: `${captureDirectory}/${name}.png`, clip: { x: 0, y: 0, width: viewport.width,
      height: Math.ceil(Math.min(article.y + article.height, 3000)) } });
    await page.setViewportSize(viewport);
  }
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin + path, { waitUntil: "networkidle" });
    await page.locator('[data-match-design="phone"]').waitFor();
    check(await nav.locator("[data-match-tab]").evaluateAll(elements => elements.map(element => element.dataset.matchTab).join(",")) === tabs.join(","), "prioritized shared tab order");
    check(await nav.evaluate(element => element.scrollWidth > element.clientWidth), "mobile navigation scrolls horizontally");
    check(await page.locator('[data-active-match-tab="stats"]').count() === 1, "Team Stats is the initial tab");
    for (const id of tabs) {
      await select(id);
      check(await nav.getByRole("tab", { selected: true }).count() === 1 && await page.locator("[data-active-match-tab]").count() === 1, `${id}: only the selected content panel`);
      check(await panel.locator('button[aria-expanded]').count() === 0, `${id}: no category disclosure inside the tab`);
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${id}: no page overflow`);
    }
    await select("stats");
    const filters = panel.locator("[data-form-filters] select");
    check(await filters.count() === 2 && await filters.nth(0).getAttribute("aria-label") === "Venue", "venue dropdown precedes match sample");
    await filters.nth(0).selectOption("away"); await filters.nth(1).selectOption("10");
    check(new URL(page.url()).searchParams.get("venue") === "away" && new URL(page.url()).searchParams.get("window") === "10", "statistics filters persist in the URL");
    await page.reload({ waitUntil: "networkidle" });
    check(await filters.nth(0).inputValue() === "away" && await filters.nth(1).inputValue() === "10", "statistics filters survive refresh");
    await capture("shared-tabs-statistics-mobile");
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 }); await select("markets");
      const rows = panel.locator("[data-detail-market]");
      check(await rows.count() > 0, `${width}: market rows available`);
      check(await rows.locator("[data-selected-odds]").count() > 0, `${width}: available odds retained beside selections`);
      check(await rows.evaluateAll(elements => elements.every(element => {
        const boxes = ["[data-name]", "[data-pick]", "[data-bar]"].map(selector => element.querySelector(selector).getBoundingClientRect());
        return boxes.every(box => Math.abs(box.top + box.height / 2 - (boxes[0].top + boxes[0].height / 2)) < 2)
          && boxes.every((box, index) => index === 0 || boxes[index - 1].right <= box.left);
      })), `${width}: market, selection and probability share one row`);
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: market containment`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await capture("shared-tabs-markets-mobile");
    await page.locator('[data-verdict] button').click();
    await panel.locator('[data-market-panel="both-teams-to-score"]').waitFor();
    check(await panel.getByRole("heading", { name: "Source and timing", exact: true }).count() === 1, "featured pick opens its full market details");
    await select("form");
    const results = panel.getByRole("combobox", { name: "Results", exact: true });
    check(await results.inputValue() === "home", "results default to the home club");
    for (const value of ["home", "away", "h2h"]) {
      await results.selectOption(value);
      const rows = panel.locator("[data-result-list] a");
      check(await rows.count() > 0, `${value}: selected results available`);
      check(await rows.first().evaluate(element => [...element.children].filter(child => !child.hidden).map(child => child.tagName === "TIME" ? "date" : child.dataset.team ?? (child.hasAttribute("data-score") ? "score" : "result")).join(",")) === "date,home,score,away,result", `${value}: actual fixture order retained`);
      check(await rows.first().locator('[data-team="home"]').getAttribute("title") !== null, `${value}: complete club names available`);
    }
    await capture("shared-tabs-results-mobile");
    await panel.locator("[data-result-list] a").first().click();
    await panel.locator("[data-item-panel]").waitFor();
    await panel.getByRole("button", { name: /Back to list/u }).click();
    check(await results.inputValue() === "h2h", "record Back restores H2H filter");
    await select("lineups");
    const pitch = panel.locator("[data-touchline-pitch]");
    check(await pitch.locator("button[data-item-key]").count() === 22, "one full mobile pitch retains every starter");
    check(!(await panel.innerText()).includes("schematic player positions"), "pitch explanation removed");
    const detail = panel.getByRole("combobox", { name: "Player detail", exact: true });
    for (const field of ["position", "nationality", "age", "rating", "number"]) {
      await detail.selectOption(field);
      check(await pitch.locator("button[data-item-key]").count() === 22, `${field}: complete pitch retained`);
      if (field !== "number") check(await pitch.locator("[data-phone-position]").count() === 22, `${field}: selected values on shirts`);
      const expected = { nationality: "ENG", age: "20", rating: "7.0" }[field];
      if (expected) check((await pitch.locator("[data-phone-position]").allTextContents()).includes(expected), `${field}: supplied sample value displayed`);
    }
    check(await panel.locator('[data-team-roster="home"]').count() === 1, "home team sheet is default");
    await panel.locator("[data-lineup-team-tabs]").getByRole("tab", { name: /Liverpool/u }).click();
    check(await panel.locator('[data-team-roster="away"]').count() === 1 && await pitch.locator("button").count() === 22, "team switching keeps both pitch halves");
    check((await panel.locator('[data-team-absences="away"]').innerText()).includes("Daniel Rey"), "team availability stays below the bench");
    await capture("shared-tabs-lineups-mobile");
    await nav.getByRole("tab", { selected: true }).press("End");
    await page.locator('[data-active-match-tab="history"]').waitFor();
    check(await nav.locator('[data-match-tab="history"]').evaluate(element => { const box = element.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth + 1; }), "keyboard selection scrolls the active tab into view");
    await page.goto(origin + path + "?panel=h2h&venue=away", { waitUntil: "networkidle" });
    check(await page.locator('[data-active-match-tab="form"]').count() === 1 && await results.inputValue() === "h2h", "legacy H2H link opens the combined results tab");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await select("stats");
    check(await nav.evaluate(element => element.scrollWidth <= element.clientWidth + 1), "desktop tabs fit as a normal row");
    await capture("shared-tabs-desktop");
    await page.getByRole("button", { name: "Switch to dark theme", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 }); await select("stats");
    await capture("shared-tabs-dark-mobile");
    await page.getByRole("button", { name: "Switch to light theme", exact: true }).click();
    await page.goto(origin + "/en/matches/10000000-0000-4000-8000-000000000001/scheduled", { waitUntil: "networkidle" });
    check(await page.getByRole("heading", { name: "Completed matches are public", exact: true }).count() === 1 && await page.locator("[data-detail-market]").count() === 0, "unfinished guest access stays restricted");
    check(errors.length === 0, "no browser errors");
    return { checks: checks.length, failures, errors };
  } finally {
    await page.unroute("**/api/account/session"); page.off("pageerror", onError); page.off("console", onConsole);
  }
}
