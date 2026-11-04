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
    const received = gallery.getByRole('textbox', { name: 'Received at', exact: true });
    await received.fill('31-JAN-2026 14:05');
    await gallery.getByRole('button', { name: 'Choose date and time', exact: true }).tap();
    const picker = phone.getByRole('dialog', { name: 'Choose date and time', exact: true });
    const aligned = await picker.locator('[data-scroll-picker-column]').evaluateAll(columns => {
      const positions = columns.map(column => column.getBoundingClientRect().top);
      return positions.length === 5 && Math.max(...positions) - Math.min(...positions) < 1;
    });
    assert(aligned, 'Touch picker keeps all five wheels on one row');
    await picker.getByRole('button', { name: 'Previous Month', exact: true }).tap();
    const month = picker.getByRole('listbox', { name: 'Month', exact: true });
    assert(await month.getByRole('option', { selected: true }).innerText() === 'DEC', 'Touch arrow wraps January to December');
    const cdp = await context.newCDPSession(phone);
    async function swipeForward(wheel) {
      const bounds = await wheel.boundingBox();
      const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height * 0.75;
      const travel = bounds.height / 3 + 8;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let step = 1; step <= 6; step++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - step * travel / 6 }] });
        await new Promise(resolve => setTimeout(resolve, 40));
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    await swipeForward(month);
    await phone.waitForFunction(() => document.querySelector('[data-scroll-picker-column="Month"] [aria-selected="true"]')?.textContent === 'JAN');
    await swipeForward(picker.getByRole('listbox', { name: 'Day', exact: true }));
    await phone.waitForFunction(() => document.querySelector('[data-scroll-picker-column="Day"] [aria-selected="true"]')?.textContent === '01');
    const hourStep = picker.getByRole('button', { name: 'Next Hour', exact: true });
    const arrow = await hourStep.boundingBox();
    assert(arrow.width === 44 && arrow.height === 44, 'Picker arrows use shared 44px touch targets');
    await hourStep.tap();
    await phone.screenshot({ path: 'output/playwright/date-time-picker-touch-dark-390.png' });
    await picker.getByRole('button', { name: 'Use selection', exact: true }).tap();
    assert(await received.inputValue() === '01-JAN-2026 15:05', 'Wrapped date and stepped hour commit together');
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
    return { touch: 'passed', monthWrap: 'DEC to JAN', dayWrap: '31 to 01', controlHeight: arrow.height };
  } finally { await context.close(); }
}
