import assert from 'node:assert/strict';

/** Check real desktop access targets, their geometry and unchanged authorized metrics. */
export async function verifyDesktopPredictionAccess(page, {
  signedIn = false, expectedLocked, expectedUnlocked, expectedOdds = [], expectedProbabilities = [],
} = {}) {
  const rows = page.locator('[data-desktop-row]');
  assert.ok(await rows.count(), 'Desktop match rows are rendered.');
  const cards = [];
  for (const row of await rows.all()) {
    if (!await row.isVisible()) continue;
    await row.scrollIntoViewIfNeeded();
    cards.push(await row.evaluate((element) => {
      const visible = (node) => Boolean(node?.getClientRects().length);
      const area = element.querySelector('[data-row-unlock]');
      const button = area?.querySelector('a[data-unlock-button]');
      const areaBounds = area?.getBoundingClientRect(), buttonBounds = button?.getBoundingClientRect();
      const teams = element.querySelector('[data-row-teams]')?.getBoundingClientRect();
      const status = element.querySelector('[data-row-status]')?.getBoundingClientRect();
      const hit = buttonBounds ? document.elementFromPoint(buttonBounds.left + buttonBounds.width / 2,
        buttonBounds.top + buttonBounds.height / 2) : null;
      const gap = parseFloat(getComputedStyle(element).columnGap);
      const metrics = ['market', 'odds', 'probability'].map((name) => element.querySelector(`[data-row-${name}]`));
      const slip = element.closest('[data-locked-slip]');
      const headerButton = slip?.querySelector('[data-slip-header-action] a[data-unlock-button]');
      return {
        locked: Boolean(area), pickState: element.getAttribute('data-pick-state'),
        label: button?.textContent.trim(), href: button?.getAttribute('href'), inSlip: Boolean(slip), headerHref: headerButton?.getAttribute('href'),
        buttons: area?.querySelectorAll('a, button').length,
        decorativeIcon: button?.querySelector('svg')?.getAttribute('aria-hidden') === 'true',
        fillsArea: Boolean(areaBounds && buttonBounds && Math.abs(areaBounds.width - buttonBounds.width) < 1),
        spansMetrics: Boolean(areaBounds && teams && status && Math.abs(areaBounds.left - teams.right - gap) < 1
          && Math.abs(status.left - areaBounds.right - gap) < 1),
        controlHeight: Boolean(buttonBounds && buttonBounds.height >= parseFloat(getComputedStyle(button).getPropertyValue('--form-control-height'))),
        receivesPointer: Boolean(button && hit && button.contains(hit)),
        rowOverlay: Boolean(element.querySelector('[data-row-analysis]')),
        metricCount: metrics.filter(Boolean).length, visibleMetrics: metrics.every(visible),
        odds: metrics[1]?.textContent, probability: metrics[2]?.textContent,
        publicFields: ['date', 'time', 'country', 'league', 'teams', 'status'].every((name) => visible(element.querySelector(`[data-row-${name}]`))),
        visibleTeams: ['home', 'away'].every((side) => visible(element.querySelector(`[data-${side}]`))),
        validDescriptions: (element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean).every((id) => Boolean(document.getElementById(id))),
      };
    }));
  }
  assert.ok(cards.length, 'At least one desktop row is visible.');
  const locked = cards.filter((card) => card.locked), unlocked = cards.filter((card) => !card.locked);
  if (expectedLocked !== undefined) assert.equal(locked.length, expectedLocked, 'Expected locked desktop rows.');
  if (expectedUnlocked !== undefined) assert.equal(unlocked.length, expectedUnlocked, 'Expected authorized desktop rows.');
  for (const card of cards) {
    assert.ok(card.publicFields && card.visibleTeams, 'Date, time, competition, teams and status stay visible.');
    assert.ok(card.validDescriptions, 'Row descriptions never reference removed prediction fields.');
  }
  for (const card of locked) {
    assert.equal(card.buttons, 1, 'One access target replaces the protected metrics.');
    assert.equal(card.label, 'Unlock prediction');
    assert.ok(card.decorativeIcon, 'A decorative lock icon accompanies the accessible button text.');
    assert.equal(card.metricCount, 0, 'Market, odds and probability are replaced, including placeholders.');
    assert.ok(card.fillsArea && card.spansMetrics, 'The access target fills the former three-column region.');
    assert.ok(card.controlHeight, 'The access target preserves shared control height.');
    assert.ok(card.receivesPointer && !card.rowOverlay, 'No card or slip overlay intercepts the access target.');
    const target = new URL(card.href, 'https://example.test');
    assert.equal(target.pathname, signedIn ? '/en/subscribe' : '/en/account');
    if (!signedIn) assert.equal(target.searchParams.get('view'), 'register');
    const returnTo = target.searchParams.get('return');
    assert.ok(returnTo?.startsWith(card.inSlip ? '/en/best-slips/' : '/en/matches/'), 'Access retains the original match or slip return destination.');
    if (card.inSlip) assert.equal(card.href, card.headerHref, 'Slip row access retains the header return destination.');
  }
  for (const card of unlocked) assert.ok(card.metricCount === 3 && card.visibleMetrics, 'Authorized rows retain all three prediction fields.');
  for (const value of expectedOdds) assert.ok(unlocked.some((card) => card.odds.includes(value)), `Authorized odds ${value} remain visible.`);
  for (const value of expectedProbabilities) assert.ok(unlocked.some((card) => card.probability.includes(value)), `Authorized probability ${value} remains visible.`);
  return { locked: locked.length, unlocked: unlocked.length };
}

/** Browser acceptance for the mobile-only access surface and intrinsic slip-header action slot. */
export async function verifyMobilePredictionAccess(page, { signedIn = false } = {}) {
  const cards = await page.locator('article[data-mobile-locked]').evaluateAll((elements) => elements.map((card) => {
    const area = card.querySelector('[data-mobile-unlock-area]');
    const button = area?.querySelector('a');
    const areaBounds = area?.getBoundingClientRect(), buttonBounds = button?.getBoundingClientRect();
    const visible = (element) => Boolean(element.getClientRects().length);
    return {
      label: button?.textContent.trim(), href: button?.getAttribute('href'),
      fillsArea: areaBounds && buttonBounds && Math.abs(areaBounds.width - buttonBounds.width) < 1
        && Math.abs(areaBounds.height - buttonBounds.height) < 1,
      controlHeight: buttonBounds && buttonBounds.height >= parseFloat(getComputedStyle(button).getPropertyValue('--form-control-height')),
      visibleTeams: [...card.querySelectorAll('[data-ledger-home], [data-ledger-away]')].filter(visible).length,
      hiddenFields: [...card.querySelectorAll('[data-ledger-facts], [data-score], [data-score-home], [data-score-away], [data-match-open]')].every((field) => !visible(field)),
    };
  }));
  for (const card of cards) {
    assert.equal(card.label, signedIn ? 'Subscribe to unlock' : 'Register / log in to unlock');
    assert.equal(new URL(card.href, 'https://example.test').pathname, signedIn ? '/en/subscribe' : '/en/account');
    assert.ok(card.fillsArea, 'The access button fills the protected region.');
    assert.ok(card.controlHeight, 'The access button retains the shared control height.');
    assert.equal(card.visibleTeams, 2, 'Both teams remain visible.');
    assert.ok(card.hiddenFields, 'Scores and prediction fields are hidden on locked mobile cards.');
  }
  const headers = await page.locator('[data-locked-slip] [data-mobile-slip-header]').evaluateAll((elements) => elements.map((header) => {
    const action = header.querySelector('[data-header-actions]'), status = header.querySelector('[data-header-status]');
    const a = action?.getBoundingClientRect(), b = status?.getBoundingClientRect();
    return Boolean(a && b && a.left >= b.right && action.querySelector('a[data-unlock-button]'));
  }));
  assert.ok(headers.every(Boolean), 'The slip action has its own track beside the status.');
  return { cards: cards.length, headers: headers.length };
}
