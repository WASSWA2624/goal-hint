import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { request as httpRequest } from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url)), execute = promisify(execFile);
const nextCli = createRequire(import.meta.url).resolve('next/dist/bin/next');
const args = process.argv.slice(2);
assert.ok(args.every(value => value === '--serve' || value.startsWith('--capture=') || value.startsWith('--reuse=')),
  'Usage: node scripts/verify-seo-rendering.mjs [--serve] [--capture=.tmp/seo-capture-ID|--reuse=.tmp/seo-ID]');
assert.ok(args.filter(value => value.startsWith('--capture=')).length <= 1);
const environment = { ...process.env, NEXT_TELEMETRY_DISABLED: '1', FORCE_COLOR: '0' };
let child, serverLog = '';

async function prepare() {
  await mkdir(path.join(root, '.tmp'), { recursive: true });
  const reuse = args.find(value => value.startsWith('--reuse='))?.slice('--reuse='.length);
  if (reuse) {
    assert.equal(args.length - args.filter(value => value === '--serve').length, 1);
    const directory = await realpath(path.resolve(root, reuse));
    assert.match(path.relative(await realpath(path.join(root, '.tmp')), directory), /^seo-[a-zA-Z0-9]+$/);
    const log = await readFile(path.join(directory, 'database.log'), 'utf8');
    assert.match(log, /\bfail 0\b/); assert.match(log, /\bskipped 0\b/);
    return { directory, cases: JSON.parse(await readFile(path.join(directory, 'scenarios.json'), 'utf8')) };
  }
  const directory = await mkdtemp(path.join(root, '.tmp/seo-'));
  const supplied = args.find(value => value.startsWith('--capture='))?.slice('--capture='.length);
  const capture = path.join(directory, 'scenarios.json');
  if (supplied) {
    const source = await realpath(path.resolve(root, supplied));
    assert.match(path.relative(await realpath(path.join(root, '.tmp')), source), /^seo-capture-[a-zA-Z0-9]+$/);
    const log = await readFile(path.join(source, 'database.log'), 'utf8');
    assert.match(log, /\bfail 0\b/); assert.match(log, /\bskipped 0\b/);
    await cp(path.join(source, 'scenarios.json'), capture); await writeFile(path.join(directory, 'database.log'), log);
  } else {
    try {
      const result = await execute(process.execPath, ['--conditions=react-server', '--test', 'tests/discovery.integration.mjs'],
        { cwd: root, env: { ...environment, SEO_PAGE_CAPTURE: capture }, windowsHide: true, timeout: 300_000, maxBuffer: 4 * 1024 * 1024 });
      await writeFile(path.join(directory, 'database.log'), `${result.stdout}\n${result.stderr}`);
      assert.match(result.stdout, /\bskipped 0\b/, 'Real MySQL acceptance may not be skipped.');
    } catch (error) { throw new Error(`SQL preparation failed: ${error.message}. See ${directory}/database.log.`); }
  }
  const cases = JSON.parse(await readFile(capture, 'utf8'));
  assert.equal(cases.inventory.matches, 35); assert.ok(cases.details[cases.publishedId].current.data.snapshot);
  const relative = target => path.relative(directory, target).split(path.sep).join('/');
  const files = {
    'package.json': JSON.stringify({ private: true, type: 'module' }),
    'next.config.ts': `import config from ${JSON.stringify(`./${relative(path.join(root, 'next.config'))}`)};
export default {...config,turbopack:{root:${JSON.stringify(root)}}};`,
    'tsconfig.json': JSON.stringify({ extends: `${relative(root)}/tsconfig.json`, compilerOptions: { paths: { '@/*': [`${relative(root)}/src/*`] } },
      include: ['app/**/*.tsx', 'app/**/*.ts', '.next/types/**/*.ts', `${relative(root)}/src/styles/styled.d.ts`], exclude: ['node_modules'] }),
    'app/layout.tsx': `export {default,metadata} from ${JSON.stringify(`../${relative(path.join(root, 'src/app/layout'))}`)};`,
    'app/[locale]/layout.tsx': `export {default,generateMetadata} from '@/app/[locale]/layout';`,
    'app/page.tsx': `export {default} from '@/app/page';`,
    'app/policy.ts': `import {resolveDiscoveryPolicy} from '@/domain/discovery';
// Synthetic release evidence belongs only to this isolated acceptance app.
export const policy=()=>resolveDiscoveryPolicy({deployment:process.env.SEO_ACCEPTANCE_ENVIRONMENT,runtime:process.env.NODE_ENV,releaseVerified:true});`,
    'proxy.ts': `import {createDiscoveryProxy} from '@/server/seo/proxy';
import {policy} from './app/policy';
export const proxy=createDiscoveryProxy(policy);
export const config={matcher:['/((?!api(?:/|$)|_next(?:/|$)|brand(?:/|$)|.*\\\\.).*)']};`,
    'app/stored.ts': `import {notFound} from 'next/navigation';
import {parseFeedQuery,feedQueryKey} from '@/domain/feed-query';
import {getReportingDate,utcInstantFromEpochMilliseconds} from '@/domain/calendar';
import {parseMatchDetailQuery} from '@/server/matches/detail-query';
import {MatchFeedError} from '@/server/matches/feed-error';
import {createDiscoveryRoutes} from '@/server/seo/discovery-routes';
import type {MatchFeedResponse} from '@/domain/match-feed';
import type {MatchDetailResponse} from '@/domain/match-detail';
import type {FeedQuery,FeedParameters} from '@/domain/feed-query';
import data from '../scenarios.json';
import {policy} from './policy';
export const instant=async()=>utcInstantFromEpochMilliseconds(data.at);
const today=getReportingDate(utcInstantFromEpochMilliseconds(data.at));
const feeds=Object.values(data.feeds) as unknown as {query:FeedQuery;result:{data:MatchFeedResponse}}[];
const details=data.details as unknown as Record<string,{current:{data:MatchDetailResponse};revision?:{data:MatchDetailResponse}}>;
export const readFeed=async(parameters:FeedParameters)=>{
 const query=parseFeedQuery(parameters,{today});
 const selected=feeds.find(item=>item.query.page===query.page&&feedQueryKey(item.query,today)===feedQueryKey(query,today));
 if(!selected)throw new MatchFeedError('unavailable');return selected.result.data;
};
export const readDetail=async(id:string,parameters=new URLSearchParams())=>{
 const query=parseMatchDetailQuery(id,parameters),item=details[id];if(!item)throw new MatchFeedError('not-found');
 if(query.revision){if(item.revision?.data.snapshot?.revisionId!==query.revision)throw new MatchFeedError('not-found');return item.revision.data;}
 return item.current.data;
};
const reader={inventory:async()=>data.inventory,matches:async(page:number)=>page===0?data.matches.map(row=>({...row,lastModified:new Date(row.lastModified)})):[],dates:async(page:number)=>page===0?data.dates:[]};
export const discovery=createDiscoveryRoutes({policy,reader:()=>reader,missing:notFound});`,
    'app/[locale]/page.tsx': `import {createFeedRoute} from '@/app/_components/feed-route';
import {readFeed,instant} from '../stored';import {policy} from '../policy';
const route=createFeedRoute({read:readFeed,instant,policy});export const generateMetadata=route.generateMetadata;export default route.Page;`,
    'app/[locale]/predictions/[date]/page.tsx': `import {createFeedRoute} from '@/app/_components/feed-route';
import {readFeed,instant} from '../../../stored';import {policy} from '../../../policy';
const route=createFeedRoute({dated:true,read:readFeed,instant,policy});export const generateMetadata=route.generateMetadata;export default route.Page;`,
    'app/[locale]/matches/[fixtureId]/[slug]/page.tsx': `import {createMatchDetailRoute} from '@/app/_components/match-detail-route';
import {readDetail} from '../../../../stored';import {policy} from '../../../../policy';
const route=createMatchDetailRoute(readDetail,policy);export const generateMetadata=route.generateMetadata;export default route.Page;`,
    'app/robots.ts': `import {discovery} from './stored';export const dynamic='force-dynamic';export default discovery.robots;`,
    'app/sitemap.ts': `import {discovery} from './stored';export const dynamic='force-dynamic';export default discovery.sitemap;`,
    'app/matches/sitemap.ts': `import {discovery} from '../stored';export const dynamic='force-dynamic';export const generateSitemaps=discovery.matchIds;export default discovery.matches;`,
    'app/archive/sitemap.ts': `import {discovery} from '../stored';export const dynamic='force-dynamic';export const generateSitemaps=discovery.dateIds;export default discovery.dates;`,
  };
  for (const page of ['privacy', 'terms', 'contact']) files[`app/[locale]/${page}/page.tsx`] = `export {default} from '@/app/[locale]/${page}/page';
import {createInformationMetadata} from '@/server/seo/metadata';import {policy} from '../../policy';export const generateMetadata=createInformationMetadata('${page}',policy);`;
  files['app/[locale]/how-it-works/page.tsx'] = `import {InformationShell} from '@/app/_components/information-shell';
import {createInformationMetadata} from '@/server/seo/metadata';import {policy} from '../../policy';
export const generateMetadata=createInformationMetadata('how-it-works',policy);
export default function Page(){return <InformationShell locale="en" page="how-it-works"/>;}`;
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(directory, name); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, content);
  }
  await cp(path.join(root, 'public/brand'), path.join(directory, 'public/brand'), { recursive: true });
  return { directory, cases };
}

async function port() {
  const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const value = server.address().port; await new Promise(resolve => server.close(resolve)); return value;
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const stopped = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGTERM');
  await Promise.race([stopped, new Promise(resolve => setTimeout(resolve, 5000))]);
  if (child.exitCode === null) { child.kill('SIGKILL'); await stopped; }
}
async function start(directory, deployment) {
  const origin = `http://127.0.0.1:${await port()}`;
  child = spawn(process.execPath, [nextCli, 'start', directory, '--hostname', '127.0.0.1', '--port', new URL(origin).port],
    { cwd: directory, env: { ...environment, SEO_ACCEPTANCE_ENVIRONMENT: deployment }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', value => { serverLog = `${serverLog}${value}`.slice(-32 * 1024); });
  const deadline = Date.now() + 30_000;
  while (true) {
    assert.equal(child.exitCode, null, serverLog);
    try { if ((await fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(1000) })).ok) return origin; } catch { /* Startup. */ }
    assert.ok(Date.now() < deadline, serverLog); await new Promise(resolve => setTimeout(resolve, 100));
  }
}
async function request(origin, path, headers = {}) {
  // Node's fetch ignores a supplied Host header. Use HTTP to exercise the real www seam.
  const response = headers.host ? await new Promise((resolve, reject) => {
    const outgoing = httpRequest(new URL(path, origin), { headers }, incoming => {
      const chunks = []; incoming.on('data', chunk => chunks.push(chunk)); incoming.on('error', reject);
      incoming.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: incoming.statusCode,
        headers: Object.fromEntries(Object.entries(incoming.headers).filter(([, value]) => value !== undefined)
          .map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value])) })));
    });
    outgoing.setTimeout(20_000, () => outgoing.destroy(new Error('Host redirect timed out.')));
    outgoing.on('error', reject); outgoing.end();
  }) : await fetch(new URL(path, origin), { redirect: 'manual', headers, signal: AbortSignal.timeout(20_000) });
  assert.equal(response.headers.get('set-cookie'), null);
  return { response, html: await response.text() };
}
const visible = html => html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, '');
const locations = xml => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1].replaceAll('&amp;', '&'));
function metadata(html, name, property = false) {
  return html.match(new RegExp(`<meta ${property ? 'property' : 'name'}="${name}" content="([^"]*)"`))?.[1];
}
async function verify(origin, cases, staging) {
  let checks = 0;
  const fixed = 'https://goalhint.com';
  async function page(path, canonical, index) {
    const { response, html } = await request(origin, path);
    assert.equal(response.status, 200, path); assert.match(html, /<html[^>]*lang="en"/);
    assert.equal(metadata(html, 'robots'), `${index ? 'index' : 'noindex'}, follow`, path);
    assert.equal(response.headers.get('x-robots-tag'), staging ? 'noindex, follow' : null, path);
    assert.ok(html.includes(`<link rel="canonical" href="${fixed}${canonical.replaceAll('&', '&amp;')}"`), path);
    assert.equal(metadata(html, 'og:url', true), `${fixed}${canonical.replaceAll('&', '&amp;')}`);
    assert.equal(metadata(html, 'og:site_name', true), 'Goal Hint');
    assert.equal(metadata(html, 'og:image', true), `${fixed}/brand/goal-hint-open-graph.png`);
    assert.equal(metadata(html, 'twitter:card'), 'summary_large_image');
    assert.ok(metadata(html, 'description')?.length > 30); assert.equal((visible(html).match(/<h1\b/g) ?? []).length, 1);
    assert.doesNotMatch(html, /rel="alternate"[^>]*hreflang=/); checks++; return html;
  }
  const root = await request(origin, '/'); assert.equal(root.response.status, 308); assert.equal(new URL(root.response.headers.get('location'), origin).pathname, '/en'); checks++;
  const www = await request(origin, '/en/predictions/2026-10-09?page=2', { host: 'www.goalhint.com' });
  assert.equal(www.response.status, 308); assert.equal(www.response.headers.get('location'), `${fixed}/en/predictions/2026-10-09?page=2`); checks++;
  const home = await page('/en', '/en', !staging); assert.match(home, /<title>Goal Hint \| Daily Football Predictions<\/title>/);
  const json = home.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)?.[1];
  assert.equal(JSON.parse(json)['@type'], 'WebSite'); assert.equal(JSON.parse(json).url, `${fixed}/en`); checks++;
  const archive = '/en/predictions/2026-10-09';
  const first = await page(archive, archive, !staging), second = await page(`${archive}?page=2`, `${archive}?page=2`, !staging);
  assert.notEqual(first.match(/<title>(.*?)<\/title>/)[1], second.match(/<title>(.*?)<\/title>/)[1]);
  assert.ok(visible(first).includes('page=2')); assert.match(second, /Page 2/); checks++;
  for (const path of ['/en?page=2', '/en?q=Discovery+Home+1', '/en?when=next-7-days', '/en?page=10000']) {
    const canonical = path === '/en?page=2' ? `${archive}?page=2` : path === '/en?page=10000' ? `${archive}?page=10000` : path;
    await page(path, canonical, path === '/en?page=2' && !staging);
  }
  const detail = cases.details[cases.publishedId].current.data;
  const match = await page(detail.route.path, detail.route.path, !staging);
  assert.match(visible(match), /Renamed Discovery Club/); assert.match(match, /data-detail-market=/); checks++;
  await page(`${detail.route.path}?revision=${cases.revision}`, detail.route.path, false);
  const unknown = await request(origin, '/en/matches/00000000-0000-4000-8000-000000000000/unknown'); assert.equal(unknown.response.status, 404); checks++;
  const invalid = await request(origin, '/en/predictions/not-a-date'); assert.equal(invalid.response.status, 404); checks++;
  const stale = await request(origin, `${cases.oldPath}?revision=${cases.revision}`);
  assert.equal(stale.response.status, 308); assert.equal(stale.response.headers.get('location'), `${detail.route.path}?revision=${cases.revision}#revision-history`); checks++;
  for (const name of ['privacy', 'terms', 'contact']) await page(`/en/${name}`, `/en/${name}`, false);
  const robots = (await request(origin, '/robots.txt')).html;
  assert.match(robots, /Allow: \//); assert.match(robots, /Disallow: \/api\//); assert.doesNotMatch(robots, /Disallow:.*(?:revision|\?|predictions|matches|\/en)/);
  const sitemap = (await request(origin, '/sitemap.xml')).html;
  const matches = (await request(origin, '/matches/sitemap/0.xml')).html;
  const dates = (await request(origin, '/archive/sitemap/0.xml')).html;
  if (staging) {
    assert.doesNotMatch(robots, /Sitemap:/); assert.deepEqual(locations(sitemap), []); assert.deepEqual(locations(matches), []); assert.deepEqual(locations(dates), []);
  } else {
    assert.match(robots, /Sitemap: https:\/\/goalhint.com\/matches\/sitemap\/0.xml/);
    assert.deepEqual(locations(sitemap), [`${fixed}/en`, `${fixed}/en/how-it-works`]);
    assert.deepEqual(locations(matches), cases.matches.map(row => `${fixed}${row.path}`));
    assert.deepEqual(locations(dates), [`${fixed}${archive}`]);
    for (const row of cases.matches) assert.ok(matches.includes(`<lastmod>${new Date(row.lastModified).toISOString()}</lastmod>`));
    assert.doesNotMatch(dates, /<lastmod>/); assert.doesNotMatch(sitemap, /<lastmod>/);
    for (const url of [...locations(matches), ...locations(dates)]) await page(new URL(url).pathname, new URL(url).pathname, true);
    // Native links discover page two and every first/second-page fixture without JS.
    const links = new Set([...visible(first + second).matchAll(/href="(\/en\/matches\/[^"?#]+)"/g)].map(value => value[1]));
    assert.equal(links.size, 35); for (const url of locations(matches)) assert.ok(links.has(new URL(url).pathname));
    assert.equal((await request(origin, '/matches/sitemap/1.xml')).response.status, 404);
    assert.equal((await request(origin, '/matches/sitemap/01.xml')).response.status, 404);
  }
  checks++;
  for (const asset of ['/brand/goal-hint-open-graph.png', '/brand/goal-hint-favicon.svg', '/brand/goal-hint-favicon.ico']) {
    assert.equal((await request(origin, asset)).response.status, 200, asset); checks++;
  }
  console.log(`PASS ${staging ? 'staging' : 'synthetic approved production'}: ${checks} HTTP/HTML checks, fixed canonical origin, crawlable noindex variants and native XML.`);
}

try {
  const { directory, cases } = await prepare(); console.log(`Building isolated SEO acceptance: ${directory}`);
  if (!args.some(value => value.startsWith('--reuse='))) try {
    const built = await execute(process.execPath, [nextCli, 'build', directory], { cwd: directory, env: { ...environment, SEO_ACCEPTANCE_ENVIRONMENT: 'staging' }, windowsHide: true, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
    await writeFile(path.join(directory, 'build.log'), `${built.stdout}\n${built.stderr}`);
  } catch (error) { await writeFile(path.join(directory, 'build.log'), `${error.stdout ?? ''}\n${error.stderr ?? ''}`); throw new Error(`Build failed; see ${directory}/build.log.`); }
  const stage = await start(directory, 'staging'); await verify(stage, cases, true); await stop();
  const origin = await start(directory, 'production'); await verify(origin, cases, false);
  await writeFile(path.join(root, '.tmp/042-rendering-target.json'), JSON.stringify({ directory, origin }));
  console.log(`SEO browser target: ${origin}; artifacts: ${directory}`);
  if (args.includes('--serve')) await new Promise(resolve => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve); child.once('exit', resolve); });
} catch (error) { console.error(error.stack); process.exitCode = 1; }
finally { await stop(); if (serverLog) await writeFile(path.join(root, '.tmp/042-isolated-server.log'), serverLog); }
