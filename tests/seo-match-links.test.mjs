import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { canonicalUrl } from '../src/domain/discovery.ts';
import { gateFixture } from '../src/domain/paywall.ts';
import { matchArchiveHref, matchHref } from '../src/domain/navigation.ts';
import { matchDetailMetadata, matchStructuredData } from '../src/server/matches/detail-page.ts';
import { cardFixture } from './helpers/match-card-fixtures.mjs';

const approved = { deployment: 'production', index: true };
const path = '/en/matches/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/example-home-fc-vs-example-away-fc';
const metadataFor = (fixture, variant = false) => matchDetailMetadata({ data: { fixture, route: { path } }, error: null }, 'en', variant, approved);
const lateKickoff = Date.parse('2026-10-19T21:30:00Z');

/**
 * Server-renders match-page client components in a plain Node child (the react-server condition has no client hooks),
 * transpiling TSX with the project's TypeScript and resolving the "@/" alias and extensionless imports to src.
 */
function render(scenario) {
  const root = new URL('../', import.meta.url).href;
  const program = `
    import { existsSync, readFileSync } from 'node:fs';
    import { registerHooks } from 'node:module';
    import { fileURLToPath } from 'node:url';
    const root = ${JSON.stringify(root)}, src = new URL('src/', root);
    const ts = (await import(new URL('node_modules/typescript/lib/typescript.js', root))).default;
    registerHooks({
      resolve(specifier, context, next) {
        // Its CommonJS build hides the default export behind interop; the bundler-facing ESM build is what Next loads.
        if (specifier === 'styled-components') return next(new URL('node_modules/styled-components/dist/styled-components.esm.js', root).href, context);
        const target = specifier.startsWith('@/') ? new URL(specifier.slice(2), src).href : specifier;
        const local = target.startsWith('file:') || target.startsWith('.') && context.parentURL?.startsWith(src.href);
        if (local && !/\\.(?:[cm]?[jt]sx?|json)$/u.test(target)) {
          for (const extension of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
            const candidate = new URL(target + extension, context.parentURL);
            if (existsSync(fileURLToPath(candidate))) return next(candidate.href, context);
          }
        }
        // Next has no exports map, so its bundler-style subpaths ("next/link") need their file extension under Node.
        return next(context.parentURL?.startsWith(src.href) && /^next\\/[\\w/-]+$/u.test(target) ? target + '.js' : target, context);
      },
      load(url, context, next) {
        if (url.startsWith(src.href) && url.endsWith('.tsx')) {
          const file = fileURLToPath(url);
          const source = ts.transpileModule(readFileSync(file, 'utf8'), { fileName: file, compilerOptions: {
            jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
          return { format: 'module', source, shortCircuit: true };
        }
        if (url.startsWith('file:') && url.endsWith('.json')) return next(url, { ...context, importAttributes: { ...context.importAttributes, type: 'json' } });
        return next(url, context);
      },
    });
    const at = (path) => import(new URL(path, root).href);
    const [{ createElement: h }, { renderToString }, { ThemeProvider }, { Provider }, { AppRouterContext }] = await Promise.all([
      import('react'), import('react-dom/server'), import('styled-components'), import('react-redux'),
      import('next/dist/shared/lib/app-router-context.shared-runtime.js')]);
    const [{ lightTheme }, { createMessages }, { defaultMatchView }, { makeDetailStore }, ui, card, banner, teams, info, { cardFixture }] = await Promise.all([
      at('src/styles/theme.ts'), at('src/i18n/messages.ts'), at('src/domain/match-view.ts'), at('src/state/detail-store.ts'),
      at('src/components/match/details/details-ui.tsx'), at('src/components/match/details/section-card.tsx'),
      at('src/components/match/details/match-banner.tsx'), at('src/components/match/details/team-sections.tsx'),
      at('src/components/match/details/info-sections.tsx'), at('tests/helpers/match-card-fixtures.mjs')]);
    const scenario = ${JSON.stringify(scenario)};
    const fixture = cardFixture({ kickoffAt: scenario.kickoffAt });
    const team = ({ id, name }) => ({ id, name, logoUrl: null }), competition = { id: 'league-a', name: 'Synthetic league', logoUrl: null };
    const result = (fixtureId, home, away, kickoffAt) => ({ fixtureId, slug: 'example-home-fc-vs-other-fc', kickoffAt, competition,
      home: team(home), away: team(away), homeGoals: 2, awayGoals: 1, status: 'finished-regulation' });
    const other = { id: 'team-c', name: 'Other FC' }, first = result('result-home', fixture.homeTeam, other, scenario.kickoffAt - 7 * 86_400_000);
    const second = result('result-away', other, fixture.awayTeam, scenario.kickoffAt - 8 * 86_400_000);
    const meeting = result('result-meeting', fixture.homeTeam, fixture.awayTeam, scenario.kickoffAt - 90 * 86_400_000);
    const empty = { lineups: { home: null, away: null }, players: { players: [] }, injuries: { injuries: [] }, news: { items: [], limitedNews: false },
      stats: { evidence: [], evidenceRetrievedAt: null }, referee: { state: 'not-available' }, history: { state: 'available' } };
    const preview = { fixtureId: fixture.fixtureId, asOf: scenario.kickoffAt, home: team(fixture.homeTeam), away: team(fixture.awayTeam),
      sections: { ...empty, form: { home: [first], away: [second] }, h2h: { meetings: [meeting] },
        context: { competition: { ...competition, country: null, round: null }, kickoffAt: scenario.kickoffAt, restDays: { home: null, away: null },
          lastResults: { home: first, away: second }, nextFixtures: { home: null, away: null } } },
      totals: { formHome: 1, formAway: 1, meetings: 1, players: 0, injuries: 0, news: 0, stats: 0 } };
    const details = { data: { fixture, route: { path: '/en/matches/x/y' } }, preview, locale: 'en', messages: createMessages('en'),
      go() {}, update() {}, home: fixture.homeTeam.name, away: fixture.awayTeam.name, fixtureId: fixture.fixtureId, history: null };
    const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };
    const page = (child) => renderToString(h(AppRouterContext.Provider, { value: router }, h(Provider, { store: makeDetailStore() },
      h(ThemeProvider, { theme: lightTheme }, h(ui.DetailsProvider, { value: details }, h(ui.ViewProvider, { value: defaultMatchView },
        h(card.DisclosureProvider, { value: { open: true, byDefault: false, reveal: 0, toggle() {} } }, child)))))));
    process.stdout.write(JSON.stringify({ banner: page(h(banner.MatchBanner)), form: page(h(teams.FormSection)), h2h: page(h(teams.H2HSection)),
      context: page(h(info.ContextSection)) }));
  `;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '--eval', program],
    { cwd: fileURLToPath(root), encoding: 'utf8', windowsHide: true, timeout: 60_000, maxBuffer: 16 * 1024 * 1024 }));
}

test('the match archive is the kickoff day in East Africa Time, including across UTC midnight', () => {
  assert.equal(matchArchiveHref(Date.parse('2026-10-19T21:30:00Z'), 'en'), '/en/predictions/2026-10-20');
  assert.equal(matchArchiveHref(Date.parse('2026-10-19T20:59:59Z'), 'en'), '/en/predictions/2026-10-19');
  assert.equal(matchArchiveHref(Date.parse('2026-10-19T21:00:00Z')), '/en/predictions/2026-10-20');
  assert.equal(matchArchiveHref(null, 'en'), null);
  for (const kickoffAt of [lateKickoff, Date.parse('2026-10-09T09:00:00Z')]) {
    const crumbs = matchStructuredData({ fixture: cardFixture({ kickoffAt }) }, 'en');
    assert.equal(crumbs.itemListElement[1].item, canonicalUrl(matchArchiveHref(kickoffAt, 'en')));
  }
  assert.equal(matchStructuredData({ fixture: cardFixture({ kickoffAt: null }) }, 'en').itemListElement.length, 2);
});

test('the banner date, result rows and last results render as crawlable links keyed for in-place opening', () => {
  const html = render({ kickoffAt: lateKickoff });
  assert.match(html.banner, /<a [^>]*href="\/en\/predictions\/2026-10-20"[^>]*><time dateTime="2026-10-19T21:30:00\.000Z">/u);
  for (const [section, keys] of [['form', ['result-home', 'result-away']], ['h2h', ['result-meeting']], ['context', ['result-home', 'result-away']]]) {
    for (const key of keys) {
      const row = new RegExp(`<a [^>]*href="${matchHref(key, 'example-home-fc-vs-other-fc', 'en')}"[^>]*>`, 'u').exec(html[section])?.[0];
      assert.ok(row, `${section} renders ${key} as a link`);
      assert.match(row, new RegExp(`data-item-key="${key}"`, 'u'));
      assert.doesNotMatch(row, /type="button"/u);
    }
    assert.doesNotMatch(html[section], /<button[^>]*data-item-key="result-/u, `${section} keeps no result-row buttons`);
  }
  for (const value of Object.values(html)) assert.doesNotMatch(value, /54%|70%|Home win|Synthetic fixture explanation/u, 'Rows and banner carry no forecast.');
});

test('match titles claim a prediction only on indexable dated pages and descriptions add the known competition', () => {
  const published = cardFixture({ kickoffAt: lateKickoff, status: 'scheduled', score: null }, 'ai', null);
  for (const fixture of [published, gateFixture(published, { tier: 'free', signedIn: false })]) {
    const metadata = metadataFor(fixture);
    assert.equal(metadata.robots.index, true);
    assert.equal(metadata.title, 'Example Home FC v Example Away FC prediction · Tue, Oct 20, 2026 | Goal Hint');
    assert.equal(metadata.description,
      'Football predictions, sources and regulation-time results for Example Home FC v Example Away FC on Tuesday, October 20, 2026 in East Africa Time (Synthetic league).');
    assert.equal(metadataFor(fixture, true).title, metadata.title, 'History keeps the published title but stays noindex.');
    assert.doesNotMatch(`${metadata.title} ${metadata.description}`, /Home win|Draw|Over 2\.5|54%|70%|estimate/u);
  }
  const shell = metadataFor({ ...published, forecast: null });
  assert.equal(shell.robots.index, false);
  assert.equal(shell.title, 'Example Home FC v Example Away FC · Tue, Oct 20, 2026 | Goal Hint');
  assert.doesNotMatch(shell.title, /prediction/u);
  assert.match(shell.description, /in East Africa Time \(Synthetic league\)\.$/u);
  assert.equal(metadataFor({ ...published, forecast: { ...published.forecast, markets: [] } }).title, shell.title);
  const unnamed = metadataFor({ ...published, competition: { ...published.competition, name: null } });
  assert.equal(unnamed.description, 'Football predictions, sources and regulation-time results for Example Home FC v Example Away FC on Tuesday, October 20, 2026 in East Africa Time.');
  const undated = metadataFor({ ...published, kickoffAt: null });
  assert.equal(undated.title, 'Example Home FC v Example Away FC | Goal Hint');
  assert.equal(undated.description, 'Stored predictions, sources and regulation-time results for Example Home FC v Example Away FC.');
});

test('user-facing message values say prediction, never pick, outside the Terms', async () => {
  const directory = new URL('../src/i18n/messages/', import.meta.url);
  const files = (await readdir(directory)).filter((name) => name.endsWith('.ts') && name !== 'terms.ts');
  assert.ok(files.includes('en.ts') && files.includes('performance.ts'));
  for (const name of files) {
    for (const [key, value] of Object.values(await import(new URL(name, directory).href)).flatMap((catalog) => Object.entries(catalog))) {
      for (const text of typeof value === 'string' ? [value] : Object.values(value ?? {})) {
        if (typeof text !== 'string') continue;
        assert.doesNotMatch(text.replace(/\{\w+\}/gu, ''), /\bpicks?\b/iu, `${name} ${key}`);
      }
    }
  }
  const source = await readFile(new URL('../src/i18n/messages/en.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /forecastMetadataDescription/u, 'Dead metadata keys with selection placeholders are gone.');
});
