/** Browser acceptance checks against verify-floating-labels-rendering.py --serve. */
export async function verifyFloatingLabels(page, origin, widths = [320, 390, 768, 1440]) {
  const checks = [];
  const assert = (value, message) => { if (!value) throw new Error(message); checks.push(message); };
  const geometry = control => control.evaluate(element => {
    const frame = element.matches("[data-select-trigger]") ? element.parentElement : element.closest("[data-floating-control]");
    const label = frame.querySelector("label, [data-select-label]");
    const input = element.getBoundingClientRect(), bounds = label.getBoundingClientRect();
    return { raised: Math.abs(bounds.top + bounds.height / 2 - input.top) < 2,
      background: getComputedStyle(label).backgroundColor,
      notch: frame.querySelector("[data-floating-outline] legend").getBoundingClientRect().width,
      borderWidth: getComputedStyle(element).borderTopWidth, outline: getComputedStyle(element).outlineStyle, border: getComputedStyle(element).borderTopColor, height: input.height, gap: frame.querySelector("legend").getBoundingClientRect().toJSON(), label: bounds.toJSON(), input: input.toJSON() };
  });
  const state = async (control, raised, name) => {
    await page.waitForFunction(({ element, raised }) => {
      const frame = element.matches("[data-select-trigger]") ? element.parentElement : element.closest("[data-floating-control]");
      const label = frame.querySelector("label, [data-select-label]");
      const input = element.getBoundingClientRect(), bounds = label.getBoundingClientRect();
      const active = Math.abs(bounds.top + bounds.height / 2 - input.top) < 2;
      const notch = frame.querySelector("legend").getBoundingClientRect().width;
      return active === raised && (raised ? notch > 3 : notch < 1);
    }, { element: await control.elementHandle(), raised });
    const result = await geometry(control);
    assert(result.raised === raised, `${name}: label ${raised ? "floats on the border" : "rests inside"}`);
    assert(result.outline === "none", `${name}: single notched border without an extra focus ring`);
    assert(Number.parseFloat(result.borderWidth) === 0 || result.border === "rgba(0, 0, 0, 0)" || result.border === "transparent", `${name}: native border leaves the notch clear`);
    assert(result.background === "rgba(0, 0, 0, 0)", `${name}: transparent label`);
    if (raised) assert(result.gap.left <= result.label.left + 3 && result.gap.right >= result.label.right - 3, `${name}: no border crosses label text`);
    assert(raised ? result.notch > 3 : result.notch < 1, `${name}: border gap follows the label`);
  };
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1100 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(origin);
    await page.locator("[data-floating-fixture]").waitFor();
    for (const mode of ["light", "dark"]) {
      if (mode === "dark") await page.getByRole("button", { name: "Toggle theme" }).click();
      const prefix = `${mode}/${width}`;
      const text = page.getByLabel("Empty text", { exact: true });
      await state(text, false, `${prefix}/empty`);
      await text.focus(); await state(text, true, `${prefix}/focused`);
      await text.fill("Entry"); await text.blur(); await state(text, true, `${prefix}/filled`);
      await text.fill(""); await text.blur(); await state(text, false, `${prefix}/cleared`);
      await text.evaluate(element => { element.value = "Restored without an input event"; });
      await state(text, true, `${prefix}/browser-restored`);
      await text.fill(""); await text.blur();
      for (const name of ["Restored text", "Number", "Invalid value", "Disabled value", "Read only", "Restored date", "Slip count"]) {
        await state(page.getByLabel(name, { exact: true }), true, `${prefix}/${name}`);
      }
      for (const [name, value] of [["Date", "2026-11-02"], ["Time", "12:30"], ["Date and time", "2026-11-02T12:30"]]) {
        const input = page.getByLabel(name, { exact: true });
        await state(input, false, `${prefix}/${name}/empty`);
        await input.focus(); await state(input, true, `${prefix}/${name}/focused`);
        await input.fill(value); await input.blur(); await state(input, true, `${prefix}/${name}/filled`);
      }
      const leading = page.getByLabel("Search account", { exact: true });
      await leading.focus(); await state(leading, true, `${prefix}/leading icon focus`);
      await leading.fill("Entry"); await leading.blur(); await state(leading, true, `${prefix}/leading icon value`);
      const search = page.getByLabel("Search matches", { exact: true });
      await search.focus(); await state(search, true, `${prefix}/composite search focus`);
      await search.blur();
      if (width >= 1024) {
        const number = page.getByLabel("Slip count", { exact: true });
        await number.focus();
        const stepper = number.locator("..").locator("[data-slip-number-stepper]");
        const bounds = await number.boundingBox();
        const arrows = await stepper.getByRole("button").evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().toJSON()));
        assert(arrows.length === 2 && arrows.every(arrow => arrow.height > 0 && arrow.height <= bounds.height / 2 + 1
          && arrow.top >= bounds.y - 1 && arrow.bottom <= bounds.y + bounds.height + 1), `${prefix}/number arrows fit both halves of the field`);
        assert(await stepper.locator("svg").count() === 2, `${prefix}/number arrows use aligned icons`);
        await stepper.getByRole("button").first().click();
        assert(await number.inputValue() === "3", `${prefix}/up arrow increments`);
        await stepper.getByRole("button").last().click();
        assert(await number.inputValue() === "2", `${prefix}/down arrow decrements`);
      }
      const select = page.getByRole("combobox", { name: /^Native choice(?::|$)/u });
      const nativeSelect = page.locator("select#select");
      await state(select, false, `${prefix}/select/empty`);
      await select.click();
      await page.getByRole("listbox", { name: "Native choice", exact: true }).getByRole("option", { name: "One", exact: true }).click();
      assert(await nativeSelect.inputValue() === "one", `${prefix}/select/first click updates the native value`);
      await select.blur(); await state(select, true, `${prefix}/select/selected`);
      const notes = page.getByLabel("Notes", { exact: true });
      await state(notes, false, `${prefix}/textarea/empty`);
      await notes.focus(); await state(notes, true, `${prefix}/textarea/focused`);
      await notes.fill("A note"); await notes.blur(); await state(notes, true, `${prefix}/textarea`);
      const password = page.getByLabel("Password", { exact: true });
      await password.fill("example");
      await page.getByRole("button", { name: "Show password", exact: true }).click();
      assert(await password.getAttribute("type") === "text", `${prefix}/password reveal remains functional`);
      await page.getByRole("button", { name: "Hide password", exact: true }).click();
      await page.getByRole("button", { name: "Reset fields" }).click();
      await state(text, false, `${prefix}/reset/text`);
      await state(page.getByLabel("Date", { exact: true }), false, `${prefix}/reset/date`);
      await state(select, false, `${prefix}/reset/select`);
      assert(await nativeSelect.inputValue() === "", `${prefix}/reset/select restores the native default`);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${prefix}/no horizontal overflow`);
      const row = await page.locator("[data-alignment-row]").evaluate(element => {
        return [...element.querySelectorAll('input, select:not([aria-hidden="true"]), button')].map(control => control.getBoundingClientRect().toJSON());
      });
      assert(row.every(bounds => Math.abs(bounds.height - row[0].height) < 1), `${prefix}/row controls share one height`);
      for (const bounds of row) {
        const peers = row.filter(peer => Math.abs(peer.top - bounds.top) < 2);
        assert(peers.every(peer => Math.abs(peer.bottom - bounds.bottom) < 1), `${prefix}/row bottoms align despite hints`);
      }
      const placeholders = await page.locator("[data-floating-control] input, [data-floating-control] textarea").evaluateAll(elements =>
        elements.filter(element => element.placeholder.trim()).map(element => element.id));
      assert(placeholders.length === 0, `${prefix}/floating labels have no visible placeholders`);
      const ids = await page.locator("[id]").evaluateAll(elements => elements.map(element => element.id));
      assert(new Set(ids).size === ids.length, `${prefix}/unique accessible IDs`);
    }
  }
  return { passed: true, count: checks.length, checks };
}

/** Exercise the real builder: Total slips is a section heading, with aligned numeric controls. */
export async function verifySlipBuilderFields(page, origin) {
  const checks = [];
  for (const theme of ["porcelain-blue", "cobalt-night"]) {
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${origin}/themes/${theme}/slip-builder`, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.locator('[data-preview-ready="true"]').waitFor();
      await page.locator('dialog[data-slip-criteria-group="advanced"][data-enhanced="true"]').waitFor({ state: "attached" });
      const targets = page.locator("[data-slip-builder-essentials]");
      if (await targets.isVisible()) throw new Error(`${theme}/${width}: Builder fields must start inside the closed Filters dialog`);
      await page.locator('[data-criteria-trigger="advanced"]').click();
      const dialog = page.getByRole("dialog", { name: "Filters", exact: true });
      await dialog.waitFor();
      const dividers = await dialog.locator("[data-filter-section]:visible").evaluateAll(sections =>
        sections.map(section => ({ width: parseFloat(getComputedStyle(section).borderBlockStartWidth),
          followsSection: section.previousElementSibling?.matches("[data-filter-section]:not([hidden])") === true })));
      if (dividers.length < 5 || !dividers.every(({ width, followsSection }) => (width > 0) === followsSection)) {
        throw new Error(`${theme}/${width}: Builder filter groups must be separated by dividers`);
      }
      const geometry = await dialog.locator("[data-slip-builder-essentials]").evaluate(element => {
        const group = element.querySelector("[data-slip-count]"), legend = group.querySelector(":scope > legend");
        const inputs = [...element.querySelectorAll("input[data-slip-numeric-field]")];
        const controlHeight = parseFloat(getComputedStyle(element).getPropertyValue("--form-control-height"));
        return { title: legend.textContent, floatingLabel: !!group.querySelector("label"),
          titleFits: legend.scrollWidth <= legend.clientWidth + 1, controlHeight,
          fields: inputs.map(input => ({ field: input.dataset.slipNumericField, ...input.getBoundingClientRect().toJSON() })) };
      });
      if (geometry.title !== "Total slips" || geometry.floatingLabel || !geometry.titleFits) {
        throw new Error(`${theme}/${width}: Total slips must remain a fully visible section legend`);
      }
      const fields = Object.fromEntries(geometry.fields.map(field => [field.field, field]));
      if (geometry.fields.length !== 5 || !geometry.fields.every(field => Math.abs(field.height - geometry.controlHeight) < 1)) {
        throw new Error(`${theme}/${width}: Builder fields must use the shared height: ${JSON.stringify(geometry.fields)}`);
      }
      for (const range of ["total", "teams"]) {
        if (Math.abs(fields[`${range}Min`].bottom - fields[`${range}Max`].bottom) >= 1) {
          throw new Error(`${theme}/${width}: ${range} range fields must share a row`);
        }
      }
      if (width >= 1024) {
        const count = dialog.locator('[data-slip-numeric-field="slips"]');
        const initial = Number(await count.inputValue());
        await count.focus();
        const stepper = count.locator("..").locator("[data-slip-number-stepper]");
        const box = await count.boundingBox();
        const arrows = await stepper.getByRole("button").evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().toJSON()));
        if (arrows.length !== 2 || arrows.some(arrow => arrow.top < box.y - 1 || arrow.bottom > box.y + box.height + 1 || arrow.height > box.height / 2 + 1)) {
          throw new Error(`${theme}/${width}: number arrows exceed their field`);
        }
        await stepper.getByRole("button").first().click();
        if (Number(await count.inputValue()) !== initial + 1) throw new Error("Builder up arrow did not increment");
        await stepper.getByRole("button").last().click();
        if (Number(await count.inputValue()) !== initial) throw new Error("Builder down arrow did not decrement");
      }
      checks.push({ theme, width, fields: geometry.fields.length });
    }
  }
  return { passed: true, checks };
}
