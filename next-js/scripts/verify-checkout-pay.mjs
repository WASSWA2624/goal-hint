import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { inspectAppLayout } from "./verify-layout-bounds.mjs";

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const settled = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

/** Exercise the production Pay UI against the local synthetic checkout fixture. */
export async function verifyCheckoutPay(page, { origin, outputDirectory } = {}) {
  const address = new URL(origin);
  assert(["127.0.0.1", "localhost", "[::1]"].includes(address.hostname), "Use a local checkout fixture.");
  const checks = [], errors = [];
  let scenario = {}, sequence = 0, confirmationRequests = 0, quoteHold = null, releaseQuote = null, changeNextQuote = false;
  const onPageError = error => errors.push(error.message);
  const onRequest = request => {
    if (request.url().endsWith("/api/account/checkout") && request.method() === "POST"
      && /"action"\s*:\s*"confirm"/u.test(request.postData() ?? "")) confirmationRequests++;
  };
  const route = async intercepted => {
    if (intercepted.request().method() === "GET") {
      await intercepted.fulfill({ json: { availableWalletUgx: scenario.wallet ?? 0, availableReferralDays: scenario.earnedDays ?? 0,
        lastMethod: scenario.lastProvider ?? null, requests: [] } });
      return;
    }
    const quoting = /"action"\s*:\s*"quote"/u.test(intercepted.request().postData() ?? "");
    if (quoting && quoteHold) await quoteHold;
    if (quoting && changeNextQuote) {
      changeNextQuote = false;
      const response = await intercepted.fetch(), value = await response.json();
      await intercepted.fulfill({ status: response.status(), contentType: "application/json",
        body: JSON.stringify({ ...value, recipient: "256700000999", recipientName: "CHANGED SYNTHETIC PAYEE" }) });
      return;
    }
    await intercepted.continue();
  };
  page.on("pageerror", onPageError);
  page.on("request", onRequest);
  await page.route("**/api/account/checkout", route);
  await page.addInitScript(() => { try { localStorage.removeItem("goal-hint-theme"); } catch { /* Sandboxed origins can block storage. */ } });
  if (outputDirectory) await mkdir(outputDirectory, { recursive: true });

  const pay = () => page.locator("[data-checkout-pay]");
  const destination = () => pay().locator("[data-payment-destination]");
  const wallet = () => pay().getByRole("checkbox", { name: /Use wallet balance/u });
  async function quoted() {
    await destination().waitFor();
    await page.waitForFunction(() => document.querySelector('[data-checkout-pay] [data-payment-destination]')?.getAttribute("aria-busy") === "false");
  }
  async function recipient(suffix) {
    await quoted();
    const value = await pay().locator("[data-pay-recipient]").textContent();
    assert(value.replace(/\D/gu, "").endsWith(suffix), `Expected receiving number ending ${suffix}; saw ${value}`);
  }
  async function open(values = {}) {
    scenario = { wallet: 0, earnedDays: 0, mode: "light", width: 390, ...values };
    const parameters = new URLSearchParams({ packages: "standard", wallet: String(scenario.wallet), earnedDays: String(scenario.earnedDays),
      scenario: `pay-${Date.now()}-${++sequence}` });
    if (scenario.lastProvider) parameters.set("lastProvider", scenario.lastProvider);
    if (scenario.disabledProvider) parameters.set("disabledProvider", scenario.disabledProvider);
    await page.setViewportSize({ width: scenario.width, height: 1100 });
    await page.emulateMedia({ colorScheme: scenario.mode, reducedMotion: "reduce" });
    await page.goto(`${address.origin}/en/subscribe?${parameters}`, { waitUntil: "domcontentloaded" });
    await page.locator("[data-package-selection]").waitFor();
    await page.waitForFunction(mode => getComputedStyle(document.documentElement).colorScheme === mode, scenario.mode);
    await page.getByRole("radio", { name: /Weekly/u }).check();
    await page.getByRole("button", { name: "Continue to Pay", exact: true }).click();
    await pay().waitFor();
    await quoted();
    assert(!await page.locator("[data-checkout-notice]").count(), "Trial notice must be absent on Pay.");
    const copy = await pay().innerText();
    assert(!/UndiDays/iu.test(copy), "Use earned days terminology.");
    assert(copy.includes("Choose how you’d like to pay."), "Keep the short payment prompt.");
    assert(!copy.includes("Check this name") && !copy.includes("Next: add payment details"), "Omit the removed helper lines.");
    const visibleTitles = await page.locator('[data-payment-step="2"] h2').evaluateAll(elements => elements.filter(element => {
      const rect = element.getBoundingClientRect();
      return element.checkVisibility() && rect.width > 1 && rect.height > 1;
    }).map(element => element.textContent));
    assert(!visibleTitles.includes("Pay for your package"), "The redundant Pay heading must be visually hidden.");
  }
  async function inspect(label) {
    await page.evaluate(() => document.fonts.ready);
    await settled(page);
    const layout = await inspectAppLayout(page, "[data-checkout-pay]");
    assert(layout.failures.length === 0, `${label}: ${JSON.stringify(layout.failures)}`);
    const controls = await pay().locator("button").evaluateAll(elements => elements.filter(element => element.checkVisibility())
      .map(element => ({ name: element.textContent.trim(), height: element.getBoundingClientRect().height,
        expected: Number.parseFloat(getComputedStyle(element).getPropertyValue("--form-control-height")) })));
    const standard = await page.evaluate(() => matchMedia("(pointer: coarse)").matches ? 44 : 40);
    assert(controls.every(control => control.expected === standard), `${label}: viewport-specific control height`);
    assert(controls.every(control => Math.abs(control.height - control.expected) <= 1), `${label}: nonstandard controls ${JSON.stringify(controls)}`);
    const parts = await pay().locator("[data-pay-package-part]").evaluateAll(elements => elements.map(element => ({
      name: element.getAttribute("data-pay-package-part"), ...element.getBoundingClientRect().toJSON() })));
    assert(parts.length === 4 && parts.every(part => part.width > 0), `${label}: missing package summary parts`);
    assert(parts.every(part => Math.abs((part.top + part.bottom) - (parts[0].top + parts[0].bottom)) <= 2),
      `${label}: package name, duration, amount and Change must share one row ${JSON.stringify(parts)}`);
    assert(parts.every((part, index) => index === 0 || part.left >= parts[index - 1].right - 1), `${label}: package summary parts overlap`);
    assert(/Names:\s*SYNTHETIC (MTN|AIRTEL) PAYEE/u.test(await destination().innerText()), `${label}: show the registered name with the Names label`);
    assert(!(await destination().innerText()).includes("After sending"), `${label}: omit the removed transfer instruction`);
    const cardRows = await pay().evaluate(element => ({
      layout: element.getBoundingClientRect().toJSON(),
      package: element.querySelector('[data-pay-package]').getBoundingClientRect().toJSON(),
      providers: [...element.querySelectorAll('[data-pay-provider]')].map(provider => provider.getBoundingClientRect().toJSON()),
      transfer: element.querySelector('[data-payment-destination]').getBoundingClientRect().toJSON(),
      amount: element.querySelector('[data-pay-amount]').getBoundingClientRect().toJSON(),
      recipient: element.querySelector('[data-pay-recipient]').getBoundingClientRect().toJSON(),
    }));
    assert(Math.abs((cardRows.amount.top + cardRows.amount.bottom) - (cardRows.recipient.top + cardRows.recipient.bottom)) <= 2
      && cardRows.amount.right <= cardRows.recipient.left + 1, `${label}: transfer amount must be left of the receiving number on the same row ${JSON.stringify(cardRows)}`);
    if (scenario.width >= 1024) {
      assert(cardRows.providers.every(provider => Math.abs(provider.top - cardRows.package.top) <= 1
        && Math.abs(provider.bottom - cardRows.package.bottom) <= 1), `${label}: desktop provider and package cards must align ${JSON.stringify(cardRows)}`);
      assert(Math.abs(cardRows.transfer.left - cardRows.layout.left) <= 1 && Math.abs(cardRows.transfer.right - cardRows.layout.right) <= 1,
        `${label}: desktop transfer panel must span the available payment layout width ${JSON.stringify(cardRows)}`);
    } else {
      assert(cardRows.providers.every(provider => provider.top >= cardRows.package.bottom - 1
        && provider.bottom <= cardRows.transfer.top + 1), `${label}: phone order must be package, methods, then transfer ${JSON.stringify(cardRows)}`);
    }
    assert(!await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), `${label}: horizontal page overflow`);
    checks.push({ check: "layout and control heights", ...scenario, controls: controls.length });
  }

  try {
    for (const width of [320, 390, 1024, 1440]) for (const mode of ["light", "dark"]) {
      await open({ width, mode });
      assert(await pay().getByRole("radio", { name: "MTN MoMo", exact: true }).isChecked(), "MTN must be selected for a new customer.");
      assert(!await pay().locator("[data-pay-wallet]").count(), "Zero wallet balance must be hidden.");
      assert(!await pay().locator("[data-pay-earned-days]").count(), "Zero earned days must be hidden.");
      await recipient("901");
      await inspect(`${mode}/${width}/no balances`);
      if (outputDirectory && [390, 1440].includes(width)) await page.locator('[data-payment-step="2"]').screenshot({ path: join(outputDirectory, `pay-${width}-${mode}.png`) });
      await pay().getByRole("radio", { name: "Airtel Money", exact: true }).check();
      await recipient("902");
      checks.push({ check: "provider switching", width, mode });
    }

    await open();
    const panelNode = await destination().elementHandle();
    const recipientNode = await pay().locator("[data-pay-recipient]").elementHandle();
    const copyNode = await destination().getByRole("button", { name: "Copy MTN MoMo receiving number", exact: true }).elementHandle();
    quoteHold = new Promise(resolve => { releaseQuote = resolve; });
    const pendingRequest = page.waitForRequest(request => request.url().endsWith("/api/account/checkout")
      && /"action"\s*:\s*"quote"/u.test(request.postData() ?? ""), { timeout: 15000 });
    // Some drivers wait for outstanding routes before resolving the input action.
    // Inspect the visible state while the quote is held, then release and await it.
    const providerSwitch = pay().getByRole("radio", { name: "Airtel Money", exact: true }).check();
    await pendingRequest;
    assert(await panelNode.evaluate(element => element.isConnected && document.querySelector('[data-checkout-pay] [data-payment-destination]') === element), "Provider switching must retain the payment panel node.");
    assert(await recipientNode.evaluate(element => element.isConnected && document.querySelector('[data-checkout-pay] [data-pay-recipient]') === element), "Provider switching must retain the receiving field node.");
    assert(await copyNode.evaluate(element => element.isConnected && document.querySelector('[data-checkout-pay] [data-payment-destination] button') === element), "Provider switching must retain the Copy button node.");
    assert((await pay().locator("[data-pay-recipient]").textContent()).replace(/\D/gu, "").endsWith("902"), "Airtel receiving number must update before the delayed quote finishes.");
    assert((await destination().innerText()).includes("SYNTHETIC AIRTEL PAYEE"), "Airtel registered name must update immediately.");
    assert(!(await destination().innerText()).includes("Confirming payment details"), "Pending verification must not replace payment details with loading text.");
    releaseQuote(); quoteHold = null; releaseQuote = null;
    await providerSwitch;
    await recipient("902");
    await panelNode.dispose(); await recipientNode.dispose(); await copyNode.dispose();
    checks.push({ check: "delayed provider quote retains field DOM and immediately updates details" });

    changeNextQuote = true;
    await pay().locator("[data-pay-continue]").click();
    const changedNotice = page.getByRole("dialog", { name: "Check payment details", exact: true });
    await changedNotice.waitFor();
    assert((await changedNotice.innerText()).includes("Transfer details changed"), "A changed server receiving destination must stop progression.");
    assert(await pay().isVisible(), "Changed receiving details must keep the member on Pay.");
    assert(!await page.locator('[data-payment-step="3"]').count(), "Changed receiving details must not advance to evidence entry.");
    await changedNotice.getByRole("button", { name: "OK", exact: true }).click();
    checks.push({ check: "server quote-change guard blocks progression" });

    await open({ lastProvider: "airtel" });
    assert(await pay().getByRole("radio", { name: "Airtel Money", exact: true }).isChecked(), "Remember the previous successful Airtel subscription.");
    assert(await pay().locator("[data-pay-remembered]").isVisible(), "Explain the remembered provider.");
    await recipient("902");
    await pay().getByRole("radio", { name: "MTN MoMo", exact: true }).check();
    await recipient("901");
    await pay().getByRole("button", { name: "Back", exact: true }).click();
    await page.locator("[data-package-selection]").waitFor();
    assert(await page.getByRole("radio", { name: /Weekly/u }).isChecked(), "Back must preserve the package.");
    await page.getByRole("button", { name: "Continue to Pay", exact: true }).click();
    await recipient("901");
    await page.reload({ waitUntil: "domcontentloaded" });
    await pay().waitFor();
    await recipient("901");
    assert(await pay().getByRole("radio", { name: "MTN MoMo", exact: true }).isChecked(), "Restored draft must beat historical provider preference.");
    checks.push({ check: "returning provider, back navigation and draft restoration" });

    await open({ lastProvider: "mtn", disabledProvider: "mtn" });
    assert(await pay().getByRole("radio", { name: "MTN MoMo", exact: true }).isDisabled(), "Disabled MTN must not be usable.");
    assert(await pay().getByRole("radio", { name: "Airtel Money", exact: true }).isChecked(), "Fall back to available Airtel.");
    await recipient("902");
    await open({ disabledProvider: "both" });
    assert(await pay().locator("[data-pay-continue]").isDisabled(), "No providers must disable payment continuation.");
    const unavailableRecipient = await pay().locator("[data-pay-recipient]").allTextContents();
    assert(unavailableRecipient.every(value => !/\d/u.test(value)), "No usable provider must never expose a receiving number.");
    checks.push({ check: "unavailable provider fallback and empty methods" });

    for (const mode of ["light", "dark"]) {
      await open({ wallet: 3000, earnedDays: 3, mode });
      assert(!await wallet().isChecked(), "Available wallet must not be spent by default.");
      await wallet().check();
      await quoted();
      assert((await pay().locator("[data-pay-amount]").textContent()).includes("2,000"), "Partial wallet must leave UGX 2,000.");
      assert(await pay().locator("[data-pay-earned-days]").isVisible(), "Available earned days need a redemption entry.");
      await pay().getByRole("radio", { name: "Airtel Money", exact: true }).check();
      await recipient("902");
      assert(await wallet().isChecked(), "Switching providers must preserve partial wallet contribution.");
      await inspect(`${mode}/partial wallet`);
      if (outputDirectory) await page.locator('[data-payment-step="2"]').screenshot({ path: join(outputDirectory, `pay-wallet-390-${mode}.png`) });
      await wallet().uncheck();
      await quoted();
      assert((await pay().locator("[data-pay-amount]").textContent()).includes("5,000"), "Unchecking wallet restores the package cash price.");
      checks.push({ check: "explicit partial wallet and provider switching", mode });
    }

    await open({ wallet: 10000, lastProvider: "airtel" });
    await wallet().check();
    await quoted();
    assert(!await pay().locator("[data-pay-recipient]").count(), "Wallet-only payment must not request a transfer.");
    assert(await pay().getByRole("button", { name: "Review payment", exact: true }).isVisible(), "Full wallet must proceed to review.");
    assert(await pay().getByRole("radio", { name: "MTN MoMo", exact: true }).isVisible(), "Mobile Money must remain discoverable.");
    await pay().getByRole("radio", { name: "MTN MoMo", exact: true }).check();
    await recipient("901");
    assert(!await wallet().isChecked(), "Choosing Mobile Money from full wallet must turn wallet off.");
    await wallet().check();
    await quoted();
    await pay().getByRole("button", { name: "Review payment", exact: true }).click();
    await page.locator('[data-payment-step="4"]').waitFor();
    assert(await page.getByRole("button", { name: "Submit", exact: true }).isDisabled(), "Wallet requires explicit final confirmation.");
    checks.push({ check: "full wallet, switching and final confirmation" });

    await open({ earnedDays: 3 });
    await pay().getByRole("button", { name: "Redeem earned days", exact: true }).click();
    const days = page.getByRole("spinbutton", { name: "Earned days to redeem", exact: true });
    await days.waitFor();
    await days.fill("2");
    await page.getByRole("button", { name: "Review redemption", exact: true }).click();
    await page.locator('[data-payment-step="4"]').waitFor();
    assert(await page.getByRole("button", { name: "Submit", exact: true }).isDisabled(), "Earned-day redemption requires explicit final confirmation.");
    const confirmation = page.getByRole("checkbox", { name: /I checked these details and confirm this redemption/u });
    assert(!await confirmation.isChecked(), "Earned-day redemption cannot preselect confirmation.");
    await confirmation.check();
    assert(await page.getByRole("button", { name: "Submit", exact: true }).isEnabled(), "Confirmed redemption must be reviewable and submittable.");
    assert(confirmationRequests === 0, "Choosing funding or reviewing must not submit a payment or debit balances.");
    checks.push({ check: "earned-day redemption path and explicit confirmation" });
    assert(errors.length === 0, `Browser errors: ${JSON.stringify(errors)}`);
    return { passed: true, checks, browserErrors: errors };
  } finally {
    releaseQuote?.();
    await page.unroute("**/api/account/checkout", route);
    page.off("pageerror", onPageError);
    page.off("request", onRequest);
  }
}
