/** Browser acceptance for an existing Playwright Page; no added dependency. */
import { mkdir } from "node:fs/promises";
import { variants, tabs, viewers, statuses } from "../design/match-details-desktop/catalog.mjs";

export async function verifyMatchDetailDesigns(page, { origin = "http://127.0.0.1:3111", width = 1440,
  phase = "layouts", captureDirectory, variantIds = variants.map(item => item.id) } = {}) {
  const failures = [], checks = [], errors = [];
  const onError = error => errors.push(String(error));
  const onConsole = message => { if (message.type() === "error") errors.push(message.text()); };
  page.on("pageerror", onError); page.on("console", onConsole);
  await page.setViewportSize({ width, height: 1050 });
  if (captureDirectory) await mkdir(captureDirectory, { recursive: true });
  const check = (condition, message) => { if (!condition) failures.push(message); };
  async function open(state) {
    await page.goto(`${origin}/?${new URLSearchParams(state)}`);
    await page.locator('#studio[data-ready="true"]').waitFor();
    await page.evaluate(() => document.fonts.ready);
  }
  async function geometry(context) {
    const result = await page.evaluate(() => {
      const panel = document.querySelector("#match-panel");
      const overflow = [...document.querySelectorAll(".studio-toolbar,.scoreboard,.featured,.access-gate,.tab-panel,.section-navigation,.form-card,.squad,.market-toolbar")]
        .filter(node => node.scrollWidth > node.clientWidth + 2).map(node => `${node.className}: ${node.scrollWidth}/${node.clientWidth}`);
      return { viewport: document.documentElement.scrollWidth <= innerWidth, overflow,
        panel: panel && panel.querySelectorAll(":scope > .panel-heading").length === 1,
        tabs: document.querySelectorAll('[role="tab"][aria-selected="true"]').length,
        feature: document.querySelectorAll("[data-featured]").length,
        order: document.querySelector(".home-team").getBoundingClientRect().left < document.querySelector(".away-team").getBoundingClientRect().left };
    });
    check(result.viewport, `${context}: page overflows at ${width}px`);
    check(result.overflow.length === 0, `${context}: ${result.overflow.join(", ")}`);
    check(result.panel && result.tabs === 1 && result.order, `${context}: panel/tab/scoreboard structure`);
    check(result.feature === 1, `${context}: one featured prediction`);
    checks.push(context);
  }
  try {
    if (phase === "layouts") {
      for (const variant of variants.filter(item => variantIds.includes(item.id))) {
        await open({ variant: variant.id, tab: "stats", viewer: "subscriber", status: "scheduled" });
        for (const tab of tabs) {
          await page.locator(`[data-tab="${tab.id}"]`).click();
          await page.locator(`[data-active-tab="${tab.id}"]`).waitFor();
          await geometry(`${variant.id}/${tab.id}/${width}`);
          if (captureDirectory && tab.id === "stats") await page.screenshot({ path: `${captureDirectory}/${variant.id}-${width}.png`, fullPage: true });
        }
        check(await page.locator('[role="tab"]').count() === 8, `${variant.id}: eight tabs`);
      }
    }
    if (phase === "access") {
      for (const variant of variants.filter(item => variantIds.includes(item.id))) for (const viewer of viewers) for (const status of statuses) {
        await open({ variant: variant.id, tab: "markets", viewer: viewer.id, status: status.id });
        const context = `${variant.id}/${viewer.id}/${status.id}`;
        const allowed = ["subscriber", "referral"].includes(viewer.id) || status.id === "finished-regulation";
        check(await page.locator("[data-featured]").count() === (allowed ? 1 : 0), `${context}: featured access`);
        check(await page.locator(".markets-table").count() === (allowed ? 1 : 0), `${context}: market access`);
        const payload = await page.evaluate(async () => (await fetch(`/api/fixture${location.search}`)).json());
        check(payload.canView === allowed, `${context}: API access`);
        if (!allowed) {
          check(payload.forecasts === null, `${context}: no prediction payload`);
          check(!/Estimated probability|74%|1\.62/u.test(await page.locator(".product").innerText()), `${context}: no leaked prediction text`);
          check(await page.locator('[data-access-gate] button[data-action="register"]').count() === (viewer.id === "guest" ? 1 : 0), `${context}: account-appropriate CTA`);
          check(await page.locator(".referral-guidance").count() === 1, `${context}: access guidance appears once`);
        } else {
          check(await page.locator(".markets-table tbody tr").count() === 4, `${context}: four additional markets`);
          check(!await page.locator(".markets-table").innerText().then(text => text.includes("Both teams to score")), `${context}: featured market not duplicated`);
        }
        await page.locator('[data-tab="analysis"]').click();
        check(await page.locator(".scenarios article").count() === (allowed ? 3 : 0), `${context}: predictive scenario access`);
        check(await page.locator(".news-card").count() === 2, `${context}: public reporting remains available`);
        check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${context}: viewport containment`);
        checks.push(context);
      }
    }
    if (phase === "interactions") {
      await open({ variant: "touchline", tab: "lineups", viewer: "subscriber", status: "scheduled" });
      check(await page.locator(".pitch-player").count() === 22, "lineups: 22 positioned players");
      check(await page.locator(".substitute").count() === 8, "lineups: substitutes");
      for (const mode of ["age", "rating", "number"]) {
        await page.getByRole("combobox", { name: "Player detail", exact: true }).selectOption(mode);
        const detail = await page.locator(mode === "number" ? ".pitch-player .player-shirt b" : ".pitch-player .player-detail").first().innerText();
        check(mode === "age" ? detail === "28 yrs" : mode === "rating" ? detail === "7.2" : detail === "1", `lineups: ${mode} display`);
      }
      await page.locator(".pitch-player").first().click();
      check(await page.getByRole("dialog").isVisible(), "player profile opens");
      await page.keyboard.press("Escape");
      await page.getByRole("combobox", { name: "Design variant", exact: true }).selectOption("dugout");
      check(await page.locator('[data-active-tab="lineups"]').count() === 1, "variant change retains selected tab");
      await page.locator('[data-tab="h2h"]').click();
      await page.getByRole("combobox", { name: "History window", exact: true }).selectOption("all");
      check(await page.locator(".h2h-table tbody tr").count() === 12, "H2H: up to 20 available records");
      await page.getByRole("combobox", { name: "H2H competition", exact: true }).selectOption("League Cup");
      check(await page.locator(".h2h-table tbody tr").count() === 2, "H2H: competition filter");
      await page.getByRole("combobox", { name: "H2H ground", exact: true }).selectOption("ars");
      check(await page.locator(".h2h-table tbody tr").count() === 1, "H2H: ground filter");
      await page.getByRole("combobox", { name: "Match status", exact: true }).selectOption("live");
      await page.locator('#studio[data-ready="true"]').waitFor();
      await page.locator('[data-tab="stats"]').click(); await page.locator('[data-action="stat-match"]').click();
      check((await page.locator(".panel-heading h2").innerText()).includes("match in numbers"), "live statistics mode");
      await page.locator('[data-tab="events"]').click();
      check(await page.locator(".timeline-event").count() === 6, "live event timeline");
      await page.getByRole("combobox", { name: "Event type", exact: true }).selectOption("goal");
      check(await page.locator(".timeline-event").count() === 3, "goal filter");
      await page.locator('[data-tab="markets"]').click(); await page.locator('[data-action="market-Goals"]').click();
      check(await page.locator(".markets-table tbody tr").count() === 2, "market category filter");
      await page.locator('[data-action="market-reason-over-25"]').click();
      check(await page.getByRole("dialog").isVisible(), "market explanation opens"); await page.keyboard.press("Escape");
      await page.locator('[data-action="featured-reason"]').click();
      check(await page.getByRole("dialog").isVisible(), "featured explanation opens"); await page.keyboard.press("Escape");
      await page.locator('[data-tab="stats"]').click(); await page.locator('[data-tab="stats"]').press("ArrowDown");
      check(await page.locator('[data-tab="h2h"]').getAttribute("aria-selected") === "true", "vertical keyboard tabs");
      await page.getByRole("combobox", { name: "Design variant", exact: true }).selectOption("touchline");
      await page.locator('[data-tab="h2h"]').focus(); await page.keyboard.press("ArrowRight");
      check(await page.locator('[data-tab="standings"]').getAttribute("aria-selected") === "true", "horizontal keyboard tabs");
      const url = page.url(); await page.reload(); await page.locator('#studio[data-ready="true"]').waitFor();
      check(page.url() === url && await page.locator('[data-active-tab="standings"]').count() === 1, "bookmark restores exact review state");
      await page.getByRole("combobox", { name: "Viewing as", exact: true }).selectOption("guest"); await page.locator('#studio[data-ready="true"]').waitFor();
      await page.locator('[data-tab="markets"]').click();
      await page.locator('[data-action="jump-access"]').click();
      check(await page.evaluate(() => document.activeElement.dataset.action) === "register", "locked markets return to the single access panel");
      await page.locator('[data-action="register"]').first().click();
      check(await page.getByRole("dialog").isVisible(), "registration guidance"); await page.keyboard.press("Escape");
      await page.getByRole("combobox", { name: "Viewing as", exact: true }).selectOption("member"); await page.locator('#studio[data-ready="true"]').waitFor();
      await page.locator('[data-action="referrals"]').first().click();
      check((await page.getByRole("dialog").innerText()).includes("verifies their phone"), "verified-referral guidance"); await page.keyboard.press("Escape");
      await page.locator('[data-action="notes"]').click(); await page.locator("#review-notes").fill("Review automation note"); await page.keyboard.press("Escape");
      await page.locator('[data-action="favorite"]').click();
      await page.locator('[data-action="filter-favorites"]').click();
      check(await page.locator(".design-option").count() === 1, "shortlist filter");
      await page.locator('[data-action="filter-favorites"]').click();
      await page.reload(); await page.locator('#studio[data-ready="true"]').waitFor();
      check(await page.locator('[data-action="favorite"]').getAttribute("aria-pressed") === "true", "shortlist persists");
      await page.locator('[data-action="notes"]').click();
      check(await page.locator("#review-notes").inputValue() === "Review automation note", "notes persist");
      await page.locator("#review-notes").fill(""); await page.keyboard.press("Escape");
      await page.locator('[data-action="favorite"]').click();
      await page.locator('[data-action="focus"]').click();
      check(await page.locator("#studio").getAttribute("class") === "focus-mode", "focus preview mode");
      await page.locator('[data-action="focus"]').click();
      await page.locator('[data-action="next"]').click();
      check(await page.locator('[data-variant-id="floodlight"]').count() === 1, "next variant");
      await page.goBack();
      check(await page.locator('[data-variant-id="touchline"]').count() === 1, "Back restores previous variant");
      checks.push("review and match interactions");
    }
  } finally { page.off("pageerror", onError); page.off("console", onConsole); }
  return { phase, width, checks: checks.length, failures, consoleErrors: [...new Set(errors)] };
}
