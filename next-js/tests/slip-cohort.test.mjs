import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { resolveFeedDates, parseFeedQuery } from "../src/domain/feed-query.ts";
import { storedMatchFeedResponseSchema } from "../src/domain/match-feed.ts";
import { slipCohortSchema } from "../src/domain/slip-cohort.ts";
import { defaultSlipCriteria } from "../src/domain/slip-builder.ts";
import { marketRules, validateMarketSnapshot } from "../src/domain/markets.ts";
import { currentSlipFixtures } from "../src/server/slips/slip-cohort.ts";
import { createSlipBuildService } from "../src/server/slips/slip-service.ts";
import { liveRecord, now, today } from "./helpers/live-refresh-fixtures.mjs";

const clock = { now: () => now };
const criteria = { ...defaultSlipCriteria(today), dateTo: today, markets: ["match-result"], probMin: 0,
  teamsMin: 2, teamsMax: 2, totalMin: 300, totalMax: 600 };
function record(id) {
  const value = liveRecord({ fixtureId: id, kickoffAt: now + 3_600_000 });
  const snapshot = validateMarketSnapshot({ "match-result": { source: "ai", period: marketRules.period,
    probabilities: { "home-win": 0.75, draw: 0.1, "away-win": 0.15 } } });
  return { ...value, homeTeam: { id: `${id}-home`, name: `${id} home` }, awayTeam: { id: `${id}-away`, name: `${id} away` },
    forecast: { ...value.forecast, provisional: false, updateDelayed: false,
      markets: Object.values(snapshot.markets).filter(entry => entry.available)
        .map(entry => ({ market: entry.market, reasons: [], uncertainty: null })) },
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

test("production Builder filters closed and expired fixtures before the bounded cohort probe", () => {
  const script = String.raw`
    import assert from 'node:assert/strict';
    import {mock} from 'node:test';
    import {addReportingDays,calendarRules} from './src/domain/calendar.ts';
    import {liveRecord,now,today} from './tests/helpers/live-refresh-fixtures.mjs';
    const feed=await import('./src/server/matches/feed-read.ts');
    let active=0,peak=0,globalVersion=1,hydrates=0,priceReads=0,transactions=0,empty=false,authoritative=true;
    const tx={version:1,async $queryRaw(query){
      if(!/LIMIT 1\s*$/u.test(query.sql)) {
        assert.equal(query.values.at(-1),501);
        const eligibility = query.sql.slice(query.sql.lastIndexOf('AND f.kickoff>=?'), query.sql.lastIndexOf('LIMIT'));
        assert.match(eligibility,/^AND f\.kickoff>=\?\s+AND f\.status='scheduled' AND c\.state='open' AND c\.openedAt<=\? AND c\.cutoffAt>\?/u);
        assert.match(eligibility,/NOT EXISTS \(SELECT 1 FROM PredictionPublicationBarrier barrier WHERE barrier\.cycleId=f\.activeCycleId AND barrier\.closedAt<=\?\)/u);
        assert.match(eligibility,/NOT EXISTS \(SELECT 1 FROM FixtureLifecycleState life WHERE life\.fixtureId=f\.id AND\s+\(life\.issue IS NOT NULL OR \(life\.actualStartedAt<=\? AND \(c\.ordinal=1 OR life\.actualStartedAt>=c\.openedAt\)\)\)/u);
        assert.deepEqual(query.values.slice(-6,-1).map(value=>value.getTime()),[
          now+calendarRules.cutoffSecondsBeforeKickoff*1000+1, now, now, now, now,
        ]);
      }
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
    mock.module('./src/server/slips/price-read.ts',{namedExports:{storedSlipPricePools:async(source,records,asOf,options)=>{
      assert.equal(source,tx);assert.equal(asOf,now);assert.equal(records.length,500);assert.equal(options.primaryBookmakerOnly,undefined);priceReads++;
      return Object.fromEntries(records.map(record=>[record.fixtureId,[{...record.prices[0],price:source.version===1?'2.00':'9.99'}]]));
    }}});
    const {createStoredSlipCohort}=await import('./src/server/slips/slip-cohort.ts');
    const read=createStoredSlipCohort({database:()=>database,competitionIds:()=>[39],providerOdds:true});
    const result=await read(new URLSearchParams({date:today,status:'scheduled',sort:'probability',dir:'desc',pageSize:'100'}),{locale:'en'},{now:()=>now});
    assert.equal(transactions,1);assert.equal(hydrates,500);assert.equal(priceReads,1);assert.equal(peak,100);
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

test("Builder final fixture read is bounded to distinct selections and rejects changed occurrences", async () => {
  const selections = [record("current"), record("moved"), record("started"), record("replaced")].map((value) => ({
    fixtureId: value.fixtureId, kickoffAt: value.kickoffAt, homeTeam: value.homeTeam, awayTeam: value.awayTeam,
    forecast: { cycleId: value.cycleId, revisionId: value.forecast.revisionId, publishedAt: value.forecast.publishedAt },
  }));
  const [current, moved, , replaced] = selections;
  const row = (selection) => ({ id: selection.fixtureId, kickoff: new Date(selection.kickoffAt), cycleId: selection.forecast.cycleId,
    revisionId: selection.forecast.revisionId, homeTeamId: selection.homeTeam.id, awayTeamId: selection.awayTeam.id });
  let queries = 0;
  const database = { query: (operation) => operation({ $queryRaw: async (query) => {
    queries++;
    assert.deepEqual(query.values.slice(0, 4), ["current", "moved", "started", "replaced"]);
    assert.match(query.sql, /WHERE f\.id IN \(\?,\?,\?,\?\) AND f\.kickoff>=\?/u);
    assert.match(query.sql, /life\.actualStartedAt<=\?/u);
    return [row(current), { ...row(moved), kickoff: new Date(moved.kickoffAt + 1000) }, { ...row(replaced), revisionId: "new-revision" }];
  } }) };
  const result = await currentSlipFixtures(database, [{ selections }, { selections: [current] }], now);
  assert.equal(queries, 1);
  assert.deepEqual([...result], ["current"]);
});

test("Builder preserves qualifying slips when fixture availability changes after the cohort read", async () => {
  const records = [record("started"), record("first"), record("second"), record("third")];
  const readCohort = async (parameters) => cohort(parameters, records);
  const jointModel = { verifyModel: () => true, model: { calibrationReference: "synthetic-check", correlationReference: "synthetic-check",
    validFrom: now - 1000, validUntil: now + 1000, estimate: () => 0.5 } };
  let checks = 0;
  const service = (available) => createSlipBuildService({ ...options, readCohort, jointModel,
    recheck: async (slips, asOf) => {
      checks++;
      assert.equal(asOf, now);
      assert.equal(slips.length, 2);
      return new Set(available);
    } });
  const result = await service(["first", "second", "third"]).query(criteria);
  assert.equal(result.state, "generated");
  assert.equal(result.data.qualifyingMatches, 3);
  assert.equal(result.data.slips.length, 1);
  const [onlySlip] = result.data.slips;
  assert.ok(onlySlip.selections.every(({ fixtureId }) => fixtureId !== "started"));
  assert.deepEqual(result.data.jointProbabilities, { [onlySlip.id]: 0.5 });
  assert.ok(result.matchStates.every(({ fixtureId }) => fixtureId !== "started"));
  assert.equal((await service([]).query(criteria)).state, "data-unavailable");
  assert.equal((await service([]).query({ ...criteria, totalMin: 999, totalMax: 999 })).state, "no-combinations");
  assert.equal(checks, 2);
});
