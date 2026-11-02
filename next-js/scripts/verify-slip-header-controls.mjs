/** Check actual control bounds, rather than hiding an oversized frame with clipping. */
export async function verifySlipHeaderControls(page, origin, widths = [320, 390, 768, 1024, 1440, 1920], enabled = true) {
  const checks = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1100 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForFunction(() => document.querySelector("[data-slip-header-fixture]")
      && document.querySelectorAll("[data-production-desktop-slip]").length === (innerWidth >= 1024 ? 5 : 0));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(enabled => document.querySelector("[data-share-slip]")?.disabled === !enabled, enabled);
    for (const mode of ["light", "dark"]) {
      if (mode === "dark") await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
      for (const section of await page.locator("[data-header-case]").all()) {
        const name = await section.getAttribute("data-header-case");
        const inspect = async () => {
          const geometry = await section.evaluate(root => {
            const card = root.querySelector("[data-compact-slip]"), header = card.querySelector("[data-slip-summary]");
            const share = root.querySelector("[data-share-slip]");
            const arrow = header.querySelector("[data-toggle-chevron], [data-header-chevron]");
            const rect = element => element?.getBoundingClientRect().toJSON();
            const style = getComputedStyle(card);
            return { header: rect(header), share: rect(share), arrow: rect(arrow),
              disabled: share?.disabled,
              expected: Number.parseFloat(style.getPropertyValue("--form-control-height"))
                - 2 * Number.parseFloat(style.getPropertyValue("--slip-header-action-inset")) };
          });
          const label = `${mode}/${width}/${name}`;
          if (!Number.isFinite(geometry.expected)) throw new Error(`${label}: missing shared action metrics`);
          for (const key of ["share", "arrow"]) {
            const control = geometry[key];
            if (!control) continue;
            if (Math.abs(control.height - geometry.expected) > .5) throw new Error(`${label}: ${key} has the wrong frame height`);
            if (control.top < geometry.header.top + 1 || control.bottom > geometry.header.bottom - 1
              || control.left < geometry.header.left + 1 || control.right > geometry.header.right - 1) {
              throw new Error(`${label}: ${key} crosses the header's inset ${JSON.stringify(geometry)}`);
            }
          }
          if (geometry.share && geometry.arrow && (Math.abs(geometry.share.top - geometry.arrow.top) > .5
            || Math.abs(geometry.share.height - geometry.arrow.height) > .5 || geometry.share.right > geometry.arrow.left - 1)) {
            throw new Error(`${label}: Share and disclosure must have matching, independent frames ${JSON.stringify(geometry)}`);
          }
          checks.push({ mode, width, name, height: geometry.expected, disabled: geometry.disabled });
        };
        await inspect();
        const summary = section.locator("summary[data-slip-summary]");
        if (await summary.count()) {
          const expanded = await summary.evaluate(element => element.parentElement.open);
          await summary.click({ position: { x: 4, y: 6 } });
          await page.waitForFunction(({ element, expanded }) => element.parentElement.open !== expanded,
            { element: await summary.elementHandle(), expanded });
          await inspect();
        }
      }
    }
  }
  return { passed: true, checks };
}
