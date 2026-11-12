/** Run against the isolated theme fixture with a Playwright page. */
export async function verifySearchPerformance(page, origin, widths = [320, 390, 768, 1024, 1440]) {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [], results = [];
  const onError = error => errors.push(error.message);
  page.on('pageerror', onError);
  try {
    for (const mode of ['light', 'dark']) for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(origin);
      await page.evaluate(value => localStorage.setItem('goal-hint-theme', value), mode);
      await page.reload();
      await page.waitForFunction(value => document.querySelector('[data-theme-mode]')?.getAttribute('data-theme-mode') === value, mode);
      await page.evaluate(() => document.fonts.ready);
      const mobile = width < 1024, search = page.locator('#theme-search'), input = search.getByRole('searchbox');
      const filters = search.locator('[data-search-filters]'), submit = search.getByRole('button', { name: 'Search', exact: true });
      const geometry = await search.evaluate(element => {
        const field = element.querySelector('[data-feed-search]'), button = element.querySelector('[data-feed-search-submit]');
        const filter = element.querySelector('[data-search-filters]');
        const bounds = field.getBoundingClientRect(), action = button.getBoundingClientRect(), outside = filter.getBoundingClientRect(), input = field.querySelector("input").getBoundingClientRect();
        return { inset: action.right <= bounds.right && action.left >= bounds.left && action.top >= bounds.top && action.bottom <= bounds.bottom && action.left > bounds.left + bounds.width / 2,
          inputFits: input.top >= bounds.top && input.bottom <= bounds.bottom,
          aligned: Math.abs(bounds.top - outside.top) < 1 && Math.abs(bounds.height - outside.height) < 1,
          fits: outside.right <= innerWidth && bounds.left >= 0,
          filterLabel: getComputedStyle(filter.querySelector('span')).display !== 'none',
          height: bounds.height, expectedHeight: parseFloat(getComputedStyle(field).getPropertyValue('--form-control-height')) };
      });
      assert(geometry.inset && geometry.inputFits && geometry.aligned && geometry.fits, `${mode}/${width}: search geometry ${JSON.stringify(geometry)}`);
      assert(geometry.filterLabel === !mobile, 'Filter label follows the screen size');
      assert(geometry.height === geometry.expectedHeight, 'Search uses the shared control height');
      await input.fill('Arsenal');
      assert(await page.locator('[data-submitted-search]').textContent() === '', 'Typing does not submit a search');
      await submit.click();
      assert(await page.locator('[data-submitted-search]').textContent() === 'Arsenal', 'Inset action submits the entered search');
      const label = search.locator('label');
      assert(await label.evaluate(element => element.getBoundingClientRect().top < element.parentElement.getBoundingClientRect().top), 'Filled labels stay floated after blur');
      await input.fill('Kampala'); await input.press('Enter');
      assert(await page.locator('[data-submitted-search]').textContent() === 'Kampala', 'Enter submits the entered search');
      await filters.click();
      const dialog = page.getByRole('dialog', { name: 'Synthetic criteria' });
      await dialog.waitFor({ state: 'visible' });
      assert(await filters.getAttribute('aria-expanded') === 'true', 'Filter action reflects its dialog');
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
      assert(await filters.evaluate(element => document.activeElement === element), 'Dialog dismissal returns focus to the filter action');
      const summary = page.locator('#theme-performance [data-performance-summary]');
      const figures = await summary.evaluate(element => {
        const cards = [...element.querySelectorAll('[data-summary-card]')];
        const boxes = cards.map(card => card.getBoundingClientRect());
        const header = element.querySelector('[data-performance-heading]').getBoundingClientRect();
        return { order: cards.map(card => card.getAttribute('data-summary-card')).join(','),
          columns: boxes.filter(box => Math.abs(box.top - boxes[0].top) < 1).length,
          visibleIcons: [...element.querySelectorAll('svg')].filter(icon => getComputedStyle(icon).display !== 'none').length,
          colors: new Set(cards.map(card => getComputedStyle(card).backgroundColor)).size,
          fits: boxes.every(box => box.left >= 0 && box.right <= innerWidth),
          period: element.querySelector('[data-performance-period]')?.textContent,
          title: element.querySelector('h2, h3')?.textContent,
          periodCount: element.querySelectorAll('[data-performance-period]').length,
          periodInHeader: !!element.querySelector('[data-performance-heading] [data-performance-period]'),
          aligned: Math.abs(Math.min(...boxes.map(box => box.left)) - header.left) < 1 && Math.abs(Math.max(...boxes.map(box => box.right)) - header.right) < 1,
          headerGap: boxes[0].top - header.bottom,
          valueIcons: element.querySelectorAll('dd svg').length,
          labelIcons: element.querySelectorAll('dt svg').length };
      });
      assert(figures.order === 'all,won,lost,pending,void,cancelled', 'All six statuses retain their order');
      assert(figures.columns === (mobile ? 3 : 6) && figures.fits, 'Status cards fit their responsive grid');
      assert(!mobile || figures.visibleIcons === 0, 'Mobile status cards have no icons');
      assert(figures.colors >= 5, 'Status cards use distinct theme colours');
      assert(figures.period === '02-Nov-2026 · EAT', 'The heading shows the actual reporting day, independently of the refresh timestamp');
      assert(figures.title === 'Performance', 'The shared heading uses Performance');
      assert(figures.periodCount === 1 && figures.periodInHeader, 'Exactly one period appears, inside the header');
      assert(figures.aligned && figures.headerGap >= 0 && figures.headerGap <= 4, 'Cards align with the header and retain minimal spacing');
      assert(figures.valueIcons === 0 && figures.labelIcons === 3, 'Outcome icons belong to labels rather than values');
      for (const status of ['won', 'lost', 'pending', 'void', 'cancelled', 'all']) {
        const action = page.locator(`#theme-filters [data-summary-result="${status}"]`);
        await action.click();
        assert(await action.getAttribute('aria-pressed') === 'true', `Best Slips selects ${status} through the shared component`);
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${mode}/${width}: viewport overflow`);
      if (width === 390 || width === 1440) {
        await search.evaluate(element => element.scrollIntoView({ block: 'center' }));
        await search.screenshot({ path: `output/playwright/search-${mode}-${width}.png` });
        const preview = page.locator('#theme-filters [data-performance-summary]');
        await preview.evaluate(element => element.scrollIntoView({ block: 'center' }));
        await preview.screenshot({ path: `output/playwright/performance-${mode}-${width}.png` });
      }
      results.push({ mode, width, sharedControlHeight: geometry.height, columns: figures.columns });
    }
    assert(errors.length === 0, errors.join('\n'));
    return { passed: results.length, results, pageErrors: errors };
  } finally { page.off('pageerror', onError); }
}

/** Exercise the shared production feed filters at both viewport sizes in the loading fixture. */
export async function verifyFeedSearchFilters(page, origin, pathname = '/en/matches') {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const results = [];
  for (const mode of ['light', 'dark']) for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}${pathname}`);
    await page.evaluate(value => localStorage.setItem('goal-hint-theme', value), mode);
    await page.reload();
    const desktop = width >= 1024;
    const panel = page.locator('[data-feed-filters]');
    await panel.waitFor({ state: 'visible' });
    const field = panel.getByRole('searchbox'), filter = panel.locator('[data-search-filters]');
    const historyLength = await page.evaluate(() => history.length);
    await field.evaluate(element => { element.dataset.searchIdentity = 'retained'; });
    await field.fill('Arsenal');
    await page.waitForURL(url => url.searchParams.get('q') === 'Arsenal');
    await page.waitForFunction(() => document.querySelector('[data-feed-match-results]')?.getAttribute('aria-busy') === 'false');
    assert(await field.evaluate(element => element.dataset.searchIdentity === 'retained' && document.activeElement === element), 'Live search preserves the input and focus');
    assert(await page.evaluate(() => history.length) === historyLength, 'Live search replaces the current history entry');
    await filter.click();
    const dialog = page.getByRole('dialog', { name: 'Filters', exact: true });
    await dialog.waitFor({ state: 'visible' });
    assert(await filter.getAttribute('aria-controls') === await dialog.getAttribute('id'), 'The feed opener targets its own dialog');
    const dates = dialog.locator('[data-date-time-field="datetime"]');
    await dates.first().waitFor();
    assert(await dates.count() === 2, 'One shared pair of date-time fields');
    const probability = dialog.locator('input[inputmode="decimal"]').first(), original = await probability.inputValue();
    const applied = page.url();
    await probability.fill('101');
    assert(page.url() === applied, 'Filter edits do not execute a search');
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    assert(await filter.evaluate(element => document.activeElement === element), 'Feed dialog dismissal restores opener focus');
    await filter.click(); await dialog.waitFor({ state: 'visible' });
    assert(await probability.inputValue() === original, 'Cancelling restores the filter draft');
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    const summary = page.locator('[data-performance-summary="matches"]');
    await page.locator('[data-feed-performance-state="ready"]').waitFor();
    assert(await summary.locator('[data-summary-card]').count() === 6, 'The feed uses all six shared cards');
    if (!desktop) assert(await summary.locator('svg').evaluateAll(icons => icons.every(icon => getComputedStyle(icon).display === 'none')), 'Feed mobile cards hide icons');
    await summary.locator('[data-summary-result="won"]').click();
    await page.waitForURL(url => url.searchParams.get('result') === 'won' && url.searchParams.get('q') === 'Arsenal');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'The integrated feed fits the viewport');
    results.push({ mode, width, search: true, advancedFilters: true, resultDrilldown: true });
  }
  return { passed: results.length, results };
}

/** Compare the real Performance and Predictions headers at each responsive size. */
export async function verifySectionHeaderUniformity(page, origin = new URL(page.url()).origin, widths = [320, 390, 768, 1024, 1440]) {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const results = [];
  for (const mode of ['light', 'dark']) {
    await page.goto(origin);
    await page.evaluate(value => localStorage.setItem('goal-hint-theme', value), mode);
    await page.reload();
    await page.waitForFunction(value => document.querySelector('[data-header-uniformity]')?.getAttribute('data-theme-mode') === value, mode);
    await page.evaluate(() => document.fonts.ready);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      const geometry = await page.evaluate(() => {
        const inspect = (selector, metadata) => {
          const node = document.querySelector(selector), title = node.querySelector('h2, h3');
          const detail = node.querySelector(metadata), style = getComputedStyle(node), text = getComputedStyle(title), meta = getComputedStyle(detail);
          const bounds = node.getBoundingClientRect(), heading = title.getBoundingClientRect(), first = detail.getClientRects()[0];
          return { family: text.fontFamily, size: text.fontSize, weight: text.fontWeight, leading: text.lineHeight,
            padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].join(','),
            metadata: [meta.fontSize, meta.fontWeight, meta.lineHeight].join(','), inset: heading.left - bounds.left,
            title: title.innerText, date: detail.innerText,
            inline: Math.abs(first.top - heading.top) < 4, fits: node.scrollWidth <= node.clientWidth };
        };
        return { performance: inspect('[data-performance-heading]', '[data-performance-period]'), predictions: inspect('[data-results-header]', 'time'),
          overflow: document.documentElement.scrollWidth > innerWidth };
      });
      for (const key of ['family', 'size', 'weight', 'leading', 'padding', 'metadata', 'inset']) {
        assert(geometry.performance[key] === geometry.predictions[key], `${mode}/${width}: ${key} differs: ${JSON.stringify(geometry)}`);
      }
      assert(geometry.performance.title === 'Performance', 'Performance retains its heading');
      assert(geometry.predictions.title === (width < 1024 ? 'Matches' : 'Predictions'), 'Results use the responsive heading');
      const datePattern = width < 1024 ? /^\d{2}-\d{2}-\d{4} \d{2}:\d{2} .+$/ : /^[A-Z]{3} \d{2}-[A-Za-z]{3}-\d{4} - \d{2}:\d{2} .+$/;
      assert(datePattern.test(geometry.predictions.date), 'Results use the responsive publication format');
      assert(geometry.performance.inline && geometry.predictions.inline, `${mode}/${width}: dates start on the title line`);
      assert(geometry.performance.fits && geometry.predictions.fits && !geometry.overflow, `${mode}/${width}: headers fit without clipping`);
      await page.locator('[data-header-uniformity]').screenshot({ path: `output/playwright/uniform-headers-${mode}-${width}.png` });
      results.push({ mode, width, ...geometry });
    }
  }
  return { passed: results.length, results };
}
