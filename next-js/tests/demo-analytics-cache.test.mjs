import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const program = String.raw`
  import assert from 'node:assert/strict';
  import {validateReportingDateRange} from './src/domain/calendar.ts';
  import {createPublicResponseCache,publicCacheDescriptor,publicCacheRules} from './src/server/cache/public-cache.ts';
  import {demoAnalyticsCacheDescriptor} from './src/server/demo/analytics-cache.ts';
  const start=Date.parse('2026-10-28T12:00:00Z'),range=validateReportingDateRange('2026-09-29','2026-10-28',31);
  const original=publicCacheDescriptor({kind:'performance',locale:'en',query:{range},scope:{grant:true},now:start,range,parse:value=>value});
  const descriptor={...original,tags:[...original.tags,'demo:source-comparison']};
  const policy=demoAnalyticsCacheDescriptor(descriptor,start);
  if(process.env.NODE_ENV!=='development'||process.env.NEXT_PUBLIC_GOAL_HINT_DEMO==='false'||process.env.EXPECT_DEMO_CACHE==='false'){
    assert.equal(policy,descriptor);assert.equal(policy.lifetimeMs,publicCacheRules.mutableMs);
    assert.ok(policy.tags.includes('date:2026-10-28'));
  }else{
    assert.equal(policy.key,descriptor.key);assert.equal(policy.deadlineAt,descriptor.deadlineAt);
    assert.equal(policy.lifetimeMs,3600000);assert.equal(Object.isFrozen(policy.tags),true);
    assert.deepEqual(policy.tags,descriptor.tags.filter(tag=>tag!=='date:2026-10-28'));
    let at=start,loads=0;const entries=new Map(),versions=new Map(descriptor.tags.map(tag=>[tag,'1']));
    const stamp=tags=>Object.fromEntries(tags.map(tag=>[tag,versions.get(tag)]));
    const cache=createPublicResponseCache({async lookup(key,tags){const row=entries.get(key),current=row&&JSON.stringify(row.generations)===JSON.stringify(stamp(tags));
      return {generations:stamp(tags),value:current?row.value:null,createdAt:current?row.createdAt:null,expiresAt:current?row.expiresAt:null};},
      async fill(key,tags,generations,value,createdAt,expiresAt){if(JSON.stringify(generations)!==JSON.stringify(stamp(tags)))return false;
        entries.set(key,{generations,value,createdAt,expiresAt});return true;},async reconcile(){return {acknowledged:0,removed:0};}},()=>at);
    const load=async()=>{loads++;return {asOf:at,sequence:loads};};
    const first=await cache.read(policy,load);at+=30000;versions.set('date:2026-10-28','2');
    const unchanged=await cache.read(policy,load);assert.deepEqual(unchanged,first);assert.equal(unchanged.asOf,start);assert.equal(loads,1);
    at+=900000;assert.deepEqual(await cache.read(policy,load),first);assert.equal(loads,1,'startup validation must leave time to browse the prepared report');
    for(const tag of ['date:2026-09-29','global:catalog','global:progress','demo:source-comparison']){
      at+=1000;versions.set(tag,'2');const value=await cache.read(policy,load);assert.equal(value.asOf,at);
    }
    assert.equal(loads,5);
    const revoked=demoAnalyticsCacheDescriptor(publicCacheDescriptor({kind:'performance',locale:'en',query:{range},scope:{grant:false},now:at,range,parse:value=>value}),at);
    assert.notEqual(revoked.key,policy.key);await cache.read(revoked,load);assert.equal(loads,6);
    at+=3600001;await cache.read(policy,load);assert.equal(loads,7);
  }
`;
for (const environment of [{ NODE_ENV: "development", NEXT_PUBLIC_GOAL_HINT_DEMO: "true" },
  { NODE_ENV: "production", NEXT_PUBLIC_GOAL_HINT_DEMO: "true" }, { NODE_ENV: "development", NEXT_PUBLIC_GOAL_HINT_DEMO: "false" },
  { NODE_ENV: "development", NEXT_PUBLIC_GOAL_HINT_DEMO: "true", DATABASE_URL: "mysql://demo@127.0.0.1/goal_hint_live", EXPECT_DEMO_CACHE: "false" }]) {
  test(`analytics cache keeps point-in-time demo snapshots and preserves other invalidations: ${environment.NODE_ENV}/${environment.NEXT_PUBLIC_GOAL_HINT_DEMO}/${environment.EXPECT_DEMO_CACHE ?? "default"}`, () => {
    const result = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", program], {
      cwd: new URL("../", import.meta.url), env: { ...process.env, DATABASE_URL: "mysql://demo@127.0.0.1/goal_hint_demo_cache_test", ...environment }, encoding: "utf8", timeout: 20_000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
}
