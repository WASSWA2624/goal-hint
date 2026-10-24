/* eslint-disable @typescript-eslint/no-unused-vars -- Playwright CLI evaluates this named function through run-code --filename. */
/**
 * Open an isolated SQL-backed /detail-cases/linked-evidence fixture, then run:
 * playwright-cli run-code --filename scripts/verify-mobile-match-content.js
 * The CLI supplies `page`; no browser dependency is added to the application.
 */
async function verifyMobileMatchContent(page) {
  const address = new URL(page.url());
  if (!["127.0.0.1", "localhost", "[::1]"].includes(address.hostname) || address.pathname !== "/detail-cases/linked-evidence") {
    throw new Error("Open the local SQL-backed /detail-cases/linked-evidence fixture first.");
  }
  const require = (condition, message) => { if (!condition) throw new Error(message); };
  const requests = [];
  const errors = [];
  const recordRequest = (request) => {
    if (/\/api\/matches\/[^/]+\/insights(?:\?|$)/u.test(request.url())) requests.push(request.url());
  };
  const recordError = (error) => errors.push(error.message);
  page.on("request", recordRequest);
  page.on("pageerror", recordError);
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.reload();
    const analysis = page.locator("#section-analysis");
    const analysisButton = page.locator('[aria-controls="section-analysis"]');
    await analysisButton.waitFor();
    await page.waitForFunction(() => document.querySelector('[aria-controls="section-analysis"]')?.getAttribute("aria-expanded") === "true");
    const reasons = await analysis.locator("li").allTextContents();
    require(reasons.length >= 2, "The stored fixture must contain original reasons and a key risk.");
    const sourceLinks = await analysis.locator("a[href]").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    require(sourceLinks.length > 0, "The stored fixture must contain attributable source links.");
    const revisionRecord = await page.locator("[data-prediction-record]").textContent();

    await page.setViewportSize({ width: 390, height: 844 });
    requests.length = 0;
    await page.reload();
    await page.waitForFunction(() => document.querySelector('[aria-controls="section-analysis"]')?.getAttribute("aria-expanded") === "false");
    require(await analysis.isHidden(), "Phone analysis should retain its collapsed presentation.");
    require(JSON.stringify(await analysis.locator("li").allTextContents()) === JSON.stringify(reasons),
      "Phone hydration must retain the original analysis and risk in the document.");
    require(JSON.stringify(await analysis.locator("a[href]").evaluateAll((links) => links.map((link) => link.getAttribute("href")))) === JSON.stringify(sourceLinks),
      "Collapsed phone analysis must retain the same citations as desktop.");
    require(await page.locator("[data-prediction-record]").textContent() === revisionRecord,
      "Phone and desktop must display the same prediction publication record.");

    const history = page.locator("#section-history");
    require(await history.isHidden() && (await history.textContent()).trim().length > 0,
      "The collapsed history drawer must retain its server-rendered publication content.");
    await analysisButton.click();
    require(await analysis.isVisible(), "The phone analysis drawer should expand.");
    await analysisButton.click();
    require(await analysis.isHidden() && await analysis.locator("li").count() === reasons.length,
      "Collapsing must hide the original analysis without removing it.");
    require(requests.length === 0, "Collapsed drawers and analysis toggles must not request insights.");

    const referee = page.locator("#section-referee");
    const refereeButton = page.locator('[aria-controls="section-referee"]');
    await refereeButton.click();
    const collapse = referee.getByRole("button").last();
    await collapse.focus();
    await collapse.press("Enter");
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-controls") === "section-referee");
    require(await referee.isHidden() && (await referee.textContent()).trim().length > 0,
      "Keyboard collapse must keep the hidden panel and restore focus to its header.");
    await page.setViewportSize({ width: 320, height: 844 });
    require(JSON.stringify(await analysis.locator("li").allTextContents()) === JSON.stringify(reasons),
      "The narrowest phone layout must retain the original analysis.");
    require(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      "The 320px phone layout must not overflow horizontally.");
    require(requests.length === 0, "Collapsed drawers and the static referee drawer must not request insights.");
    require(errors.length === 0, `Unexpected browser errors: ${errors.join("; ")}`);
    return { passed: true, widths: [390, 320], originalAnalysisItems: reasons.length, retainedSourceLinks: sourceLinks.length,
      retainedHistory: true, keyboardFocusRestored: true, unnecessaryInsightRequests: requests.length };
  } finally {
    page.off("request", recordRequest);
    page.off("pageerror", recordError);
  }
}
