import assert from 'node:assert/strict';

const agents = {
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
  android: 'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36',
};

/** Real download screen acceptance in an isolated browser context; no account changes. */
export async function verifyAppDownloadScreen(browser, origin, { theme = 'light', width = 1440, platform = 'windows' } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 960 }, userAgent: agents[platform],
    colorScheme: theme, isMobile: platform === 'android', hasTouch: platform === 'android', acceptDownloads: true });
  try {
    await context.addInitScript(mode => localStorage.setItem('goal-hint-theme', mode), theme);
    const page = await context.newPage();
    await page.bringToFront();
    await page.goto(`${origin}/en/download`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.locator('meta[name="goal-hint-appearance"]').waitFor({ state: 'attached', timeout: 120000 });
    const installer = page.locator('[data-app-installer]');
    await installer.waitFor({ timeout: 120000 });
    assert.equal(await page.locator(`[data-download-platform="${platform}"]`).getAttribute('aria-pressed'), 'true');
    assert.match(await installer.getAttribute('href'), new RegExp(`/api/downloads/${platform}\\?version=`));
    const geometry = await page.evaluate(() => {
      const header = document.querySelector('[data-header-download]'), login = document.querySelector('[data-header-auth="login"]');
      const a = header.getBoundingClientRect(), b = login.getBoundingClientRect();
      const card = document.querySelector('[data-download-page]').getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth > innerWidth + 1, cardWidth: card.width,
        aligned: a.right <= b.left + 1 && Math.abs(a.top - b.top) < 1,
        labelHidden: getComputedStyle(header.querySelector('span')).display === 'none',
        foreground: getComputedStyle(document.body).color, background: getComputedStyle(document.body).backgroundColor };
    });
    assert.equal(geometry.overflow, false); assert.equal(geometry.aligned, true);
    assert.equal(geometry.labelHidden, width < 1024);
    assert.ok(geometry.cardWidth <= 480 + 1, 'The page stays within the shared compact-form width.');
    assert.equal(await page.locator('#app-download-invitation[open]').count(), 0);
    const other = platform === 'android' ? 'windows' : 'android';
    await page.locator(`[data-download-platform="${other}"]`).click();
    await page.waitForFunction(expected => document.querySelector('[data-app-installer]')?.getAttribute('href')?.includes(`/api/downloads/${expected}?`), other);
    const downloadEvent = page.waitForEvent('download', { timeout: 90000 });
    await installer.click();
    const download = await downloadEvent;
    assert.ok(download.suggestedFilename().endsWith(other === 'android' ? '.apk' : '.exe'), `Unexpected ${other} installer: ${download.suggestedFilename()}`);
    const memory = await page.evaluate(() => JSON.parse(localStorage.getItem('goalhint:app-downloads')));
    assert.ok(memory[`development:${other}`]?.acknowledged, `Download memory missing for ${other}: ${JSON.stringify(memory)}`);
    await download.cancel();
    return { theme, width, platform, ...geometry };
  } finally { await context.close(); }
}

/** Invitations persist, a new version can be offered, and current native hosts remain quiet. */
export async function verifyAppDownloadPrompts(browser, origin) {
  const probe = await browser.newContext();
  let catalog;
  try { catalog = await (await probe.request.get(`${origin}/api/downloads`)).json(); }
  finally { await probe.close(); }
  const release = catalog.releases.find(row => row.platform === 'windows');
  assert.ok(release);
  const context = await browser.newContext({ userAgent: agents.windows, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.bringToFront();
    await page.goto(`${origin}/en/help`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.locator('meta[name="goal-hint-appearance"]').waitFor({ state: 'attached', timeout: 120000 });
    const dialog = page.locator('#app-download-invitation[open]');
    await dialog.waitFor({ timeout: 30000 }).catch(error => { throw new Error(`Initial offer: ${error.message}`); });
    const bounds = await dialog.boundingBox(); assert.ok(bounds.width <= 390 && bounds.x >= 0);
    await dialog.getByRole('button', { name: 'Later', exact: true }).click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('meta[name="goal-hint-appearance"]').waitFor({ state: 'attached', timeout: 120000 });
    await page.waitForTimeout(3000);
    assert.equal(await dialog.count(), 0);
    // A later actual native release overrides the previous release's dismissal.
    await page.route('**/api/downloads', route => route.fulfill({ json: { ...catalog,
      releases: catalog.releases.map(row => row.platform === 'windows' ? { ...row, build: row.build + 1 } : row) } }));
    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await dialog.waitFor().catch(error => { throw new Error(`New release offer: ${error.message}`); });
    await dialog.getByRole('button', { name: 'I already have the app', exact: true }).click();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    assert.equal(await dialog.count(), 0);
  } finally { await context.close(); }

  for (const outdated of [false, true]) {
    const native = await browser.newContext({ userAgent: `${agents.windows} GoalHintNative/windows/${release.version}/${outdated ? release.build - 1 : release.build}/development` });
    try {
      const page = await native.newPage();
      await page.bringToFront();
      await page.goto(`${origin}/en/help`, { waitUntil: 'domcontentloaded' });
      await page.locator('meta[name="goal-hint-appearance"]').waitFor({ state: 'attached', timeout: 120000 });
      const offer = page.locator('#app-download-invitation[open]');
      if (outdated) {
        await offer.waitFor({ timeout: 30000 }).catch(error => { throw new Error(`Native update offer: ${error.message}`); });
        assert.equal(await offer.getByRole('heading').innerText(), 'Update available');
        assert.equal(await page.locator('[data-header-download]').getAttribute('aria-label'), 'Update available');
      } else {
        await page.waitForTimeout(3000);
        assert.equal(await offer.count(), 0); assert.equal(await page.locator('[data-header-download]').count(), 0);
      }
    } finally { await native.close(); }
  }
  return { dismissal: 'passed', newerRelease: 'passed', currentNative: 'passed', outdatedNative: 'passed' };
}
