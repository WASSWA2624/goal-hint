import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url)), execute = promisify(execFile);
const nextCli = createRequire(import.meta.url).resolve('next/dist/bin/next');
const args = process.argv.slice(2);
assert.ok(args.every((argument) => ['--serve', '--detail', '--history', '--live'].includes(argument) || argument.startsWith('--reuse=')),
  'Usage: node scripts/verify-match-feed-rendering.mjs [--serve] [--detail|--history|--live] [--reuse=.tmp/match-feed-ID]');
assert.ok(args.filter(argument => argument.startsWith('--reuse=')).length <= 1);
const includeLive = args.includes('--live'), includeHistory = includeLive || args.includes('--history'), includeDetail = includeHistory || args.includes('--detail');
const environment = { ...process.env, NEXT_TELEMETRY_DISABLED: '1', FORCE_COLOR: '0' };
let child, log = '';

async function fixture() {
  await mkdir(path.join(root, '.tmp'), { recursive: true });
  const reuse = args.find(argument => argument.startsWith('--reuse='))?.slice('--reuse='.length);
  const directory = reuse ? await realpath(path.resolve(root, reuse)) : await mkdtemp(path.join(root, '.tmp/match-feed-'));
  if (reuse) {
    assert.match(path.relative(await realpath(path.join(root, '.tmp')), directory), /^match-feed-[a-zA-Z0-9]+$/);
    const databaseLog = await readFile(path.join(directory, 'database.log'), 'utf8');
    assert.match(databaseLog, /\bfail 0\b/); assert.doesNotMatch(databaseLog, /\bfail [1-9]/);
  }
  if (includeLive) await writeFile(path.join(directory, 'live-clock.json'), JSON.stringify({ now: Date.parse('2026-10-09T09:00:00Z') }));
  const capture = path.join(directory, 'scenarios.json');
  const detailCapture = path.join(directory, 'detail-scenarios.json');
  if (!reuse) try {
    const result = await execute(process.execPath, ['--conditions=react-server', '--test', '--test-concurrency=1', 'tests/feed-page.integration.mjs',
      ...(includeDetail ? ['tests/match-detail.integration.mjs'] : [])], {
      cwd: root, env: { ...environment, MATCH_FEED_PAGE_CAPTURE: capture, ...(includeDetail ? { MATCH_DETAIL_PAGE_CAPTURE: detailCapture } : {}) },
      windowsHide: true, timeout: 360_000, maxBuffer: 4 * 1024 * 1024,
    });
    await writeFile(path.join(directory, 'database.log'), `${result.stdout}\n${result.stderr}`);
  } catch (error) {
    await writeFile(path.join(directory, 'database.log'), `${error.stdout ?? ''}\n${error.stderr ?? ''}`);
    throw new Error(`Stored fixture preparation failed; see ${directory}/database.log.`);
  }
  const scenarios = JSON.parse(await readFile(capture, 'utf8'));
  const details = includeDetail ? JSON.parse(await readFile(detailCapture, 'utf8')) : null;
  if (details) {
    assert.ok(details.open?.data.snapshot?.markets.length === 4 && details.navigation?.data, 'Genuine detail projections are required.');
    // Explicitly synthetic presentation/security variants; never a production switch.
    const long = structuredClone(details.open);
    long.data.fixture.homeTeam.name = 'InternationalHomeIdentifier'.repeat(18);
    long.data.fixture.awayTeam.name = 'InternationalAwayIdentifier'.repeat(18);
    details['long-names'] = long;
    const unsafe = structuredClone(details.open), url = 'https://localhost/private?token=synthetic-secret';
    unsafe.data.snapshot.analysis.sources[0].url = url;
    unsafe.data.snapshot.analysis.sources[0].title = '<script>window.sourceExecuted=true</script>';
    unsafe.data.snapshot.analysis.reasons[0].sourceUrls = [url]; details['unsafe-links'] = unsafe;
    const delayed = structuredClone(details.open);
    delayed.data.fixture.update.prediction = 'delayed'; delayed.data.fixture.update.result = 'delayed';
    delayed.data.fixture.forecast.updateDelayed = true; delayed.data.fixture.partialCoverage = true;
    details['delayed-partial-coverage'] = delayed;
    details.failure = { data: null, error: 'unavailable' }; details.busy = { data: null, error: 'rate-limited' };
  }
  assert.ok(scenarios.today?.result.data.records.length === 30, 'Real MySQL acceptance cannot be skipped.');
  const relative = (target) => path.relative(directory, target).split(path.sep).join('/');
  const files = {
    'package.json': JSON.stringify({ private: true, type: 'module' }),
    'next.config.mjs': `export default { agentRules: false, compiler: { styledComponents: true }, turbopack: { root: ${JSON.stringify(root)} } };`,
    'tsconfig.json': JSON.stringify({ extends: `${relative(root)}/tsconfig.json`, compilerOptions: { paths: { '@/*': [`${relative(root)}/src/*`] } },
      include: ['app/**/*.tsx', '.next/types/**/*.ts', `${relative(root)}/src/styles/styled.d.ts`], exclude: ['node_modules'] }),
    'app/layout.tsx': `export { default, metadata } from ${JSON.stringify(`../${relative(path.join(root, 'src/app/layout'))}`)};`,
    'app/scenarios.json': JSON.stringify(scenarios),
    'app/fixture-page.tsx': `import { notFound } from 'next/navigation';
import { MatchFeedPage } from '@/app/_components/match-feed-page';
import { BodyText } from '@/components/ui/layout';
import { parseFeedQuery, feedQueryKey } from '@/domain/feed-query';
import { parseReportingDate } from '@/domain/calendar';
import type { FeedPageResult } from '@/server/matches/feed-page';
import scenarios from './scenarios.json';
const cases = scenarios as unknown as Record<string, { query: ReturnType<typeof parseFeedQuery>; today: ReturnType<typeof parseReportingDate>; result: FeedPageResult }>;
export default async function FixturePage({ params, searchParams }: {
  params: Promise<{ date?: string; scenario?: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { date, scenario } = await params, input = await searchParams;
  if (!scenario) {
    const today = parseReportingDate('2026-10-09');
    let query;
    try { query = parseFeedQuery(input, { today, ...(date ? { routeDate: date } : {}) }); } catch { notFound(); }
    // Deliberate test-only delay/error for navigation races and failed refreshes.
    if (query.search === 'Slow query') await new Promise((resolve) => setTimeout(resolve, 1800));
    if (['Unavailable query', 'Slow query', 'Busy query'].includes(query.search)) {
      return <MatchFeedPage query={query} today={today} result={{ data: null, error: query.search === 'Busy query' ? 'rate-limited' : 'unavailable' }} />;
    }
    const selected = Object.values(cases).find((item) => item.result.data && item.today === today && item.query.page === query.page &&
      feedQueryKey(item.query, today) === feedQueryKey(query, today));
    if (!selected) notFound();
    return <MatchFeedPage query={query} today={today} result={selected.result} />;
  }
  const selected = cases[scenario]; if (!selected) notFound();
  return <MatchFeedPage {...selected} controls={<BodyText>Synthetic acceptance fixtures only. This isolated app never serves production forecasts.</BodyText>} />;
}`,
    'app/en/page.tsx': `export { default } from '../fixture-page'; export const dynamic = 'force-dynamic';`,
    'app/en/predictions/[date]/page.tsx': `export { default } from '../../../fixture-page'; export const dynamic = 'force-dynamic';`,
    'app/cases/[scenario]/page.tsx': `export { default } from '../../fixture-page'; export const dynamic = 'force-dynamic';`,
    'app/api/matches/route.ts': `import { parseFeedQuery, feedQueryKey } from '@/domain/feed-query';
import { parseReportingDate } from '@/domain/calendar';
import type { MatchFeedResponse } from '@/domain/match-feed';
import scenarios from '../../scenarios.json';
const cases = scenarios as unknown as Record<string, { query: ReturnType<typeof parseFeedQuery>; today: string; result: { data: MatchFeedResponse | null } }>;
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const today = parseReportingDate('2026-10-09');
  let query; try { query = parseFeedQuery(new URL(request.url).searchParams, { today }); } catch { return Response.json({ error: 'invalid-query' }, { status: 400 }); }
  const selected = Object.entries(cases).find(([name, item]) => !name.startsWith('pagination-changed') &&
    item.result.data && item.today === today && item.query.page === query.page && feedQueryKey(item.query, today) === feedQueryKey(query, today));
  return selected ? Response.json(selected[1].result.data, { headers: { 'cache-control': 'no-store' } }) : Response.json({error:'unavailable'},{status:503});
}`,
    'app/en/matches/[fixtureId]/[slug]/page.tsx': `import { notFound } from 'next/navigation';
import { PublicShell } from '@/app/_components/public-shell';
import { BodyText, PageHeading } from '@/components/ui/layout';
import { canonicalMatchSlug } from '@/domain/match-slug';
import type { MatchFeedResponse } from '@/domain/match-feed';
import scenarios from '../../../../scenarios.json';
const cases = scenarios as unknown as Record<string, { result: { data: MatchFeedResponse | null } }>;
export default async function Page({ params }: { params: Promise<{ fixtureId: string; slug: string }> }) {
  const { fixtureId, slug } = await params;
  const fixture = Object.values(cases).flatMap((item) => item.result.data?.records ?? []).find((item) => item.fixtureId === fixtureId);
  if (!fixture || slug !== canonicalMatchSlug(fixture.homeTeam.name, fixture.awayTeam.name)) notFound();
  return <PublicShell><PageHeading>Synthetic analysis destination</PageHeading>
    <BodyText>{fixture.homeTeam.name} v {fixture.awayTeam.name}</BodyText>
    <BodyText>Isolated one-tap navigation check; real detail content belongs to prompt 035.</BodyText></PublicShell>;
}`,
  };
  if (details) {
    files['app/detail-scenarios.json'] = JSON.stringify(details);
    files['app/en/matches/[fixtureId]/[slug]/page.tsx'] = `import { createMatchDetailRoute } from '@/app/_components/match-detail-route';
import { MatchFeedError } from '@/server/matches/feed-error';
import { parseMatchDetailQuery } from '@/server/matches/detail-query';
import type { DetailPageResult } from '@/server/matches/detail-page';
import cases from '../../../../detail-scenarios.json';
const scenarios = cases as unknown as Record<string, DetailPageResult & { requestQuery?: string }>;
let failNextHistory = true, busyNextHistory = true;
const route = createMatchDetailRoute(async (id, parameters = new URLSearchParams()) => {
  const query = parseMatchDetailQuery(id, parameters), values = Object.values(scenarios);
  const primary = ['history-current', 'history-cycle-current', 'history-locked-current'].map(key => scenarios[key]).find(item => item?.data?.fixture.fixtureId === id)
    ?? values.find(item => item.data?.fixture.fixtureId === id && item.data.selection === 'applicable');
  if (!primary?.data) throw new MatchFeedError('not-found');
  if (!parameters.size) return primary.data;
  if (query.limit === 20 && failNextHistory) { failNextHistory = false; throw new MatchFeedError('unavailable'); }
  if (query.limit === 19 && busyNextHistory) { busyNextHistory = false; throw new MatchFeedError('rate-limited'); }
  const selected = values.find(item => item.data?.fixture.fixtureId === id &&
    (query.revision ? item.data.selection === 'revision' && item.data.snapshot?.revisionId === query.revision
      : query.cycle ? item.data.selection === 'cycle' && item.data.selectedCycle?.id === query.cycle : item.data.selection === 'applicable') &&
    (query.revisionBefore === null || new URLSearchParams(item.requestQuery).get('revisionBefore') === String(query.revisionBefore)) &&
    (query.cycleBefore === null || new URLSearchParams(item.requestQuery).get('cycleBefore') === String(query.cycleBefore)));
  if (selected?.data) return selected.data;
  if (query.revision || query.cycle) throw new MatchFeedError('not-found');
  return primary.data;
});
type Props = { params: Promise<{ fixtureId: string; slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const normalized = (props: Props) => ({ ...props, params: props.params.then(params => ({ ...params, locale: 'en' })) });
export const dynamic = 'force-dynamic';
export function generateMetadata(props: Props) { return route.generateMetadata(normalized(props)); }
export default function Page(props: Props) { return route.Page(normalized(props)); }
`;
    files['app/detail-cases/[scenario]/page.tsx'] = `import { notFound } from 'next/navigation';
import { MatchDetailPage } from '@/app/_components/match-detail-page';
import { parseReportingDate } from '@/domain/calendar';
import type { DetailPageResult } from '@/server/matches/detail-page';
import cases from '../../detail-scenarios.json';
const scenarios = cases as unknown as Record<string, DetailPageResult & { requestQuery?: string }>;
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ scenario: string }> }) {
  const { scenario } = await params, selected = scenarios[scenario]; if (!selected) notFound();
  if (scenario.startsWith('history-')) {
    const primary = ['history-current', 'history-cycle-current', 'history-locked-current'].map(key => scenarios[key]).find(item => item?.data?.fixture.fixtureId === selected.data?.fixture.fixtureId);
    if (!primary) notFound();
    return <MatchDetailPage result={primary} historyResult={selected} historyQuery={selected.requestQuery ?? ''}
      today={parseReportingDate('2026-10-09')} retryHref={primary.data!.route.path} />;
  }
  return <MatchDetailPage result={selected} today={parseReportingDate('2026-10-09')} retryHref={selected.data?.route.path ?? '/detail-cases/open'} />;
}`;
  }
  if (includeLive) {
    // Test-only clock and rollover projections. This generated app is outside src/app.
    const clockImport = `import { readFile } from 'node:fs/promises';
import { getReportingDate, utcInstantFromEpochMilliseconds, addReportingDays } from '@/domain/calendar';
const readClock = async () => JSON.parse(await readFile(${JSON.stringify(path.join(directory, 'live-clock.json'))}, 'utf8')).now as number;
`;
    files['app/fixture-page.tsx'] = clockImport + files['app/fixture-page.tsx']
      .replace("const today = parseReportingDate('2026-10-09');", "const instant = await readClock(), today = getReportingDate(utcInstantFromEpochMilliseconds(instant)); const originalToday = parseReportingDate('2026-10-09');")
      .replace('item.today === today && item.query.page', 'item.today === originalToday && item.query.page')
      .replace('feedQueryKey(item.query, today) === feedQueryKey(query, today)', 'feedQueryKey(item.query, originalToday) === feedQueryKey(query, originalToday)')
      .replace('result={selected.result}', `result={{ data: rollover(selected.result.data!, query, today, instant), error: null }}`)
      .replace("import { parseFeedQuery, feedQueryKey }", "import { parseFeedQuery, feedQueryKey, resolveFeedDates }");
    const rollover = `
function rollover(original: import('@/domain/match-feed').MatchFeedResponse, query: ReturnType<typeof parseFeedQuery>, today: ReturnType<typeof parseReportingDate>, instant: number) {
  const data = structuredClone(original), relative = ['today','tomorrow','next-7-days'].includes(query.dates.kind);
  const range = resolveFeedDates(query, today), shift = relative ? Date.parse(today) - Date.parse('2026-10-09') : 0;
  data.today = today; data.asOf = Math.max(data.asOf, instant);
  data.range = { from: range.startDate, to: range.endDate, ...range.window };
  if (shift) {
    data.records = data.records.map(record => ({ ...record, dataVersion: String(BigInt(record.dataVersion) + BigInt(shift / 86400000)), kickoffAt: record.kickoffAt === null ? null : (record.kickoffAt + shift) as typeof record.kickoffAt }));
    data.coverage.dates = data.coverage.dates.map(entry => ({ ...entry, date: addReportingDays(parseReportingDate(entry.date), shift / 86400000) }));
    if (data.run) data.run = { ...data.run, date: today, sequence: today.replaceAll('-', '') };
  }
  return data;
}
`;
    files['app/fixture-page.tsx'] += rollover;
    files['app/api/matches/route.ts'] = clockImport + files['app/api/matches/route.ts']
      .replace("const today = parseReportingDate('2026-10-09');", "const instant = await readClock(), today = getReportingDate(utcInstantFromEpochMilliseconds(instant)); const originalToday = parseReportingDate('2026-10-09');")
      .replace('item.today === today && item.query.page', 'item.today === originalToday && item.query.page')
      .replace('feedQueryKey(item.query, today) === feedQueryKey(query, today)', 'feedQueryKey(item.query, originalToday) === feedQueryKey(query, originalToday)')
      .replace('Response.json(selected[1].result.data,', 'Response.json(rollover(selected[1].result.data!, query, today, instant),')
      .replace("import { parseFeedQuery, feedQueryKey }", "import { parseFeedQuery, feedQueryKey, resolveFeedDates }") + rollover;
    files['app/api/matches/[id]/route.ts'] = `import cases from '../../../detail-scenarios.json';
import type { DetailPageResult } from '@/server/matches/detail-page';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, values = cases as unknown as Record<string, DetailPageResult>;
  const selected = ['history-current','history-cycle-current','history-locked-current'].map(key => values[key]).find(item => item?.data?.fixture.fixtureId === id)
    ?? Object.values(values).find(item => item.data?.fixture.fixtureId === id && item.data.selection === 'applicable');
  return selected?.data ? Response.json(selected.data, { headers: { 'cache-control': 'no-store' } }) : Response.json({error:'not-found'}, {status:404});
}`;
  }
  for (const [name, contents] of Object.entries(files)) {
    const target = path.join(directory, name); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, `${contents}\n`);
  }
  if (!reuse) await cp(path.join(root, 'public/brand'), path.join(directory, 'public/brand'), { recursive: true, errorOnExist: true, force: false });
  return { directory, scenarios, details };
}

async function port() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address(); assert.ok(address && typeof address === 'object');
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); return address.port;
}

async function verify(origin, directory, scenarios) {
  for (const [name, scenario] of Object.entries(scenarios)) {
    const response = await fetch(`${origin}/cases/${name}`); assert.equal(response.status, 200, name);
    assert.equal(response.headers.get('set-cookie'), null);
    const html = await response.text(), visible = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, '').replace(/<!--[\s\S]*?-->/g, '');
    await writeFile(path.join(directory, `${name}.html`), html);
    assert.ok(html.indexOf('data-styled=') < html.indexOf('<main'), `${name}: CSS before content`);
    assert.equal((visible.match(/<h1[\s>]/g) ?? []).length, 1);
    const articles = [...visible.matchAll(/<article\b[^>]*data-fixture-id="([^"]+)"[^>]*>([\s\S]*?)<\/article>/g)];
    assert.deepEqual(articles.map((item) => item[1]), scenario.result.data?.records.map((item) => item.fixtureId) ?? []);
    for (const [index, record] of (scenario.result.data?.records ?? []).entries()) {
      const article = articles[index][2];
      assert.ok(article.includes(record.homeTeam.name)); assert.ok(article.includes(record.awayTeam.name));
      assert.match(article, /Kickoff: <time/); assert.match(article, /Prediction:/); assert.match(article, /Last synced: <time/);
      assert.equal((article.match(/<a\b/g) ?? []).length, 1);
      if (record.forecast) assert.ok(article.includes(new Date(record.forecast.publishedAt).toISOString()));
      if (record.syncedAt !== null) assert.ok(article.includes(new Date(record.syncedAt).toISOString()));
      assert.doesNotMatch(article, /\/_next\/image|\s\$[\w-]+=/);
    }
    if (name === 'today') { assert.match(visible, /Current prediction/); assert.match(visible, /No prediction was locked for this market/); assert.match(visible, /2 of 34 prediction jobs completed/); }
    if (name === 'historical') { assert.match(visible, /Locked prediction/); assert.match(visible, /Final score/); assert.match(visible, /data-outcome="correct"/); }
    if (name === 'empty') assert.match(visible, /No fixtures confirmed/);
    if (['partial', 'partial-empty', 'failed-import', 'unknown'].includes(name)) { assert.match(visible, /Partial fixture coverage/); assert.doesNotMatch(visible, /No fixtures confirmed/); }
    if (name === 'unavailable-predictions') assert.match(visible, /Prediction data unavailable/);
    if (name === 'failure') { assert.match(visible, /Matches temporarily unavailable/); assert.match(visible, /Try again/); assert.doesNotMatch(visible, /No fixtures confirmed|prediction jobs completed/); }
    if (name === 'outside') assert.match(visible, /Predictions become available within seven days of the match/);
    if (['today', 'last-day', 'historical'].includes(name)) assert.doesNotMatch(visible, /Predictions become available within seven days of the match/);
    if (['not-started', 'selecting'].includes(name)) assert.doesNotMatch(visible, /of \d+ prediction jobs completed/);
  }
  console.log(`PASS ${Object.keys(scenarios).length} anonymous server-rendered scenarios: original stored cards/clocks, initial CSS, honest coverage/errors, current/locked forecasts and EAT window.`);
}

async function verifyDetail(origin, directory, scenarios) {
  const escaped = (value) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' })[character]);
  for (const [name, scenario] of Object.entries(scenarios)) {
    if (name.startsWith('history-')) continue;
    const response = await fetch(`${origin}/detail-cases/${name}`); assert.equal(response.status, 200, name);
    assert.equal(response.headers.get('set-cookie'), null);
    const html = await response.text(), visible = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, '').replace(/<!--[\s\S]*?-->/g, '');
    await writeFile(path.join(directory, `detail-${name}.html`), html);
    assert.ok(html.indexOf('data-styled=') < html.indexOf('<main'), `${name}: CSS before content`);
    assert.equal((visible.match(/<h1[\s>]/g) ?? []).length, 1);
    if (!scenario.data) { assert.match(visible, /Match temporarily unavailable/); assert.match(visible, /Try again/); continue; }
    const { fixture, snapshot } = scenario.data;
    assert.ok(visible.includes(escaped(fixture.homeTeam.name))); assert.ok(visible.includes(escaped(fixture.awayTeam.name)));
    assert.equal((visible.match(/data-detail-market=/g) ?? []).length, 4, name);
    assert.match(visible, /Match result and settlement/); assert.match(visible, /excluding extra time and penalties/);
    assert.doesNotMatch(visible, /\/_next\/image|\s\$[\w-]+=/);
    if (snapshot) {
      assert.ok(visible.includes(`data-detail-revision="${snapshot.revisionId}"`));
      assert.ok(visible.includes(new Date(snapshot.publishedAt).toISOString()));
      for (const outcome of snapshot.outcomes) assert.ok(visible.includes(`data-outcome="${outcome.status}"`));
      if (name === 'unsafe-links') { assert.doesNotMatch(visible, /href="https:\/\/localhost|href="javascript:|<script>/); assert.match(visible, /original explanation is unavailable/); }
      else if (snapshot.analysis.state === 'available') for (const reason of snapshot.analysis.reasons) assert.ok(visible.includes(escaped(reason.text)), `${name}: original reason text`);
      else assert.match(visible, /original explanation is unavailable/);
    } else assert.match(visible, /No prediction analysis is available/);
    if (name === 'closed-without-lock') assert.match(visible, /cycle closed without an eligible locked prediction/);
    if (name.startsWith('void-')) assert.match(visible, /voided because the match was postponed/);
    if (name === 'corrected') assert.match(visible, /Result correction applied/);
  }
  const data = scenarios.open.data;
  const unknown = await fetch(`${origin}/en/matches/00000000-0000-4000-8000-000000000000/unknown`); assert.equal(unknown.status, 404);
  const stale = await fetch(`${origin}/en/matches/${data.fixture.fixtureId}/old-name`, { redirect: 'manual' });
  assert.equal(stale.status, 308); assert.equal(new URL(stale.headers.get('location'), origin).pathname, data.route.path);
  const canonical = await fetch(`${origin}${data.route.path}`); assert.equal(canonical.status, 200);
  const canonicalHtml = await canonical.text(); assert.ok(canonicalHtml.includes(`https://goalhint.com${data.route.path}`));
  assert.match(canonicalHtml, /property="og:title"/); assert.match(canonicalHtml, /noindex, follow/);
  console.log(`PASS ${Object.keys(scenarios).filter(name => !name.startsWith('history-')).length} stored detail HTML scenarios, canonical metadata/redirect and genuine unknown-fixture 404.`);
}

async function verifyHistory(origin, directory, scenarios) {
  const current = scenarios['history-current'].data, old = scenarios['history-old'].data, partial = scenarios['history-partial'].data;
  const read = async (query) => {
    const response = await fetch(`${origin}${current.route.path}${query ? '?'+query : ''}`);
    assert.equal(response.status, 200); assert.equal(response.headers.get('set-cookie'), null);
    const html = await response.text(); return { html, visible: html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, '') };
  };
  const primary = await read('');
  assert.match(primary.visible, /data-revision-history/); assert.doesNotMatch(primary.visible, /data-history-snapshot=/);
  for (const [name, data] of [['old', old], ['partial', partial]]) {
    const { html, visible } = await read(`revision=${data.snapshot.revisionId}&limit=1`);
    await writeFile(path.join(directory, `history-${name}.html`), html);
    assert.ok(visible.includes(`data-detail-revision="${current.snapshot.revisionId}"`));
    assert.ok(visible.includes(`data-history-snapshot="${data.snapshot.revisionId}"`));
    assert.match(visible, /Historical prediction snapshot/); assert.match(visible, /Historical publication/);
    assert.equal((visible.match(/data-detail-market=/g) ?? []).length, 8);
    assert.equal((visible.match(/<article\b/g) ?? []).length, 1);
    assert.match(html, /noindex, follow/); assert.ok(html.includes(`href="https://goalhint.com${current.route.path}"`));
    assert.doesNotMatch(visible, /candidateJson|promptVersion|private-void-proof|rawJson/);
    if (name === 'partial') assert.match(visible, /does not contain a supported probability group/);
    const ids = [...visible.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]); assert.equal(new Set(ids).size, ids.length);
  }
  for (const query of [`revision=${scenarios.open.data.snapshot.revisionId}`, 'revision=00000000-0000-4000-8000-000000000000', 'revision=bad',
    `revision=${old.snapshot.revisionId}&cycle=${old.snapshot.cycleId}`, 'limit=21', 'revisionBefore=1', `revision=${old.snapshot.revisionId}&revision=${old.snapshot.revisionId}`]) {
    assert.equal((await fetch(`${origin}${current.route.path}?${query}`)).status, 404, query);
  }
  const failed = await read(`revision=${old.snapshot.revisionId}&limit=20`);
  assert.match(failed.visible, /data-history-error/); assert.ok(failed.visible.includes(`data-detail-revision="${current.snapshot.revisionId}"`));
  assert.match(failed.visible, /Try again/); assert.match(failed.visible, /data-history-revision=/);
  const retried = await read(`revision=${old.snapshot.revisionId}&limit=20`); assert.match(retried.visible, /data-history-snapshot=/);
  assert.doesNotMatch(retried.visible, /data-history-error/);
  console.log('PASS revision history: separate primary/full historical/partial snapshots, fixture-scoped 404, canonical noindex, unique IDs and inline failure/retry.');
}

try {
  const { directory, scenarios, details } = await fixture(); console.log(`Building isolated match feed: ${directory}`);
  try {
    const built = await execute(process.execPath, [nextCli, 'build', directory], { cwd: directory, env: environment, windowsHide: true, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
    await writeFile(path.join(directory, 'build.log'), `${built.stdout}\n${built.stderr}`);
  } catch (error) {
    await writeFile(path.join(directory, 'build.log'), `${error.stdout ?? ''}\n${error.stderr ?? ''}`); throw new Error(`Fixture build failed; see ${directory}/build.log.`);
  }
  const origin = `http://127.0.0.1:${await port()}`;
  child = spawn(process.execPath, [nextCli, 'start', directory, '--hostname', '127.0.0.1', '--port', new URL(origin).port],
    { cwd: directory, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (data) => { log = `${log}${data}`.slice(-32 * 1024); });
  child.on('error', (error) => { log += error.message; });
  const deadline = Date.now() + 30_000;
  while (true) {
    assert.equal(child.exitCode, null, log);
    try { if ((await fetch(`${origin}/en`, { signal: AbortSignal.timeout(1000) })).ok) break; } catch { /* Startup. */ }
    assert.ok(Date.now() < deadline, log); await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await verify(origin, directory, scenarios);
  if (details) await verifyDetail(origin, directory, details);
  if (includeHistory) await verifyHistory(origin, directory, details);
  console.log(`Fixture artifacts: ${directory}`); console.log(`Fixture browser URL: ${origin}`);
  await writeFile(path.join(root, `.tmp/${includeLive ? '037' : includeHistory ? '036' : includeDetail ? '035' : '032'}-rendering-target.json`), JSON.stringify({ directory, origin }));
  if (args.includes('--serve')) await new Promise((resolve) => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve); child.once('exit', resolve); });
} catch (error) { console.error(error instanceof Error ? error.message : 'Match feed rendering verification failed.'); process.exitCode = 1; }
finally {
  if (child && child.exitCode === null) {
    const stopped = new Promise((resolve) => child.once('exit', resolve)); child.kill('SIGTERM');
    await Promise.race([stopped, new Promise((resolve) => setTimeout(resolve, 5000))]);
    if (child.exitCode === null) { child.kill('SIGKILL'); await stopped; }
  }
}
