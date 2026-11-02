import assert from 'node:assert/strict';

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
