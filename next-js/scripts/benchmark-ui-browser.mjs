/** Run with the Playwright runtime against benchmark-ui.py --serve.
 * Actual component interactions; synthetic data; event-to-next-paint approximation.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const paint = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function timed(page, event, action) {
  await page.evaluate(type => {
    window.__auditDuration = null;
    document.addEventListener(type, () => {
      const start = performance.now();
      requestAnimationFrame(() => requestAnimationFrame(() => { window.__auditDuration = performance.now() - start; }));
    }, { capture: true, once: true });
  }, event);
  await action();
  await page.waitForFunction(() => window.__auditDuration !== null);
  return Math.round(await page.evaluate(() => window.__auditDuration) * 10) / 10;
}

async function main() {
  const { values } = parseArgs({ options: {
    before: { type: 'string' }, after: { type: 'string' }, playwright: { type: 'string' },
    output: { type: 'string', default: 'output/playwright/ui-performance' },
  } });
  if (!values.before || !values.after) throw new Error('Provide --before and --after local benchmark server origins.');
  const expected = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).engines.node;
  if (process.versions.node !== expected) throw new Error(`Benchmark requires pinned Node ${expected}; found ${process.versions.node}.`);
  const runtime = values.playwright ? pathToFileURL(path.resolve(values.playwright)).href : 'playwright';
  const { chromium } = await import(runtime);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const comparison = { synthetic: true, runtime: { node: process.versions.node, browser: browser.version() },
    offlineWorker: 'blocked in UI fixture; covered separately by integrity/concurrency tests', profiles: [] };
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    const profiles = ['light', 'dark'].flatMap(theme => [390, 1440].map(width => ({ theme, width })));
    for (const [index, profile] of profiles.entries()) {
      const result = { ...profile };
      for (const label of index % 2 ? ['after', 'before'] : ['before', 'after']) {
        const directory = path.resolve(values.output, `${label}-${profile.theme}-${profile.width}`);
        console.log(`Measuring ${label} ${profile.theme}/${profile.width}`);
        result[label] = await benchmarkUI(page, values[label], directory, [profile]);
      }
      comparison.profiles.push(result);
      await mkdir(values.output, { recursive: true });
      await writeFile(path.join(values.output, 'comparison.json'), JSON.stringify(comparison, null, 2) + '\n');
    }
    console.log(JSON.stringify(comparison.profiles.map(profile => ({ theme: profile.theme, width: profile.width,
      before: profile.before.results.map(({ samples, ...summary }) => summary),
      after: profile.after.results.map(({ samples, ...summary }) => summary) }))));
  } finally { await browser.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();

export async function benchmarkUI(page, origin, outputDirectory,
  profiles = ['light', 'dark'].flatMap(theme => [390, 1440].map(width => ({ theme, width })))) {
  if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw new Error('Use the isolated local fixture.');
  await mkdir(outputDirectory, { recursive: true });
  const errors = [], results = [];
  const onError = error => errors.push(error.message);
  page.on('pageerror', onError);
  try {
    for (const { theme, width } of profiles) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${origin}/audit/options`);
      await page.evaluate(value => localStorage.setItem('goal-hint-theme', value), theme);
      await page.reload();
      const trigger = page.locator('[data-select-trigger]');
      await trigger.waitFor();
      await page.evaluate(() => document.fonts.ready);
      await paint(page);
      const opened = [], focus = [], search = [];
      for (let sample = 0; sample < 5; sample++) {
        opened.push(await timed(page, 'click', () => trigger.click()));
        const field = page.getByRole('combobox');
        for (let step = 0; step < 5; step++) focus.push(await timed(page, 'keydown', () => field.press('ArrowDown')));
        search.push(await timed(page, 'input', () => field.fill('League 1999')));
        await page.locator('[data-select-option="1999"]').click();
        const selected = await page.locator('[data-selected]').textContent();
        if (selected !== (sample % 2 === 0 ? '1999' : '')) throw new Error('Picker selection/deselection changed.');
        await page.keyboard.press('Escape');
        if (!await trigger.evaluate(element => document.activeElement === element)) throw new Error('Picker focus restoration changed.');
      }
      await trigger.click();
      await page.screenshot({ path: path.join(outputDirectory, `picker-${theme}-${width}.png`) });
      await page.keyboard.press('Escape');
      results.push({ scenario: '2000-option-picker', theme, width, samples: { opened, focus, search },
        medianOpenMs: median(opened), medianFocusMs: median(focus), medianSearchMs: median(search) });

      const navigation = [];
      for (let sample = 0; sample < 5; sample++) {
        await page.goto(`${origin}/audit/options`);
        await page.locator('[data-select-trigger]').waitFor();
        const started = performance.now();
        await page.getByRole('link', { name: 'Matches', exact: true }).click();
        await page.locator('[data-fixture-id]').first().waitFor();
        await page.locator('[data-feed-performance-state="ready"]').waitFor();
        await paint(page);
        navigation.push(Math.round((performance.now() - started) * 10) / 10);
      }
      const filters = page.locator('[data-feed-filters] [data-search-filters]');
      const dialogs = [];
      for (let sample = 0; sample < 5; sample++) {
        dialogs.push(await timed(page, 'click', () => filters.click()));
        await page.getByRole('dialog', { name: 'Advanced Filters', exact: true }).waitFor();
        await page.keyboard.press('Escape');
      }
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`${theme}/${width}: viewport overflow`);
      await page.screenshot({ path: path.join(outputDirectory, `matches-${theme}-${width}.png`) });
      results.push({ scenario: 'matches', theme, width, samples: { navigation, dialogs },
        medianNavigationMs: median(navigation), medianDialogMs: median(dialogs) });
      for (const route of ['/en/performance', '/best-slips/browse', '/cases/generated']) {
        await page.goto(origin + route);
        await page.evaluate(() => document.fonts.ready);
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`${route}/${theme}/${width}: overflow`);
      }
    }
    if (errors.length) throw new Error(errors.join('\n'));
    const report = { synthetic: true, eventTiming: 'event dispatch to second animation frame; not field INP',
      navigationTiming: 'Playwright click start to content ready and second animation frame; includes automation overhead', results, errors };
    await writeFile(path.join(outputDirectory, 'browser-benchmark.json'), JSON.stringify(report, null, 2) + '\n');
    return report;
  } finally { page.off('pageerror', onError); }
}
