/** Native browser acceptance against explicitly synthetic stored competition data. */
export async function verifyCompetitionView(page, { origin = "http://127.0.0.1:3127", captureDirectory } = {}) {
  const checks = [], failures = [], errors = [], navigations = [];
  const check = (ok, name) => { checks.push(name); if (!ok) failures.push(name); };
  const onError = error => errors.push(String(error));
  const onRequest = request => { if (request.resourceType() === "document" || new URL(request.url()).searchParams.has("_rsc")) navigations.push(request.url()); };
  page.on("pageerror", onError); page.on("request", onRequest);
  await page.addInitScript(() => { Date.now = () => Date.parse("2026-10-09T09:00:00Z"); delete Navigator.prototype.serviceWorker; });
  await page.route("**/api/account/session", route => route.fulfill({ json: { phone:null, administrator:false, subscription:null } }));
  const panel = page.locator("#match-information-panel"), table = panel.locator("[data-competition-table]");
  const canvas = panel.locator("[data-knockout-canvas]"), round = panel.getByRole("combobox", { name:"Round", exact:true });
  const path = (id, slug) => `${origin}/en/matches/10000000-0000-4000-8000-${String(id).padStart(12,"0")}/${slug}?panel=standings&section=context`;
  async function choose(name) {
    const radio = panel.getByRole("radio", {name,exact:true});
    if (!await radio.isChecked()) await radio.click();
    await page.waitForFunction(element=>element.checked,await radio.elementHandle());
    if (name === "Summary" || name === "Detailed") await page.waitForFunction(columns=>
      document.querySelector('[data-competition-table]')?.getAttribute('data-columns') === columns,name === "Detailed" ? "detailed" : "summary");
  }
  async function capture(name) { if (captureDirectory) await page.screenshot({path:`${captureDirectory}/${name}.png`,fullPage:true}); }
  async function settle() { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
  try {
    await page.emulateMedia({reducedMotion:"reduce"});
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(path(5,"finished-regulation"), {waitUntil:"networkidle"});
    await table.waitFor();
    check(await table.locator("tbody tr").count() === 20, "full supplied table contains all twenty clubs");
    check((await table.locator("thead th").allTextContents()).join(",") === "#,Team,P,GD,PT,Form", "compact table uses abbreviated columns and no Group column");
    check(await table.locator('tr[data-side="home"] [data-points]').innerText() === "23"
      && await table.locator('tr[data-side="away"] [data-points]').innerText() === "21", "source points and both fixture club highlights");
    check(await panel.locator("h2").count() === 0 && !await panel.getByRole("combobox",{name:"Group",exact:true}).count(), "single league repeats neither title nor group control");
    await choose("Detailed");
    check((await table.locator("thead th").allTextContents()).join(",") === "#,Team,P,W,D,L,GF,GA,GD,PT,Form", "detailed view shows every supplied statistic in one row");
    check(new URL(page.url()).searchParams.get("tab") === "table-detail", "column preference is stored in the URL");
    await page.reload({waitUntil:"networkidle"}); await table.waitFor();
    check(await table.getAttribute("data-columns") === "detailed", "detailed table survives reload");
    const innerNavigations = navigations.length;
    for (const width of [320,390,768,1024,1440]) {
      await page.setViewportSize({width,height:844});
      await page.locator(`[data-match-design="${width < 1024 ? "phone" : "touchline"}"]`).waitFor();
      const stableHero = await page.locator("[data-verdict]").elementHandle();
      await choose("Summary"); await settle();
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: summary has no page overflow`);
      check(await table.locator("tbody tr").evaluateAll(rows => rows.every(row => row.getBoundingClientRect().height <= 44)), `${width}: every club stays on one compact row`);
      check(await table.locator("[data-team-cell][title]").count() === 20, `${width}: full club names remain accessible`);
      await choose("Detailed"); await settle();
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: detailed table has no page overflow`);
      const sticky = await panel.locator("[data-standings-scroll]").evaluate(frame => {
        frame.scrollLeft=0; const team=frame.querySelector("tbody [data-team-cell]"),rank=frame.querySelector("tbody [data-rank]");
        const before=[team.getBoundingClientRect().left,rank.getBoundingClientRect().left]; frame.scrollLeft=120;
        return {overflow:frame.scrollWidth>frame.clientWidth,left:frame.scrollLeft,stable:before[0]===team.getBoundingClientRect().left && before[1]===rank.getBoundingClientRect().left};
      });
      check(sticky.stable && (width >= 768 || sticky.overflow && sticky.left > 0), `${width}: rank and team remain pinned while detailed statistics scroll`);
      check(await stableHero.evaluate(element=>element.isConnected), `${width}: table controls keep the page shell mounted`);
      if (width === 390) { await choose("Summary"); await capture("standings-summary-mobile"); await choose("Detailed"); await capture("standings-detailed-mobile"); }
    }
    check(navigations.length === innerNavigations, "table controls do not navigate or refetch the server page");
    await choose("Summary");
    check(await table.locator('[data-form-result]').evaluateAll(dots => new Set(dots.map(dot=>getComputedStyle(dot).backgroundColor)).size) === 3, "form uses distinct green, red and gray outcomes");
    const form = table.locator('tr[data-side="home"] [data-standing-form]');
    await form.click();
    const dialog = page.getByRole("dialog"); await dialog.waitFor();
    check(await dialog.locator("li").count() === 5 && /2026/u.test(await dialog.innerText()), "tap or click opens five sourced result details");
    await dialog.getByRole("button",{name:"Close",exact:true}).last().click();
    check(await form.evaluate(element => document.activeElement === element), "form dialog restores keyboard focus");
    await page.setViewportSize({width:1440,height:1000}); await choose("Detailed"); await capture("standings-detailed-desktop");
    await page.goto(path(7,"knockout"), {waitUntil:"networkidle"}); await canvas.waitFor();
    check(await panel.locator("[data-knockout-tie]").count() === 15 && await panel.locator("[data-bracket-edge]").count() === 14, "all supplied ties and advancement links form the complete tree");
    check(await round.inputValue() === "quarter-finals" && await panel.locator('[data-knockout-tie][data-current]').count() === 1, "bracket opens at the current match and round");
    await panel.locator('[data-bracket-controls]').scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => scrollY), count = navigations.length;
    await panel.getByRole("button",{name:"Next round",exact:true}).click();
    check(await round.inputValue() === "semi-finals", "next round navigation");
    await panel.getByRole("button",{name:"Previous round",exact:true}).click();
    check(await round.inputValue() === "quarter-finals", "previous round navigation");
    await round.selectOption("final"); await settle();
    check(await round.inputValue() === "final" && await panel.getByRole("button",{name:"Next round",exact:true}).isDisabled(), "round selector and last-round boundary");
    await canvas.evaluate(element=>element.focus({preventScroll:true})); await canvas.press("Home");
    check(await round.inputValue() === "round-of-16", "keyboard Home reaches opening round");
    await canvas.press("End"); check(await round.inputValue() === "final", "keyboard End reaches final");
    await panel.getByRole("button",{name:"Current match",exact:true}).click(); await settle();
    const current = panel.locator('[data-knockout-tie][data-current]');
    check(await current.evaluate(element => {const b=element.getBoundingClientRect(),c=element.closest('[data-knockout-canvas]').getBoundingClientRect(); return b.left>=c.left && b.right<=c.right && b.top>=c.top && b.bottom<=c.bottom;}), "current match is brought inside the canvas in both directions");
    check(await page.evaluate(() => scrollY) === before && navigations.length === count, "round changes leave the outer page position and navigation unchanged");
    await current.click(); await dialog.waitFor();
    check(/Penalties: 5–4/u.test(await dialog.innerText()), "shootout remains distinct from the two-all match score");
    await dialog.getByRole("button",{name:"Close",exact:true}).last().click();
    await round.selectOption("quarter-finals");
    const aggregate = panel.locator('[data-knockout-tie="qf-3"]');
    await aggregate.click(); await dialog.waitFor();
    check(/Aggregate: 3–2/u.test(await dialog.innerText()) && await dialog.locator("section").count() === 2, "two-leg tie details show aggregate and each fixture in actual home-away order");
    await dialog.getByRole("button",{name:"Close",exact:true}).last().click();
    await capture("knockout-desktop");
    for (const width of [320,390,768,1024,1440]) {
      await page.setViewportSize({width,height:844}); await canvas.waitFor();
      await round.selectOption("final"); await settle();
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: bracket stays inside the page`);
      check(await panel.locator('[data-knockout-tie="final"]').innerText().then(text=>text.includes("To be decided")), `${width}: unknown finalists remain TBD`);
      await panel.getByRole("button",{name:"Current match",exact:true}).click(); await settle();
      check(await current.evaluate(element=>Math.round(element.getBoundingClientRect().width)===224), `${width}: bracket cards retain readable proportions`);
      if(width===390) await capture("knockout-mobile");
    }
    await page.setViewportSize({width:390,height:844}); await round.selectOption("round-of-16"); await settle();
    await canvas.evaluate(element => { element.dispatchEvent(new WheelEvent("wheel",{bubbles:true})); element.scrollLeft=520; }); await settle();
    check(await round.inputValue() !== "round-of-16", "native horizontal scrolling updates the visible round control");
    await page.setViewportSize({width:1024,height:844}); await round.selectOption("final"); await settle();
    const box=await canvas.boundingBox(), left=await canvas.evaluate(element=>element.scrollLeft);
    await page.mouse.move(box.x+20,box.y+18); await page.mouse.down(); await page.mouse.move(box.x+140,box.y+18,{steps:5}); await page.mouse.up(); await settle();
    check(await canvas.evaluate(element=>element.scrollLeft) < left, "desktop dragging pans the draw");
    await page.goto(path(8,"group-stage"),{waitUntil:"networkidle"}); await table.waitFor();
    check(await panel.getByRole("radio",{name:"Table",exact:true}).isChecked() && await panel.getByRole("radio",{name:"Bracket",exact:true}).count() === 1, "mixed competition exposes table and knockout modes");
    const group=panel.getByRole("combobox",{name:"Group",exact:true});
    check(await group.locator("option").count() === 4 && await table.locator("tbody tr").count() === 4, "grouped competition shows the entire selected group");
    const other=(await group.locator("option").all()).at(-1), groupId=await other.getAttribute("value");
    await group.selectOption(groupId);
    check(new URL(page.url()).searchParams.get("item") === groupId, "group choice is stored in URL");
    await page.reload({waitUntil:"networkidle"}); await table.waitFor();
    check(await group.inputValue() === groupId, "selected group survives reload");
    await choose("Bracket"); await canvas.waitFor();
    check(await panel.locator('[data-knockout-tie] [data-winner]').count() === 0, "scheduled knockout rounds do not invent winners");
    await page.goto(path(9,"partial-bracket"),{waitUntil:"networkidle"}); await canvas.waitFor();
    check((await panel.innerText()).includes("Partial bracket"), "partial bracket coverage is explicit");
    await page.getByRole("button",{name:"Switch to dark theme",exact:true}).click(); await capture("knockout-dark");
    await page.getByRole("button",{name:"Switch to light theme",exact:true}).click();
    check(errors.length === 0, "no runtime browser errors");
  } catch(error) { failures.push(error instanceof Error ? error.message : String(error)); }
  finally { await page.unroute("**/api/account/session"); page.off("pageerror",onError); page.off("request",onRequest); }
  return {checks:checks.length,failures,errors};
}
