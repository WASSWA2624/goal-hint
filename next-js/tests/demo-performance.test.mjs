import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const isolatedEnvironment = { ...process.env, NODE_ENV: "development", NEXT_PUBLIC_GOAL_HINT_DEMO: "true",
  DATABASE_URL: "mysql://demo@127.0.0.1/goal_hint_demo_unit" };
function run(script, environment = isolatedEnvironment) {
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", script], {
    cwd: new URL("../", import.meta.url), env: environment, encoding: "utf8", timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test("synthetic forecasts produce real diagnostic metrics without public claims or invented historical odds", () => {
  run(`
    import assert from 'node:assert/strict';
    import { parseReportingDate } from './src/domain/calendar.ts';
    import { performanceFamilies } from './src/domain/performance.ts';
    import { settleMarketSelection } from './src/domain/market-settlement.ts';
    import { aggregatePerformance } from './src/server/performance/performance-service.ts';
    import { parsePerformanceQuery } from './src/server/performance/performance-query.ts';
    import { demoFixturesForDate } from './src/server/demo/api-football.ts';
    import { demoForecast, demoId, demoModel } from './src/server/demo/forecast.ts';
    import { demoPerformancePolicy, demoPerformanceQuotes } from './src/server/demo/performance.ts';
    const now = Date.parse('2026-10-28T12:00:00Z'), policy = demoPerformancePolicy();
    assert.ok(policy);
    assert.equal(policy.verifyProtocol(policy.protocol),true);
    const quotes=demoPerformanceQuotes(); assert.ok(quotes);
    assert.equal(quotes.bookmakerId,8); assert.equal(quotes.maximumAgeMs,300000);
    assert.equal(quotes.verifyPublicDisplay(),true);
    const future=demoForecast(demoFixturesForDate('2026-11-30',now)[0],now);
    const futureHorizon=future.context.kickoffAt-future.publishedAt;
    assert.ok(futureHorizon>7*86400000);
    assert.ok(policy.protocol.horizons.some(h=>futureHorizon>=h.minimumMs&&futureHorizon<h.maximumMs));
    const records = demoFixturesForDate('2026-10-27',now).filter(raw=>raw.fixture.status.short==='FT').slice(0,3).map(raw=>{
      const f=demoForecast(raw,now), regulation={verified:true,period:'regulation-including-stoppage-time',
        home:raw.score.fulltime.home,away:raw.score.fulltime.away};
      const resultContext={status:'finished-regulation',cycleEligibility:{eligible:true},regulationScore:regulation};
      return {fixture:{id:f.fixtureId,dataVersion:1n,homeTeam:{name:raw.teams.home.name},awayTeam:{name:raw.teams.away.name},
          season:{competitionId:demoId('competition',raw.league.id),competition:{name:raw.league.name,country:raw.league.country}}},
        cycle:{id:f.cycleId,state:'closed',lockedSetId:f.revisionId,kickoffAt:f.context.kickoffAt,voidReason:null},
        revision:{id:f.revisionId,cycleId:f.cycleId,fixtureId:f.fixtureId,modelVersionId:demoModel.id,
          evidenceCutoffAt:f.context.cutoffAt,publishedAt:f.publishedAt,candidate:f.candidate},
        result:{id:'a'.repeat(64),status:'finished-regulation',regulation},
        projection:{markets:performanceFamilies.map(family=>({base:{family},inputHash:'synthetic',previous:{inputHash:'synthetic',
          lockedSetId:f.revisionId,status:settleMarketSelection(family,f.candidate.markets[family].market.selection,resultContext).status}}))}};
    });
    assert.equal(records.length,3);
    const snapshot={records,models:new Map([[demoModel.id,demoModel]]),settlements:[],quotes:new Map(),
      historicalCycles:{basis:'void-cycle-original-kickoff-in-period-excluding-applicable-cycle',void:0,postponed:0},
      operations:{basis:'refresh-jobs-for-current-cohort-fixtures-across-runs',total:0,failed:0,pending:0,failedFixtures:0,delayedRefreshes:0,delayedFixtures:0}};
    const query=parsePerformanceQuery(new URLSearchParams('from=2026-10-27&to=2026-10-27'),parseReportingDate('2026-10-28'));
    const response=aggregatePerformance(snapshot,query,now,policy.protocol);
    assert.equal(response.policy.publicClaimAuthorized,false);
    assert.equal(response.policy.provisional,true);
    for(const family of performanceFamilies){
      const cell=response.cells.find(c=>c.family===family&&c.source==='combined'&&c.horizon===null);
      assert.equal(cell.metrics.state,'available',JSON.stringify(cell.metrics));
      for(const metric of ['hitRate','brier','logLoss','calibrationError']) assert.ok(Number.isFinite(cell.metrics[metric]));
      assert.ok(cell.metrics.calibration.some(bucket=>bucket.count>0));
      assert.equal(cell.returns.returnsSampleCount,0);
      assert.equal(cell.returns.excludedQuoteCount,3);
      assert.equal(cell.returns.roi,null);
    }
  `);
});

test("synthetic performance approval fails closed after environment or protocol changes", () => {
  run(`
    import assert from 'node:assert/strict';
    import { demoPerformancePolicy, demoPerformanceQuotes } from './src/server/demo/performance.ts';
    const policy=demoPerformancePolicy(),quotes=demoPerformanceQuotes(); assert.ok(policy); assert.ok(quotes);
    assert.equal(policy.verifyProtocol({...policy.protocol,id:'a'.repeat(64)}),false);
    assert.equal(policy.verifyProtocol({...policy.protocol,hash:'a'.repeat(64)}),false);
    for(const patch of [{NODE_ENV:'production'}, {NEXT_PUBLIC_GOAL_HINT_DEMO:'false'},
      {DATABASE_URL:'mysql://demo@db.example/goal_hint_demo'}, {DATABASE_URL:'mysql://demo@localhost/goal_hint'}]) {
      const previous={...process.env}; Object.assign(process.env,patch);
      assert.equal(policy.verifyProtocol(policy.protocol),false);
      assert.equal(demoPerformancePolicy(),null);
      assert.equal(quotes.verifyPublicDisplay(),false);
      assert.equal(demoPerformanceQuotes(),null);
      process.env=previous;
    }
  `);
});

test("production cannot activate synthetic performance diagnostics with a demo flag", () => {
  run(`
    import assert from 'node:assert/strict';
    import { demoPerformancePolicy, demoPerformanceQuotes } from './src/server/demo/performance.ts';
    assert.equal(demoPerformancePolicy(),null);
    assert.equal(demoPerformanceQuotes(),null);
  `, { ...isolatedEnvironment, NODE_ENV: "production" });
});
