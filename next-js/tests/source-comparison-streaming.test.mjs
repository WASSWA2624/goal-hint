import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { createSourceComparisonAccumulator, compareSources } from "../src/server/comparison/source-comparison.ts";
import { readSourceReceipts } from "../src/server/comparison/source-receipts-read.ts";
import { comparisonRecord, comparisonReceipts, comparisonOptions, finished } from "./helpers/source-comparison-fixtures.mjs";

const receipt = comparisonReceipts({ ai: { "home-win": .5, draw: .3, "away-win": .2 },
  provider: { "home-win": .2, draw: .3, "away-win": .5 }, evidence: { conflicting: true, limitedNews: true } });

test("streamed comparison boundaries preserve coverage, arithmetic, segments, order audit, recent pairs and exact key hashes", () => {
  const records = Array.from({ length: 73 }, (_, i) => comparisonRecord(i + 1, { settlement: finished(i % 3, (i + 1) % 3),
    ...(i % 13 === 0 ? { state: "void" } : i % 11 === 0 ? { state: "open" } : i % 7 === 0 ? { order: null } : {}) }));
  const receipts = new Map(records.flatMap(record => record.locked ? [[record.locked.jobId, receipt]] : []));
  const expected = compareSources(records, receipts, comparisonOptions());
  for (const width of [1, 7, 19, 50]) {
    const accumulator = createSourceComparisonAccumulator(comparisonOptions());
    for (let offset = 0; offset < records.length; offset += width) accumulator.add(records.slice(offset, offset + width), receipts);
    assert.deepEqual(accumulator.finish(), expected);
  }
});

test("source receipt reads retain seal, shared job/source-order and per-batch byte-budget checks", async () => {
  const jobId = "a".repeat(64), revision = { jobId, candidate: { context: { jobId }, audit: { sourceOrder: "provider-first" } } };
  let sealed = true, bytes = 2000, sources = receipt, calls = 0;
  const tx = { async $queryRaw() { calls++; return calls % 2 ? [{ bytes: BigInt(bytes), total: 1n }] : [{ jobId, sealed, sources }]; } };
  assert.equal((await readSourceReceipts(tx, [revision])).get(jobId).order, "provider-first");
  sealed = false;
  await assert.rejects(() => readSourceReceipts(tx, [revision]), error => error.code === "unavailable");
  sealed = true; sources = { ...receipt, order: "ai-first" };
  await assert.rejects(() => readSourceReceipts(tx, [revision]), error => error.code === "unavailable");
  calls = 0; sources = receipt; bytes = 2_000_001;
  await assert.rejects(() => readSourceReceipts(tx, [revision]), error => error.code === "unavailable");
  assert.equal(calls, 1, "Oversized bodies must be rejected before fetching them");
  await assert.rejects(() => readSourceReceipts(tx, [{ ...revision, candidate: { ...revision.candidate, context: { jobId: "b".repeat(64) } } }]),
    error => error.code === "unavailable");
});

const serviceProgram = String.raw`
  import assert from 'node:assert/strict';
  import {mock} from 'node:test';
  import {createPublicResponseCache} from './src/server/cache/public-cache.ts';
  import {comparisonReceipts,finished} from './tests/helpers/source-comparison-fixtures.mjs';
  const demo=process.env.NODE_ENV==='development', total=demo?3:16800, now=Date.parse('2026-10-28T12:00:00Z');
  const normalized=comparisonReceipts({ai:{'home-win':.5,draw:.3,'away-win':.2},provider:{'home-win':.2,draw:.3,'away-win':.5}});
  let transactions=0,prepares=0,sourcePrepares=0,receiptReads=0,serializedBytes=0,lookups=0,generation=1,entry=null;
  const preparedDates=[];
  const audits=[];
  const tx={};
  const database={async transaction(operation,options){transactions++;assert.equal(options.isolationLevel,'RepeatableRead');
    assert.equal(options.timeout,demo?240000:30000);return operation(tx);}};
  const wrap=(value,active)=>new Proxy(value,{get(target,key){if(!active.value)throw new Error('A discarded raw batch was retained');return Reflect.get(target,key);}});
  mock.module('./src/server/performance/performance-read.ts',{namedExports:{readPerformanceBatches:async function*(source){
    assert.equal(source,tx);
    for(let offset=0;offset<total;offset+=500){
      const active={value:true},records=[];
      for(let index=offset;index<Math.min(total,offset+500);index++){
        const id='50000000-0000-4000-8000-'+String(index).padStart(12,'0'),jobId=String(index).padStart(64,'0');
        const audit=Object.freeze(demo?{providerStatus:'not-requested'}:{sourceOrder:'provider-first'});audits.push(audit);
        const candidate={audit,context:{jobId},markets:normalized.ai.markets.markets,privateCandidateBody:'x'.repeat(4096)};
        serializedBytes+=Buffer.byteLength(JSON.stringify(candidate));
        records.push({fixture:wrap({id,homeTeam:{name:'Home '+index},awayTeam:{name:'Away '+index},lifecycleState:null},active),
          cycle:{id:'cycle-'+index,state:'closed',kickoffAt:now-86400000,voidReason:null},
          revision:wrap({id:'revision-'+index,jobId,candidate,generationCompletedAt:now-2*86400000,active},active),result:null});
      }
      yield {records};active.value=false;
    }
  }}});
  const mapReceipts=(revisions,replay)=>new Map(revisions.map(revision=>[revision.jobId,wrap({...normalized,order:replay?'ai-first':'provider-first'},revision.active)]));
  mock.module('./src/server/comparison/source-receipts-read.ts',{namedExports:{readSourceReceipts:async(source,revisions)=>{
    assert.equal(source,tx);assert.ok(revisions.length<=500);receiptReads++;
    return demo?new Map():mapReceipts(revisions,false);
  }}});
  mock.module('./src/server/settlement/settlement-read.ts',{namedExports:{settlementContextFor:()=>finished(2,1)}});
  mock.module('./src/server/demo/read-seed.ts',{namedExports:{prepareDemoRange:async()=>{prepares++;generation++;}}});
  if(demo)mock.module('./src/server/demo/source-receipts.ts',{namedExports:{DEMO_SOURCE_PAIR_NOTICE:'Synthetic replay; original audit unchanged.',
    ensureDemoSourcePairs:async(source,dates,at)=>{assert.equal(source,database);assert.equal(at,now);assert.equal(prepares,sourcePrepares+1);
      sourcePrepares++;preparedDates.push(dates);generation++;},
    readDemoSourcePairs:async(source,revisions)=>{assert.equal(source,tx);assert.ok(sourcePrepares>0);return mapReceipts(revisions,true);}}});
  const cache=createPublicResponseCache({async lookup(key,tags){lookups++;const valid=entry?.key===key&&entry?.generation===generation;
    return {generations:Object.fromEntries(tags.map(tag=>[tag,String(generation)])),
      value:valid?entry.value:null,createdAt:valid?entry.createdAt:null,expiresAt:valid?entry.expiresAt:null};},
    async fill(key,_tags,stamp,value,createdAt,expiresAt){if(Object.values(stamp).some(version=>version!==String(generation)))return false;
      entry={key,generation,value:structuredClone(value),createdAt,expiresAt};return true;},async reconcile(){return {acknowledged:0,removed:0};}},()=>now);
  const {createSourceComparisonService}=await import('./src/server/comparison/source-comparison-service.ts');
  const service=createSourceComparisonService({database,competitionIds:[39],clock:{now:()=>now},...(demo?{cache}:{})});
  const result=await service.read();
  assert.equal(result.fixtureCount,total);assert.equal(transactions,1);
  assert.equal(receiptReads,Math.ceil(total/500));
  assert.equal(result.comparisons[0].matched.count,total);
  assert.ok(result.comparisons[0].matched.ai.brier>=0);
  assert.equal(result.recent.length,Math.min(total,20));
  if(demo){
    assert.equal(result.orders.none,total);assert.equal(result.orders['ai-first'],0);assert.equal(result.orders['provider-first'],0);
    assert.equal(result.diagnostic.kind,'synthetic-comparison-replay');assert.equal(result.diagnostic.replayedFixtures,total);
    assert.ok(audits.every(audit=>!Object.hasOwn(audit,'sourceOrder')&&audit.providerStatus==='not-requested'));
    assert.ok(result.recent.every(pair=>pair.sourceOrder==='ai-first'));
    const before=lookups,again=await service.read();assert.deepEqual(again,result);
    assert.equal(lookups-before,1);assert.equal(prepares,1);assert.equal(sourcePrepares,1);assert.equal(transactions,1);
    assert.equal(preparedDates[0].length,30);assert.equal(preparedDates[0][0],'2026-09-29');assert.equal(preparedDates[0].at(-1),'2026-10-28');
    entry.value.recent[0].href='https://example.invalid/unsafe-cache';
    const repaired=await service.read();assert.equal(transactions,2);assert.ok(repaired.recent[0].href.startsWith('/en/matches/'));
    entry.value.comparisons[0].matched.count++;
    await service.read();assert.equal(transactions,3);
    const cold=await service.read(new URLSearchParams({from:'2026-02-01',to:'2026-02-02'}));
    assert.equal(cold.from,'2026-02-01');assert.equal(cold.to,'2026-02-02');assert.equal(cold.comparisons[0].matched.count,total);
    assert.deepEqual(preparedDates.at(-1),['2026-02-01','2026-02-02']);
    await service.read(new URLSearchParams({from:'2026-10-28',to:'2026-10-30'}));
    assert.deepEqual(preparedDates.at(-1),['2026-10-28'],'Future open fixtures need no historical comparison replay yet');
  }else{
    assert.ok(serializedBytes>16777216);assert.equal(prepares,0);assert.equal(result.orders['provider-first'],total);
    assert.equal(result.diagnostic,undefined);
  }
`;
for (const NODE_ENV of ["test", "development"]) test(`bounded owner comparison ${NODE_ENV === "test" ? "streams16,800large candidates and discards decoded batches" : "labels replay, preserves original order/audit and hits validated cache before preparation"}`, () => {
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--experimental-test-module-mocks", "--input-type=module", "-e", serviceProgram], {
    cwd: new URL("../", import.meta.url), env: { ...process.env, NODE_ENV, NEXT_PUBLIC_GOAL_HINT_DEMO: "true", NODE_NO_WARNINGS: "1",
      DATABASE_URL: "mysql://demo@127.0.0.1/goal_hint_demo_comparison_test" },
    encoding: "utf8", timeout: 45_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
