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
    for (const theme of ['light', 'dark']) for (const width of [320, 360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(mode => localStorage.setItem('goal-hint-theme', mode), theme);
      summaryRequests = 0;
      await page.goto(`${origin}/en/matches`, { waitUntil: 'commit' });
      const summary = page.locator('[data-performance-summary="matches"]').first();
      await summary.waitFor({ state: 'visible' });
      await page.waitForFunction(mode => document.querySelector('meta[name="color-scheme"]')?.content === mode, theme);
      await page.evaluate(() => document.fonts.ready);
      assert(await summary.getAttribute('aria-busy') === 'true', `${theme}/${width}: summary must render while pending`);
      assert(await page.getByRole('progressbar', { name: /loading/i }).count() === 0, 'Streaming performance must keep the header progress quiet');
      assert((await summary.textContent()).includes('Won'), 'Pending summaries retain outcome labels');
      const height = await summary.evaluate(element => element.getBoundingClientRect().height);
      const background = await summary.evaluate(element => getComputedStyle(element).backgroundColor);
      if (width === 390) await page.screenshot({ path: `output/playwright/loading-matches-${theme}.png` });
      await page.locator('[data-feed-performance-state="ready"]').waitFor();
      await page.getByRole('progressbar', { name: /loading/i }).waitFor({ state: 'hidden' });
      const readyHeight = await summary.evaluate(element => element.getBoundingClientRect().height);
      assert(Math.abs(readyHeight - height) < 1, `${theme}/${width}: summary height changed (${height} → ${readyHeight})`);
      assert(await summary.evaluate(element => getComputedStyle(element).backgroundColor) === background, `${theme}/${width}: loading colors differ from the selected theme`);
      assert(summaryRequests === 0, 'The streamed summary must not trigger an immediate duplicate API read');
      assert(await summary.locator('[data-summary-count="all"]').textContent() === '55'
        && await page.locator('[data-fixture-id]').count() === 37, 'The full-period count stays at 55 while Pending shows 37 fixtures');
      assert(await summary.locator('[data-summary-result="pending"]').getAttribute('aria-pressed') === 'true', 'Matches starts on Pending');
      assert(await summary.locator('[data-summary-predicted], [data-summary-unavailable]').count() === 0, 'Coverage has no separate summary row');
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
      await page.goto(`${origin}/en/best-slips`, { waitUntil: 'commit' });
      await page.locator('[data-best-slips-loading]').waitFor({ state: 'visible' });
      assert(await page.getByRole('progressbar', { name: /loading/i }).count() === 1, 'Pending Best Slips uses one header progress bar');
      assert(await page.locator('[data-slip-skeleton]').count() === 0, 'Pending Best Slips has no separate skeleton');
      await page.waitForFunction(mode => document.querySelector('meta[name="color-scheme"]')?.content === mode, theme);
      const artwork = await page.locator('[data-best-slips-loading] [data-header-brand]').evaluate(element => getComputedStyle(element).content);
      assert(artwork.includes(theme === 'dark' ? 'inverse.svg' : 'primary.svg'), 'Pending header artwork must follow the selected theme');
      assert(await page.locator('[data-best-slips-loading] [data-slip-result="won"]').count() === 1, 'Homepage filters must render while its read is pending');
      await page.screenshot({ path: `output/playwright/loading-home-${theme}.png` });
      await page.locator('[data-best-slips-page]').waitFor({ state: 'visible' });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Homepage viewport overflow');
      results.push({ screen: 'home', theme, width: 390, immediateFilters: true });
    }
    for (const theme of ['light', 'dark']) {
      await page.evaluate(mode => localStorage.setItem('goal-hint-theme', mode), theme);
      summaryRequests = 0;
      await page.goto(`${origin}/en/matches?fail=1`);
      await page.locator('[data-feed-performance-state="unavailable"]').waitFor();
      await page.waitForFunction(mode => document.querySelector('meta[name="color-scheme"]')?.content === mode, theme);
      const progress = page.getByRole('progressbar', { name: /loading/i });
      await progress.waitFor({ state: 'hidden' });
      assert(await page.locator('[data-performance-summary="matches"] [data-summary-result="won"]').isDisabled(), 'Unknown result counts cannot be selected');
      let release;
      const hold = new Promise(resolve => { release = resolve; });
      const summaryUrl = /\/api\/matches\/summary(?:\?|$)/u;
      const delay = async route => { await hold; await route.continue(); };
      await page.route(summaryUrl, delay);
      try {
        await page.getByRole('button', { name: 'Try again', exact: true }).click();
        await progress.waitFor({ state: 'visible' });
        assert(await page.locator('[data-feed-performance-state="loading"]').isVisible(), 'An explicit retry marks the summary busy');
        assert(await page.getByRole('button', { name: 'Try again', exact: true }).isDisabled(), 'The retry stays visible and cannot be submitted twice');
      } finally {
        release();
        await page.unroute(summaryUrl, delay);
      }
      await page.locator('[data-feed-performance-state="ready"]').waitFor();
      await progress.waitFor({ state: 'hidden' });
      assert(summaryRequests === 1, 'A failed server summary retries exactly once through the current endpoint');
      results.push({ screen: 'matches', theme, retry: true, requests: summaryRequests });
    }
    await page.clock.install();
    const summaryUrl = /\/api\/matches\/summary(?:\?|$)/u;
    for (const theme of ['light', 'dark']) {
      await page.evaluate(mode => localStorage.setItem('goal-hint-theme', mode), theme);
      let attempts = 0;
      const failOnce = async route => {
        if (++attempts === 1) await route.fulfill({ status: 503, headers: { 'Retry-After': '12' }, body: '{}' });
        else await route.continue();
      };
      await page.route(summaryUrl, failOnce);
      try {
        await page.goto(`${origin}/en/matches?fail=1`);
        const unavailable = page.locator('[data-feed-performance-state="unavailable"]');
        const retry = unavailable.locator('[data-performance-retry]');
        await unavailable.waitFor();
        const rows = await page.locator('[data-fixture-id]').count();
        const failed = page.waitForResponse(response => summaryUrl.test(response.url()) && response.status() === 503);
        await retry.click();
        await failed;
        await unavailable.waitFor();
        await page.waitForFunction(() => document.querySelector('[data-performance-retry]')?.disabled);
        await page.clock.fastForward(11_000);
        assert(attempts === 1, 'A transient summary failure must respect Retry-After');
        await page.clock.fastForward(2_000);
        await page.locator('[data-feed-performance-state="ready"]').waitFor();
        assert(attempts === 2 && rows === await page.locator('[data-fixture-id]').count(), 'The same cohort auto-recovers without clearing the list');
        assert(await page.getByRole('progressbar', { name: /loading/i }).count() === 0, 'Automatic recovery stays quiet');
        results.push({ screen: 'matches', theme, automaticRetry: true, attempts, retainedRows: rows });
      } finally {
        await page.unroute(summaryUrl, failOnce);
      }
    }
    for (const theme of ['light', 'dark']) {
      await page.emulateMedia({ reducedMotion: theme === 'dark' ? 'reduce' : 'no-preference' });
      await page.evaluate(mode => localStorage.setItem('goal-hint-theme', mode), theme);
      await page.goto(`${origin}/en/matches`);
      await page.waitForFunction(mode => document.querySelector('meta[name="color-scheme"]')?.content === mode, theme);
      const progress = page.getByRole('progressbar', { name: /loading/i });
      const track = page.locator('[data-navigation-progress]:visible').first();
      const busy = page.locator('[data-feed-results]');
      const rows = page.locator('[data-fixture-id]');
      const count = await rows.count();
      await page.evaluate(() => document.querySelector('main').setAttribute('data-app-loading', ''));
      await progress.waitFor({ state: 'visible' });
      if (theme === 'dark') assert(await progress.evaluate(element => getComputedStyle(element).animationName) === 'none', 'Reduced motion keeps the loading segment static');
      // Finish the track deadline while leaving the moving segment alone.
      await track.evaluate(element => element.getAnimations().forEach(animation => animation.finish()));
      await progress.waitFor({ state: 'hidden' });
      await page.evaluate(() => document.querySelector('main').removeAttribute('data-app-loading'));

      let release, intercepted;
      const held = new Promise(resolve => { release = resolve; });
      const target = /\/en\/matches\?.*result=won/u;
      const delay = route => intercepted = held.then(() => route.continue());
      await page.route(target, delay, { times: 1 });
      try {
        const requestReady = page.waitForRequest(request => target.test(request.url()));
        await page.locator('[data-summary-result="won"]').click();
        await requestReady;
        await progress.waitFor({ state: 'visible' });
        assert(await busy.getAttribute('aria-busy') === 'true', 'A pending filter update marks the current list busy');
        await page.clock.fastForward(15_100);
        const retry = page.locator('[data-feed-navigation-retry] a');
        await retry.waitFor();
        await progress.waitFor({ state: 'hidden' });
        assert(await busy.getAttribute('aria-busy') === 'false' && await rows.count() === count, 'A stalled update restores the existing list and its controls');
        assert(target.test(new URL(await retry.getAttribute('href'), origin).href), 'Retry keeps the exact requested filter');
      } finally {
        release();
        await intercepted;
        await page.unroute(target, delay);
      }
      // A response that eventually arrives can still update the retained list.
      await page.waitForURL(target);
      results.push({ screen: 'matches', theme, boundedProgress: true, retainedRows: count });
    }
    assert(failures.length === 0, failures.join('\n'));
    return { passed: results.length, results, hydrationErrors: failures };
  } finally {
    await page.emulateMedia({ reducedMotion: null });
    page.off('pageerror', onError); page.off('console', onConsole); page.off('request', onRequest);
  }
}
