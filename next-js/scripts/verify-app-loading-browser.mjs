/** Verify the clean browser route separately from the server-rendered crawler fixture. */
export async function verifyBrowserMatches(page, origin) {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const summaryUrl = /\/api\/matches\/summary(?:\?|$)/u;
  const listUrl = /\/api\/matches\?/u;
  const appScript = url => url.origin === origin && url.pathname.startsWith('/_next/static/') && url.pathname.endsWith('.js');
  const results = [], errors = [];
  const recordError = error => errors.push(error.message);
  page.on('pageerror', recordError);
  try {
    await page.goto(origin);
    for (const theme of ['light', 'dark']) for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(mode => localStorage.setItem('goal-hint-theme', mode), theme);
      const testPreload = theme === 'light' && width === 390;
      const updateGeneration = theme === 'dark' && width === 1440;
      const generation = 'b'.repeat(64);
      let releaseSummary, releaseList, summaryRequests = 0, listRequests = 0;
      const summaryGate = new Promise(resolve => { releaseSummary = resolve; });
      const listGate = new Promise(resolve => { releaseList = resolve; });
      const scripts = Promise.withResolvers();
      const holdScript = async route => { await scripts.promise; await route.continue(); };
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
      if (testPreload) await page.route(appScript, holdScript);
      if (updateGeneration) await page.route(listUrl, refreshList);
      try {
        await page.goto(`${origin}/browser-matches`, { waitUntil: 'commit' });
        const progress = page.getByRole('progressbar', { name: /loading/i });
        await progress.waitFor({ state: 'visible' });
        assert(await page.locator('[data-feed-match-results]').count() === 0, 'The browser shell must precede the delayed list');
        const list = page.locator('[data-feed-match-results]'), summary = page.locator('[data-performance-summary="matches"]');
        const deferred = page.locator('[data-feed-performance-deferred="true"]');
        await list.waitFor();
        if (testPreload) {
          await page.waitForFunction(() => document.querySelector('link[rel="preload"][as="fetch"][href^="/api/matches/summary?"]'));
          if (!summaryRequests) await page.waitForRequest(request => summaryUrl.test(request.url()), { timeout: 6000 });
          assert(summaryRequests === 1, 'The accepted list must start one summary request before app scripts load');
          scripts.resolve();
          await page.waitForLoadState('domcontentloaded');
        }
        await deferred.waitFor();
        await progress.waitFor({ state: 'hidden' });
        await page.waitForFunction(mode => document.querySelector('meta[name="color-scheme"]')?.content === mode, theme);
        if (width === 1440) await list.locator('[data-desktop-row]').first().waitFor();
        await page.evaluate(() => document.fonts.ready);
        assert(await list.locator('[data-fixture-id]').count() === 37, 'The accepted Pending rows must precede the audit');
        assert(await summary.getAttribute('aria-busy') === 'true', 'The cards must indicate the separate read');
        const before = await list.boundingBox();
        const height = (await summary.boundingBox()).height;
        await page.evaluate(() => {
          window.fixtureHeader = document.querySelector('header');
          window.fixtureRow = document.querySelector('[data-fixture-id]');
        });
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
        const stable = await page.evaluate(() => ({ header: window.fixtureHeader === document.querySelector('header'),
          row: window.fixtureRow === document.querySelector('[data-fixture-id]') }));
        assert(stable.header && stable.row, `The shell and first accepted row must stay mounted at ${width}px ${theme} (${JSON.stringify(stable)}${errors.length ? `, errors: ${errors.join('; ')}` : ''})`);
        assert(summaryRequests === 1 && listRequests === Number(updateGeneration), 'The generation check must reuse the one verified audit');
        results.push({ theme, width, summaryRequests, listRequests, summaryHeight: height });
      } finally {
        scripts.resolve();
        releaseSummary();
        releaseList();
        if (testPreload) await page.unroute(appScript, holdScript);
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
  const speculative = [];
  const observePrefetch = response => {
    const headers = response.request().headers();
    if (new URL(response.url()).pathname === '/en/best-slips'
      && (headers['next-router-prefetch'] || headers['next-router-segment-prefetch'])) {
      void response.text().then(body => speculative.push(body), () => {});
    }
  };
  const screen = page.locator('[data-best-slips-page]');
  const headerIsStable = () => page.evaluate(() => window.fixtureArchiveHeader instanceof HTMLElement
    && window.fixtureArchiveHeader === document.querySelector('[data-app-header]'));
  page.on('pageerror', onError);
  page.on('response', observePrefetch);
  const unavailableSeed = 'synthetic-best-slips-unavailable';
  try {
    await page.goto(origin);
    const results = [];
    for (const { theme, width, fail } of [{ theme: 'light', width: 390, fail: false }, { theme: 'dark', width: 1440, fail: true }]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(mode => localStorage.setItem('goal-hint-theme', mode), theme);
      if (fail) await page.context().addCookies([{ name: unavailableSeed, value: '1', url: origin }]);
      await page.goto(`${origin}/en/matches`);
      await page.waitForFunction(mode => document.querySelector('meta[name="color-scheme"]')?.content === mode, theme);
      await page.evaluate(() => { window.fixtureArchiveHeader = document.querySelector('[data-app-header]'); });
      const requests = [];
      const { promise: held, resolve: release } = Promise.withResolvers();
      const fallback = Promise.withResolvers();
      let scheduled;
      const intercept = route => {
        requests.push(new URL(route.request().url()).search);
        if (!fail || requests.length !== 1) return route.continue();
        fallback.resolve();
        scheduled = held.then(() => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
        return scheduled;
      };
      await page.route(archive, intercept);
      try {
        const navigation = page.locator('[data-responsive-navigation]:visible').first();
        const link = navigation.locator('a[data-nav-key="best-slips"]:visible').first();
        if (!await link.isVisible()) await navigation.locator('[data-nav-more] summary:visible').click();
        const started = performance.now();
        const firstRequest = fail
          ? page.waitForRequest(request => archive(new URL(request.url()))).catch(() => null) : null;
        await link.click();
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
        if (fail) {
          assert(await firstRequest, 'The unavailable server seed exhausts its read and starts the API fallback');
          await fallback.promise;
          assert(requests.length === 1 && requests[0] === query, 'The unavailable server seed starts one exact fallback request');
          release();
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
        assert(await screen.locator('[data-summary-count="pending"]').textContent() === '65', 'The archive shows its verified count with the row');
        assert(await headerIsStable(), 'The archive updates within the initial Best Slips document and shared header');
        assert(requests.length === (fail ? 2 : 0) && requests.every(request => request === query),
          'A verified server seed avoids the duplicate API read, and fallback keeps its exact query on retry');
        const readyMs = Math.round(performance.now() - started), initialRequests = requests.length;
        const load = screen.locator('[data-show-more]'), secondPage = url => archive(url) && url.searchParams.get('through') === '2';
        const next = Promise.withResolvers();
        const holdNext = async route => { await next.promise; await route.continue(); };
        await page.evaluate(() => { window.fixtureFirstSlip = document.querySelector('[data-slip-key]'); });
        await page.route(secondPage, holdNext);
        const moreStarted = performance.now();
        try {
          await Promise.all([page.waitForRequest(request => secondPage(new URL(request.url()))), load.click()]);
          await load.and(screen.locator('[aria-busy="true"]')).waitFor();
          const pendingMs = Math.round(performance.now() - moreStarted);
          assert(await screen.locator('[data-slip-key]').count() === 20, 'Show More keeps the accepted first archive page visible');
          next.resolve();
          await screen.locator('[data-slip-key="synthetic-archive-slip-40"]').waitFor();
          const unique = await screen.locator('[data-slip-key]').evaluateAll(rows => new Set(rows.map(row => row.dataset.slipKey)).size);
          assert(unique === 40 && await screen.locator('[data-summary-count="pending"]').textContent() === '65',
            'Show More appends a full page and preserves the period count');
          assert(await page.evaluate(() => window.fixtureFirstSlip === document.querySelector('[data-slip-key]')),
            'Appending the archive leaves the first rendered row mounted');
          results.push({ screen: 'best-slips-navigation', theme, width, shellMs, readyMs, initialRequests, retry: fail,
            loadMorePendingMs: pendingMs, loadMoreReadyMs: Math.round(performance.now() - moreStarted), rows: unique });
        } finally {
          next.resolve();
          await page.unroute(secondPage, holdNext);
        }
      } finally {
        release();
        await scheduled;
        await page.unroute(archive, intercept);
        await page.context().clearCookies({ name: unavailableSeed });
      }
    }
    assert(errors.length === 0, errors.join('\n'));
    assert(speculative.every(body => !body.includes('synthetic-archive-slip')), 'Speculative Best Slips prefetches may not stream an archive row');
    results.push({ screen: 'best-slips-prefetch', checkedFlightResponses: speculative.length });
    return results;
  } finally {
    page.off('pageerror', onError);
    page.off('response', observePrefetch);
  }
}

/** Exercise deep pagination, transient failure, an atomic rebase and guest history in both themes. */
export async function verifyMatchesContinuation(page, origin) {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const listEndpoint = url => url.pathname === '/api/matches';
  const matches = new URL('/en/matches?when=today&result=all', origin);
  const list = page.locator('[data-feed-match-results]');
  const rows = list.locator('[data-fixture-id]');
  const load = page.locator('[data-feed-pagination] [data-show-more]');
  const guest = 'synthetic-match-history-guest';
  const results = [];
  async function checkedSize(expected) {
    await page.waitForFunction(size => document.querySelectorAll('[data-feed-match-results] [data-fixture-id]').length === size, expected);
    const unique = await rows.evaluateAll(elements => new Set(elements.map(element => element.dataset.fixtureId)).size);
    assert(unique === expected, 'Loaded matches must have unique fixture IDs');
  }
  async function openSlips() {
    const navigation = page.locator('[data-responsive-navigation]:visible').first();
    const link = navigation.locator('a[data-nav-key="best-slips"]:visible').first();
    if (!await link.isVisible()) await navigation.locator('[data-nav-more] summary:visible').click();
    await link.click();
    await page.waitForURL(url => url.pathname === '/en/best-slips');
    await page.locator('[data-best-slips-page]').waitFor();
  }
  async function heldRead(action, check) {
    const calls = [], continuing = [], first = Promise.withResolvers(), release = Promise.withResolvers();
    const intercept = route => {
      calls.push(new URL(route.request().url()));
      first.resolve();
      const result = release.promise.then(() => route.continue());
      continuing.push(result);
      return result;
    };
    await page.route(listEndpoint, intercept);
    try {
      const started = performance.now();
      await Promise.all([action(), page.waitForRequest(request => listEndpoint(new URL(request.url()))), first.promise]);
      await check(calls, release.resolve, started);
    } finally {
      release.resolve();
      try { await Promise.all(continuing); }
      finally { await page.unroute(listEndpoint, intercept); }
    }
  }
  await page.context().addCookies([{ name: guest, value: '1', url: origin }]);
  try {
    for (const { theme, width } of [{ theme: 'light', width: 390 }, { theme: 'dark', width: 1440 }]) {
      await page.goto(origin);
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(mode => localStorage.setItem('goal-hint-theme', mode), theme);
      await page.goto(matches.href);
      await page.waitForFunction(mode => document.querySelector('meta[name="color-scheme"]')?.content === mode, theme);
      await page.waitForFunction(() => document.querySelectorAll('[data-feed-match-results] [data-fixture-id]').length === 50);
      await openSlips();
      await heldRead(() => page.goBack({ waitUntil: 'commit' }), async (calls, release) => {
        assert(calls.length === 1 && (calls[0].searchParams.get('page') ?? '1') === '1' && !calls[0].searchParams.has('through'),
          'The return quietly requests one current list page');
        assert(await rows.count() === 50 && await list.getAttribute('aria-busy') !== 'true',
          'An older snapshot of the same guest page remains usable while its history refresh is held');
        release();
        await page.waitForURL(matches.href);
      });
      await heldRead(() => load.click(), async (calls, release, started) => {
        await load.and(page.locator('[aria-busy="true"]')).waitFor();
        const pendingMs = Math.round(performance.now() - started);
        assert(await rows.count() === 50, 'Show More keeps the accepted first Matches page visible');
        assert(calls.length === 1 && calls[0].searchParams.get('page') === '2' && calls[0].searchParams.has('prefix')
          && !calls[0].searchParams.has('through'), 'Show More starts one checked next-page request');
        release();
        await checkedSize(100);
        results.push({ screen: 'matches-continuation', theme, width, loadMorePendingMs: pendingMs,
          loadMoreReadyMs: Math.round(performance.now() - started), rows: 100, quietHistory: true });
      });
      await openSlips();
      await heldRead(() => page.goBack({ waitUntil: 'commit' }), async (calls, release) => {
        assert(calls.length === 1 && calls[0].searchParams.get('through') === '2',
          'The two-page history return restores the exact window with one request');
        release();
        await checkedSize(100);
      });
      for (const [next, expected, fault] of [[3, 150, 503], [4, 200, 409], [5, 250, 'connection'], [6, 293, null]]) {
        const calls = [];
        const continuation = url => listEndpoint(url) && (url.searchParams.get('through') === String(next)
          || url.searchParams.get('page') === String(next) && url.searchParams.has('prefix'));
        const intercept = route => {
          const url = new URL(route.request().url());
          calls.push(url.searchParams.has('prefix') ? 'page' : 'rebase');
          if (fault === 'connection' && calls.length <= 2) return route.abort();
          if (typeof fault === 'number' && calls.length === 1) return route.fulfill({ status: fault, json: { error: 'test' },
            headers: { 'Retry-After': '0' } });
          return route.continue();
        };
        await page.route(continuation, intercept);
        try {
          const started = performance.now();
          await load.click();
          if (fault === 'connection') {
            await page.locator('[data-feed-pagination] [data-show-more-status]').waitFor();
            await checkedSize(expected - 50);
            await load.click();
          }
          await checkedSize(expected);
          const sequence = fault === 503 ? ['page', 'page'] : fault === 409 ? ['page', 'rebase']
            : fault === 'connection' ? ['page', 'page', 'page'] : ['page'];
          assert(JSON.stringify(calls) === JSON.stringify(sequence), `Page ${next} must read ${sequence.join(', ')} exactly`);
          results.push({ screen: 'matches-deep-continuation', theme, width, rows: expected, requests: calls.length,
            fault, loadMoreReadyMs: Math.round(performance.now() - started) });
        } finally { await page.unroute(continuation, intercept); }
      }
      assert(!await load.isVisible(), 'No continuation control remains after the verified final page');
    }
    return results;
  } finally {
    await page.context().clearCookies({ name: guest });
  }
}

/** Exercise a direct archive read that fails before the browser can recover it. */
export async function verifyColdBestSlipsRetry(page, origin) {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [], results = [];
  const onError = error => errors.push(error.message);
  const archive = url => url.origin === origin && url.pathname === '/api/best-slips';
  const archiveRequest = request => request.method() === 'GET' && archive(new URL(request.url()));
  const query = '?period=today&status=pending&page=1&oddsBand=1.5-5';
  const cookie = 'synthetic-best-slips-unavailable';
  const unavailableTitle = 'Slips could not be loaded. Please try again.';
  const screen = page.locator('[data-best-slips-page]');
  page.on('pageerror', onError);
  await page.context().addCookies([{ name: cookie, value: '1', url: origin }]);
  try {
    await page.goto(origin);
    for (const { theme, width } of [{ theme: 'light', width: 390 }, { theme: 'dark', width: 1440 }]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(mode => localStorage.setItem('goal-hint-theme', mode), theme);
      const requests = [];
      const manualStarted = Promise.withResolvers();
      const release = Promise.withResolvers();
      let quietFlight, manualFlight;
      const intercept = route => {
        requests.push(new URL(route.request().url()).search);
        if (requests.length === 1) {
          // Keep the quiet fallback pending until the explicit retry replaces it.
          quietFlight = manualStarted.promise.then(() => route.abort()).catch(() => {});
          return quietFlight;
        }
        if (requests.length !== 2) return route.continue();
        manualStarted.resolve();
        manualFlight = release.promise.then(() => route.continue());
        return manualFlight;
      };
      await page.route(archive, intercept);
      try {
        const [document] = await Promise.all([
          page.goto(origin + '/en/best-slips', { waitUntil: 'commit' }),
          page.waitForRequest(archiveRequest),
        ]);
        const alert = screen.getByRole('alert');
        await alert.getByRole('heading', { name: unavailableTitle, exact: true }).waitFor();
        assert(document?.ok() && (await document.text()).includes(unavailableTitle),
          'The direct Best Slips document must contain the archive failure');
        await page.waitForFunction(mode => document.querySelector('meta[name="color-scheme"]')?.content === mode, theme);
        const timeOrigin = await page.evaluate(() => {
          window.fixtureColdArchiveHeader = document.querySelector('[data-app-header]');
          return performance.timeOrigin;
        });
        const sameDocumentAndHeader = () => page.evaluate(start => performance.timeOrigin === start
          && window.fixtureColdArchiveHeader instanceof HTMLElement
          && window.fixtureColdArchiveHeader === document.querySelector('[data-app-header]'), timeOrigin);

        await Promise.all([
          page.waitForRequest(archiveRequest),
          alert.getByRole('button', { name: 'Try again', exact: true }).click(),
        ]);
        const pending = screen.and(page.locator('[data-best-slips-initial-loading][aria-busy="true"]'));
        await pending.locator('[data-best-slips-filter-trigger]').waitFor({ timeout: 5000 });
        await alert.waitFor({ state: 'hidden' });
        assert(await sameDocumentAndHeader(), 'A cold archive retry must preserve the document and shared header');
        assert(await pending.locator('[data-slip-key], [role="status"]').count() === 0,
          'A pending cold archive retry must not report results or empty coverage');

        const response = page.waitForResponse(value => archiveRequest(value.request()) && value.status() === 200);
        release.resolve();
        await response;
        await screen.locator('[data-slip-key="synthetic-archive-slip"]').waitFor();
        assert(await pending.count() === 0 && await alert.count() === 0, 'The recovered archive must clear pending and error feedback');
        assert(await screen.locator('[data-summary-count="pending"]').textContent() === '65', 'The recovered archive must show its actual count');
        assert(await sameDocumentAndHeader(), 'The recovered archive must not reload or remount shared navigation');
        assert(requests.length === 2 && requests.every(request => request === query),
          'The quiet fallback and manual retry must request the same canonical cohort once each');
        results.push({ screen: 'cold-best-slips-retry', theme, width, requests: requests.length });
      } finally {
        manualStarted.resolve();
        release.resolve();
        await Promise.all([quietFlight, manualFlight]);
        await page.unroute(archive, intercept);
      }
    }
    assert(errors.length === 0, errors.join('\n'));
    return results;
  } finally {
    await page.context().clearCookies({ name: cookie });
    page.off('pageerror', onError);
  }
}

/** Settle slips between requests and verify a single coherent numbered window. */
export async function verifyBestSlipsContinuation(page, origin) {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const cookie = "synthetic-best-slips-epoch", results = [];
  const screen = page.locator("[data-best-slips-page]");
  const load = screen.locator("[data-show-more]");
  const validSlips = () => screen.locator("[data-slip-key]").evaluateAll(rows => rows.map(row => row.dataset.slipKey));
  const pending = () => screen.locator('[data-summary-count="pending"]').textContent();
  const windowAt = through => url => url.origin === origin && url.pathname === "/api/best-slips" && url.searchParams.get("through") === String(through);
  const epoch = value => page.context().addCookies([{ name: cookie, value, url: origin }]);
  const readWindow = async (through) => {
    const [response] = await Promise.all([page.waitForResponse(value => windowAt(through)(new URL(value.url()))), load.click()]);
    assert(response.ok(), "The numbered window must be available");
    return response.json();
  };
  try {
    for (const { theme, width } of [{ theme: "light", width: 390 }, { theme: "dark", width: 1440 }]) {
      await page.setViewportSize({ width, height: 900 });
      await page.context().clearCookies({ name: cookie });
      await page.goto(origin + "/en/best-slips");
      await page.evaluate(value => localStorage.setItem("goal-hint-theme", value), theme);
      await page.reload();
      await page.waitForFunction(value => document.querySelector('meta[name="color-scheme"]')?.content === value, theme);
      await load.waitFor();
      const original = await validSlips();
      assert(original.length === 20 && await pending() === "65", "The active period starts with 20 visible slips and ready counts");
      await page.route(windowAt(2), route => route.fulfill({ status: 503, json: { error: "unavailable" } }), { times: 1 });
      await load.click();
      await screen.getByRole("button", { name: "Try again", exact: true }).waitFor();
      assert(JSON.stringify(await validSlips()) === JSON.stringify(original) && await pending() === "65",
        "A failed append keeps the accepted slips and performance counts");
      const stableAt = performance.now(), stable = await readWindow(2);
      await screen.locator('[data-slip-key="synthetic-archive-slip-40"]').waitFor();
      assert(stable.reusedPrefix && stable.pages.length === 1 && (await validSlips()).length === 40,
        "An unchanged archive sends only the next page");
      const stableMs = Math.round(performance.now() - stableAt);
      await epoch("settled");
      const settledAt = performance.now(), settled = await readWindow(3);
      await screen.locator('[data-slip-key="synthetic-archive-slip-64"]').waitFor();
      const updated = await validSlips();
      assert(!settled.reusedPrefix && settled.pages.length === 3 && updated.length === 60 && new Set(updated).size === 60
        && updated[0] === "synthetic-archive-slip-5" && await pending() === "61",
      "A live settlement rebases in one request with unique rows and fresh counts");
      const settledMs = Math.round(performance.now() - settledAt);
      await page.context().clearCookies({ name: cookie });
      await page.reload();
      await load.waitFor();
      await epoch("shrink");
      const shrunk = await readWindow(2);
      await load.waitFor({ state: "hidden" });
      assert(!shrunk.reusedPrefix && shrunk.pages.length === 1 && (await validSlips()).length === 15 && await pending() === "15",
        "A continuation that reaches the new end presents the full current result");
      results.push({ theme, width, stableMs, settledMs, stableRows: 40, rebasedRows: 60, terminalRows: 15 });
    }
    return results;
  } finally { await page.context().clearCookies({ name: cookie }); }
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
    results.push(...await verifyMatchesContinuation(page, origin));
    results.push(...await verifyColdBestSlipsRetry(page, origin));
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
