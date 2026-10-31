/** Native Touchline browser checks for a Page connected to the paywall acceptance fixture. */
export async function verifyTouchline(page, { origin = "http://127.0.0.1:3112", phase = "layout", width = 1440,
  captureDirectory } = {}) {
  const tabs = ["stats", "h2h", "standings", "lineups", "markets", "events", "venue", "analysis"];
  const path = (name, index = 1) => `/en/matches/10000000-0000-4000-8000-${String(index).padStart(12, "0")}/${name}`;
  const failures = [], errors = [], checks = [];
  const check = (value, message) => { if (!value) failures.push(message); };
  const onError = error => errors.push(String(error));
  const onConsole = message => { if (message.type() === "error") errors.push(message.text()); };
  page.on("pageerror", onError); page.on("console", onConsole);
  // The isolated stored readers use this fixed reporting day; avoid artificial day-rollover refreshes.
  await page.addInitScript(() => {
    Date.now = () => Date.parse("2026-10-09T09:00:00Z");
    // This isolated component fixture deliberately excludes the offline worker/build manifest.
    delete Navigator.prototype.serviceWorker;
  });
  await page.setViewportSize({ width, height: 1000 });
  const sessionRoute = "**/api/account/session";
  await page.route(sessionRoute, route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ phone: null, administrator: false, subscription: null }) }));
  try {
    if (phase === "layout") {
      await page.setExtraHTTPHeaders({ "x-test-viewer": "entitled" });
      await page.goto(origin + path("scheduled"), { waitUntil: "networkidle" });
      await page.locator('[data-match-design="touchline"]').waitFor();
      check(await page.locator("[data-match-tab]").count() === 8, "eight desktop tabs");
      check(await page.getByRole("button", { name: "Last 5", exact: true }).count() === 1, "one shared form-window control");
      for (const tab of tabs) {
        await page.locator(`[data-match-tab="${tab}"]`).click();
        await page.locator(`[data-active-match-tab="${tab}"]`).waitFor();
        if (tab === "lineups") await page.locator("[data-touchline-pitch] button").first().waitFor();
        if (tab === "standings") await page.locator("[data-active-match-tab] tbody tr").first().waitFor();
        check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${tab}/${width}: horizontal overflow`);
        check(await page.locator('[role="tab"][aria-selected="true"]').count() === 1, `${tab}: one selected tab`);
        check(await page.locator('[data-featured-pick="both-teams-to-score"]').count() === 1, `${tab}: one featured selection`);
        if (tab === "markets") {
          check(await page.locator("[data-detail-market]").count() === 3, "three additional markets");
          check(await page.locator('[data-detail-market="both-teams-to-score"]').count() === 0, "featured market excluded from list");
          await page.locator("[data-detail-market]").first().click();
          check((await page.locator('[data-active-match-tab="markets"]').innerText()).includes("Why this pick?"), "market explanation links to analysis owner");
        }
        if (tab === "lineups") {
          check(await page.locator("[data-touchline-pitch]").count() === 1, "one shared horizontal pitch");
          check(await page.locator("[data-pitch-goal]").count() === 2, "a goal at each end");
          check(await page.locator("[data-touchline-pitch] button").count() === 22, "22 formation players");
          check(await page.locator("[data-formation]").count() === 2, "both formations shown beside teams");
          check(await page.locator('[data-section="lineups"]').getByText("Daniel Mercer", { exact: true }).count() === 1, "starter appears once");
          await page.getByRole("combobox", { name: "Player detail", exact: true }).selectOption("position");
          check(await page.locator("[data-position]").count() === 22, "position detail mode");
          const geometry = await page.locator("[data-touchline-pitch]").evaluate(field => {
            const pitch = field.getBoundingClientRect(), players = [...field.querySelectorAll("button")];
            const rectangles = players.map(player => player.getBoundingClientRect());
            return { horizontal: pitch.width > pitch.height * 2,
              ownHalves: players.every((player, i) => player.dataset.side === "home" ? rectangles[i].right < pitch.x + pitch.width / 2 : rectangles[i].left > pitch.x + pitch.width / 2),
              separated: rectangles.every((box, i) => rectangles.slice(i + 1).every(other => box.right <= other.left || other.right <= box.left || box.bottom <= other.top || other.bottom <= box.top)),
              contained: rectangles.every(box => box.left >= pitch.left && box.right <= pitch.right && box.top >= pitch.top && box.bottom <= pitch.bottom) };
          });
          check(geometry.horizontal && geometry.ownHalves && geometry.separated && geometry.contained, `horizontal pitch/${width}: readable, separate markers within their halves`);
          await page.getByRole("button", { name: "Liverpool", exact: true }).click();
          check(await page.locator('[data-touchline-pitch] button[data-side="away"]').count() === 11 && await page.locator('[data-touchline-pitch] button[data-side="home"]').count() === 0, "team filter preserves the selected half");
          await page.getByRole("button", { name: "Both teams", exact: true }).click();
          check(await page.locator("[data-touchline-pitch] button").count() === 22, "both-team formation restored");
          check(await page.locator("[data-position]").count() === 22, "player detail mode survives team filtering");
        }
        await page.locator('[data-active-match-tab] [role="status"]').first().waitFor({ state: "hidden" });
        if (captureDirectory) await page.screenshot({ path: `${captureDirectory}/touchline-${tab}-${width}.png`, fullPage: true });
        checks.push(`${tab}/${width}`);
      }
      await page.goto(`${origin}${path("scheduled")}?panel=markets&market=both-teams-to-score`, { waitUntil: "networkidle" });
      check(await page.locator("[data-detail-market]").count() === 3, "legacy featured-market links retain the single featured owner");
      await page.locator('[data-match-tab="stats"]').focus(); await page.keyboard.press("ArrowRight");
      await page.locator('[data-active-match-tab="h2h"]').waitFor();
      check((await page.locator('[data-match-tab="h2h"]').getAttribute("aria-selected")) === "true", "keyboard tab navigation");
      await page.getByRole("button", { name: "Up to 20 meetings", exact: true }).click();
      const bookmark = page.url(); await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");
      check(page.url() === bookmark && await page.locator('[data-active-match-tab="h2h"]').count() === 1, "refresh retains selected tab/filter");
      await page.locator('[data-match-tab="lineups"]').click(); await page.locator('[data-active-match-tab="lineups"]').waitFor();
      await page.locator("[data-touchline-pitch] button").first().click();
      check(await page.locator("[data-item-panel]").count() === 1, "player profile opens");
      await page.goBack({ waitUntil: "domcontentloaded" });
      await page.locator("[data-item-panel]").waitFor({ state: "detached" });
      check(await page.locator("[data-item-panel]").count() === 0, "Back returns to formation");
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('[data-match-design="phone"]').waitFor();
      check(await page.locator("[data-match-tab]").count() === 0, "phone retains drawer navigation");
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "phone horizontal containment");
      checks.push("keyboard, refresh, player profile, Back and phone preservation");
    }
    if (phase === "access") {
      for (const viewer of ["anonymous", "expired", "entitled", "referral"]) for (const [name, index] of [["scheduled", 1], ["live", 2], ["postponed", 3], ["finished-regulation", 5]]) {
        await page.setExtraHTTPHeaders({ "x-test-viewer": viewer });
        await page.goto(origin + path(name, index), { waitUntil: "networkidle" });
        const allowed = ["entitled", "referral"].includes(viewer) || name === "finished-regulation";
        check(await page.locator("[data-match-access]").count() === (allowed ? 0 : 1), `${viewer}/${name}: one access panel`);
        check(await page.locator('[data-featured-pick="both-teams-to-score"]').count() === (allowed ? 1 : 0), `${viewer}/${name}: featured access`);
        await page.locator('[data-match-tab="markets"]').click();
        await page.locator('[data-active-match-tab="markets"]').waitFor();
        check(await page.locator("[data-detail-market]").count() === (allowed ? 3 : 0), `${viewer}/${name}: additional markets`);
        await page.locator('[data-match-tab="analysis"]').click();
        const text = await page.locator('[data-active-match-tab="analysis"]').innerText();
        check(text.includes("chance creation") === allowed, `${viewer}/${name}: explanation access`);
        if (!allowed) {
          check(await page.locator("[data-match-referral-guidance]").count() === 1, `${viewer}/${name}: guidance is not repeated`);
          await page.getByRole("button", { name: "Go to access options", exact: true }).click();
          check(await page.evaluate(() => document.querySelector("[data-match-access]").contains(document.activeElement)), "access link returns focus");
          const href = await page.locator("[data-match-access] a").first().getAttribute("href");
          check(viewer === "anonymous" ? href.includes("view=register") : href.includes("/subscribe"), `${viewer}: account-specific CTA`);
        }
        checks.push(`${viewer}/${name}`);
      }
    }
  } finally { page.off("pageerror", onError); page.off("console", onConsole); await page.unroute(sessionRoute); }
  return { phase, width, checks: checks.length, failures, consoleErrors: [...new Set(errors)] };
}
