import assert from 'node:assert/strict';

/** Exercise the quiet retry through the real fixture GET before injecting a terminal failure. */
export async function verifyInitialMatchFeedRetry(page, origin) {
  const context = page.context(), requests = [], errors = [];
  const api = /\/api\/matches\?/u;
  const busy = page.locator('[data-feed-initial-retry="true"]');
  const terminal = page.locator('[data-feed-list-recovery]');
  const rows = page.locator('[data-feed-match-results] [data-fixture-id]');
  const progress = page.getByRole('progressbar', { name: /loading/i });
  const cookie = value => context.addCookies([{ name: 'synthetic-feed-unavailable', value, url: origin }]);
  const observe = request => { if (api.test(request.url())) requests.push(new URL(request.url())); };
  const recordError = error => errors.push(error.message);
  page.on('request', observe);
  page.on('pageerror', recordError);
  try {
    await cookie('1');
    const url = `${origin}/browser-matches?country=England&result=pending`;
    let release, handled;
    const held = new Promise(resolve => { release = resolve; });
    const delay = route => handled = held.then(() => route.continue());
    await page.route(api, delay, { times: 1 });
    const started = performance.now();
    let shellMs, scheduledMs, readMs, recoveredMs;
    try {
      await page.goto(url, { waitUntil: 'commit' });
      await progress.waitFor({ state: 'visible' });
      shellMs = Math.round(performance.now() - started);
      await page.evaluate(() => { window.initialRetryHeader = document.querySelector('header'); });
      await busy.waitFor();
      scheduledMs = Math.round(performance.now() - started);
      assert.equal(await busy.getAttribute('aria-busy'), 'true');
      assert.equal(await terminal.count(), 0);
      assert.equal(await rows.count(), 0);
      await page.waitForRequest(api);
      readMs = Math.round(performance.now() - started);
      await busy.waitFor();
      assert.equal(await terminal.count(), 0);
      assert.equal(await progress.isVisible(), false);
    } finally {
      release();
      await handled;
      await page.unroute(api, delay);
    }
    await rows.first().waitFor();
    recoveredMs = Math.round(performance.now() - started);
    await page.locator('[data-feed-performance-state="ready"]').waitFor();
    assert.equal(await rows.count(), 13);
    assert.equal(await busy.count(), 0);
    assert.equal(page.url(), url);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].searchParams.get('country'), 'England');
    assert.equal(requests[0].searchParams.get('result'), 'pending');
    assert.match(requests[0].searchParams.get('date'), /^\d{4}-\d{2}-\d{2}$/u);
    assert.ok(await page.evaluate(() => window.initialRetryHeader === document.querySelector('header')));

    await page.clock.install();
    for (const status of [503, 403]) {
      const count = requests.length;
      const failure = route => route.fulfill({ status, body: 'Synthetic fault' });
      await page.route(api, failure);
      try {
        await page.goto(`${origin}/browser-matches`);
        await busy.waitFor();
        const failed = page.waitForResponse(response => api.test(response.url()) && response.status() === status);
        await page.clock.fastForward(5_100);
        await failed;
        await terminal.waitFor();
        await busy.waitFor({ state: 'hidden' });
        assert.equal(await rows.count(), 0);
        await page.clock.fastForward(15_000);
        assert.equal(requests.length - count, 1);
      } finally { await page.unroute(api, failure); }
    }

    const beforeBypass = requests.length;
    await cookie('rate-limited');
    await page.goto(`${origin}/browser-matches`);
    await terminal.waitFor();
    assert.equal(await busy.count(), 0);
    await page.clock.fastForward(5_100);
    await cookie('coverage');
    await page.goto(`${origin}/browser-matches`);
    await page.locator('[data-feed-list-state="data-unavailable"]').waitFor();
    assert.equal(await busy.count(), 0);
    await page.clock.fastForward(5_100);
    assert.equal(requests.length, beforeBypass);
    assert.deepEqual(errors, []);
    return { shellMs, scheduledMs, readMs, recoveredMs, recoveredRows: 13, terminalStatuses: [503, 403], skipped: ['rate-limit', 'coverage'] };
  } finally {
    page.off('request', observe);
    page.off('pageerror', recordError);
    await context.clearCookies({ name: 'synthetic-feed-unavailable' });
  }
}

/** Run against the production-like app-loading fixture with an isolated Playwright page. */
export async function verifyMatchFeedRecovery(page, origin) {
  const context = page.context();
  const api = /\/api\/matches\?/u;
  const heading = name => page.getByRole('heading', { name, exact: true });
  const failure = page.locator('[data-feed-list-recovery]');
  const progress = page.getByRole('progressbar', { name: /loading/i });
  const rows = page.locator('[data-feed-match-results] [data-fixture-id]');
  const retry = failure.getByRole('link', { name: 'Try again', exact: true });
  const faultCookie = { name: 'synthetic-feed-unavailable', value: '1', url: origin };
  const requests = [];
  const observe = request => { if (api.test(request.url())) requests.push(new URL(request.url())); };
  page.on('request', observe);
  try {
    await page.clock.install();
    await page.goto(`${origin}/en/matches?result=all`);
    await rows.first().waitFor();
    await page.locator('[data-feed-performance-state="ready"]').waitFor();
    const count = await rows.count();
    assert.ok(count > 0);
    await rows.first().evaluate(row => { row.dataset.recoveryWitness = 'original'; });
    await context.addCookies([faultCookie]);
    await page.locator('[data-summary-result="won"]').click();
    await heading('Matches temporarily unavailable').waitFor();
    const url = page.url();
    assert.equal(new URL(url).searchParams.get('result'), 'won');
    assert.equal(await rows.count(), count);
    assert.equal(await rows.first().getAttribute('data-recovery-witness'), 'original');
    assert.equal(await page.getByRole('searchbox').count(), 1);
    await page.getByRole('searchbox').fill('Unsubmitted team');

    let release;
    const held = new Promise(resolve => { release = resolve; });
    let handled;
    const delay = route => handled = held.then(() => route.continue());
    await page.route(api, delay, { times: 1 });
    const beforeManual = requests.length;
    try {
      const requested = page.waitForRequest(api);
      await retry.evaluate(link => { link.click(); link.click(); });
      await requested;
      await progress.waitFor({ state: 'visible' });
      await failure.getByRole('link', { name: 'Trying again…' }).waitFor();
      assert.equal(await failure.getAttribute('aria-busy'), 'true');
      assert.equal(await rows.count(), count);
      await page.clock.fastForward(30_100);
      assert.equal(await failure.getAttribute('aria-busy'), 'true');
    } finally {
      release();
      await handled;
      await page.unroute(api, delay);
    }
    await failure.waitFor({ state: 'hidden' });
    await rows.first().waitFor();
    assert.equal(page.url(), url);
    assert.equal(requests.length - beforeManual, 1);
    assert.equal(requests.at(-1).searchParams.get('result'), 'won');
    assert.ok(await rows.count() < count);
    assert.equal(await page.getByRole('searchbox').inputValue(), 'Unsubmitted team');

    // The real browser's online/offline notifications drive actionable copy and a quiet retry.
    await page.goto(`${origin}/en/matches?result=lost`);
    await heading('Matches temporarily unavailable').waitFor();
    await context.setOffline(true);
    await heading('You’re offline').waitFor();
    await failure.getByText('Check your Wi-Fi or mobile data connection, then try again.').waitFor();
    const beforeReconnect = requests.length;
    await context.setOffline(false);
    await failure.waitFor({ state: 'hidden' });
    await rows.first().waitFor();
    assert.equal(requests.length - beforeReconnect, 1);
    assert.equal(requests.at(-1).searchParams.get('result'), 'lost');
    assert.equal(await progress.isVisible(), false);

    const unavailable = route => route.fulfill({ status: 503, body: 'Synthetic outage' });
    await page.route(api, unavailable);
    try {
      const attempts = () => requests.filter(url => url.searchParams.get('result') === 'void').length;
      const beforeAutomatic = attempts();
      const unavailableResponse = page.waitForResponse(response => api.test(response.url())
        && response.status() === 503 && new URL(response.url()).searchParams.get('result') === 'void');
      await page.goto(`${origin}/en/matches?result=void`);
      await heading('Matches temporarily unavailable').waitFor();
      await page.clock.fastForward(5_100);
      await unavailableResponse;
      await retry.waitFor();
      await page.clock.fastForward(15_000);
      await retry.waitFor();
      assert.equal(attempts() - beforeAutomatic, 1);
    } finally { await page.unroute(api, unavailable); }

    return { retainedRows: count, oneManualRead: true, oneReconnectRead: true, automaticFailureRemainsRetryable: true };
  } finally {
    page.off('request', observe);
    await context.setOffline(false);
    await context.clearCookies({ name: faultCookie.name });
  }
}
