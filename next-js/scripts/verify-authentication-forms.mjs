/** Browser acceptance for the isolated member fixture; never submit to a live account service. */
import assert from "node:assert/strict";
import { inspectAppLayout } from "./verify-layout-bounds.mjs";

export async function verifyAuthenticationForms(page, { origin, widths = [320, 390, 768, 1024, 1440], captureDirectory } = {}) {
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname), "Use the local member fixture");
  const open = async (query) => {
    // Forced server scenarios must agree with the private header's session read.
    // Otherwise the production recovery guard correctly rejects the stale HTML.
    await page.context().clearCookies();
    const state = new URLSearchParams(query).get("state");
    const token = state === "active" ? "a" : state === "unverified" ? "v" : state === "password-reset" ? "r" : null;
    if (token) await page.context().addCookies([{ name: "goal-hint-member", value: token.repeat(43), url: origin }]);
    if (state === "active") await page.context().addCookies([{ name: "member-fixture-subscription", value: "active", url: origin }]);
    await page.goto(`${origin}/en/account?${query}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    assert.equal(await page.locator('meta[name="description"]').first().getAttribute("content"), "Isolated member acceptance fixture.");
    await page.locator("[data-account-auth], [data-account-sign-in]").waitFor();
    await page.locator('meta[name="color-scheme"]').waitFor({ state: "attached" });
  };
  const checks = [];
  const cases = [
    ["login", "state=signed-out&view=login"], ["register", "state=signed-out&view=register"],
    ["recovery", "state=support&view=forgot"], ["recovery-code", "state=support&view=forgot", true],
    ["verification", "state=unverified"], ["verification-code", "state=unverified", true],
    ["new-password", "state=password-reset"],
    ["change-password", "state=active&section=password"], ["change-phone", "state=active&section=phone"],
  ];
  for (const [name, query, codeStep] of cases) {
    await open(query);
    if (codeStep) {
      const phone = page.locator("[data-phone-input]");
      if (await phone.count()) await phone.fill("700000101");
      await page.getByRole("button", { name: "Have a code?", exact: true }).click();
      await page.locator('[data-verification-step="code"]').waitFor();
    }
    for (const width of widths) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const scope = page.locator("[data-account-auth], [data-account-sign-in]");
      const geometry = await scope.evaluate(root => {
        const box = root.getBoundingClientRect(), style = getComputedStyle(root);
        const mode = document.querySelector('meta[name="color-scheme"]').content;
        const secondary = [...root.querySelectorAll("[data-account-secondary-actions] a, [data-account-secondary-actions] button, [data-account-support] a")]
          .filter(element => element.checkVisibility({ visibilityProperty: true, opacityProperty: true }))
          .map(element => ({ name: element.textContent.trim(), background: getComputedStyle(element).backgroundColor,
            image: getComputedStyle(element).backgroundImage }));
        const prefix = root.querySelector("[data-phone-country-field]");
        const number = root.querySelector("[data-phone-input]");
        const primary = getComputedStyle(root.querySelector('form button[type="submit"]'));
        const grouped = [...root.querySelectorAll("[data-account-secondary-actions] > *")]
          .map(element => element.getBoundingClientRect().top);
        return { mode, width: box.width, maxWidth: Number.parseFloat(style.maxInlineSize),
          left: box.left, right: box.right, viewport: document.documentElement.clientWidth,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, secondary, grouped,
          primaryFilled: primary.backgroundColor !== "rgba(0, 0, 0, 0)" || primary.backgroundImage !== "none",
          prefix: prefix ? { label: prefix.querySelector("[data-phone-country-label]").textContent,
            border: Number.parseFloat(getComputedStyle(prefix.querySelector("[data-floating-outline]")).borderTopWidth),
            top: prefix.querySelector("button").getBoundingClientRect().top,
            numberTop: number.getBoundingClientRect().top, height: prefix.querySelector("button").getBoundingClientRect().height,
            numberHeight: number.getBoundingClientRect().height } : null };
      });
      assert.ok(geometry.width <= geometry.maxWidth + 1, `${name}/${width}: bounded form width`);
      assert.equal(geometry.primaryFilled, true, `${name}/${width}: primary action stays filled`);
      if (width >= 390 && geometry.grouped.length > 1) {
        assert.ok(Math.max(...geometry.grouped) - Math.min(...geometry.grouped) <= 1, `${name}/${width}: secondary actions share a row`);
      }
      assert.ok(geometry.left >= -1 && geometry.right <= geometry.viewport + 1 && geometry.overflow <= 1, `${name}/${width}: no horizontal overflow`);
      if (name !== "change-password" && name !== "change-phone") {
        assert.ok(Math.abs(geometry.left - (geometry.viewport - geometry.right)) <= 1, `${name}/${width}: centered card`);
      }
      for (const link of geometry.secondary) {
        assert.equal(link.background, "rgba(0, 0, 0, 0)", `${name}/${width}/${link.name}: secondary action is a link`);
        assert.equal(link.image, "none");
      }
      if (geometry.prefix) {
        assert.equal(geometry.prefix.label, "Code");
        assert.equal(geometry.prefix.border, 1);
        assert.ok(Math.abs(geometry.prefix.top - geometry.prefix.numberTop) <= 1, "Phone field bodies align");
        assert.ok(Math.abs(geometry.prefix.height - geometry.prefix.numberHeight) <= 1, "Phone field heights agree");
      }
      const audit = await inspectAppLayout(page, "[data-account-auth], [data-account-sign-in]");
      assert.deepEqual(audit.failures, [], `${name}/${width}: controls fit and keep their shared height`);
      checks.push({ name, viewportWidth: width, ...geometry });
      if (captureDirectory && [390, 1440].includes(width)) await page.screenshot({ path: `${captureDirectory}/${name}-${geometry.mode}-${width}.png` });
    }
  }

  await open("state=support&view=forgot");
  await page.locator("[data-phone-input]").fill("700000101");
  const sms = page.getByRole("radio", { name: "SMS", exact: true });
  const whatsapp = page.getByRole("radio", { name: "WhatsApp", exact: true });
  assert.equal(await sms.isChecked(), true);
  await whatsapp.check();
  assert.equal(await sms.isChecked(), false);
  await sms.check();
  await page.getByRole("button", { name: "Send by SMS", exact: true }).click();
  await page.locator('[data-verification-step="code"]').waitFor();
  const code = page.getByRole("textbox", { name: "6-digit code", exact: true });
  await code.fill("111111");
  await page.locator('[data-account-step-form="code"] button[type="submit"]').click();
  await page.getByRole("alert").filter({ hasText: "invalid or has expired" }).waitFor();
  await code.fill("123456");
  await page.locator('[data-account-step-form="code"] button[type="submit"]').click();
  await page.locator("[data-account-reset]").waitFor();
  await page.waitForLoadState("load");
  await page.getByLabel("New password", { exact: true }).fill("Synthetic passphrase 123");
  await page.getByLabel("Confirm new password", { exact: true }).fill("Different passphrase 123");
  await page.locator('[data-account-reset] button[type="submit"]').click();
  await page.locator('[data-account-reset] [role="alert"]').filter({ hasText: "The passwords do not match." }).waitFor();

  await open("state=signed-out&view=login");
  await page.locator("[data-phone-country-trigger]").click();
  await page.locator("[data-phone-country-search]").fill("GB");
  await page.locator('[data-phone-country-option="GB"]').click();
  await page.locator("[data-phone-input]").fill("7700900123");
  assert.equal(await page.locator("[data-phone-canonical]").inputValue(), "447700900123");
  await page.locator("[data-phone-country-trigger]").focus();
  await page.keyboard.press("ArrowDown");
  await page.locator("[data-phone-country-picker]").waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("[data-phone-country-trigger]").evaluate(element => element === document.activeElement), true);
  return { passed: true, checks, flows: ["SMS/WhatsApp choice", "delivery", "invalid code", "accepted code", "password mismatch", "country search", "canonical phone", "keyboard dismissal"] };
}
