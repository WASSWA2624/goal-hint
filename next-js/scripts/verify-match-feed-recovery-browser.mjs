import assert from 'node:assert/strict';

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
