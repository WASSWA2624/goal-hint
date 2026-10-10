import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root=fileURLToPath(new URL('../',import.meta.url)), execute=promisify(execFile);
const nextCli=createRequire(import.meta.url).resolve('next/dist/bin/next');
const args=process.argv.slice(2);
assert.ok(args.every(value=>value==='--serve'||value.startsWith('--reuse=')), 'Usage: node scripts/verify-methodology-rendering.mjs [--serve] [--reuse=.tmp/methodology-ID]');
assert.ok(args.filter(value=>value.startsWith('--reuse=')).length<=1);
const environment={...process.env,NEXT_TELEMETRY_DISABLED:'1',FORCE_COLOR:'0'};
let child,serverLog='';

async function prepare() {
  await mkdir(path.join(root,'.tmp'),{recursive:true});
  const reuse=args.find(value=>value.startsWith('--reuse='))?.slice('--reuse='.length);
  const directory=reuse?await realpath(path.resolve(root,reuse)):await mkdtemp(path.join(root,'.tmp/methodology-'));
  assert.match(path.relative(await realpath(path.join(root,'.tmp')),directory),/^methodology-[a-zA-Z0-9]+$/);
  const capture=path.join(directory,'scenarios.json');
  if (!reuse) {
    try {
      const result=await execute(process.execPath,['--conditions=react-server','--test','--test-concurrency=1','tests/performance.integration.mjs'],{
        cwd:root,env:{...environment,PERFORMANCE_PAGE_CAPTURE:capture},windowsHide:true,timeout:360_000,maxBuffer:4*1024*1024,
      });
      await writeFile(path.join(directory,'database.log'),`${result.stdout}\n${result.stderr}`);
    } catch(error) {
      await writeFile(path.join(directory,'database.log'),`${error.stdout??''}\n${error.stderr??''}`);
      throw new Error(`SQL acceptance failed; see ${directory}/database.log.`);
    }
  }
  const databaseLog=await readFile(path.join(directory,'database.log'),'utf8');
  assert.match(databaseLog,/\bfail 0\b/);assert.match(databaseLog,/\bskipped 0\b/);
  const cases=JSON.parse(await readFile(capture,'utf8'));
  assert.equal(cases.mixed.data.cells[0].coverage.settled,4,'Genuine SQL preparation must not be skipped.');
  cases.failure={data:null,error:'unavailable'};cases.busy={data:null,error:'rate-limited'};
  cases['long-labels']=structuredClone(cases.mixed);
  for (const cell of cases['long-labels'].data.cells) {
    for (const version of cell.versions) version.version='LongVersionIdentifier'.repeat(10);
    for (const link of cell.evidence.links) link.matchLabel='<script>window.unsafeReport=true</script>'+'LongTeamIdentifier'.repeat(35);
  }
  const relative=target=>path.relative(directory,target).split(path.sep).join('/');
  const files={
    'package.json':JSON.stringify({private:true,type:'module'}),
    'next.config.mjs':`export default {agentRules:false,compiler:{styledComponents:true},turbopack:{root:${JSON.stringify(root)}}};`,
    'tsconfig.json':JSON.stringify({extends:`${relative(root)}/tsconfig.json`,compilerOptions:{paths:{'@/*': [ `${relative(root)}/src/*` ]}},
      include:['app/**/*.tsx','.next/types/**/*.ts',`${relative(root)}/src/styles/styled.d.ts`],exclude:['node_modules']}),
    'app/layout.tsx':`export {default,metadata} from ${JSON.stringify('../'+relative(path.join(root,'src/app/layout')))};`,
    'app/[locale]/layout.tsx':`export {default,generateMetadata} from '@/app/[locale]/layout';`,
    'app/cases.json':JSON.stringify(cases),
    'app/[locale]/how-it-works/page.tsx':`import cases from '../../cases.json';
import {createMethodologyRoute} from '@/app/_components/methodology-route';
import {parseReportingDate,utcInstantFromEpochMilliseconds} from '@/domain/calendar';
import {parsePerformanceQuery} from '@/server/performance/performance-query';
import {performanceParameters} from '@/server/performance/performance-page';
import {MatchFeedError} from '@/server/matches/feed-error';
import type {PerformanceResponse} from '@/domain/performance';
export {generateMetadata} from '@/app/[locale]/how-it-works/page';
const stored=cases as unknown as Record<string,{data:PerformanceResponse}>;
const at=utcInstantFromEpochMilliseconds(stored.default!.data.asOf);
export default createMethodologyRoute(async parameters=>{
  const query=parsePerformanceQuery(parameters,parseReportingDate('2026-10-13'));
  if(query.version==='server-failure')throw new MatchFeedError('unavailable');
  for(const name of ['default','unapproved','ai']) {
    const data=stored[name]!.data;
    const expected=parsePerformanceQuery(new URLSearchParams({from:data.cohort.from,to:data.cohort.to,market:data.filters.market,source:data.filters.source}),parseReportingDate('2026-10-13'));
    if(performanceParameters(query).toString()===performanceParameters(expected).toString())return data;
  }
  throw new MatchFeedError('unavailable');
},async()=>at);`,
    'app/case/[scenario]/page.tsx':`import {notFound} from 'next/navigation';
import cases from '../../cases.json';
import {MethodologyPage} from '@/app/_components/methodology-page';
import {parseReportingDate} from '@/domain/calendar';
import {parsePerformanceQuery} from '@/server/performance/performance-query';
import type {PerformancePageResult} from '@/server/performance/performance-page';
const stored=cases as unknown as Record<string,PerformancePageResult>;
export default async function Page({params}:{params:Promise<{scenario:string}>}){
  const {scenario}=await params,result=stored[scenario];if(!result||scenario.startsWith('detail:'))notFound();
  const data=result.data??stored.mixed!.data!;
  const query=parsePerformanceQuery(new URLSearchParams({from:data.cohort.from,to:data.cohort.to,market:data.filters.market,source:data.filters.source}),parseReportingDate('2026-10-13'));
  return <MethodologyPage locale="en" today={parseReportingDate('2026-10-13')} result={{...result,query}}/>;
}`,
    'app/[locale]/matches/[fixtureId]/[slug]/page.tsx':`import cases from '../../../../cases.json';
import {createMatchDetailRoute} from '@/app/_components/match-detail-route';
import type {MatchDetailResponse} from '@/domain/match-detail';
import {MatchFeedError} from '@/server/matches/feed-error';
const stored=cases as unknown as Record<string,MatchDetailResponse>;
const route=createMatchDetailRoute(async id=>{const data=stored['detail:'+id];if(!data)throw new MatchFeedError('not-found');return data;});
export const generateMetadata=route.generateMetadata;export default route.Page;`,
  };
  for (const [name,content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(directory,name)),{recursive:true});await writeFile(path.join(directory,name),content);
  }
  await cp(path.join(root,'public/brand'),path.join(directory,'public/brand'),{recursive:true});
  return {directory,cases};
}
async function port() {
  const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const value=server.address().port;await new Promise(resolve=>server.close(resolve));return value;
}
async function request(origin,url) {
  const response=await fetch(origin+url,{signal:AbortSignal.timeout(30_000)});
  assert.equal(response.status,200,url);assert.equal(response.headers.get('set-cookie'),null);
  return response.text();
}
async function verify(origin,cases) {
  let scenarios=0, reconciled=0;
  for(const [name,result] of Object.entries(cases).filter(([name])=>!name.startsWith('detail:'))) {
    const html=await request(origin,`/case/${name}`);
    assert.match(html,/<style data-styled/);assert.equal((html.match(/<h1[\s>]/g)??[]).length,1);
    assert.match(html,/data-correction-policy="unresolved"/);
    assert.match(html,/late lineup news may be absent/);assert.match(html,/strictly before scheduled kickoff minus five minutes/);
    assert.match(html,/<form[^>]*method="get"/);
    if(result.data) {
      assert.match(html,/data-stored-performance/);
      assert.equal((html.match(/data-performance-cell="/g)??[]).length,result.data.cells.length);
      for(const cell of result.data.cells) {
        const id=`${cell.family}:${cell.source}:${cell.horizon?.id??'overall'}`;
        const section=html.split(`data-performance-cell="${id}"`)[1].split('</section>')[0];
        for(const key of ['total','available','settled','pending','unavailable','void','filteredOut']) {
          assert.match(section,new RegExp(`data-count="${key}"[^>]*>${cell.coverage[key].toLocaleString('en')}</dd>`));reconciled++;
        }
        assert.equal(section.includes('data-performance-metrics'),cell.metrics.state==='available',`${name}:${id}`);
        if(cell.metrics.state!=='available')assert.match(section,/withheld for this group/);
        for(const link of cell.evidence.links)assert.ok(section.includes(`href="${link.pageHref.replaceAll('&','&amp;')}"`));
      }
    } else {assert.match(html,/data-performance-error/);assert.doesNotMatch(html,/data-stored-performance/);}
    if(name==='empty')assert.match(html,/not a 0% hit rate/);
    if(name==='long-labels')assert.ok(html.includes('&lt;script&gt;window.unsafeReport=true'));
    scenarios++;
  }
  const page=await request(origin,'/en/how-it-works');
  assert.match(page,/rel="canonical" href="https:\/\/goalhint.com\/en\/how-it-works"/);
  assert.match(page,/<meta name="robots" content="noindex, follow"/);
  assert.doesNotMatch(page,/data-performance-metrics/);
  const invalid=await request(origin,'/en/how-it-works?from=bad&to=bad');assert.match(invalid,/No performance report was read/);
  const failure=await request(origin,'/en/how-it-works?from=2026-10-09&to=2026-10-12&version=server-failure');assert.match(failure,/Retry this performance report/);
  console.log(`PASS ${scenarios} SQL-backed presentation scenarios; ${reconciled} counts reconciled; initial CSS, gates, locked links, clocks, errors, canonical/noindex and truthful policy.`);
}
try {
  const {directory,cases}=await prepare();
  console.log(`Building isolated methodology app: ${directory}`);
  try {
    const result=await execute(process.execPath,[nextCli,'build',directory],{cwd:root,env:environment,windowsHide:true,timeout:240_000,maxBuffer:4*1024*1024});
    await writeFile(path.join(directory,'build.log'),`${result.stdout}\n${result.stderr}`);
  } catch(error) {await writeFile(path.join(directory,'build.log'),`${error.stdout??''}\n${error.stderr??''}`);throw new Error(`Build failed; see ${directory}/build.log.`);}
  const listen=await port(),origin=`http://127.0.0.1:${listen}`;
  child=spawn(process.execPath,[nextCli,'start',directory,'--hostname','127.0.0.1','--port',String(listen)],{cwd:root,env:environment,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',data=>{serverLog+=data;});child.stderr.on('data',data=>{serverLog+=data;});
  for(let attempt=0;attempt<120;attempt++) {try {await request(origin,'/en/how-it-works');break;}catch{if(attempt===119)throw new Error('Fixture server did not start.');await new Promise(resolve=>setTimeout(resolve,250));}}
  await verify(origin,cases);
  await writeFile(path.join(root,'.tmp/038-rendering-target.json'),JSON.stringify({directory,origin}));
  console.log(`Fixture browser URL: ${origin}`);
  if(args.includes('--serve'))await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);child.once('exit',resolve);});
} catch(error) {console.error(String(error.message).slice(0,1600));process.exitCode=1;}
finally {child?.kill();if(serverLog)await writeFile(path.join(root,'.tmp/038-rendering-server.log'),serverLog);}
