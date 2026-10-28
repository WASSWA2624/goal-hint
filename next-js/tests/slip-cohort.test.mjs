import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { resolveFeedDates, parseFeedQuery } from "../src/domain/feed-query.ts";
import { storedMatchFeedResponseSchema } from "../src/domain/match-feed.ts";
import { slipCohortSchema } from "../src/domain/slip-cohort.ts";
import { defaultSlipCriteria } from "../src/domain/slip-builder.ts";
import { createSlipBuildService } from "../src/server/slips/slip-service.ts";
import { liveRecord, now, today } from "./helpers/live-refresh-fixtures.mjs";

const clock = { now: () => now };
const criteria = { ...defaultSlipCriteria(today), dateTo: today, teamsMin: 2, teamsMax: 2, totalMin: 300, totalMax: 600 };
function record(id) {
  const value = liveRecord({ fixtureId: id, kickoffAt: now + 3_600_000 });
  return { ...value, homeTeam: { id: `${id}-home`, name: `${id} home` }, awayTeam: { id: `${id}-away`, name: `${id} away` },
    forecast: { ...value.forecast, provisional: false, updateDelayed: false },
    prices: [{ family: "match-result", selection: "home-win", price: "2.00", basis: "bookmaker", retrievedAt: now - 1000, providerUpdatedAt: null }] };
}
function cohort(parameters, records, overrides = {}) {
  const range = resolveFeedDates(parseFeedQuery(parameters, { today }), today);
  return { records, selectionPrices: Object.fromEntries(records.map(record => [record.fixtureId, record.prices])), asOf: now, today,
    range: { from: range.startDate, to: range.endDate, ...range.window }, partialCoverage: false, searchLimited: false, ...overrides };
}
function page(parameters, records) {
  const source = cohort(parameters, records);
  return storedMatchFeedResponseSchema.parse({ records: source.records, asOf: source.asOf, today: source.today, range: source.range,
    paginationVersion: "a".repeat(64), page: 1, pageSize: 100,
    total: records.length, totalPages: records.length ? 1 : 0, nextPage: null, previousPage: null,
    links: { next: null, previous: null }, state: records.length ? "ready" : "no-fixtures", message: null,
    coverage: { partial: false, knownFixtures: records.length, matchingWithMarket: records.length,
      dates: [{ date: today, status: "complete", observedAt: now, authoritative: true }] }, run: null });
}
const options = { consume: async () => {}, providerOdds: true, clock };

test("atomic cohort makes one read and produces the same decisions as the existing paged reader", async () => {
  const records = [record("fixture-1"), record("fixture-2"), record("fixture-3"), record("fixture-4")];
  let reads = 0, consumes = 0;
  const atomic = await createSlipBuildService({ ...options, read: async () => { throw new Error("Paged path must not run"); },
    consume: async () => { consumes++; }, readCohort: async (parameters, context, pinned) => {
      reads++; assert.equal(pinned.now(), now); assert.equal(context.locale, "en");
      return cohort(parameters, records);
    } }).query(criteria);
  const paged = await createSlipBuildService({ ...options, read: async parameters => page(parameters, records) }).query(criteria);
  assert.equal(atomic.state, "generated"); assert.equal(reads, 1); assert.equal(consumes, 1);
  assert.deepEqual(atomic, paged);
});

test("atomic cohort preserves permission, deadline and joint-estimator rechecks", async () => {
  let reads = 0;
  const reader = async parameters => { reads++; return cohort(parameters, [record("fixture-1"), record("fixture-2")]); };
  const read = async () => { throw new Error("Unexpected paged read"); };
  assert.equal((await createSlipBuildService({ ...options, providerOdds: false, read, readCohort: reader }).query(criteria)).state, "odds-unavailable");
  assert.equal(reads, 0);
  let ticks = 0;
  const afterCutoff = await createSlipBuildService({ ...options, read, readCohort: reader,
    clock: { now: () => ticks++ ? now + 3_600_000 : now } }).query(criteria);
  assert.equal(afterCutoff.state, "no-qualifying");
  let approved = true;
  const jointModel = { model: { calibrationReference: "synthetic-cohort", correlationReference: "synthetic-cohort",
    validFrom: now - 1, validUntil: now + 60_000, estimate: () => .5 }, verifyModel: () => approved };
  const revoked = await createSlipBuildService({ ...options, read, jointModel, readCohort: async parameters => {
    approved = false; return cohort(parameters, [record("fixture-1"), record("fixture-2")]);
  } }).query(criteria);
  assert.equal(revoked.state, "model-unavailable");
});

test("atomic cohort rejects clock/range drift, duplicates, oversized cohorts and invalid supplementary quotes", async () => {
  const records = [record("fixture-1"), record("fixture-2")];
  const alterations = [source => ({ ...source, asOf: now + 1 }), source => ({ ...source, today: "2026-01-01" }),
    source => ({ ...source, range: { ...source.range, endExclusive: source.range.endExclusive + 1 } }),
    source => ({ ...source, records: [...records, records[0]] }),
    source => ({ ...source, records: Array.from({ length: 501 }, (_, index) => record(`fixture-${index}`)) }),
    source => ({ ...source, selectionPrices: { ...source.selectionPrices, "fixture-1": [{ ...records[0].prices[0], retrievedAt: now + 1 }] } }),
    source => ({ ...source, selectionPrices: { ...source.selectionPrices, foreign: [] } }),
    source => ({ ...source, selectionPrices: { ...source.selectionPrices, "fixture-1": [...records[0].prices, ...records[0].prices] } }),
    source => ({ ...source, searchLimited: true })];
  for (const alter of alterations) {
    const result = await createSlipBuildService({ ...options, read: async () => { throw new Error(); },
      readCohort: async parameters => alter(cohort(parameters, records)) }).query(criteria);
    assert.equal(result.state, "data-unavailable"); assert.equal(result.data, null);
  }
  assert.throws(() => slipCohortSchema.parse(cohort(new URLSearchParams({ date: today }), records,
    { selectionPrices: { "fixture-1": [] } })));
});

test("production cohort uses one RR snapshot, a501-ID probe and bounded ordered hydration without full-period summary scans", () => {
  const script = String.raw`
    import assert from 'node:assert/strict';
    import {mock} from 'node:test';
    import {addReportingDays} from './src/domain/calendar.ts';
    import {liveRecord,now,today} from './tests/helpers/live-refresh-fixtures.mjs';
    const feed=await import('./src/server/matches/feed-read.ts');
    let active=0,peak=0,globalVersion=1,hydrates=0,priceReads=0,transactions=0,empty=false,authoritative=true;
    const tx={version:1,async $queryRaw(query){
      if(!/LIMIT 1\s*$/u.test(query.sql)) assert.equal(query.values.at(-1),501);
      assert.ok(!/COUNT\(|GROUP BY/iu.test(query.sql));
      return empty?[]:Array.from({length:501},(_,i)=>({id:'fixture-'+String(i).padStart(4,'0')}));
    }};
    const database={query(){throw new Error('No out-of-snapshot reads expected')},async transaction(operation,settings){
      transactions++;assert.equal(settings.isolationLevel,'RepeatableRead');assert.equal(settings.timeout,60000);
      return operation(tx);
    }};
    mock.module('./src/server/matches/feed-read.ts',{namedExports:{...feed,
      storedFeedCoverage:async(source,range)=>{assert.equal(source,tx);return Array.from({length:range.dayCount},(_,i)=>({
        date:addReportingDays(range.startDate,i),status:authoritative?'complete':'unknown',observedAt:now,authoritative}));},
      storedFeedRunContext:async source=>{assert.equal(source,tx);return {window:{startInclusive:now-1000,endExclusive:now+86400000},run:null};}
    }});
    mock.module('./src/server/matches/fixture-read.ts',{namedExports:{storedFeedFixture:async()=>{throw new Error('Expected bounded bulk hydration')},storedFeedFixtures:async(source,ids)=>Promise.all(ids.map(async id=>{
      assert.equal(source,tx);active++;peak=Math.max(peak,active);hydrates++;
      await new Promise(resolve=>setImmediate(resolve));globalVersion=2;active--;
      const value=liveRecord({fixtureId:id,kickoffAt:now+3600000});
      return {...value,dataVersion:String(source.version),forecast:{...value.forecast,provisional:false,updateDelayed:false},
        prices:[{family:'match-result',selection:'home-win',price:'2.00',basis:'bookmaker',retrievedAt:now-1000,providerUpdatedAt:null}]};
    }))}});
    mock.module('./src/server/slips/price-read.ts',{namedExports:{storedSlipPricePools:async(source,records)=>{
      assert.equal(source,tx);assert.ok(records.length<=10);priceReads++;
      return Object.fromEntries(records.map(record=>[record.fixtureId,[{...record.prices[0],price:source.version===1?'2.00':'9.99'}]]));
    }}});
    const {createStoredSlipCohort}=await import('./src/server/slips/slip-cohort.ts');
    const read=createStoredSlipCohort({database:()=>database,competitionIds:()=>[39],providerOdds:true});
    const result=await read(new URLSearchParams({date:today,status:'scheduled',sort:'probability',dir:'desc',pageSize:'100'}),{locale:'en'},{now:()=>now});
    assert.equal(transactions,1);assert.equal(hydrates,500);assert.equal(priceReads,50);assert.equal(peak,10);
    assert.equal(globalVersion,2);assert.equal(result.searchLimited,true);assert.equal(result.records.length,500);
    assert.equal(result.records[0].fixtureId,'fixture-0000');assert.equal(result.records.at(-1).fixtureId,'fixture-0499');
    assert.ok(result.records.every(record=>record.dataVersion==='1'));
    assert.ok(Object.values(result.selectionPrices).every(prices=>prices[0].price==='2.00'));
    empty=true;authoritative=false;
    await assert.rejects(()=>read(new URLSearchParams({date:today}),{},{now:()=>now}),error=>error.code==='unavailable');
    assert.equal(hydrates,500);
  `;
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--experimental-test-module-mocks", "--input-type=module", "-e", script], {
    cwd: new URL("../", import.meta.url), env: { ...process.env, NODE_ENV: "test", NODE_NO_WARNINGS: "1" }, encoding: "utf8", timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
