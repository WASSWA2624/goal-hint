import assert from 'node:assert/strict';
import test from 'node:test';
import { getReportingDate } from '../src/domain/calendar.ts';
import { aggregatePerformance } from '../src/server/performance/performance-service.ts';
import { loadPerformancePage, performanceParameters } from '../src/server/performance/performance-page.ts';
import { parsePerformanceQuery } from '../src/server/performance/performance-query.ts';
import { MatchFeedError } from '../src/server/matches/feed-error.ts';
import { performanceProtocol, performanceRecord, performanceSnapshot } from './helpers/performance-fixtures.mjs';

const clock = {now: () => Date.parse('2026-10-10T08:00:00Z')};
const input = {from:'2026-10-09', to:'2026-10-12', market:'match-result', source:'combined'};
const query = (value = input) => parsePerformanceQuery(new URLSearchParams(value), getReportingDate(clock.now()));
const report = (protocol = null, records = [performanceRecord(), performanceRecord({source:'api-football', score:null}),
  performanceRecord({state:'void'}), performanceRecord({noLock:true})]) => aggregatePerformance(performanceSnapshot(records), query(), clock.now() - 5000, protocol);

test('page rejects ambiguous, invalid, oversized and incompatible filters before resolving storage', async () => {
  let reads=0;
  for (const value of [{from:'2026-02-29',to:'2026-03-01'}, {from:'2026-10-01'}, {from:'2026-08-01',to:'2026-10-01'},
    {source:['ai','combined']}, {unknown:'ignored?'}, {source:'api-football',model:'a'.repeat(64)}, {version:'x'.repeat(2100)}]) {
    assert.deepEqual(await loadPerformancePage(value, clock, async () => { reads++; }), {query:null,data:null,error:'invalid-query'});
  }
  assert.equal(reads,0);
});

test('native form optional empty fields normalize to the same bounded request and preserve original stored clocks/counts', async () => {
  const original=report();let calls=0;
  const result=await loadPerformancePage({...input,model:'',version:''},clock,async (parameters,receivedClock) => {
    calls++;assert.equal(receivedClock,clock);assert.deepEqual(query(Object.fromEntries(parameters)),query());return original;
  });
  assert.equal(calls,1);assert.deepEqual(result.data,original);assert.equal(result.data.asOf,clock.now()-5000);
  assert.deepEqual(result.data.cells[0].coverage,{total:4,available:2,unavailable:1,void:1,filteredOut:0,pending:1,settled:1,sources:{ai:1,'api-football':1}});
  assert.equal(result.data.cells[0].metrics.hitRate,null);
  assert.equal(result.data.policy.publicClaimAuthorized,false);
  assert.equal(performanceParameters(result.query).toString(),'from=2026-10-09&market=match-result&source=combined&to=2026-10-12');
});

test('default EAT period advances at midnight while explicit historical cohorts remain fixed', async () => {
  for (const [instant,from,to] of [['2026-10-09T20:59:59Z','2026-09-10','2026-10-09'],['2026-10-09T21:00:00Z','2026-09-11','2026-10-10']]) {
    const at=Date.parse(instant),date=getReportingDate(at);
    const read=async parameters => aggregatePerformance(performanceSnapshot([]),parsePerformanceQuery(parameters,date),at,null);
    const result=await loadPerformancePage({}, {now:()=>at}, read);
    assert.equal(result.query.range.startDate,from);assert.equal(result.query.range.endDate,to);
    const selected=await loadPerformancePage(input,{now:()=>at},read);
    assert.equal(selected.query.range.startDate,'2026-10-09');assert.equal(selected.query.range.endDate,'2026-10-12');
  }
});

test('page keeps approved descriptive, insufficient-sample, quality-failed and empty states from the service', async () => {
  for (const [protocol,records,state] of [[performanceProtocol(),[performanceRecord(),performanceRecord()], 'available'],
    [performanceProtocol(),[performanceRecord()], 'insufficient-sample'],
    [performanceProtocol({gate:{maximumBrier:0}}),[performanceRecord(),performanceRecord()], 'quality-gate-failed'],
    [performanceProtocol(),[], 'unavailable']]) {
    const data=report(protocol,records), result=await loadPerformancePage(input,clock,async()=>data);
    assert.equal(result.error,null);assert.equal(result.data.cells[0].metrics.state,state);
    assert.equal(result.data.cells[0].metrics.hitRate,state==='available'?1:null);
    assert.equal(result.data.policy.publicClaimAuthorized,false);
  }
});

test('foreign cohorts, malformed projections and private read failures cannot be rendered as valid or empty reports', async () => {
  for (const mutate of [d=>{d.cohort.from='2026-10-08';},d=>{d.filters.source='ai';},d=>{d.cells[0].metrics.hitRate=.9;},d=>{delete d.cells[0].evidence.links[0].pageHref;}]) {
    const data=structuredClone(report());mutate(data);
    const result=await loadPerformancePage(input,clock,async()=>data);
    assert.equal(result.data,null);assert.equal(result.error,'unavailable');assert.deepEqual(result.query,query());
  }
  for (const failure of [new Error('mysql://private-secret'),new MatchFeedError('rate-limited')]) {
    const result=await loadPerformancePage(input,clock,async()=>{throw failure;});
    assert.equal(result.data,null);assert.equal(result.error,failure.code??'unavailable');
    assert.doesNotMatch(JSON.stringify(result),/private-secret|mysql:/);
  }
});

test('evidence navigation is canonical, revision-specific and bounded even with long or unsafe team text', () => {
  const record=performanceRecord();record.fixture.homeTeam.name='<script>Club & Co</script>';record.fixture.awayTeam.name='Away Identifier '.repeat(25);
  const data=report(null,[record]),link=data.cells[0].evidence.links[0];
  assert.equal(link.pageHref,`/en/matches/${record.fixture.id}/script-club-co-script-vs-${('away-identifier-'.repeat(25)).slice(0,75).replace(/-$/,'')}?revision=${record.revision.id}#revision-history`);
  assert.equal(link.revisionId,record.cycle.lockedSetId);assert.ok(link.pageHref.length<=512);
  assert.equal(data.cells[0].metrics.denominator,1);assert.equal(data.cohort.fixtureCount,1);
});
