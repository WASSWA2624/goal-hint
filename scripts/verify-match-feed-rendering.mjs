import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url)), execute = promisify(execFile);
const nextCli = createRequire(import.meta.url).resolve('next/dist/bin/next');
const args = process.argv.slice(2);
assert.ok(args.every((argument) => argument === '--serve'), 'Usage: node scripts/verify-match-feed-rendering.mjs [--serve]');
const environment = { ...process.env, NEXT_TELEMETRY_DISABLED: '1', FORCE_COLOR: '0' };
let child, log = '';

async function fixture() {
  await mkdir(path.join(root, '.tmp'), { recursive: true });
  const directory = await mkdtemp(path.join(root, '.tmp/match-feed-'));
  const capture = path.join(directory, 'scenarios.json');
  try {
    const result = await execute(process.execPath, ['--conditions=react-server', '--test', 'tests/feed-page.integration.mjs'], {
      cwd: root, env: { ...environment, MATCH_FEED_PAGE_CAPTURE: capture }, windowsHide: true, timeout: 240_000, maxBuffer: 4 * 1024 * 1024,
    });
    await writeFile(path.join(directory, 'database.log'), `${result.stdout}\n${result.stderr}`);
  } catch (error) {
    await writeFile(path.join(directory, 'database.log'), `${error.stdout ?? ''}\n${error.stderr ?? ''}`);
    throw new Error(`Stored fixture preparation failed; see ${directory}/database.log.`);
  }
  const scenarios = JSON.parse(await readFile(capture, 'utf8'));
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
  for (const [name, contents] of Object.entries(files)) {
    const target = path.join(directory, name); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, `${contents}\n`);
  }
  await cp(path.join(root, 'public/brand'), path.join(directory, 'public/brand'), { recursive: true, errorOnExist: true, force: false });
  return { directory, scenarios };
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

try {
  const { directory, scenarios } = await fixture(); console.log(`Building isolated match feed: ${directory}`);
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
  console.log(`Fixture artifacts: ${directory}`); console.log(`Fixture browser URL: ${origin}`);
  await writeFile(path.join(root, '.tmp/032-rendering-target.json'), JSON.stringify({ directory, origin }));
  if (args.includes('--serve')) await new Promise((resolve) => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve); child.once('exit', resolve); });
} catch (error) { console.error(error instanceof Error ? error.message : 'Match feed rendering verification failed.'); process.exitCode = 1; }
finally {
  if (child && child.exitCode === null) {
    const stopped = new Promise((resolve) => child.once('exit', resolve)); child.kill('SIGTERM');
    await Promise.race([stopped, new Promise((resolve) => setTimeout(resolve, 5000))]);
    if (child.exitCode === null) { child.kill('SIGKILL'); await stopped; }
  }
}
