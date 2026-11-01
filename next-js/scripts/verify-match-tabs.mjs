/** Browser acceptance for the native match page using explicitly synthetic stored fixtures. */
export async function verifyMatchTabs(page, { origin = "http://127.0.0.1:3118", captureDirectory } = {}) {
  const failures = [], errors = [], checks = [], navigations = [];
  const onRequest = request => { if (request.resourceType() === "document" || new URL(request.url()).searchParams.has("_rsc")) navigations.push(request.url()); };
  const check = (value, label) => { checks.push(label); if (!value) failures.push(label); };
  const onError = error => errors.push(String(error));
  const onConsole = message => { if (message.type() === "error") errors.push(message.text()); };
  page.on("pageerror", onError); page.on("console", onConsole); page.on("request", onRequest);
  await page.addInitScript(() => {
    window.__matchTestNow = Date.parse("2026-10-09T09:00:00Z");
    Date.now = () => window.__matchTestNow;
    delete Navigator.prototype.serviceWorker;
  });
  await page.setExtraHTTPHeaders({ "x-test-viewer": "anonymous" });
  await page.route("**/api/account/session", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ phone: null, administrator: false, subscription: null }) }));
  const path = "/en/matches/10000000-0000-4000-8000-000000000005/finished-regulation";
  const tabs = ["stats", "markets", "lineups", "form", "analysis", "events", "standings", "players", "news", "venue", "referee", "history"];
  const nav = page.getByRole("tablist", { name: "Match information", exact: true });
  const panel = page.locator("#match-information-panel");
  async function select(id) {
    const button = page.locator(`[data-match-tab-navigation] [data-match-tab="${id}"]`);
    if (!await button.isVisible()) await page.locator("[data-match-tabs-more] summary").click();
    await button.click();
    await page.locator(`[data-active-match-tab="${id}"]`).waitFor();
  }
  async function choose(radio) {
    if (!await radio.isChecked()) await radio.click();
    await page.waitForFunction(element => element.checked, await radio.elementHandle());
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
    const hero = await page.locator("[data-verdict]").elementHandle();
    const navigationCount = navigations.length;
    const right = page.getByRole("button", { name: "Scroll tabs right", exact: true });
    await right.click();
    await page.waitForFunction(() => document.querySelector('[role="tablist"][aria-label="Match information"]').scrollLeft > 0);
    await page.waitForFunction(() => !document.querySelector('button[aria-label="Scroll tabs left"]').disabled);
    check(await page.getByRole("button", { name: "Scroll tabs left", exact: true }).isEnabled(), "mobile scroll arrows move the strip without selecting a tab");
    check(await page.locator('[data-active-match-tab="stats"]').count() === 1, "scroll arrows leave the content unchanged");
    check(await nav.locator("[data-tab-icon]").evaluateAll(elements => new Set(elements.map(element => getComputedStyle(element).color)).size > 3), "tab icons use a restrained range of colors");
    for (const id of tabs) {
      await select(id);
      check(await nav.getByRole("tab", { selected: true }).count() === 1 && await page.locator("[data-active-match-tab]").count() === 1, `${id}: only the selected content panel`);
      check(await panel.locator("#touchline-panel-title, [data-embedded-section] > h3").count() === 0, `${id}: tab title is not repeated`);
      check(await hero.evaluate(element => element.isConnected), `${id}: prediction shell stays mounted`);
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${id}: no page overflow`);
    }
    check(navigations.length === navigationCount, "tab changes do not navigate or refetch the server page");
    async function contentSwitch(id, label) {
      const before = await page.evaluate(() => {
        const bar = document.querySelector('[data-match-tab-navigation]').getBoundingClientRect();
        const panel = document.querySelector('#match-information-panel').getBoundingClientRect();
        const read = () => [document.querySelector('[data-match-tab-navigation]').getBoundingClientRect().top,
          scrollY + document.querySelector('[data-verdict]').getBoundingClientRect().top];
        window.__matchTabFrames = [read()]; window.__matchTabSampling = true;
        const sample = () => { if (!window.__matchTabSampling) return; window.__matchTabFrames.push(read()); requestAnimationFrame(sample); };
        requestAnimationFrame(sample);
        return { scroll: scrollY, deep: panel.top < bar.bottom - 1 };
      });
      await select(id);
      const result = await page.evaluate(async before => {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        window.__matchTabSampling = false;
        const panel = document.querySelector('#match-information-panel'), box = panel.getBoundingClientRect();
        const bar = document.querySelector('[data-match-tab-navigation]').getBoundingClientRect();
        return {
          stable: window.__matchTabFrames.every(frame => frame.every((position, index) => position === window.__matchTabFrames[0][index])),
          visible: before.deep ? Math.abs(box.top - bar.bottom) < 1 && scrollY < before.scroll
            && parseFloat(panel.style.getPropertyValue('--match-panel-min-size')) <= innerHeight : scrollY === before.scroll,
        };
      }, before);
      check(result.stable && result.visible, label);
    }
    for (const width of [320, 390, 1024, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await page.locator(`[data-match-design="${width < 1024 ? "phone" : "touchline"}"]`).waitFor();
      for (const depth of [0, 200, 650, "bottom"]) {
        for (const id of ["referee", "markets", "lineups", "history", "form"]) {
          await select(id === "lineups" ? "form" : "lineups");
          await page.evaluate(depth => window.scrollTo(0, depth === "bottom" ? document.documentElement.scrollHeight - innerHeight : depth), depth);
          await contentSwitch(id, `${width}/${depth}/${id}: new content starts below stable tabs and the prediction stays unchanged`);
          if (width < 1024) check(await nav.evaluate(element => {
            const selected = element.querySelector('[aria-selected="true"]'), box = selected.getBoundingClientRect(), strip = element.getBoundingClientRect();
            const desired = Math.max(0, Math.min(element.scrollWidth - element.clientWidth,
              element.scrollLeft + box.left + box.width / 2 - strip.left - strip.width / 2));
            return Math.abs(element.scrollLeft - desired) < 1;
          }), `${width}/${depth}/${id}: selected mobile tab is centered or clamped at the strip edge`);
        }
      }
      check(await panel.locator('[data-results-filters] fieldset').evaluateAll(groups => groups.every(group => {
        const labels = [...group.querySelectorAll('label')].map(label => label.getBoundingClientRect());
        return labels.every(label => Math.abs(label.top - labels[0].top) < 1);
      })), `${width}: radio options fit on one row per filter`);
      check(await panel.locator('[data-results-filters] > section').evaluateAll((groups, width) => {
        const boxes = groups.map(group => group.getBoundingClientRect());
        return width >= 1024 ? boxes.every(box => box.top === boxes[0].top)
          && groups.slice(1).every(group => getComputedStyle(group).borderInlineStartWidth === '1px')
          : boxes.every((box, index) => index === 0 || box.top >= boxes[index - 1].bottom);
      }, width), `${width}: labelled filter groups use divided desktop columns and stacked mobile rows`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-match-design="phone"]').waitFor();
    const rolloverHero = await page.locator("[data-verdict]").elementHandle();
    const rolloverResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/matches/10000000-0000-4000-8000-000000000005");
    await page.evaluate(() => { window.__matchTestNow += 86400000; document.dispatchEvent(new Event("visibilitychange")); });
    await rolloverResponse;
    check(await rolloverHero.evaluate(element => element.isConnected) && navigations.length === navigationCount, "day rollover refreshes observations without refreshing the page");
    await page.evaluate(() => { window.__matchTestNow = Date.parse("2026-10-09T09:00:00Z"); });
    await select("stats");
    const filters = panel.locator("[data-form-filters]");
    check(await filters.locator('legend').allTextContents().then(labels => labels.join(',') === 'Venue,Results window')
      && await filters.locator('input[type="radio"]').count() === 7 && await filters.locator('select').count() === 0, "mobile statistics use venue then match-sample radio groups");
    await choose(filters.getByRole('radio', { name: 'Away games', exact: true }));
    await choose(filters.getByRole('radio', { name: 'Last 10', exact: true }));
    check(new URL(page.url()).searchParams.get("venue") === "away" && new URL(page.url()).searchParams.get("window") === "10", "statistics filters persist in the URL");
    await page.reload({ waitUntil: "networkidle" });
    await page.locator('[data-match-design="phone"]').waitFor();
    check(await filters.getByRole('radio', { name: 'Away games', exact: true }).isChecked()
      && await filters.getByRole('radio', { name: 'Last 10', exact: true }).isChecked(), "statistics radio filters survive refresh");
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
    const marketRows = panel.locator("[data-detail-market]");
    const marketCount = await marketRows.count(), firstMarket = marketRows.first();
    const beforeY = await page.evaluate(() => scrollY);
    await firstMarket.click();
    check(await firstMarket.getAttribute("aria-expanded") === "true" && await panel.locator("[data-inline-market]").count() === 1, "market details expand beneath their row");
    check(await marketRows.count() === marketCount && await panel.locator('[data-inline-market] nav').count() === 0, "expanding a market keeps all rows and adds no page breadcrumbs");
    check(Math.abs(await page.evaluate(() => scrollY) - beforeY) < 2, "market expansion does not move the page");
    await capture("shared-tabs-markets-mobile");
    await firstMarket.click();
    check(await firstMarket.getAttribute("aria-expanded") === "false" && await panel.locator("[data-inline-market]").count() === 0, "market row collapses in place");
    await page.locator('[data-verdict] button').click();
    await panel.locator('[data-market-panel="both-teams-to-score"]').waitFor();
    check(await panel.getByRole("heading", { name: "Source and timing", exact: true }).count() === 1, "featured pick opens its full market details");
    await select("form");
    const results = panel.getByRole("group", { name: "Teams", exact: true });
    check(await results.getByRole("radio", { name: "Arsenal", exact: true }).isChecked(), "results default to the home club");
    check(await panel.locator('[data-results-filters] input[type="radio"]').count() === 10
      && await panel.locator('[data-results-filters] button').count() === 0, "result filters use compact native radio choices");
    await results.getByRole("radio", { name: "Arsenal", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => new URL(location.href).searchParams.get("team") === "away");
    check(await results.getByRole("radio", { name: "Liverpool", exact: true }).isChecked(), "native radio arrow keys update the selected team");
    await choose(results.getByRole("radio", { name: "Arsenal", exact: true }));
    check(await panel.locator("[data-results-filters] > section").evaluateAll(elements => elements.map(element => element.dataset.row).join(",")) === "teams,venues,matches", "three toggle rows are Teams, Venues, Matches");
    for (const name of ["Arsenal", "Liverpool", "Head-to-Head"]) {
      await choose(results.getByRole("radio", { name, exact: true }));
      const rows = panel.locator("[data-result-list] a");
      check(await rows.count() > 0, `${name}: selected results available`);
      check(await rows.first().evaluate(element => [...element.children].filter(child => !child.hidden).map(child => child.tagName === "TIME" ? "date" : child.dataset.resultSide ? child.dataset.resultSide + "Result" : child.dataset.team ?? "score").join(",")) === "date,homeResult,home,score,away,awayResult", `${name}: actual fixture order and two result markers`);
      check(await rows.evaluateAll(elements => elements.every(element => {
        const goals = [...element.querySelectorAll("[data-score] b")].map(node => Number(node.textContent));
        const home = goals[0] > goals[1] ? "W" : goals[0] < goals[1] ? "L" : "D";
        const away = home === "W" ? "L" : home === "L" ? "W" : "D";
        return element.querySelector('[data-result-side="home"]').textContent === home && element.querySelector('[data-result-side="away"]').textContent === away;
      })), `${name}: each club gets its own correct W/D/L marker`);
    }
    await choose(panel.getByRole("group", { name: "Matches", exact: true }).getByRole("radio", { name: "Last 20", exact: true }));
    check(new URL(page.url()).searchParams.get("window") === "20", "results match-sample toggle updates its URL");
    await capture("shared-tabs-results-mobile");
    await panel.locator("[data-result-list] a").first().click();
    await panel.locator("[data-item-panel]").waitFor();
    await panel.getByRole("button", { name: /Back to list/u }).click();
    check(await results.getByRole("radio", { name: "Head-to-Head", exact: true }).isChecked(), "record Back restores H2H filter");
    await select("lineups");
    const pitch = panel.locator("[data-touchline-pitch]");
    check(await pitch.locator("button[data-item-key]").count() === 22, "one full mobile pitch retains every starter");
    check(!(await panel.innerText()).includes("schematic player positions"), "pitch explanation removed");
    check(await pitch.evaluate(element => {
      const box = element.getBoundingClientRect(), mid = box.top + box.height / 2;
      return [...element.querySelectorAll("button[data-side]")].every(button => { const shirt = button.querySelector("[data-shirt]").getBoundingClientRect();
        return button.dataset.side === "home" ? shirt.top + shirt.height / 2 < mid : shirt.top + shirt.height / 2 > mid; });
    }), "home players occupy the upper half and away players the lower half");
    check(await pitch.evaluate(element => { const box = element.getBoundingClientRect(), column = element.parentElement;
      return column.querySelector('[data-pitch-teams] [data-side="home"]').getBoundingClientRect().bottom <= box.top + 1
        && column.querySelector('[data-pitch-teams] [data-side="away"]').getBoundingClientRect().top >= box.bottom - 1;
    }), "team names and formations match their ends of the pitch");
    const detail = panel.getByRole("group", { name: "Player detail", exact: true });
    check(await detail.getByRole('radio').count() === 5 && await panel.getByRole('combobox', {name:'Player detail',exact:true}).count() === 0, "lineup player details use five labelled radio choices");
    for (const field of ["position", "nationality", "age", "rating", "number"]) {
      await choose(detail.locator(`input[value="${field}"]`));
      check(await pitch.locator("button[data-item-key]").count() === 22, `${field}: complete pitch retained`);
      if (field !== "number") check(await pitch.locator("[data-phone-position]").count() === 22, `${field}: selected values on shirts`);
      const expected = { nationality: "ENG", age: "20", rating: "7.0" }[field];
      if (expected) check((await pitch.locator("[data-phone-position]").allTextContents()).includes(expected), `${field}: supplied sample value displayed`);
    }
    check(await panel.locator('[data-team-roster="home"]').count() === 1, "home team sheet is default");
    await panel.locator("[data-lineup-team-tabs]").getByRole("tab", { name: /Liverpool/u }).click();
    await panel.locator('[data-team-roster="away"]').waitFor();
    check(await panel.locator('[data-team-roster="away"]').count() === 1 && await pitch.locator("button").count() === 22, "team switching keeps both pitch halves");
    check((await panel.locator('[data-team-absences="away"]').innerText()).includes("Daniel Rey"), "team availability stays below the bench");
    await choose(detail.locator('input[value="nationality"]'));
    await pitch.locator('[data-profile="nationality"]').first().waitFor();
    check(await pitch.locator("[data-nationality-flag]").count() === 22, "nationality mode adds flags to the pitch");
    check(await panel.locator('[data-team-roster="away"] [data-lineup-players="starters"] [data-country-label] img').count() === 11
      && await panel.locator('[data-team-roster="away"] [data-lineup-players="substitutes"] [data-country-label] img').count() > 0
      && await panel.locator('[data-team-absences="away"] [data-country-label] img').count() === 1, "nationality flags accompany starters, substitutes and supplied injury profiles");
    await capture("shared-tabs-lineups-mobile");
    await nav.getByRole("tab", { selected: true }).press("End");
    await page.locator('[data-active-match-tab="history"]').waitFor();
    check(await nav.locator('[data-match-tab="history"]').evaluate(element => { const box = element.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth + 1; }), "keyboard selection scrolls the active tab into view");
    await page.goto(origin + path + "?panel=h2h&venue=away", { waitUntil: "networkidle" });
    check(await page.locator('[data-active-match-tab="form"]').count() === 1 && await results.getByRole("radio", { name: "Head-to-Head", exact: true }).isChecked(), "legacy H2H link opens the combined results tab");
    await page.setViewportSize({ width: 1024, height: 1000 });
    await page.locator('[data-match-design="touchline"]').waitFor();
    await page.locator("[data-match-tabs-more] summary").waitFor();
    check(await page.locator("[data-match-tabs-more]").count() === 1, "desktop overflow uses the shared More menu");
    await select("history");
    check(await page.locator('[data-active-match-tab="history"]').count() === 1, "desktop More items select their content");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await select('form');
    await capture('shared-tabs-results-desktop');
    await select('lineups');
    check(await detail.getByRole('radio').count() === 5, "desktop lineup player details also use radio choices");
    await choose(detail.locator('input[value="rating"]'));
    await pitch.locator('[data-profile="rating"]').first().waitFor();
    check(await detail.locator('input[value="rating"]').isChecked() && await pitch.locator('button[data-item-key]').count() === 22, "desktop radio selection preserves the complete pitch");
    await select("stats");
    check(await panel.getByRole('group', { name:'Venue', exact:true }).getByRole('button').count() === 3
      && await panel.getByRole('radio').count() === 0, "desktop statistics keep their existing controls");
    check(await nav.evaluate(element => element.scrollWidth <= element.clientWidth + 1), "desktop tabs fit as a normal row");
    check(await nav.locator('[data-match-tab]').evaluateAll(elements => elements.every(element => {
      const style = getComputedStyle(element); return parseFloat(style.fontSize) >= 13 && Number(style.fontWeight) >= 600;
    })), "desktop tab labels use readable size and stronger weight");
    await capture("shared-tabs-desktop");
    await page.getByRole("button", { name: "Switch to dark theme", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 }); await select("stats");
    await capture("shared-tabs-dark-mobile");
    await page.getByRole("button", { name: "Switch to light theme", exact: true }).click();
    await page.goto(origin + "/en/matches/10000000-0000-4000-8000-000000000001/scheduled", { waitUntil: "networkidle" });
    check(await page.getByRole("heading", { name: "Completed matches are public", exact: true }).count() === 1 && await page.locator("[data-detail-market]").count() === 0, "unfinished guest access stays restricted");
    check(errors.length === 0, "no browser errors");
    return { checks: checks.length, failures, errors };
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    return { checks: checks.length, failures, errors };
  } finally {
    await page.unroute("**/api/account/session"); page.off("pageerror", onError); page.off("console", onConsole); page.off("request", onRequest);
  }
}
