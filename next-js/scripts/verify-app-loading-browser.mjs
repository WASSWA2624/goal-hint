/** Verify the clean browser route separately from the server-rendered crawler fixture. */
export async function verifyBrowserMatches(page, origin) {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const summaryUrl = /\/api\/matches\/summary(?:\?|$)/u;
  const listUrl = /\/api\/matches\?/u;
  const results = [], errors = [];
  const recordError = error => errors.push(error.message);
  page.on('pageerror', recordError);
  try {
    await page.goto(origin);
    for (const theme of ['light', 'dark']) for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(mode => localStorage.setItem('goal-hint-theme', mode), theme);
      const updateGeneration = theme === 'dark' && width === 1440;
      const generation = 'b'.repeat(64);
      let releaseSummary, releaseList, summaryRequests = 0, listRequests = 0;
      const summaryGate = new Promise(resolve => { releaseSummary = resolve; });
      const listGate = new Promise(resolve => { releaseList = resolve; });
      const delaySummary = async route => {
        summaryRequests++;
        await summaryGate;
        if (!updateGeneration) return route.continue();
        const response = await route.fetch();
        const json = await response.json();
        await route.fulfill({ response, json: { ...json, paginationVersion: generation } });
      };
      const refreshList = async route => {
        listRequests++;
        await listGate;
        const response = await route.fetch();
        const json = await response.json();
        await route.fulfill({ response, json: { ...json, performanceVersion: generation } });
      };
      await page.route(summaryUrl, delaySummary);
      if (updateGeneration) await page.route(listUrl, refreshList);
      try {
        await page.goto(`${origin}/browser-matches`, { waitUntil: 'commit' });
        const progress = page.getByRole('progressbar', { name: /loading/i });
        await progress.waitFor({ state: 'visible' });
        assert(await page.locator('[data-feed-match-results]').count() === 0, 'The browser shell must precede the delayed list');
        await page.evaluate(() => { window.fixtureHeader = document.querySelector('header'); });
        const list = page.locator('[data-feed-match-results]'), summary = page.locator('[data-performance-summary="matches"]');
        const deferred = page.locator('[data-feed-performance-deferred="true"]');
        await list.waitFor();
        await deferred.waitFor();
        await progress.waitFor({ state: 'hidden' });
        await page.waitForFunction(mode => document.querySelector('meta[name="color-scheme"]')?.content === mode, theme);
        await page.evaluate(() => document.fonts.ready);
        assert(await list.locator('[data-fixture-id]').count() === 37, 'The accepted Pending rows must precede the audit');
        assert(await summary.getAttribute('aria-busy') === 'true', 'The cards must indicate the separate read');
        const before = await list.boundingBox();
        const height = (await summary.boundingBox()).height;
        await page.evaluate(() => { window.fixtureRow = document.querySelector('[data-fixture-id]'); });
        const refreshing = updateGeneration && page.waitForRequest(request => listUrl.test(request.url()));
        releaseSummary();
        if (refreshing) {
          await refreshing;
          assert(await deferred.isVisible() && await progress.count() === 0, 'An unconfirmed generation must stay hidden during a quiet observation');
          releaseList();
        }
        await page.locator('[data-feed-performance-state="ready"]').waitFor();
        assert(await summary.locator('[data-summary-result="won"]').getAttribute('aria-label') === 'Won: 10', 'The cards must show the verified period counts');
        assert(Math.abs((await summary.boundingBox()).height - height) < 1 && Math.abs((await list.boundingBox()).y - before.y) < 1,
          'The resolved counts must preserve the list position and card height');
        assert(await page.evaluate(() => window.fixtureHeader === document.querySelector('header')
          && window.fixtureRow === document.querySelector('[data-fixture-id]')), 'The shell and first accepted row must stay mounted');
        assert(summaryRequests === 1 && listRequests === Number(updateGeneration), 'The generation check must reuse the one verified audit');
        results.push({ theme, width, summaryRequests, listRequests, summaryHeight: height });
      } finally {
        releaseSummary();
        releaseList();
        await page.unroute(summaryUrl, delaySummary);
        if (updateGeneration) await page.unroute(listUrl, refreshList);
      }
    }
    await page.setViewportSize({ width: 390, height: 900 });
    const context = page.context(), cookie = 'synthetic-summary-generation';
    for (const [listGeneration, summaryGeneration, extraWins] of [['a', 'b', 1], ['b', 'c', 2]]) {
      let summaryRequests = 0, listRequests = 0;
      const observe = request => { if (listUrl.test(request.url())) listRequests++; };
      const newerSummary = async route => {
        summaryRequests++;
        const response = await route.fetch();
        const json = await response.json();
        const performance = { ...json.performance, won: json.performance.won + extraWins, pending: json.performance.pending - extraWins };
        await route.fulfill({ response, json: { ...json, performance, asOf: json.asOf + 5_000,
          access: { tier: 'free', signedIn: false }, performanceScope: '1'.repeat(64), paginationVersion: summaryGeneration.repeat(64) } });
      };
      await context.addCookies([{ name: cookie, value: listGeneration, url: origin }]);
      await page.route(summaryUrl, newerSummary);
      page.on('request', observe);
      try {
        await page.goto(`${origin}/browser-matches`, { waitUntil: 'commit' });
        const list = page.locator('[data-feed-match-results]');
        await list.waitFor();
        const accepted = await list.locator('[data-fixture-id]').count();
        const ready = page.locator('[data-feed-performance-state="ready"]');
        await ready.waitFor();
        assert(await ready.locator('[data-summary-result="won"]').getAttribute('aria-label') === `Won: ${10 + extraWins}`,
          'The newer verified guest observation must supply the counts');
        assert(summaryRequests === 1 && listRequests === 0 && await list.locator('[data-fixture-id]').count() === accepted,
          'A newer verified guest observation must complete without advancing the list generation');
        results.push({ width: 390, summaryRequests, listRequests, accepted, newerGuestSummary: true });
      } finally {
        page.off('request', observe);
        await page.unroute(summaryUrl, newerSummary);
        await context.clearCookies({ name: cookie });
      }
    }
    assert(errors.length === 0, errors.join('\n'));
    return results;
  } finally {
    page.off('pageerror', recordError);
  }
}

/** Drive real Next navigation while the authorized archive endpoint cannot finish. */
export async function verifyBestSlipsNavigation(page, origin) {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  const onError = error => errors.push(error.message);
  const archive = url => url.pathname === '/api/best-slips';
  const screen = page.locator('[data-best-slips-page]');
  const headerIsStable = () => page.evaluate(() => window.fixtureArchiveHeader instanceof HTMLElement
    && window.fixtureArchiveHeader === document.querySelector('[data-app-header]'));
  page.on('pageerror', onError);
  try {
    await page.goto(origin);
    const results = [];
    for (const { theme, width, fail } of [{ theme: 'light', width: 390, fail: false }, { theme: 'dark', width: 1440, fail: true }]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(mode => localStorage.setItem('goal-hint-theme', mode), theme);
      await page.goto(`${origin}/en/matches`);
      await page.waitForFunction(mode => document.querySelector('meta[name="color-scheme"]')?.content === mode, theme);
      await page.evaluate(() => { window.fixtureArchiveHeader = document.querySelector('[data-app-header]'); });
      const requests = [];
      const { promise: held, resolve: release } = Promise.withResolvers();
      let scheduled;
      const intercept = route => {
        requests.push(new URL(route.request().url()).search);
        if (requests.length !== 1) return route.continue();
        scheduled = held.then(() => fail ? route.fulfill({ status: 503, json: { error: 'unavailable' } }) : route.continue());
        return scheduled;
      };
      await page.route(archive, intercept);
      try {
        const navigation = page.locator('[data-responsive-navigation]:visible').first();
        const link = navigation.locator('a[data-nav-key="best-slips"]:visible').first();
        if (!await link.isVisible()) await navigation.locator('[data-nav-more] summary:visible').click();
        const started = performance.now();
        await Promise.all([page.waitForRequest(request => archive(new URL(request.url()))), link.click()]);
        await page.waitForURL(url => url.pathname === '/en/best-slips');
        const pending = screen.and(page.locator('[data-best-slips-initial-loading]'));
        await pending.waitFor();
        const shellMs = Math.round(performance.now() - started);
        assert(await headerIsStable(), 'Best Slips must commit in the existing document and keep the shared header');
        await pending.locator('[data-slip-result="won"]').waitFor();
        assert(await pending.getAttribute('aria-busy') === 'true',
          'The held archive displays its filter shell with a busy state');
        const pendingCounts = await pending.locator('[data-summary-count]').allTextContents();
        assert(pendingCounts.length > 0 && pendingCounts.every(count => count === '—')
          && await pending.locator('[data-slip-key], [role="alert"], [role="status"]').count() === 0,
          'A pending archive cannot claim results, empty coverage, or an error');
        const query = '?period=today&status=pending&page=1&oddsBand=1.5-5';
        assert(requests.length === 1 && requests[0] === query, 'Best Slips starts one exact request for its canonical cohort');
        release();
        if (fail) {
          const unavailable = screen.getByRole('alert');
          const retry = unavailable.getByRole('button', { name: 'Try again', exact: true });
          await retry.waitFor();
          assert(requests.length === 1 && await screen.locator('[data-slip-key]').count() === 0 && await headerIsStable(),
            'An unavailable archive keeps the header and waits for explicit retry');
          await retry.click();
        }
        const row = screen.locator('[data-slip-key="synthetic-archive-slip"]');
        await row.waitFor();
        assert(await pending.count() === 0 && await screen.getByRole('alert').count() === 0, 'Verified rows clear pending and failure feedback');
        assert(await screen.locator('[data-summary-count="pending"]').textContent() === '1', 'The archive shows its verified count with the row');
        assert(await headerIsStable(), 'The archive updates within the initial Best Slips document and shared header');
        assert(requests.length === (fail ? 2 : 1) && requests.every(request => request === query),
          'The archive uses one request per explicit attempt and keeps its exact query on retry');
        results.push({ screen: 'best-slips-navigation', theme, width, shellMs, requests: requests.length, retry: fail });
      } finally {
        release();
        await scheduled;
        await page.unroute(archive, intercept);
      }
    }
    assert(errors.length === 0, errors.join('\n'));
    return results;
  } finally {
    page.off('pageerror', onError);
  }
}

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
    results.push(...await verifyBestSlipsNavigation(page, origin));
    for (const theme of ['light', 'dark']) {
      await page.evaluate(mode => localStorage.setItem('goal-hint-theme', mode), theme);
      summaryRequests = 0;
      const summaryUrl = /\/api\/matches\/summary(?:\?|$)/u;
      await page.route(summaryUrl, route => route.fulfill({ status: 503, body: '{}' }), { times: 1 });
      await page.goto(`${origin}/en/matches?fail=1`);
      const scheduled = page.locator('[data-feed-summary-retry="true"]');
      await scheduled.waitFor();
      assert(await scheduled.locator('[data-performance-summary="matches"]').getAttribute('aria-busy') === 'true',
        'The same summary cards stay busy until the initial automatic retry finishes');
      assert(await scheduled.locator('[data-performance-unavailable]').count() === 0, 'A scheduled recovery must not flash unavailable feedback');
      await page.locator('[data-feed-performance-state="unavailable"]').waitFor();
      await page.waitForFunction(mode => document.querySelector('meta[name="color-scheme"]')?.content === mode, theme);
      const progress = page.getByRole('progressbar', { name: /loading/i });
      await progress.waitFor({ state: 'hidden' });
      assert(await page.locator('[data-performance-summary="matches"] [data-summary-result="won"]').isDisabled(), 'Unknown result counts cannot be selected');
      let release, resumed;
      const hold = new Promise(resolve => { release = resolve; });
      const delay = route => { resumed = hold.then(() => route.continue()); return resumed; };
      await page.route(summaryUrl, delay);
      try {
        await page.getByRole('button', { name: 'Try again', exact: true }).click();
        await progress.waitFor({ state: 'visible' });
        assert(await page.locator('[data-feed-performance-state="loading"]').isVisible(), 'An explicit retry marks the summary busy');
        assert(await page.getByRole('button', { name: 'Try again', exact: true }).isDisabled(), 'The retry stays visible and cannot be submitted twice');
      } finally {
        release();
        await resumed;
        await page.unroute(summaryUrl, delay);
      }
      await page.locator('[data-feed-performance-state="ready"]').waitFor();
      await progress.waitFor({ state: 'hidden' });
      assert(summaryRequests === 2, 'One automatic failure exposes one explicit retry through the current endpoint');
      results.push({ screen: 'matches', theme, retry: true, requests: summaryRequests });
    }
    await page.clock.install();
    const summaryUrl = /\/api\/matches\/summary(?:\?|$)/u;
    for (const theme of ['light', 'dark']) {
      await page.evaluate(mode => localStorage.setItem('goal-hint-theme', mode), theme);
      let attempts = 0;
      let release, resumed;
      const hold = new Promise(resolve => { release = resolve; });
      const failOnce = async route => {
        if (++attempts === 1) await route.fulfill({ status: 503, headers: { 'Retry-After': '12' }, body: '{}' });
        else { await (resumed = hold.then(() => route.continue())); }
      };
      await page.route(summaryUrl, failOnce);
      try {
        const failed = page.waitForResponse(response => summaryUrl.test(response.url()) && response.status() === 503);
        await page.goto(`${origin}/browser-matches`);
        await failed;
        const scheduled = page.locator('[data-feed-summary-retry="true"]');
        await scheduled.waitFor();
        const rows = await page.locator('[data-fixture-id]').count();
        const footprint = (await scheduled.boundingBox()).height;
        assert(await scheduled.locator('[data-performance-unavailable]').count() === 0, 'Unavailable feedback stays hidden during the protected wait');
        await page.clock.fastForward(11_000);
        assert(attempts === 1, 'A transient summary failure must respect Retry-After');
        const started = page.waitForRequest(request => summaryUrl.test(request.url()));
        await page.clock.fastForward(2_000);
        await started;
        assert(await scheduled.isVisible(), 'The initial retry remains marked while its response is in flight');
        release();
        const ready = page.locator('[data-feed-performance-state="ready"]');
        await ready.waitFor();
        assert(Math.abs((await ready.boundingBox()).height - footprint) < 1, 'Recovering the summary must not resize the cards');
        assert(attempts === 2 && rows === await page.locator('[data-fixture-id]').count(), 'The same cohort auto-recovers without clearing the list');
        assert(await page.getByRole('progressbar', { name: /loading/i }).count() === 0, 'Automatic recovery stays quiet');
        results.push({ screen: 'matches', theme, automaticRetry: true, attempts, retainedRows: rows });
      } finally {
        release();
        await resumed;
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
