/** Exercise the actual match-details route against the native Touchline acceptance fixture. */
export async function verifyMatchEvents(page, { origin = "http://127.0.0.1:3118", width = 1440, captureDirectory } = {}) {
  const errors = [], failures = [], checks = [];
  const check = (value, label) => { if (!value) failures.push(label); };
  const capture = async name => {
    if (!captureDirectory) return;
    await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({ path: `${captureDirectory}/${name}.png`, fullPage: true });
  };
  const onError = error => errors.push(String(error));
  const onConsole = message => { if (message.type() === "error") errors.push(message.text()); };
  page.on("pageerror", onError); page.on("console", onConsole);
  await page.addInitScript(() => { Date.now = () => Date.parse("2026-10-09T09:00:00Z"); delete Navigator.prototype.serviceWorker; });
  const session = "**/api/account/session";
  await page.route(session, route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ phone: null, administrator: false, subscription: null }) }));
  const path = (index, slug) => `/en/matches/10000000-0000-4000-8000-${String(index).padStart(12, "0")}/${slug}?panel=events`;
  try {
    await page.setViewportSize({ width, height: 1000 });
    await page.setExtraHTTPHeaders({ "x-test-viewer": "anonymous" });
    await page.goto(origin + path(5, "finished-regulation"), { waitUntil: "networkidle" });
    await page.locator("[data-match-event-timeline]").waitFor();
    const sequence = await page.locator("[data-match-event]").evaluateAll(rows => rows.map(row => Number(row.dataset.matchEvent)));
    check(JSON.stringify(sequence) === JSON.stringify(Array.from({ length: 15 }, (_, index) => 15 - index)), "newest events first, preserving every source incident");
    check(await page.locator('[data-match-event="15"] [data-event-minute]').innerText() === "90+7′", "stoppage-time minute preserved");
    check(await page.locator('[data-match-event="4"] [data-event-minute]').innerText() === "45+2′", "first-half added time preserved");
    const placement = await page.locator("[data-match-event]").evaluateAll(rows => rows.every(row => {
      const minute = row.querySelector("[data-event-minute]").getBoundingClientRect(), incident = row.querySelector('[role="group"]').getBoundingClientRect();
      return row.dataset.eventTeam === "home" ? incident.right < minute.left : incident.left > minute.right;
    }));
    check(placement, "home on left and away on right");
    for (const kind of ["goal", "own-goal", "penalty-goal", "missed-penalty", "yellow-card", "red-card", "second-yellow", "substitution", "var"])
      check(await page.locator(`[data-event-symbol="${kind}"]`).count() > 0, `distinct ${kind} representation`);
    check(await page.locator('[data-event-symbol="yellow-card"] rect').first().getAttribute("fill") === "#FACC15", "yellow card symbol");
    check(await page.locator('[data-event-symbol="red-card"] rect').first().getAttribute("fill") === "#E53935", "red card symbol");
    check(await page.locator('[data-event-symbol="second-yellow"] rect').count() === 2, "second-yellow dismissal shows both cards");
    check((await page.locator('[data-match-event="8"] [data-player-on]').innerText()).includes("Nico Rossi"), "incoming substitute identified");
    check((await page.locator('[data-match-event="8"] [data-player-off]').innerText()).includes("Samuel Okoro"), "outgoing substitute identified");
    check((await page.locator('[data-match-event="5"] [data-event-detail]').innerText()) === "Goal cancelled", "VAR outcome retained");
    check(await page.locator("[data-active-match-tab] h2").count() === 1 && await page.locator("[data-active-match-tab] h3").count() === 0, "one events heading");
    await page.locator("[data-event-source] summary").click();
    check((await page.locator("[data-event-source]").innerText()).includes("Data retrieved") && (await page.locator("[data-event-source]").innerText()).includes("not supplied an update time"), "independent source clocks remain available");
    await page.locator("[data-event-source] summary").click();
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `desktop ${width}: no overflow`);
    await capture(`match-events-${width}`);
    checks.push("completed public timeline, team sides, symbols, substitutions, VAR and source clocks");

    await page.setExtraHTTPHeaders({ "x-test-viewer": "entitled" });
    await page.goto(origin + path(2, "live"), { waitUntil: "networkidle" });
    await page.locator("[data-match-event-timeline]").waitFor();
    check(await page.locator('[data-match-event="10"] [data-event-minute]').innerText() === "—", "unknown minute stays unknown");
    check(await page.locator('[data-match-event="10"] [data-event-minute]').getAttribute("aria-label") === "Time not supplied", "unknown minute has an accessible label");
    check(await page.locator('[data-match-event="10"] [data-event-symbol="card"]').count() === 1, "unknown card detail is not assigned a yellow/red colour");
    check((await page.locator("[data-active-match-tab]").innerText()).includes("missing or could not be refreshed"), "partial coverage remains visible");
    checks.push("partial source, unknown minute and unknown card type");
    await page.setExtraHTTPHeaders({ "x-test-viewer": "anonymous" });
    await page.goto(origin + path(2, "live"), { waitUntil: "networkidle" });
    check(await page.locator("[data-match-event-timeline]").count() === 0 && await page.locator("[data-match-access]").count() === 1, "unfinished observations remain protected");
    const privateResponse = await page.request.get(origin + path(2, "live"), { headers: { "x-test-viewer": "anonymous" } });
    check(!(await privateResponse.text()).includes("Caution review"), "protected event details absent from HTML and flight");
    checks.push("unfinished access and raw HTML boundary");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin + path(5, "finished-regulation"), { waitUntil: "networkidle" });
    await page.locator('[data-match-design="phone"]').waitFor();
    await page.getByText("Match events (15)", { exact: true }).click();
    await page.locator("[data-match-event-timeline]").waitFor();
    check(await page.locator("[data-match-event]").count() === 15, "phone reuses full visual timeline");
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "phone has no horizontal overflow");
    await capture("match-events-phone");
    checks.push("390px phone timeline");
  } catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
  finally { page.off("pageerror", onError); page.off("console", onConsole); await page.unroute(session); }
  return { width, checks: checks.length, failures, consoleErrors: [...new Set(errors)] };
}
