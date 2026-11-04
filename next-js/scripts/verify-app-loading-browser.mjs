/** Run against verify-app-loading-rendering.py's isolated server using a Playwright page. */
export async function verifyAppLoading(page, origin) {
  const failures = [], results = [];
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const onError = error => failures.push(error.message);
  const onConsole = message => { if (message.type() === 'error' && /hydrat|react error|did not match/i.test(message.text())) failures.push(message.text()); };
  page.on('pageerror', onError); page.on('console', onConsole);
  let summaryRequests = 0;
  const onRequest = request => { if (new URL(request.url()).pathname === '/api/matches/summary') summaryRequests++; };
  page.on('request', onRequest);
  try {
    for (const theme of ['light', 'dark']) for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(mode => localStorage.setItem('goal-hint-theme', mode), theme);
      summaryRequests = 0;
      await page.goto(`${origin}/en/matches`, { waitUntil: 'commit' });
      const summary = page.locator('[data-performance-summary="matches"]').first();
      await summary.waitFor({ state: 'visible' });
      await page.waitForFunction(mode => document.querySelector('meta[name="color-scheme"]')?.content === mode, theme);
      await page.evaluate(() => document.fonts.ready);
      assert(await summary.getAttribute('aria-busy') === 'true', `${theme}/${width}: summary must render while pending`);
      assert((await summary.textContent()).includes('Won'), 'Pending summaries retain outcome labels');
      const height = await summary.evaluate(element => element.getBoundingClientRect().height);
      const background = await summary.evaluate(element => getComputedStyle(element).backgroundColor);
      if (width === 390) await page.screenshot({ path: `output/playwright/loading-matches-${theme}.png` });
      await page.locator('[data-feed-performance-state="ready"]').waitFor();
      const readyHeight = await summary.evaluate(element => element.getBoundingClientRect().height);
      assert(Math.abs(readyHeight - height) < 1, `${theme}/${width}: summary height changed (${height} → ${readyHeight})`);
      assert(await summary.evaluate(element => getComputedStyle(element).backgroundColor) === background, `${theme}/${width}: loading colors differ from the selected theme`);
      assert(summaryRequests === 0, 'The streamed summary must not trigger an immediate duplicate API read');
      assert(await summary.locator('[data-summary-count="all"]').innerText() === '55'
        && await page.locator('[data-fixture-id]').count() === 50, 'Performance includes the complete cohort across pages');
      assert(await summary.locator('[data-summary-result="won"]').getAttribute('aria-label') === 'Won: 10', 'Audited figures must replace unknown counts');
      assert(await page.evaluate(() => document.querySelectorAll('main').length === 1 && document.documentElement.scrollWidth <= innerWidth), `${theme}/${width}: landmark or viewport overflow`);
      if (width === 390 || width === 1440) await page.screenshot({ path: `output/playwright/ready-matches-${theme}-${width}.png` });
      results.push({ screen: 'matches', theme, width, stableSummaryHeight: height, duplicateSummaryRequests: summaryRequests });

      await page.goto(`${origin}/en/performance?stream=1`, { waitUntil: 'commit' });
      await page.locator('[data-performance-dashboard]').waitFor({ state: 'visible' });
      assert(await page.locator('#individual-performance').isVisible(), 'Prediction heading must render immediately');
      assert(await page.locator('#published-performance').isVisible(), 'Publication heading must render immediately');
      assert(await page.locator('#league-performance').isVisible(), 'League heading must render immediately');
      await page.locator('[data-published-slip]').first().waitFor();
      assert(await page.locator('[data-prediction-performance]').count() === 0, 'The faster publication report must render independently');
      await page.locator('[data-prediction-performance]').first().waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme}/${width}: performance overflow`);
      if (width === 390 || width === 1440) await page.screenshot({ path: `output/playwright/ready-performance-${theme}-${width}.png` });
      results.push({ screen: 'performance', theme, width, independentReports: true });
    }
    for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width: 390, height: 900 });
      await page.evaluate(mode => localStorage.setItem('goal-hint-theme', mode), theme);
      await page.goto(`${origin}/en`, { waitUntil: 'commit' });
      await page.locator('[data-best-slips-loading]').waitFor({ state: 'visible' });
      await page.waitForFunction(mode => document.querySelector('meta[name="color-scheme"]')?.content === mode, theme);
      const artwork = await page.locator('[data-best-slips-loading] [data-header-brand]').evaluate(element => getComputedStyle(element).content);
      assert(artwork.includes(theme === 'dark' ? 'inverse.svg' : 'primary.svg'), 'Pending header artwork must follow the selected theme');
      assert(await page.locator('[data-best-slips-loading] [data-slip-result="won"]').count() === 1, 'Homepage filters must render while its read is pending');
      await page.screenshot({ path: `output/playwright/loading-home-${theme}.png` });
      await page.locator('[data-best-slips-page]').waitFor({ state: 'visible' });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Homepage viewport overflow');
      results.push({ screen: 'home', theme, width: 390, immediateFilters: true });
    }
    summaryRequests = 0;
    await page.goto(`${origin}/en/matches?fail=1`);
    await page.locator('[data-feed-performance-state="unavailable"]').waitFor();
    assert(await page.locator('[data-performance-summary="matches"] [data-summary-result="won"]').isDisabled(), 'Unknown result counts cannot be selected');
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await page.locator('[data-feed-performance-state="ready"]').waitFor();
    assert(summaryRequests === 1, 'A failed server summary retries exactly once through the current endpoint');
    results.push({ screen: 'matches', retry: true, requests: summaryRequests });
    assert(failures.length === 0, failures.join('\n'));
    return { passed: results.length, results, hydrationErrors: failures };
  } finally {
    page.off('pageerror', onError); page.off('console', onConsole); page.off('request', onRequest);
  }
}
