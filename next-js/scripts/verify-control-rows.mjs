/** Browser regressions for control bodies, baseline alignment and subtle notched outlines. */
function aligned(controls, label, expectedHeight) {
  if (controls.length < 2) throw new Error(`${label}: missing row controls`);
  const height = controls[0].height;
  for (const control of controls) {
    if (expectedHeight !== undefined && Math.abs(control.height - expectedHeight) > 1) {
      throw new Error(`${label}: expected ${expectedHeight}px control bodies ${JSON.stringify(controls)}`);
    }
    if (Math.abs(control.height - height) > 1) throw new Error(`${label}: mismatched heights ${JSON.stringify(controls)}`);
    for (const peer of controls) {
      const overlap = Math.min(control.bottom, peer.bottom) - Math.max(control.top, peer.top);
      if (overlap > height / 2 && (Math.abs(control.top - peer.top) > 1 || Math.abs(control.bottom - peer.bottom) > 1)) {
        throw new Error(`${label}: misaligned edges ${JSON.stringify(controls)}`);
      }
    }
  }
}

const rectangles = (elements, composite = false) => elements.map(element => {
  const control = (composite && element.closest("[data-feed-search]"))
    || (getComputedStyle(element).opacity === "0" && element.closest("[data-floating-control]")) || element;
  return { name: element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 30) || element.id,
    ...control.getBoundingClientRect().toJSON() };
}).filter(rect => rect.width && rect.height);

export async function verifyMixedControlRows(page, origin, widths = [320, 390, 768, 1024, 1440]) {
  const checks = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1100 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${origin}/fields`, { waitUntil: "domcontentloaded" });
    for (const mode of ["light", "dark"]) {
      if (mode === "dark") await page.getByRole("button", { name: "Toggle theme" }).click();
      const controls = await page.locator("[data-mixed-controls] input, [data-mixed-controls] [data-select-trigger], [data-mixed-range], [data-mixed-compact], [data-mixed-action], [data-mixed-link]")
        .evaluateAll(rectangles);
      aligned(controls, `${mode}/${width}/mixed fields, dates, actions and links`);
      const owner = await page.locator("[data-alignment-row] input, [data-alignment-row] select, [data-alignment-row] button").evaluateAll(rectangles);
      aligned(owner, `${mode}/${width}/owner action and hint`);
      const input = page.locator("#same-fill");
      await input.blur();
      await page.waitForFunction(element => getComputedStyle(element).backgroundColor === getComputedStyle(element.closest("[data-same-fill]")).backgroundColor, await input.elementHandle());
      const inspect = () => input.evaluate(element => {
        const outline = element.closest("[data-floating-control]").querySelector("[data-floating-outline]");
        const style = getComputedStyle(outline), label = element.closest("[data-floating-control]").querySelector("label");
        return { width: Number.parseFloat(style.borderTopWidth), color: style.borderTopColor,
          background: getComputedStyle(element).backgroundColor,
          parent: getComputedStyle(element.closest("[data-same-fill]")).backgroundColor,
          nativeBorder: getComputedStyle(element).borderTopColor,
          nativeOutline: getComputedStyle(element).outlineStyle, labelFill: getComputedStyle(label).backgroundColor };
      });
      const idle = await inspect();
      if (idle.background !== idle.parent || idle.color === idle.background || idle.color === "rgba(0, 0, 0, 0)" || idle.width <= 0 || idle.width > 1.1) {
        throw new Error(`${mode}/${width}: same-fill field needs a single faint border ${JSON.stringify(idle)}`);
      }
      await input.focus();
      const focus = await inspect();
      if (focus.width !== idle.width || focus.color === idle.color || focus.nativeOutline !== "none" || focus.nativeBorder !== "rgba(0, 0, 0, 0)" || focus.labelFill !== "rgba(0, 0, 0, 0)") {
        throw new Error(`${mode}/${width}: focus must retain one thin notched outline ${JSON.stringify(focus)}`);
      }
      await input.blur();
      checks.push({ mode, width, controls: controls.length + owner.length, bodyHeight: controls[0].height, border: idle.color });
    }
  }
  return { passed: true, checks };
}

/** Real parent styles must preserve the standard even when validation changes a field's total height. */
export async function verifyUniformControls(page, origin, widths = [320, 390, 768, 1024, 1440, 1920]) {
  const checks = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1100 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${origin}/fields`, { waitUntil: "domcontentloaded" });
    const expected = await page.evaluate(() => matchMedia("(pointer: coarse)").matches ? 44 : 40);
    for (const mode of ["light", "dark"]) {
      if (mode === "dark") await page.getByRole("button", { name: "Toggle theme" }).click();
      for (const validation of [false, true]) {
        if (validation) await page.locator("[data-toggle-row-error]").click();
        for (const row of await page.locator("[data-uniform-row]").all()) {
          const name = await row.getAttribute("data-uniform-row");
          const controls = await row.locator('input:not([type="hidden"], [type="checkbox"], [type="radio"]), select, button, a').evaluateAll(rectangles, true);
          aligned(controls, `${mode}/${width}/${name}/validation=${validation}`, expected);
          checks.push({ mode, width, name, validation, height: expected, controls: controls.length });
        }
      }
      await page.locator("[data-toggle-row-error]").click();
    }
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) {
      throw new Error(`${width}: shared control fixture overflows horizontally`);
    }
  }
  return { passed: true, checks };
}

/** Audit all visible native controls; embedded actions take their enclosing field's geometry. */
export async function inspectControlHeights(page, scope = "body") {
  return page.locator(scope).evaluate(root => {
    const expected = matchMedia("(pointer: coarse)").matches ? 44 : 40;
    const failures = [], controls = [];
    for (const element of root.querySelectorAll('button, summary, select, input:not([type="hidden"], [type="checkbox"], [type="radio"], [type="range"])')) {
      const bounds = element.getBoundingClientRect(), style = getComputedStyle(element);
      if (!bounds.width || !bounds.height || style.visibility === "hidden" || style.opacity === "0") continue;
      if (!element.checkVisibility({ visibilityProperty: true, opacityProperty: true }) || element.closest("[data-fixture-controls]")) continue;
      if (element.closest('[data-field-trailing], [data-field-action], [data-slip-number-stepper], [data-truncation], [data-slip-header-action], [data-phone-share-action]')) continue;
      if (element.tagName === "BUTTON" && element.closest("[data-floating-control], [data-feed-search]")) continue;
      const height = element.closest("[data-feed-search]")?.getBoundingClientRect().height ?? bounds.height;
      const name = element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 45) || element.id;
      controls.push({ name, height });
      const headerAction = element.matches('[data-theme-toggle], [data-account-menu] > summary');
      const minimum = headerAction ? expected - 2 * Number.parseFloat(style.getPropertyValue('--gh-headerControl-blockInset')) : expected;
      if (height < minimum - 1) failures.push({ name, height, expected: minimum, tag: element.tagName, html: element.outerHTML.slice(0, 200) });
    }
    return { controls: controls.length, failures };
  });
}

export async function verifyScreenControlRows(page, origin, widths = [320, 390, 768, 1024, 1440]) {
  const checks = [];
  for (const theme of ["porcelain-blue", "cobalt-night"]) for (const width of widths) {
    await page.setViewportSize({ width, height: 1100 });
    for (const screen of ["best-slips", "matches", "slip-builder", "analytics", "invites", "results"]) {
      await page.goto(`${origin}/themes/${theme}/${screen}`, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.locator('[data-preview-ready="true"]').waitFor();
      if (screen === "analytics") await page.locator('section[aria-label="Report filters"]').waitFor();
      const before = checks.length;
      const groups = screen === "results" ? ["[data-performance-dashboard] form"] : screen === "invites" ? ["[data-invite-friends]"] : screen === "slip-builder" ? ["[data-slip-builder-toolbar]"] : screen === "best-slips" ? ["[data-slip-toggle-row]"] : screen === "matches"
        ? ["[data-desktop-filter-search]", "[data-phone-query-filters]", "[data-phone-filter-toolbar]"]
        : ['section[aria-label="Report filters"]'];
      for (const selector of groups) {
        const group = page.locator(selector);
        if (!await group.count() || !await group.isVisible()) continue;
        const controls = await group.locator('input:not([type="hidden"], [type="checkbox"]), select, [data-select-trigger], button:not([tabindex="-1"]), a')
          .evaluateAll(rectangles, true);
        const expected = await page.evaluate(() => matchMedia("(pointer: coarse)").matches ? 44 : 40);
        aligned(controls, `${theme}/${width}/${screen}/${selector}`, expected);
        checks.push({ theme, width, screen, controls: controls.length });
      }
      if (checks.length === before) throw new Error(`${theme}/${width}/${screen}: no visible control row`);
      const audit = await inspectControlHeights(page, "[data-preview-canvas]");
      if (audit.failures.length) throw new Error(`${theme}/${width}/${screen}: ${JSON.stringify(audit.failures)}`);
    }
  }
  return { passed: true, checks };
}
