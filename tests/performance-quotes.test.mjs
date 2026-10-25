import assert from 'node:assert/strict';
import test from 'node:test';
import { readPerformanceQuotes, verifiedQuotePolicy } from '../src/server/performance/performance-quotes.ts';
import { preparePredictionQuotes } from '../src/server/predictions/prediction-quote-store.ts';
import { historyCandidate } from './helpers/prediction-history-fixtures.mjs';

const publishedAt = Date.parse('2026-10-09T10:00:00Z');
const target = { fixtureId: '20000000-0000-4000-8000-000000000001', cycleId:'20000000-0000-4000-8000-000000000003',
  revisionId: '20000000-0000-4000-8000-000000000002', openedAt: publishedAt-4000, publishedAt, cutoffAt: publishedAt+1000,kickoffAt:publishedAt+301000 };
const policy = {bookmakerId:8,maximumAgeMs:3000};
function quoteRow(overrides={}) {
  const markets=historyCandidate().markets;
  const [quote] = preparePredictionQuotes({...target,recordedAt:publishedAt,freshnessMs:3000,markets,
    source:{state:{lastRetrievedAt:new Date(publishedAt-1000),withdrawnAt:null},rows:[{marketKey:'match-result',selection:markets['match-result'].market.selection,
      basis:'bookmaker',bookmakerId:8,displayHundredths:235,priceDecimal:'2.3500',line:null,method:'proportional-v1',mappingVersion:'launch-odds-v1',
      snapshotId:'a'.repeat(64),retrievedAt:new Date(publishedAt-2000),providerUpdatedAt:null}]}});
  return { ...quote, body:quote,validIntegrity:1n,displayHundredths:235,quotedAt:new Date(publishedAt-2000),recordedAt:new Date(publishedAt),snapshotId:'a'.repeat(64),...overrides};
}
function database(rows,bytes=2000n) {
  const calls=[];return {calls,$queryRaw:async sql=>{calls.push(sql);return calls.length===1?[{bytes,total:BigInt(rows.length)}]:rows;}};
}
test('historical quote binding requires synchronous approval and bounded bookmaker/age policy',()=>{
  assert.deepEqual(verifiedQuotePolicy({...policy,verifyPublicDisplay:()=>true}),policy);
  for(const binding of [null,{...policy,verifyPublicDisplay:()=>false},{...policy,verifyPublicDisplay:async()=>true},
    {...policy,maximumAgeMs:0,verifyPublicDisplay:()=>true},{...policy,verifyPublicDisplay:()=>{throw Error();}}]) assert.equal(verifiedQuotePolicy(binding),null);
});
test('captured sidecars use bounded sealed reads without reconstructing transient provider history',async()=>{
  const tx=database([quoteRow()]),budget={remainingBytes:5000};const quotes=await readPerformanceQuotes(tx,[target],policy,budget);
  assert.equal([...quotes.values()][0],'2.35');assert.equal(quotes.size,1);assert.equal(budget.remainingBytes,3000);
  assert.equal(tx.calls.length,2);const sql=tx.calls.map(call=>call.strings.join(' ')).join(' ');
  assert.match(sql,/FROM PredictionQuote/u);assert.doesNotMatch(sql,/ProviderOddsSnapshot|OddsImportBatch|FixtureOddsPrice/u);
});
test('missing captures remain unpriced, unavailable captures never create a refund or reconstructed quote',async()=>{
  const empty=database([]);assert.equal((await readPerformanceQuotes(empty,[target],policy,{remainingBytes:5000})).size,0);
  const noTargets=database([]);assert.equal((await readPerformanceQuotes(noTargets,[],policy,{remainingBytes:0})).size,0);assert.equal(noTargets.calls.length,0);
});
test('oversized sidecars stop before bodies load and mismatched clocks or seals fail closed',async()=>{
  const huge=database([quoteRow()],5001n);await assert.rejects(readPerformanceQuotes(huge,[target],policy,{remainingBytes:5000}));assert.equal(huge.calls.length,1);
  for(const row of [quoteRow({validIntegrity:0n}),quoteRow({fixtureId:'foreign'}),quoteRow({cycleId:'foreign'}),quoteRow({displayHundredths:999}),
    quoteRow({recordedAt:new Date(publishedAt+1)})]) await assert.rejects(readPerformanceQuotes(database([row]),[target],policy,{remainingBytes:5000}));
  await assert.rejects(readPerformanceQuotes(database([quoteRow(),quoteRow()]),[target],policy,{remainingBytes:5000}));
});
test('bookmaker grants, original cycle opening and age bounds independently withhold captured prices',async()=>{
  const run=(changes={},scope=policy)=>readPerformanceQuotes(database([quoteRow()]),[{...target,...changes}],scope,{remainingBytes:5000});
  assert.equal((await run({}, {...policy,bookmakerId:9})).size,0);
  assert.equal((await run({}, {...policy,maximumAgeMs:1000})).size,0);
  assert.equal((await run({openedAt:publishedAt-1000})).size,0);
  await assert.rejects(run({publishedAt:publishedAt+1}));await assert.rejects(run({cycleId:'foreign'}));
});
