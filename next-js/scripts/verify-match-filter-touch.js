/* eslint-disable @typescript-eslint/no-unused-vars -- Playwright CLI evaluates this function through run-code --filename. */
async function verifyMatchFilterTouch(page) {
  const origin = new URL(page.url()).origin, browser = page.context().browser();
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'America/New_York' });
  const phone = await context.newPage();
  try {
    await phone.goto(origin);
    await phone.evaluate(() => localStorage.setItem('goal-hint-theme', 'dark')); await phone.reload();
    const gallery = phone.locator('[data-date-gallery]');
    await gallery.locator('[data-date-time-input]').first().waitFor();
    await gallery.getByRole('button', { name: 'Choose date', exact: true }).first().tap();
    const picker = phone.getByRole('dialog', { name: 'Choose date', exact: true });
    await picker.getByRole('button', { name: 'Next Month', exact: true }).tap();
    assert(await picker.getByRole('listbox', { name: 'Day', exact: true }).getByRole('option', { selected: true }).innerText() === '28', 'Touch arrow clamps February');
    const month = picker.getByRole('listbox', { name: 'Month', exact: true });
    const before = await month.getByRole('option', { selected: true }).innerText(), bounds = await month.boundingBox();
    const cdp = await context.newCDPSession(phone), x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height * 0.75;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 6; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - step * 8 }] });
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await phone.waitForFunction(value => document.querySelector('[data-scroll-picker-column="Month"] [aria-selected="true"]')?.textContent !== value, before);
    const after = await month.getByRole('option', { selected: true }).innerText();
    await picker.getByRole('button', { name: 'Next Year', exact: true }).tap();
    assert(await picker.getByRole('listbox', { name: 'Year', exact: true }).getByRole('option', { selected: true }).innerText() === '2027', 'Touch year arrow advances one year');
    await picker.getByRole('button', { name: 'Use selection', exact: true }).tap();
    assert((await gallery.getByRole('textbox', { name: 'Report date', exact: true }).inputValue()).endsWith('-2027'), 'Touch selection commits');
    await phone.goto(`${origin}/en/matches?start=2026-11-04T09%3A00&end=2026-11-06T17%3A00&tz=Africa%2FKampala&picks=all`);
    await phone.locator('[data-criteria-dialog][data-enhanced="true"]').waitFor({ state: 'attached' });
    await phone.locator('[data-search-filters]').tap();
    const dialog = phone.getByRole('dialog', { name: 'Advanced Filters', exact: true });
    assert(await dialog.getByRole('textbox', { name: 'From', exact: true }).inputValue() === '04-NOV-2026 01:00', 'Applied interval prefills in detected New York device zone');
    const countries = dialog.locator('[data-searchable-select]').filter({ has: phone.getByRole('button', { name: /^Countries:/ }) });
    await countries.locator('[data-select-trigger]').tap(); await countries.getByRole('combobox').fill('E');
    await countries.getByRole('option', { name: 'Egypt', exact: true }).tap();
    assert(await countries.getByRole('option', { name: 'Egypt', exact: true }).getAttribute('aria-selected') === 'true', 'One tap selects Egypt');
    await phone.screenshot({ path: 'output/playwright/match-filters-touch-dark-390.png' });
    assert(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Touch layout fits viewport');
    return { touch: 'passed', monthBefore: before, monthAfter: after, controlHeight: await dialog.getByRole('textbox', { name: 'From', exact: true }).evaluate(node => node.getBoundingClientRect().height) };
  } finally { await context.close(); }
}
