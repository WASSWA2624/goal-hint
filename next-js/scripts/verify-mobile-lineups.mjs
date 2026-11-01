/** Verify the shared team sheet against the isolated, explicitly synthetic native fixture. */
export async function verifyMobileLineups(page, { origin = "http://127.0.0.1:3118", captureDirectory } = {}) {
  const failures = [], errors = [];
  const check = (value, label) => { if (!value) failures.push(label); };
  const onError = error => errors.push(String(error));
  const onConsole = message => { if (message.type() === "error") errors.push(message.text()); };
  page.on("pageerror", onError); page.on("console", onConsole);
  await page.addInitScript(() => { Date.now = () => Date.parse("2026-10-09T09:00:00Z"); delete Navigator.prototype.serviceWorker; });
  await page.setExtraHTTPHeaders({ "x-test-viewer": "anonymous" });
  await page.route("**/api/account/session", route => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ phone: null, administrator: false, subscription: null }) }));
  const path = "/en/matches/10000000-0000-4000-8000-000000000005/finished-regulation";
  const section = page.locator('[data-section="lineups"]');
  const pitch = section.locator("[data-touchline-pitch]");
  const roster = section.locator("[data-team-roster]");
  async function capture(name, width) {
    if (!captureDirectory) return;
    // A tall capture viewport keeps the fixed phone navigation clear of the team sheet.
    await page.setViewportSize({ width, height: 2400 });
    await section.screenshot({ path: `${captureDirectory}/${name}.png` });
    await page.setViewportSize({ width, height: 844 });
  }
  async function geometry(width) {
    check(await pitch.count() === 1 && await pitch.locator("[data-pitch-goal]").count() === 2, `${width}: one complete pitch and two goals`);
    check(await pitch.locator("button[data-item-key]").count() === 22, `${width}: every starter stays on the pitch`);
    const positions = await pitch.evaluate(field => {
      const box = field.getBoundingClientRect(), middle = box.top + box.height / 2;
      const buttons = [...field.querySelectorAll("button[data-item-key]")];
      const centres = buttons.every(button => {
        const shirt = button.querySelector("[data-shirt]").getBoundingClientRect(), y = shirt.top + shirt.height / 2;
        return shirt.left >= box.left && shirt.right <= box.right && shirt.top >= box.top && shirt.bottom <= box.bottom
          && (button.dataset.side === "home" ? y > middle : y < middle);
      });
      const circle = field.querySelector("[data-centre-circle]").getBoundingClientRect();
      const overlap = buttons.some((button, index) => buttons.slice(index + 1).some(other => {
        const a = button.getBoundingClientRect(), b = other.getBoundingClientRect();
        return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
      }));
      return { portrait: box.height > box.width, centres, round: Math.abs(circle.width - circle.height) < 1, overlap };
    });
    check(positions.portrait && positions.centres && positions.round, `${width}: proportional portrait field with opposing team halves`);
    check(!positions.overlap, `${width}: player labels and targets do not overlap`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: no page overflow`);
  }
  try {
    for (const width of [390, 320, 768]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(origin + path + "?section=lineups&mk=closed", { waitUntil: "networkidle" });
      await page.locator('[data-match-design="phone"] [data-lineup-team-tabs]').waitFor();
      await geometry(width);
      check(await roster.count() === 1 && await roster.getAttribute("data-team-roster") === "home", `${width}: Home is the default roster`);
      check(await roster.locator('[data-lineup-players="starters"] > li').count() === 11, `${width}: complete selected starting XI`);
      check(await roster.locator('[data-lineup-players="substitutes"] > li').count() > 0, `${width}: substitutes retained`);
      check((await roster.locator('[data-team-absences="home"]').innerText()).includes("Adrian Cole"), `${width}: selected home absence`);
      check(await roster.evaluate(element => Boolean(element.querySelector('[data-lineup-players="substitutes"]')
        .compareDocumentPosition(element.querySelector("[data-team-absences]")) & Node.DOCUMENT_POSITION_FOLLOWING)), `${width}: absences follow substitutes`);
      check(await page.locator('[data-section="injuries"]').count() === 0, `${width}: no separate injury disclosure`);
      if (width === 390) await capture("mobile-lineups-home", width);
      await section.getByRole("tab", { name: /Liverpool/u }).click();
      await section.getByRole("tab", { name: /Liverpool/u, selected: true }).waitFor();
      check(await roster.getAttribute("data-team-roster") === "away" && await roster.count() === 1, `${width}: Away switches only the team sheet`);
      check((await roster.locator('[data-team-absences="away"]').innerText()).includes("Daniel Rey"), `${width}: away suspension retained`);
      await geometry(width);
      if (width === 390) await capture("mobile-lineups-away", width);
      await section.getByRole("tab", { name: /Liverpool/u }).press("ArrowLeft");
      await section.getByRole("tab", { name: /Arsenal/u, selected: true }).waitFor();
      check(await section.getByRole("tab", { name: /Arsenal/u }).getAttribute("aria-selected") === "true", `${width}: keyboard team switching`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin + path + "?section=injuries&team=away&mk=closed", { waitUntil: "networkidle" });
    await section.locator("[data-lineup-team-tabs]").waitFor();
    check(await roster.getAttribute("data-team-roster") === "away", "legacy injury link resolves to the selected team sheet");
    await roster.getByRole("button", { name: /Daniel Rey/u }).click();
    await section.locator("[data-item-panel]").waitFor();
    check((await section.innerText()).includes("Suspended"), "absence opens its existing player availability details");
    await section.getByRole("button", { name: /Back to list/u }).click();
    check(await roster.getAttribute("data-team-roster") === "away" && await pitch.locator("button").count() === 22, "player Back restores the selected team and full pitch");
    await section.getByLabel("Player detail", { exact: true }).selectOption("position");
    await geometry(390);
    check(await pitch.locator("[data-phone-position]").count() === 22 && (await pitch.innerText()).includes("GK"), "mobile position mode labels the shirts without expanding player targets");
    await capture("mobile-lineups-positions", 390);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(origin + path + "?panel=lineups&section=lineups", { waitUntil: "networkidle" });
    await page.locator('[data-match-design="touchline"]').waitFor();
    const box = await pitch.boundingBox();
    check(box.width > box.height && await pitch.locator("button[data-item-key]").count() === 22, "desktop retains the horizontal full pitch");
    check(await section.locator("[data-lineup-team-tabs]").count() === 0 && await roster.count() === 2, "desktop retains both bench columns");
    check(await section.locator("[data-team-absences]").count() === 2 && await page.locator('[data-section="injuries"]').count() === 0, "desktop availability shares its team bench without duplication");
    await section.getByRole("button", { name: /Adrian Cole/u }).click();
    await section.locator("[data-item-panel]").waitFor();
    await section.getByRole("button", { name: /Back to list/u }).click();
    await pitch.waitFor();
    check(await pitch.locator("button[data-item-key]").count() === 22 && await roster.count() === 2, "desktop absence Back preserves the both-team view");
    await capture("lineups-desktop", 1440);
    await page.getByRole("button", { name: "Switch to dark theme", exact: true }).click();
    await page.getByRole("button", { name: "Switch to light theme", exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("[data-lineup-team-tabs]").waitFor();
    await geometry(390);
    await capture("mobile-lineups-dark", 390);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "Switch to light theme", exact: true }).click();
    await page.setExtraHTTPHeaders({ "x-test-viewer": "anonymous" });
    const protectedPath = "/en/matches/10000000-0000-4000-8000-000000000002/live?section=lineups";
    const response = await page.request.get(origin + protectedPath, { headers: { "x-test-viewer": "anonymous" } });
    check(!(await response.text()).includes("Adrian Cole"), "unfinished availability is absent from public HTML and flight");
  } catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
  finally { page.off("pageerror", onError); page.off("console", onConsole); await page.unroute("**/api/account/session"); }
  return { checks: "390px, 320px, tablet, desktop, keyboard, legacy links, player details, both themes and access", failures, consoleErrors: [...new Set(errors)] };
}
