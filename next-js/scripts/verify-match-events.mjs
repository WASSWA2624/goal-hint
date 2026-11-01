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
    const sequence = await page.locator("[data-event-row]").evaluateAll(rows => rows.map(row => [...row.querySelectorAll("[data-match-event]")].map(event => Number(event.dataset.matchEvent)).sort((a, b) => b - a)));
    check(JSON.stringify(sequence) === JSON.stringify([[15], [14], [13], [12], [11], [10], [9, 8], [7], [6], [5], [4], [3], [2], [1]]), "newest minute rows first, preserving every source incident");
    const minuteFor = sequence => page.locator("[data-event-row]").filter({ has: page.locator(`[data-match-event="${sequence}"]`) }).locator("[data-event-minute]");
    check(await minuteFor(15).innerText() === "90+7′", "stoppage-time minute preserved");
    check(await minuteFor(4).innerText() === "45+2′", "first-half added time preserved");
    const paired = page.locator('[data-event-row]').filter({ has: page.locator('[data-match-event="8"]') });
    check(await paired.locator('[data-match-event="9"]').count() === 1 && await paired.locator('[data-event-minute]').count() === 1, "both teams share one row and one minute");
    check(await paired.evaluate(row => {
      const home = row.querySelector('[data-match-event="8"]').getBoundingClientRect(), away = row.querySelector('[data-match-event="9"]').getBoundingClientRect();
      return Math.abs(home.top - away.top) <= 1 && row.getBoundingClientRect().height <= 40;
    }), "simultaneous home and away incidents occupy the same horizontal row");
    check(await page.locator('[data-event-period="full-time"]').count() === 1 && await page.locator('[data-event-period="half-time"]').count() === 1, "full-time and half-time dividers");
    check(await page.locator('[data-event-period="added-time"]').count() === 2 && await page.locator('[data-event-period="extra-time"]').count() === 0, "added time remains distinct from extra-time periods");
    check(await page.locator('[data-event-toolbar]').evaluate(toolbar => toolbar.getBoundingClientRect().height <= 40), "one compact desktop toolbar");
    check(await page.locator('[data-match-event]').evaluateAll(rows => rows.every(row => row.getBoundingClientRect().height <= 48)), "desktop incidents fit horizontal rows");
    const placement = await page.locator("[data-match-event]").evaluateAll(events => events.every(event => {
      const minute = event.closest('[data-event-row]').querySelector("[data-event-minute]").getBoundingClientRect(), incident = event.getBoundingClientRect();
      return event.dataset.eventTeam === "home" ? incident.right < minute.left : incident.left > minute.right;
    }));
    check(placement, "home on left and away on right");
    for (const kind of ["goal", "own-goal", "penalty-goal", "missed-penalty", "yellow-card", "red-card", "second-yellow", "substitution", "var"])
      check(await page.locator(`[data-event-symbol="${kind}"]`).count() > 0, `distinct ${kind} representation`);
    check(await page.locator('[data-event-symbol="yellow-card"] rect').first().getAttribute("fill") === "#FACC15", "yellow card symbol");
    check(await page.locator('[data-event-symbol="red-card"] rect').first().getAttribute("fill") === "#E53935", "red card symbol");
    check(await page.locator('[data-event-symbol="second-yellow"] rect').count() === 2, "second-yellow dismissal shows both cards");
    check((await page.locator('[data-match-event="8"] [data-player-on]').innerText()).includes("Nico Rossi"), "incoming substitute identified");
    check((await page.locator('[data-match-event="8"] [data-player-off]').innerText()).includes("Samuel Okoro"), "outgoing substitute identified");
    check(await page.locator('[data-match-event="8"] [data-player-on] small').innerText() === "In"
      && await page.locator('[data-match-event="8"] [data-player-off] small').innerText() === "Out", "substitutions use clear In and Out labels");
    check((await page.locator('[data-match-event="5"] [data-event-detail]').innerText()) === "Goal cancelled", "VAR outcome retained");
    check(await page.locator("[data-active-match-tab] h2, [data-active-match-tab] h3").count() === 0, "events tab is the section heading");
    await page.locator("[data-event-source] summary").click();
    check((await page.locator("[data-event-source]").innerText()).includes("Data retrieved") && (await page.locator("[data-event-source]").innerText()).includes("not supplied an update time"), "independent source clocks remain available");
    await page.locator("[data-event-source] summary").click();
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `desktop ${width}: no overflow`);
    await capture(`match-events-${width}`);
    checks.push("completed public timeline, team sides, symbols, substitutions, VAR and source clocks");

    await page.setExtraHTTPHeaders({ "x-test-viewer": "entitled" });
    await page.goto(origin + path(2, "live"), { waitUntil: "networkidle" });
    await page.locator("[data-match-event-timeline]").waitFor();
    check(await minuteFor(10).innerText() === "—", "unknown minute stays unknown");
    check(await minuteFor(10).getAttribute("aria-label") === "Time not supplied", "unknown minute has an accessible label");
    check(await page.locator('[data-match-event="10"] [data-event-symbol="card"]').count() === 1, "unknown card detail is not assigned a yellow/red colour");
    check((await page.locator("[data-active-match-tab]").innerText()).includes("missing or could not be refreshed"), "partial coverage remains visible");
    checks.push("partial source, unknown minute and unknown card type");
    await page.setExtraHTTPHeaders({ "x-test-viewer": "anonymous" });
    await page.goto(origin + path(2, "live"), { waitUntil: "networkidle" });
    check(await page.locator("[data-match-event-timeline]").count() === 0 && await page.locator("[data-match-access]").count() === 1, "unfinished observations remain protected");
    const privateResponse = await page.request.get(origin + path(2, "live"), { headers: { "x-test-viewer": "anonymous" } });
    check(!(await privateResponse.text()).includes("Caution review"), "protected event details absent from HTML and flight");
    checks.push("unfinished access and raw HTML boundary");

    await page.goto(origin + "/en/live-match?state=extra-time&section=events", { waitUntil: "networkidle" });
    await page.locator('[data-event-period="extra-time"]').waitFor();
    check(await page.locator('[data-event-period="extra-time-interval"]').count() === 1, "extra-time half-time interval");
    check((await page.locator('[data-event-period="full-time"]').innerText()).includes("After extra time"), "final boundary after extra time");
    if (captureDirectory) await capture(`match-events-extra-time-${width}`);
    await page.goto(origin + "/en/live-match?state=half-time&section=events", { waitUntil: "networkidle" });
    await page.locator('[data-event-period="half-time"]').waitFor();
    check(await page.locator('[data-event-period="full-time"]').count() === 0, "a half-time live clock is not labelled full-time");
    checks.push("verified half-time and extra-time context");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin + path(5, "finished-regulation"), { waitUntil: "networkidle" });
    await page.locator('[data-match-design="phone"]').waitFor();
    await page.locator("[data-match-event-timeline]").waitFor();
    check(await page.locator("[data-match-event]").count() === 15, "phone reuses full visual timeline");
    check(await page.locator('[data-event-row]').count() === 14 && await paired.locator('[data-match-event]').count() === 2, "phone also shares same-minute events");
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "phone has no horizontal overflow");
    await capture("match-events-phone");
    checks.push("390px phone timeline");
  } catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
  finally { page.off("pageerror", onError); page.off("console", onConsole); await page.unroute(session); }
  return { width, checks: checks.length, failures, consoleErrors: [...new Set(errors)] };
}
