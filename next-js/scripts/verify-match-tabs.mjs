/** Browser acceptance for the native match page using explicitly synthetic stored fixtures. */
const matchPath = "/en/matches/10000000-0000-4000-8000-000000000005/finished-regulation";
const desktopTabs = ["details", "stats", "events", "lineups", "form", "standings", "players", "markets", "analysis", "news", "venue", "referee", "history"];

export async function verifyDesktopMatchWorkspace(page, { origin = "http://127.0.0.1:3118", captureDirectory } = {}) {
  const failures = [], checks = [];
  const check = (value, label) => { checks.push(label); if (!value) failures.push(label); };
  const workspace = page.locator("[data-match-workspace]");
  const sidebar = workspace.getByRole("navigation", { name: "Match sections", exact: true });
  const content = workspace.locator("[data-match-content]");
  const header = page.locator("[data-app-header]:visible");
  const progress = header.locator("[data-navigation-progress]");
  const switchTheme = mode => header.getByRole("button", { name: `Switch to ${mode} theme`, exact: true });
  const link = id => sidebar.locator(`[data-match-section="${id}"]`);
  async function select(id) {
    await link(id).click();
    await content.and(page.locator(`[data-active-match-tab="${id}"]`)).waitFor();
  }
  const positions = () => page.evaluate(() => {
    const side = document.querySelector("[data-match-sidebar]"), pane = document.querySelector("[data-match-content]");
    return { left: side.scrollTop, right: pane.scrollTop, page: window.scrollY,
      documentOverflow: document.documentElement.scrollHeight - innerHeight,
      paneTop: pane.getBoundingClientRect().top, paneBottom: pane.getBoundingClientRect().bottom,
      header: document.querySelector("[data-app-header]").getBoundingClientRect().bottom,
      progress: document.querySelector("[data-app-header] [data-navigation-progress]").getBoundingClientRect().top, viewport: innerHeight };
  });
  try {
    await page.setViewportSize({ width: 1024, height: 485 });
    await page.goto(origin + matchPath, { waitUntil: "domcontentloaded" });
    await page.locator('meta[name="goal-hint-appearance"]').waitFor({ state: "attached" });
    await workspace.waitFor();
    if (await switchTheme("light").isVisible()) await switchTheme("light").click();
    check(await sidebar.locator("[data-match-section]").evaluateAll(elements => elements.map(element => element.dataset.matchSection).join(",")) === desktopTabs.join(","), "desktop sidebar follows the approved section order");
    check(await content.getAttribute("data-active-match-tab") === "details" && await link("details").getAttribute("aria-current") === "page", "desktop opens Match Details by default");
    check(!await page.locator("[data-match-tab-navigation]").isVisible() && !await page.getByRole("link", { name: "Back", exact: true }).isVisible(), "desktop has no horizontal match tabs or Back row");
    check(await content.getByRole("heading", { name: "Top Predictions", exact: true }).count() === 1, "desktop default pane contains the predictions summary");
    check(await content.getByRole("heading", { name: "Match Details", exact: true }).count() === 0, "desktop default pane has no repeated section heading");
    check(await header.count() === 1 && await progress.count() === 1, "one production header and its shared progress bar");
    const stableNodes = await Promise.all([header, progress, sidebar, content, content.locator("footer")].map(locator => locator.elementHandle()));
    const colors = [];
    for (const mode of ["light", "dark"]) {
      if (mode === "dark") await switchTheme("dark").click();
      await page.waitForFunction(mode => getComputedStyle(document.documentElement).colorScheme === mode, mode);
      const overview = await content.getByRole("heading", { name: "Top Predictions", exact: true }).isVisible();
      check(overview, `${mode}: production theme control leaves the active pane in place`);
      colors.push(await sidebar.evaluate(element => getComputedStyle(element.parentElement).backgroundColor));
      if (captureDirectory) await page.screenshot({ path: `${captureDirectory}/match-workspace-${mode}.png` });
      await select("lineups");
      await content.locator("[data-touchline-pitch]").waitFor();
      check(await sidebar.locator('a[aria-current="page"]').count() === 1
        && await link("lineups").getAttribute("aria-current") === "page", `${mode}: exactly one current section link`);
      check(await content.getByRole("heading", { name: "Lineups", exact: true }).count() === 0
        && await content.getByRole("heading", { name: "Top Predictions", exact: true }).count() === 0, `${mode}: section title and overview are absent from the lineups pane`);
      check(await sidebar.evaluate(element => element.scrollHeight > element.clientHeight)
        && await content.evaluate(element => element.scrollHeight > element.clientHeight), `${mode}: both panes overflow with existing match content`);
      const before = await positions();
      check(Math.abs(before.paneTop - before.header) <= 1 && Math.abs(before.paneBottom - before.viewport) <= 1
        && before.documentOverflow === 0, `${mode}: the workspace fills the viewport below the header`);
      await sidebar.hover();
      await page.mouse.wheel(0, 180);
      await page.waitForFunction(left => document.querySelector("[data-match-sidebar]").scrollTop > left, before.left);
      const left = await positions();
      check(left.right === before.right && left.page === before.page && left.header === before.header && left.progress === before.progress,
        `${mode}: sidebar scrolling leaves content, document, header and progress stationary`);
      await content.hover({ position: { x: 10, y: 25 } });
      await page.mouse.wheel(0, 250);
      await page.waitForFunction(right => document.querySelector("[data-match-content]").scrollTop > right, left.right);
      const right = await positions();
      check(right.left === left.left && right.page === 0 && right.header === left.header && right.progress === left.progress,
        `${mode}: content scrolling leaves sidebar, document, header and progress stationary`);
      const sectionLabel = await link("events").locator("[data-sidebar-label]").textContent();
      await select("events");
      check((await positions()).right === 0 && new URL(page.url()).searchParams.get("panel") === "events"
        && await content.getByRole("heading", { name: sectionLabel, exact: true }).count() === 0, `${mode}: section navigation resets content scroll and keeps an addressable pane without a repeated heading`);
      await select("details");
    }
    check(colors[0] !== colors[1], "both themes apply distinct sidebar surfaces");
    check((await Promise.all(stableNodes.map(handle => handle.evaluate(element => element.isConnected)))).every(Boolean),
      "header, progress, both panes and production footer stay mounted through theme and section changes");
    const pickAction = content.getByRole("button", { name: /^(Why this pick\?|Original publication)$/u });
    const target = await pickAction.textContent() === "Original publication" ? "history" : "analysis";
    await pickAction.press("Enter");
    await content.and(page.locator(`[data-active-match-tab="${target}"]`)).waitFor();
    check(await content.evaluate(element => element.contains(document.activeElement)), "keyboard pick action moves focus into its destination pane");
    await page.goBack();
    await content.and(page.locator('[data-active-match-tab="details"]')).waitFor();
    await page.goForward();
    await content.and(page.locator(`[data-active-match-tab="${target}"]`)).waitFor();
    check(await link(target).getAttribute("aria-current") === "page", "browser Back and Forward restore the addressed desktop section");
    await page.goto(origin + matchPath + "?panel=history", { waitUntil: "domcontentloaded" });
    await content.and(page.locator('[data-active-match-tab="history"]')).waitFor();
    await page.waitForFunction(() => document.querySelector("[data-match-sidebar]").scrollTop > 0);
    check(await link("history").evaluate(element => {
      const item = element.getBoundingClientRect(), sidebar = element.closest("nav"), bounds = sidebar.getBoundingClientRect();
      return element.getAttribute("aria-current") === "page" && sidebar.scrollTop > 0 && item.bottom <= bounds.bottom + 1;
    }), "direct desktop Pick History links reveal the selected item in the sidebar");
    const summaryLink = content.getByRole("link", { name: "Back to current match summary", exact: true });
    if (await summaryLink.count()) {
      await summaryLink.click();
      await content.and(page.locator('[data-active-match-tab="details"]')).waitFor();
      await page.goBack();
      await content.and(page.locator('[data-active-match-tab="history"]')).waitFor();
      check(await link("history").getAttribute("aria-current") === "page", "History’s summary link opens Details and browser Back restores History");
    }
    await switchTheme("light").click();
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
  return { checks: checks.length, failures };
}

export async function verifyMatchTabs(page, { origin = "http://127.0.0.1:3118", captureDirectory } = {}) {
  const failures = [], errors = [], checks = [], navigations = [];
  let desktopChecks = 0;
  const onRequest = request => {
    const url = new URL(request.url());
    if (url.pathname === matchPath && (request.resourceType() === "document" || url.searchParams.has("_rsc"))) navigations.push(request.url());
  };
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
  const path = matchPath;
  const tabs = ["stats", "markets", "lineups", "form", "analysis", "events", "standings", "players", "news", "venue", "referee", "history"];
  const nav = page.getByRole("tablist", { name: "Match information", exact: true });
  const panel = page.locator("#match-information-panel:visible, [data-match-content]:visible");
  async function select(id) {
    await page.locator(`[data-match-tab="${id}"]:visible, [data-match-section="${id}"]:visible`).click();
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
    const article = await page.locator("[data-match-detail]:visible").boundingBox();
    await page.screenshot({ path: `${captureDirectory}/${name}.png`, clip: { x: 0, y: 0, width: viewport.width,
      height: Math.ceil(Math.min(article.y + article.height, 3000)) } });
    await page.setViewportSize(viewport);
  }
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin + path, { waitUntil: "networkidle" });
    await page.locator('[data-match-design="phone"]').waitFor();
    await nav.locator('[data-match-tab="history"]').waitFor({ state: "attached" });
    check(await nav.locator("[data-match-tab]").evaluateAll(elements => elements.map(element => element.dataset.matchTab).join(",")) === tabs.join(","), "prioritized shared tab order");
    check(await nav.evaluate(element => element.scrollWidth > element.clientWidth), "mobile navigation scrolls horizontally");
    check(await page.locator('[data-active-match-tab="stats"]').count() === 1, "Team Stats is the initial tab");
    const hero = await page.locator("[data-verdict]:visible").elementHandle();
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
            && parseFloat(panel.style.minBlockSize) <= innerHeight : scrollY === before.scroll,
        };
      }, before);
      check(result.stable && result.visible, label);
    }
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.locator('[data-match-design="phone"]').waitFor();
      for (const depth of [0, 200, 650, "bottom"]) {
        for (const id of ["referee", "markets", "lineups", "history", "form"]) {
          await select(id === "lineups" ? "form" : "lineups");
          await page.evaluate(depth => window.scrollTo(0, depth === "bottom" ? document.documentElement.scrollHeight - innerHeight : depth), depth);
          await contentSwitch(id, `${width}/${depth}/${id}: new content starts below stable tabs and the prediction stays unchanged`);
          check(await nav.evaluate(element => {
            const selected = element.querySelector('[aria-selected="true"]'), box = selected.getBoundingClientRect(), strip = element.getBoundingClientRect();
            const desired = Math.max(0, Math.min(element.scrollWidth - element.clientWidth,
              element.scrollLeft + box.left + box.width / 2 - strip.left - strip.width / 2));
            return Math.abs(element.scrollLeft - desired) < 1;
          }), `${width}/${depth}/${id}: selected mobile tab is centered or clamped at the strip edge`);
        }
      }
      check(await panel.locator('[data-results-filters] fieldset').evaluateAll(groups => groups.every(group => {
        const labels = [...group.querySelectorAll('label')].map(label => label.getBoundingClientRect());
        return labels.every((label, index) => labels.slice(index + 1).every(other =>
          Math.min(label.right, other.right) - Math.max(label.left, other.left) <= 1
          || Math.min(label.bottom, other.bottom) - Math.max(label.top, other.top) <= 1));
      })), `${width}: all filter radio choices stay distinct and readable`);
      check(await panel.locator('[data-results-filters] > section').evaluateAll(groups => {
        const boxes = groups.map(group => group.getBoundingClientRect());
        return boxes.every((box, index) => index === 0 || box.top >= boxes[index - 1].bottom);
      }), `${width}: labelled filter groups use stacked mobile rows`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-match-design="phone"]').waitFor();
    const rolloverHero = await page.locator("[data-verdict]:visible").elementHandle();
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
    await page.locator('[data-match-design="phone"]').waitFor();
    const marketRows = panel.locator("[data-detail-market]");
    const marketCount = await marketRows.count(), firstMarket = marketRows.first();
    const inlineMarket = panel.locator("[data-inline-market]");
    const beforeY = await page.evaluate(() => scrollY);
    await firstMarket.click();
    await inlineMarket.waitFor();
    check(await firstMarket.getAttribute("aria-expanded") === "true" && await inlineMarket.count() === 1, "market details expand beneath their row");
    check(await marketRows.count() === marketCount && await panel.locator('[data-inline-market] nav').count() === 0, "expanding a market keeps all rows and adds no page breadcrumbs");
    check(Math.abs(await page.evaluate(() => scrollY) - beforeY) < 2, "market expansion does not move the page");
    await capture("shared-tabs-markets-mobile");
    await firstMarket.click();
    await inlineMarket.waitFor({ state: "detached" });
    check(await firstMarket.getAttribute("aria-expanded") === "false", "market row collapses in place");
    const verdict = page.locator("[data-verdict]:visible");
    const featuredMarket = await verdict.getAttribute("data-verdict");
    const featuredAction = verdict.locator("button");
    const actionText = (await featuredAction.textContent()).trim();
    await featuredAction.click();
    if (actionText === "Original publication" || actionText === "Why this pick?") {
      const active = actionText === "Original publication" ? "history" : "analysis";
      await panel.and(page.locator(`[data-active-match-tab="${active}"]`)).waitFor();
      check(new URL(page.url()).searchParams.get("panel") === active, "retrospective featured action opens its source section");
    } else {
      await page.waitForFunction(family => {
        const parameters = new URL(location.href).searchParams;
        return parameters.get("market") === family || parameters.get("mcat") === "goals";
      }, featuredMarket);
      if (new URL(page.url()).searchParams.get("market") === featuredMarket) {
        await panel.locator(`[data-market-panel="${featuredMarket}"]`).waitFor();
        check(await panel.getByRole("heading", { name: "Source and timing", exact: true }).count() === 1, "featured pick opens its full market details");
      } else {
        check(await panel.locator("[data-retrospective-market], [data-detail-market]").count() > 0, "exact featured pick opens its filtered market group");
      }
    }
    await select("form");
    const results = panel.getByRole("group", { name: "Teams", exact: true });
    check(await results.getByRole("radio", { name: "Both teams", exact: true }).isChecked(), "results default to both clubs");
    const samples = panel.getByRole('group', { name:'Matches', exact:true });
    check(await samples.getByRole('radio', {name:'Last 10',exact:true}).isChecked(), "combined form defaults to the latest ten fixtures in total");
    check(await panel.locator('[data-results-filters] input[type="radio"]').count() === 11
      && await panel.locator('[data-results-filters] button').count() === 0, "result filters use compact native radio choices");
    const formResponse = await page.request.get(`${origin}/api/matches/10000000-0000-4000-8000-000000000005/insights?section=form`);
    const source = (await formResponse.json()).data;
    const combined = (venue, window = 0) => {
      const eligible = (records, team) => records.filter(record => venue === 'all' || record[venue].id === team);
      const unique = [...new Map([...eligible(source.home, 'ars'), ...eligible(source.away, 'liv')].map(record => [record.fixtureId, record])).values()]
        .sort((a,b) => b.kickoffAt - a.kickoffAt || a.fixtureId.localeCompare(b.fixtureId));
      return window > 0 ? unique.slice(0, window) : unique;
    };
    const rowIds = () => panel.locator('[data-result-list] a').evaluateAll(rows => rows.map(row => row.dataset.itemKey));
    check(JSON.stringify(await rowIds()) === JSON.stringify(combined('all', 10).map(record => record.fixtureId)), "both clubs share one deduplicated list in true newest-first order");
    check(await panel.locator('[data-result-list] time').evaluateAll(dates => dates.every(date => /-\d{4}$/u.test(date.textContent)
      && date.scrollWidth <= date.clientWidth)), "fixture years stay fully visible in compact result dates");
    await capture('shared-tabs-both-teams-mobile');
    const venues = panel.getByRole('group', {name:'Venues',exact:true});
    for (const [venue, label] of [['home','Home games'],['away','Away games']]) {
      await choose(venues.getByRole('radio', {name:label,exact:true}));
      check(JSON.stringify(await rowIds()) === JSON.stringify(combined(venue, 10).map(record => record.fixtureId)), `${venue}: venue choice is applied to each club before merging`);
    }
    await choose(venues.getByRole('radio', {name:'All venues',exact:true}));
    await choose(samples.getByRole('radio', {name:'Last 5',exact:true}));
    check((await rowIds()).length === 5, "Last 5 limits the combined list rather than each team");
    await choose(samples.getByRole('radio', {name:'All stored',exact:true}));
    await panel.getByRole('button', {name:'Page 2',exact:true}).click();
    await page.waitForFunction(() => new URL(location.href).searchParams.get('page') === '2');
    const secondPage = combined('all').slice(10, 20).map(record => record.fixtureId);
    await panel.locator(`[data-result-list] a[data-item-key="${secondPage[0]}"]`).waitFor();
    check(JSON.stringify(await rowIds()) === JSON.stringify(secondPage), "shared fixture appears only once across combined pagination");
    await page.reload({waitUntil:'networkidle'});
    await page.locator('[data-match-design="phone"]').waitFor();
    check(await results.getByRole('radio', {name:'Both teams',exact:true}).isChecked()
      && await samples.getByRole('radio', {name:'All stored',exact:true}).isChecked()
      && JSON.stringify(await rowIds()) === JSON.stringify(secondPage), "combined team, sample and page survive refresh");
    await choose(samples.getByRole('radio', {name:'Last 10',exact:true}));
    await results.getByRole("radio", { name: "Arsenal", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => new URL(location.href).searchParams.get("team") === "away");
    await page.waitForFunction(element => element.checked, await results.getByRole("radio", { name: "Liverpool", exact: true }).elementHandle());
    check(await results.getByRole("radio", { name: "Liverpool", exact: true }).isChecked(), "native radio arrow keys update the selected team");
    await choose(results.getByRole("radio", { name: "Arsenal", exact: true }));
    check(await panel.locator("[data-results-filters] > section").evaluateAll(elements => elements.map(element => element.dataset.row).join(",")) === "teams,venues,matches", "three toggle rows are Teams, Venues, Matches");
    for (const name of ["Both teams", "Arsenal", "Liverpool", "Head-to-Head"]) {
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
    await page.locator("[data-match-workspace]").waitFor();
    await select("history");
    check(await page.locator('[data-active-match-tab="history"]').count() === 1, "desktop sidebar items select their content");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await select('form');
    check(await panel.locator('[data-results-filters] > section').evaluateAll(groups => {
      const boxes = groups.map(group => group.getBoundingClientRect());
      return boxes.length === 3 && boxes.every((box, index) => box.top === boxes[0].top && (index === 0 || box.left >= boxes[index - 1].right));
    }), "desktop result filter groups keep distinct columns on the same row");
    await capture('shared-tabs-results-desktop');
    await select('lineups');
    check(await detail.getByRole('radio').count() === 5, "desktop lineup player details also use radio choices");
    await choose(detail.locator('input[value="rating"]'));
    await pitch.locator('[data-profile="rating"]').first().waitFor();
    check(await detail.locator('input[value="rating"]').isChecked() && await pitch.locator('button[data-item-key]').count() === 22, "desktop radio selection preserves the complete pitch");
    await select("stats");
    check(await panel.getByRole('group', { name:'Venue', exact:true }).getByRole('button').count() === 3
      && await panel.getByRole('radio').count() === 0, "desktop statistics keep their existing controls");
    await capture("shared-tabs-desktop");
    const desktop = await verifyDesktopMatchWorkspace(page, { origin, captureDirectory });
    desktopChecks = desktop.checks;
    failures.push(...desktop.failures);
    await page.setViewportSize({ width: 390, height: 844 });
    await select("stats");
    await page.getByRole("button", { name: "Switch to dark theme", exact: true }).click();
    await capture("shared-tabs-dark-mobile");
    await page.getByRole("button", { name: "Switch to light theme", exact: true }).click();
    await page.goto(origin + "/en/matches/10000000-0000-4000-8000-000000000001/scheduled", { waitUntil: "networkidle" });
    const access = page.getByRole("link", { name: "Unlock predictions", exact: true }).first();
    await access.waitFor();
    check(await access.isVisible()
      && await page.locator("[data-detail-market]:visible").count() === 0, "unfinished guest access stays restricted");
    check(errors.length === 0, "no browser errors");
    return { checks: checks.length + desktopChecks, failures, errors };
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    return { checks: checks.length + desktopChecks, failures, errors };
  } finally {
    await page.unroute("**/api/account/session"); page.off("pageerror", onError); page.off("console", onConsole); page.off("request", onRequest);
  }
}
