const settled = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

/** Inspect production screens, retaining intentional scrolling tables, lists and tab strips. */
export async function inspectAppLayout(page, scope = "body") {
  return page.locator(scope).evaluate(root => {
    const failures = [], rows = new Map();
    const embedded = '[data-field-trailing], [data-field-action], [data-slip-number-stepper], [data-truncation], [data-slip-header-action], [data-phone-share-action]';
    const describe = element => element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 60) || element.id || element.tagName;
    let controls = 0, comparisons = 0;
    for (const element of root.querySelectorAll('button, a, summary, select, input:not([type="hidden"], [type="checkbox"], [type="radio"], [type="range"])')) {
      if (!element.checkVisibility({ visibilityProperty: true, opacityProperty: true }) || element.closest('[aria-hidden="true"], [data-fixture-controls]')) continue;
      const style = getComputedStyle(element);
      if (style.clipPath === "inset(50%)") continue; // Screen-reader/skip links are checked when focused.
      if (element.tagName === "A" && style.display === "inline") continue;
      const body = element.closest("[data-feed-search]") || element;
      const rect = body.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) continue;
      controls++;
      let left = rect.left, right = rect.right, top = rect.top, bottom = rect.bottom;
      let positioned = ["absolute", "fixed"].includes(style.position);
      for (let parent = element.parentElement; parent && parent !== root.parentElement; parent = parent.parentElement) {
        const frame = parent.getBoundingClientRect(), paint = getComputedStyle(parent);
        const clipX = ["auto", "scroll", "hidden", "clip"].includes(paint.overflowX);
        const clipY = ["auto", "scroll", "hidden", "clip"].includes(paint.overflowY);
        const clippedX = left < frame.left - 1 || right > frame.right + 1;
        const clippedY = top < frame.top - 1 || bottom > frame.bottom + 1;
        if (clipX) { left = Math.max(left, frame.left); right = Math.min(right, frame.right); }
        if (clipY) { top = Math.max(top, frame.top); bottom = Math.min(bottom, frame.bottom); }
        if (right > left && bottom > top && ((["hidden", "clip"].includes(paint.overflowX) && clippedX)
          || (["hidden", "clip"].includes(paint.overflowY) && clippedY))) {
          failures.push({ kind: "clipped control", name: describe(element), rect: rect.toJSON() });
        }
        positioned ||= ["absolute", "fixed"].includes(paint.position);
        if (parent.tagName === "HEADER" && !element.closest('[role="listbox"], [role="menu"]') && !positioned
          && (rect.top < frame.top - 1 || rect.bottom > frame.bottom + 1)) {
          failures.push({ kind: "header overflow", name: describe(element), rect: rect.toJSON(), frame: frame.toJSON() });
        }
      }
      if (right > left && bottom > top && (left < -1 || right > document.documentElement.clientWidth + 1)) {
        failures.push({ kind: "viewport overflow", name: describe(element), left, right });
      }
      if (element.closest(embedded) || (element.tagName === "BUTTON" && element.closest("[data-floating-control], [data-feed-search]"))) continue;
      if (element.matches("[data-match-analysis-link], [data-row-analysis]")) continue; // Covering links take the match row's geometry.
      const standard = Number.parseFloat(style.getPropertyValue("--form-control-height"));
      const expected = style.getPropertyValue("--header-control-height") ? standard
        - 2 * Number.parseFloat(style.getPropertyValue("--gh-headerControl-blockInset")) : standard;
      if (rect.height < expected - 1) failures.push({ kind: "short control", name: describe(element), height: rect.height, expected });
      if (element.closest("[data-record-list-scroll]") || element.querySelector("img, small, dl") || element.title === "Filter by this value") continue;
      if (!["INPUT", "SELECT"].includes(element.tagName) && (element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1)) {
        failures.push({ kind: "control content overflow", name: describe(element), rect: rect.toJSON() });
      }
      if (rect.height > expected * 1.5) continue; // Content cards and multiline disclosures retain their own height.
      for (let parent = element.parentElement; parent && parent !== root; parent = parent.parentElement) {
        const layout = getComputedStyle(parent);
        if ((layout.display.includes("flex") && layout.flexDirection === "row")
          || (layout.display.includes("grid") && layout.gridTemplateColumns.split(" ").length > 1)) {
          if (!rows.has(parent)) rows.set(parent, []);
          rows.get(parent).push({ name: describe(element), rect: rect.toJSON() });
          break;
        }
      }
    }
    for (const items of rows.values()) for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) {
      const first = items[a].rect, second = items[b].rect;
      const overlap = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
      if (overlap > Math.min(first.height, second.height) * .7) {
        comparisons++;
        if (Math.abs(first.height - second.height) > 1 || Math.abs(first.top - second.top) > 1) {
          failures.push({ kind: "unequal row controls", first: items[a], second: items[b] });
        }
      }
    }
    return { controls, comparisons, failures };
  });
}

async function contained(locator, label, viewport = false) {
  const result = await locator.evaluate((element, viewport) => {
    const rect = element.getBoundingClientRect();
    const parent = viewport ? { left: 0, top: 0, right: document.documentElement.clientWidth, bottom: document.documentElement.clientHeight }
      : element.closest("dialog").getBoundingClientRect().toJSON();
    return { rect: rect.toJSON(), parent };
  }, viewport);
  const { rect, parent } = result;
  if (rect.left < parent.left + 1 || rect.right > parent.right - 1 || rect.top < parent.top + 1 || rect.bottom > parent.bottom - 1) {
    throw new Error(`${label}: component crosses its frame ${JSON.stringify(result)}`);
  }
}

async function uniform(locator, label) {
  const result = await locator.evaluateAll(elements => elements.filter(element => element.checkVisibility({ visibilityProperty: true, opacityProperty: true }))
    .map(element => ({ name: element.getAttribute("aria-label") || element.textContent?.trim(), rect: element.getBoundingClientRect().toJSON(),
      expected: Number.parseFloat(getComputedStyle(element).getPropertyValue("--form-control-height")),
      clipped: element.tagName !== "INPUT" && element.tagName !== "SELECT"
        && (element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1) })));
  for (const control of result) {
    if (Math.abs(control.rect.height - control.expected) > 1 || control.clipped) {
      throw new Error(`${label}: control height or content overflow ${JSON.stringify(control)}`);
    }
    for (const peer of result) {
      const overlap = Math.min(control.rect.bottom, peer.rect.bottom) - Math.max(control.rect.top, peer.rect.top);
      if (overlap > control.expected / 2 && Math.abs(control.rect.top - peer.rect.top) > 1) {
        throw new Error(`${label}: row controls have different top edges ${JSON.stringify(result)}`);
      }
    }
  }
  return result.length;
}

/** Run once in each fine/coarse pointer context; every frame is measured after layout settles. */
export async function verifyLayoutBounds(page, origin, widths = [320, 390, 768, 1024, 1440, 1920]) {
  const checks = [];
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of widths) for (const height of [360, 900]) {
    await page.setViewportSize({ width, height });
    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.locator('[data-layout-bounds-fixture][data-ready="true"]').waitFor();
    await page.evaluate(() => document.fonts.ready);
    for (const mode of ["light", "dark"]) {
      if (mode === "dark") await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
      for (const validation of [false, true]) {
        if (validation) await page.getByRole("button", { name: "Toggle validation", exact: true }).click();
        for (const row of await page.locator("[data-layout-row]").all()) {
          const name = await row.getAttribute("data-layout-row");
          await uniform(row.locator("input, select, button, a"), `${mode}/${width}/${height}/${name}`);
          checks.push({ mode, width, height, validation, name });
        }
      }
      await page.getByRole("button", { name: "Toggle validation", exact: true }).click();
      for (const name of ["start", "end", "bottom"]) {
        const trigger = page.locator(`[data-layout-select="${name}"]`);
        await trigger.click();
        await settled(page);
        await contained(page.getByRole("listbox"), `${name} select`, true);
        await page.keyboard.press("End");
        await page.keyboard.press("Enter");
        if (await trigger.getAttribute("aria-expanded") !== "false") throw new Error(`${name}: keyboard selection did not close the menu`);
        checks.push({ mode, width, height, name: `${name} select` });
      }
      const choices = page.locator('summary[aria-label^="Bottom choices:"]');
      await uniform(choices, `${mode}/${width}/${height}/multiple-choice summary`);
      await choices.click();
      await settled(page);
      const panel = page.locator("details[open] > fieldset");
      await contained(panel, "bottom choices", true);
      await page.setViewportSize({ width: width + 16, height });
      await settled(page);
      await contained(panel, "resized bottom choices", true);
      await page.setViewportSize({ width, height });
      await page.keyboard.press("Escape");
      checks.push({ mode, width, height, name: "choice picker and resize" });
      for (const kind of ["payment", "filter"]) {
        await page.getByRole("button", { name: `Open ${kind} dialog`, exact: true }).click();
        const dialog = page.locator("dialog[open]");
        await settled(page);
        await contained(dialog, `${kind} dialog`, true);
        await uniform(dialog.locator("footer button"), `${mode}/${width}/${height}/${kind} footer`);
        for (const button of await dialog.locator("footer button").all()) await contained(button, `${kind} footer action`);
        await dialog.getByRole("button", { name: `Close ${kind} dialog`, exact: true }).click();
        checks.push({ mode, width, height, name: `${kind} dialog` });
      }
      if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)) {
        throw new Error(`${mode}/${width}/${height}: page overflows horizontally`);
      }
    }
  }
  return { passed: true, checks };
}
