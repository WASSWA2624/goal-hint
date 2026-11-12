/* eslint-disable @typescript-eslint/no-unused-vars -- Playwright CLI evaluates this function through run-code --filename. */
/** Run against scripts/verify-app-loading-rendering.py --serve (synthetic 55-match cohort). */
async function verifyUnifiedMatchFilters(page) {
  const origin = new URL(page.url()).origin;
  if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname)) throw new Error("Use a local acceptance fixture.");
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const segment = (field, part) => field.locator(`[data-date-part="${part}"]`);
  const dateText = field => field.evaluate(node => [...node.children].map(child => child.value ?? child.textContent).join(''));
  const pasteDate = (field, value) => field.locator('input').first().evaluate((node, text) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', text);
    node.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  }, value);
  const sortBy = dialog => dialog.getByRole('combobox', { name: /^Sort by:/u });
  const latestApplied = url => url.searchParams.get('sort') === 'kickoff'
    && (url.searchParams.get('dir') ?? 'desc') === 'desc';
  async function chooseLatestSort(target, dialog, activate = control => control.click()) {
    const before = target.url(), sort = sortBy(dialog);
    const originalSort = await sort.getAttribute('aria-label');
    await activate(sort);
    const options = dialog.getByRole('listbox', { name: 'Sort by', exact: true });
    await activate(options.getByRole('option', { name: 'Latest first', exact: true }));
    assert(originalSort !== 'Sort by: Latest first' && await dialog.isVisible() && await sort.getAttribute('aria-label') === 'Sort by: Latest first'
      && (await sort.innerText()).includes('Latest first') && await sort.getAttribute('aria-expanded') === 'false',
      'One activation closes the Sort by menu and visibly updates the filter draft');
    assert(target.url() === before, 'Changing the Sort by draft leaves the route unchanged before Apply');
  }
  const results = [], errors = [];
  page.on("pageerror", error => errors.push(error.message));
  async function ready() {
    await page.locator('[data-feed-filters] [data-criteria-dialog][data-enhanced="true"]').first().waitFor({ state: "attached" });
    await page.locator('[data-feed-performance-state="ready"]').waitFor({ state: "attached" });
    await page.evaluate(() => document.fonts.ready);
  }
  for (const mode of ["light", "dark"]) for (const width of [320, 390, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/en/matches?when=today&picks=all`);
    await page.evaluate(value => localStorage.setItem("goal-hint-theme", value), mode);
    await page.reload(); await ready();
    await page.waitForFunction(mode => document.querySelector('meta[name="color-scheme"]')?.content === mode, mode);
    const form = page.locator('[data-feed-filters]'), opener = form.locator('[data-search-filters]');
    const dialog = page.getByRole('dialog', { name: 'Filters', exact: true });
    assert(await opener.locator('span').isVisible() && await opener.locator('span').innerText() === 'Filters'
      && await opener.locator('svg').count() === 1, 'Filters always shows its label and icon');
    assert(await page.locator('[data-fixture-id]').count() === 50, 'First page shows fifty available matches');
    assert(/1–50 of 55/u.test(await page.locator('[data-match-count]').innerText()), 'Count reflects fifty of fifty-five');
    assert(/^[A-Z]{3} \d{2}-[A-Z][a-z]{2}-\d{4}$/u.test(await page.locator('[data-feed-performance-section] [data-performance-period]').innerText()),
      'Matches performance starts with the weekday and uses a date without the zone suffix');
    if (width === 390 || width === 1440) {
      const card = page.locator('[data-fixture-id]').first();
      const background = await card.evaluate(node => getComputedStyle(node).backgroundColor);
      const header = await page.locator('[data-results-header]').evaluate(node => getComputedStyle(node).backgroundColor);
      await card.hover();
      const hover = await card.evaluate(async node => {
        await Promise.all(node.getAnimations().map(animation => animation.finished.catch(() => {})));
        return getComputedStyle(node).backgroundColor;
      });
      assert(hover !== background && hover !== header, 'Hovered match uses a separate, faint fill');
    }
    if (width < 1024) {
      const typography = await page.locator('[data-fixture-id]').first().evaluate(node => {
        const name = node.querySelector('[data-team-name], [data-ledger-home] [data-ledger-name]');
        const score = node.querySelector('[data-score-home]'), logo = node.querySelector('[data-ledger-teams] [data-team-logo]');
        return { name: getComputedStyle(name).fontWeight, score: getComputedStyle(score).fontWeight,
          font: parseFloat(getComputedStyle(name).fontSize), logo: logo.getBoundingClientRect().height };
      });
      assert(typography.name === '500' && typography.score === '500' && typography.font === typography.logo, `Mobile typography: ${JSON.stringify(typography)}`);
    }
    await opener.click();
    await page.mouse.click(1, 1);
    assert(await dialog.isVisible(), 'Clicking the backdrop keeps the filter draft open');
    assert((await sortBy(dialog).innerText()).includes('Live first'), 'Today starts with Live first');
    const paired = await dialog.locator('[data-status-sort-fields], [data-date-time-fields]').evaluateAll(rows => rows.length === 2 && rows.every(row => {
      const [first, second] = row.children;
      const left = first.getBoundingClientRect(), right = second.getBoundingClientRect();
      return Math.abs(left.top - right.top) < 1 && right.left >= left.right;
    }));
    assert(paired && await dialog.locator('legend:visible').filter({ hasText: /^(Sort by|Match Date & Time)$/u }).count() === 0, 'Status, sort and date pairs share their rows without duplicate headings');
    const sections = await dialog.locator('[data-feed-dialog] > [data-filter-section]').evaluateAll(groups =>
      groups.map(group => parseFloat(getComputedStyle(group).borderBlockStartWidth)));
    assert(sections.length === 7 && sections[0] === 0 && sections.slice(1).every(width => width > 0), 'Subtle dividers separate every Matches filter section');
    const locations = dialog.locator('[data-location-fields] [data-searchable-select]');
    const stacked = await locations.evaluateAll(fields => {
      if (fields.length !== 2) return false;
      const [league, country] = fields.map(field => field.getBoundingClientRect());
      const row = fields[0].parentElement.getBoundingClientRect();
      return country.top >= league.bottom && Math.abs(league.left - country.left) < 1
        && Math.abs(league.width - row.width) < 1 && Math.abs(country.width - row.width) < 1;
    });
    assert(stacked, 'League and country each take a full-width row');
    assert(await dialog.locator(':scope > header h2 svg').count() === 1 && await dialog.locator(':scope > header h2 img').count() === 0, 'Filters use the sliders icon');
    const apply = dialog.getByRole('button', { name: 'Apply Filters', exact: true });
    const reset = dialog.getByRole('button', { name: 'Reset Filters', exact: true });
    assert(await dialog.locator('[data-date-time-input="datetime"]').count() === 2, 'Exactly two combined date-time editors');
    assert(await dialog.locator('[data-feed-period],select[name="tz"]').count() === 0, 'Period and editable zone removed');
    const dateWindow = dialog.getByRole('group', { name: 'Date and time window', exact: true });
    const from = dateWindow.getByRole('group', { name: 'From', exact: true });
    const to = dateWindow.getByRole('group', { name: 'To', exact: true });
    assert(/^\d{2}-[A-Z]{3}-\d{4} \d{2}:\d{2}$/u.test(await dateText(from)), 'Day-first abbreviated date and 24-hour time');
    for (const field of [from, to]) {
      assert(await field.locator('[data-date-part]').evaluateAll(segments => {
        if (segments.length !== 5) return false;
        const group = segments[0].parentElement.getBoundingClientRect();
        const picker = segments[0].closest('[data-date-time-field]').querySelector('[data-date-time-picker-trigger]').getBoundingClientRect();
        const boxes = segments.map(segment => segment.getBoundingClientRect());
        return boxes.every((box, index) => Math.abs(box.top - boxes[0].top) < 1 && box.width > 0
          && box.left >= group.left && box.right <= picker.left + 0.5
          && (index === 0 || box.left >= boxes[index - 1].right - 0.5));
      }), 'All date and time segments fit on one line');
    }
    const before = page.url();
    await segment(from, 'day').fill('0');
    assert(await dialog.getByRole('alert').count() === 0 && await segment(from, 'day').inputValue() === '0', 'Leading zero stays editable without premature error');
    await segment(to, 'day').focus(); assert(await segment(from, 'day').getAttribute('aria-invalid') === 'true', 'Incomplete value is explained inline on blur');
    await pasteDate(from, '30-APR-2026 09:00');
    await segment(from, 'day').fill('31');
    await segment(from, 'hour').fill('24');
    await segment(from, 'minute').fill('60');
    assert(await dateText(from) === '30-APR-2026 09:00', 'Impossible day, hour and minute values are rejected');
    await segment(from, 'month').fill('5');
    await segment(from, 'month').press('Home');
    await segment(from, 'month').press('Backspace');
    assert(await dateText(from) === '30-5-2026 09:00', 'Backspace at the segment boundary preserves separators');
    await segment(to, 'day').focus();
    assert(await dateText(from) === '30-MAY-2026 09:00', 'Numeric month normalizes on blur');
    await pasteDate(from, '07-JAN-2026 09:00'); await pasteDate(to, '06-JAN-2026 17:00');
    assert(await apply.isDisabled() && await segment(to, 'day').getAttribute('aria-invalid') === 'true', 'Reversed interval fails under affected field');
    await pasteDate(from, '04-JAN-2026 09:00');
    const probability = dialog.locator('[data-probability-fields]');
    const odds = dialog.locator('[data-odds-fields]');
    for (const [group, heading] of [[probability, 'Probability (%)'], [odds, 'Odds']]) {
      const legend = group.locator('legend');
      assert(await legend.isVisible() && (await legend.innerText()).trim() === heading, `${heading} has a visible heading`);
      const labels = (await group.locator('label:visible').allTextContents()).map(label => label.trim());
      assert(labels.join(',') === 'Minimum,Maximum', `${heading} uses consistent range-bound labels`);
    }
    await probability.getByRole('textbox', { name: 'Min probability (%)', exact: true }).fill('101');
    assert(await apply.isDisabled(), 'Probability bounds prevent application');
    await reset.click(); assert(!(await apply.isDisabled()), 'Reset restores a valid draft');
    const minOdds = odds.getByRole('textbox', { name: 'Min odds', exact: true });
    const maxOdds = odds.getByRole('textbox', { name: 'Max odds', exact: true });
    if (await minOdds.count()) {
      await minOdds.fill('2.50'); await maxOdds.fill('1.90');
      assert(await apply.isDisabled(), 'Reversed odds bounds prevent application');
      await maxOdds.fill('3.50');
      assert(!(await apply.isDisabled()), 'Eligible odds fields accept a valid range');
      await reset.click();
    } else {
      for (const name of ['Min odds', 'Max odds']) {
        const explanation = odds.getByRole('button', { name, exact: true });
        await explanation.focus();
        assert((await odds.getByRole('tooltip').innerText()).length > 0, 'An unavailable odds field explains why');
        await explanation.press('Escape');
      }
    }
    const original = await dateText(from);
    assert(page.url() === before, 'Draft editing does not navigate');
    await dialog.getByRole('button', { name: 'Choose date and time', exact: true }).first().click();
    const picker = page.getByRole('dialog', { name: 'Choose date and time', exact: true });
    await picker.waitFor();
    await page.mouse.click(1, 1);
    assert(await picker.isVisible(), 'Backdrop clicks also keep the nested picker open');
    const pickerLayout = await picker.evaluate(node => {
      const columns = [...node.querySelectorAll('[data-scroll-picker-column]')];
      const controlHeight = parseFloat(getComputedStyle(node).getPropertyValue('--form-control-height'));
      const top = columns[0].getBoundingClientRect().top;
      return {
        labels: columns.map(column => column.dataset.scrollPickerColumn).join(','),
        aligned: columns.every(column => Math.abs(column.getBoundingClientRect().top - top) < 1),
        fits: node.scrollWidth <= node.clientWidth,
        height: node.getBoundingClientRect().height,
        chrome: [...node.querySelectorAll(':scope > header, :scope > footer')].map(region => region.getBoundingClientRect().height - controlHeight),
      };
    });
    assert(pickerLayout.labels === 'Day,Month,Year,Hour,Minute' && pickerLayout.aligned && pickerLayout.fits, 'Five date-time columns fit on one row in order');
    assert(pickerLayout.height < 400 && pickerLayout.chrome.every(padding => padding <= 8), 'Picker uses compact header and footer spacing');
    assert(await picker.locator('header h2 svg').count() === 1, 'Picker title has an icon');
    const day = picker.getByRole('listbox', { name: 'Day', exact: true });
    const month = picker.getByRole('listbox', { name: 'Month', exact: true });
    const year = picker.getByRole('listbox', { name: 'Year', exact: true });
    const selected = wheel => wheel.getByRole('option', { selected: true }).innerText();
    const initialYear = await selected(year);
    await month.press('Home');
    await month.press('ArrowUp');
    assert(await selected(month) === 'DEC', 'Keyboard wraps January backward to December');
    await picker.getByRole('button', { name: 'Next Month', exact: true }).click();
    assert(await selected(month) === 'JAN' && await selected(year) === initialYear, 'Month arrow wraps without changing year');
    await day.press('Home');
    await picker.getByRole('button', { name: 'Previous Day', exact: true }).click();
    assert(await selected(day) === '31', 'Day arrow wraps backward to the last day');
    await day.hover();
    const rowHeight = (await day.boundingBox()).height / 3;
    await page.mouse.wheel(0, rowHeight);
    await page.waitForFunction(() => document.querySelector('[data-scroll-picker-column="Day"] [aria-selected="true"]')?.textContent === '01');
    await page.mouse.wheel(0, -rowHeight);
    await page.waitForFunction(() => document.querySelector('[data-scroll-picker-column="Day"] [aria-selected="true"]')?.textContent === '31');
    for (const [label, upper] of [['Hour', '23'], ['Minute', '59']]) {
      const wheel = picker.getByRole('listbox', { name: label, exact: true });
      await wheel.press('Home'); await wheel.press('ArrowUp');
      assert(await selected(wheel) === upper, `${label} wraps backward with the keyboard`);
      await wheel.press('ArrowDown');
      assert(await selected(wheel) === '00', `${label} wraps forward with the keyboard`);
      await wheel.press('End'); await wheel.hover();
      const height = (await wheel.boundingBox()).height / 3;
      const waitForSelection = expected => page.waitForFunction(({ label, expected }) =>
        document.querySelector(`[data-scroll-picker-column="${label}"] [aria-selected="true"]`)?.textContent === expected, { label, expected });
      await page.mouse.wheel(0, height); await waitForSelection('00');
      await page.mouse.wheel(0, -height); await waitForSelection(upper);
    }
    const yearRows = await picker.locator('[data-scroll-picker-column="Year"] [role="option"]').count();
    assert(yearRows <= 12, 'Year wheel virtualizes its long range');
    assert((await picker.getByRole('listbox', { name: 'Month', exact: true }).getByRole('option', { selected: true }).innerText()).length === 3, 'Month labels use three letters');
    await page.screenshot({ path: `output/playwright/date-time-picker-${mode}-${width}.png` });
    await page.keyboard.press('Escape');
    assert(await dialog.isVisible() && await dateText(from) === original, 'Picker cancellation preserves field and outer dialog');
    const countries = dialog.locator('[data-searchable-select]').filter({ has: page.getByRole('button', { name: /^Countries:/u }) });
    await countries.locator('[data-select-trigger]').click();
    const search = countries.getByRole('combobox'); await search.fill('E');
    assert(await countries.getByRole('option', { name: 'Egypt', exact: true }).isVisible(), 'E immediately finds Egypt');
    await search.fill('eG');
    const egypt = countries.getByRole('option', { name: 'Egypt', exact: true });
    await egypt.click(); assert(await egypt.getAttribute('aria-selected') === 'true', 'A single click selects Egypt');
    await search.fill('France'); await search.fill('eg');
    assert(await egypt.getAttribute('aria-selected') === 'true', 'Selection persists across live searches');
    await search.press('Escape'); assert(await dialog.isVisible(), 'Search Escape closes only its own popup');
    const marketSection = dialog.locator('[data-market-section]');
    const marketTrigger = marketSection.locator('[data-market-trigger]');
    const markets = page.getByRole('dialog', { name: 'Markets', exact: true });
    assert(await marketTrigger.isVisible() && await marketTrigger.locator('svg').count() >= 1, 'Markets opens through a labeled icon button');
    assert(await marketSection.evaluate(section => {
      const bounds = section.getBoundingClientRect();
      const button = section.querySelector('[data-market-trigger]');
      const summary = document.getElementById(button.getAttribute('aria-describedby'));
      const buttonBounds = button.getBoundingClientRect(), summaryBounds = summary.getBoundingClientRect();
      return Math.abs(buttonBounds.width - bounds.width) < 1 && summaryBounds.top >= buttonBounds.bottom;
    }), 'Markets has a full-width trigger above its selection summary');
    assert(!(await markets.isVisible()) && await dialog.locator('[data-market-choices]:visible').count() === 0, 'Market choices stay inside their own dialog');
    await marketTrigger.click(); await markets.waitFor();
    assert(await marketTrigger.getAttribute('aria-controls') === await markets.getAttribute('id')
      && await markets.locator(':scope > header h2 svg').count() === 1, 'The Markets trigger targets an icon-titled dialog');
    const anyMarket = markets.getByRole('checkbox', { name: 'Any', exact: true });
    const matchResult = markets.getByRole('checkbox', { name: 'Match result', exact: true });
    assert(await anyMarket.isChecked(), 'Any reflects the initial all-market selection');
    await matchResult.uncheck();
    assert(await markets.getByRole('checkbox', { checked: true }).count() === 3, 'Markets supports multiple checkbox selections');
    await page.keyboard.press('Escape'); await markets.waitFor({ state: 'hidden' });
    assert(await dialog.isVisible() && await marketTrigger.evaluate(node => node === document.activeElement), 'Escape closes only Markets and restores its trigger focus');
    await marketTrigger.click();
    assert(await anyMarket.isChecked() && await matchResult.isChecked(), 'Reopening Markets discards the cancelled edit');
    await matchResult.uncheck();
    await anyMarket.check();
    assert(await markets.getByRole('checkbox', { checked: true }).count() === 5, 'Any selects all four individual markets');
    await matchResult.uncheck();
    await markets.getByRole('button', { name: 'Apply', exact: true }).click();
    await markets.waitFor({ state: 'hidden' });
    assert(await dialog.isVisible() && page.url() === before && (await marketSection.innerText()).includes('Double chance'), 'Market Apply updates the parent summary without navigating');
    await pasteDate(from, '04-JAN-2026 09:00'); await pasteDate(to, '06-JAN-2026 17:00');
    await chooseLatestSort(page, dialog);
    const geometry = await dialog.evaluate(node => ({ overflow: node.scrollWidth > node.clientWidth + 1,
      background: getComputedStyle(node).backgroundColor, height: node.getBoundingClientRect().height }));
    assert(!geometry.overflow, 'Dialog fits the viewport');
    await page.screenshot({ path: `output/playwright/match-filters-${mode}-${width}.png` });
    await apply.click();
    await page.waitForURL(url => url.searchParams.get('start') === '2026-01-04T09:00' && url.searchParams.get('end') === '2026-01-06T17:00'
      && url.searchParams.get('country') === 'Egypt' && latestApplied(url)
      && url.searchParams.get('market')?.split(',').sort().join(',') === 'both-teams-to-score,double-chance,total-goals');
    await ready(); await opener.click();
    assert(await dateText(from) === '04-JAN-2026 09:00' && await dateText(to) === '06-JAN-2026 17:00', 'Reopening prefills applied dates');
    assert((await countries.locator('[data-select-trigger]').innerText()).includes('Egypt'), 'Reopening prefills applied country');
    assert((await sortBy(dialog).innerText()).includes('Latest first'), 'Reopening prefills the applied sort');
    await marketTrigger.click();
    assert(!(await matchResult.isChecked()), 'Reopening Markets prefills the applied market selection');
    await anyMarket.check(); await markets.getByRole('button', { name: 'Apply', exact: true }).click();
    await markets.waitFor({ state: 'hidden' });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' }); await opener.click();
    assert((await marketSection.innerText()).includes('Double chance'), 'Cancelling Filters also discards applied child edits');
    await page.keyboard.press('Escape');
    await page.goto(`${origin}/en/matches?when=today&picks=all&page=2`); await ready();
    assert(await page.locator('[data-fixture-id]').count() === 5 && /51–55 of 55/u.test(await page.locator('[data-match-count]').innerText()), 'Second page shows the remaining five');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Page has no horizontal overflow');
    results.push({ mode, width, ...geometry });
  }
  const touch = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const phone = await touch.newPage();
    await phone.goto(`${origin}/en/matches?when=today&picks=all`);
    await phone.locator('[data-feed-filters] [data-criteria-dialog][data-enhanced="true"]').first().waitFor({ state: 'attached' });
    const opener = phone.locator('[data-feed-filters] [data-search-filters]');
    const dialog = phone.getByRole('dialog', { name: 'Filters', exact: true });
    await opener.tap();
    await chooseLatestSort(phone, dialog, control => control.tap());
    await dialog.getByRole('button', { name: 'Apply Filters', exact: true }).tap();
    await phone.waitForURL(latestApplied);
    await phone.locator('[data-feed-filters][aria-busy="false"]').waitFor();
    await opener.tap();
    assert((await sortBy(dialog).innerText()).includes('Latest first'), 'Touch reopens with the applied sort');
  } finally { await touch.close(); }
  // Date-only and standalone-time reuse, including successful form values and real leap-day clamping.
  await page.goto(origin); await page.locator('[data-date-gallery] [data-date-time-input]').first().waitFor();
  const gallery = page.locator('[data-date-gallery]');
  await gallery.getByRole('button', { name: 'Choose date', exact: true }).first().click();
  let picker = page.getByRole('dialog', { name: 'Choose date', exact: true });
  assert(await picker.getByRole('listbox').count() === 3, 'Date-only mode has three columns');
  assert(await picker.getByRole('button', { name: 'Previous Year', exact: true }).isDisabled(), 'Year stops at its lower bound');
  const restrictedDay = picker.getByRole('listbox', { name: 'Day', exact: true });
  await picker.getByRole('button', { name: 'Next Day', exact: true }).click();
  assert(await restrictedDay.getByRole('option', { selected: true }).innerText() === '30', 'Restricted day wheel wraps within the allowed dates');
  assert(await restrictedDay.getByRole('option').count() === 2, 'Repeated options are announced only once');
  await picker.getByRole('button', { name: 'Previous Day', exact: true }).click();
  await picker.getByRole('button', { name: 'Next Month', exact: true }).click();
  assert(await picker.getByRole('listbox', { name: 'Day', exact: true }).getByRole('option', { selected: true }).innerText() === '28', 'January 31 clamps to February 28');
  await picker.getByRole('button', { name: 'Apply', exact: true }).click();
  assert(await dateText(gallery.getByRole('group', { name: 'Report date', exact: true })) === '28-FEB-2026', 'Date-only picker commits formatted date');
  await gallery.getByRole('button', { name: 'Choose time', exact: true }).click();
  picker = page.getByRole('dialog', { name: 'Choose time', exact: true });
  assert(await picker.getByRole('listbox').count() === 2, 'Time-only mode has hour and minute columns');
  const minute = picker.getByRole('listbox', { name: 'Minute', exact: true });
  await minute.press('End');
  await picker.getByRole('button', { name: 'Next Minute', exact: true }).click();
  assert(await minute.getByRole('option', { selected: true }).innerText() === '00', 'Time-only minutes wrap from 59 to 00');
  await picker.getByRole('button', { name: 'Next Minute', exact: true }).click();
  await picker.getByRole('button', { name: 'Apply', exact: true }).click();
  await gallery.getByRole('combobox', { name: /^Example choice/u }).click();
  await gallery.getByRole('option', { name: 'Second choice', exact: true }).click();
  assert((await gallery.getByRole('combobox', { name: /^Example choice/u }).getAttribute('aria-label')).includes('Second choice'), 'Shared single-select commits on one click');
  await gallery.getByRole('button', { name: 'Submit dates' }).click();
  assert(JSON.parse(await gallery.locator('[data-saved-date]').innerText()).date === '2026-02-28', 'Formatted dates submit canonical civil values');
  assert(JSON.parse(await gallery.locator('[data-saved-date]').innerText()).time === '14:01', 'Time-only picker submits the stepped minute');
  assert(JSON.parse(await gallery.locator('[data-saved-date]').innerText()).receivedAt === '2026-01-04T14:05', 'Uncontrolled payment-style date-time defaults submit canonical values');
  assert(errors.length === 0, errors.join('; '));
  return { passed: results.length, results, gallery: 'passed', pageErrors: errors };
}
