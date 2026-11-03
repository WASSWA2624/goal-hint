import assert from 'node:assert/strict';
import test from 'node:test';
import { createLocalSlipShare, sharedSlipSchema, shareSlipSourceSchema } from '../src/domain/shared-slips.ts';
import { createShareSlipHandler } from '../src/server/slips/shared-slips-http.ts';
import { slipShareCaption } from '../src/domain/slip-share-caption.ts';
import { createSharedSlips } from '../src/server/slips/shared-slips.ts';
import { liveRecord, now, today } from './helpers/live-refresh-fixtures.mjs';

const record = liveRecord();
const slip = { id: 'original', totalOdds: '2.00', averageProbability: 0.7, estimatedProbability: 0.6, oddsBasis: 'bookmaker',
  selections: [{ fixtureId: record.fixtureId, kickoffAt: now + 3600000, homeTeam: record.homeTeam, awayTeam: record.awayTeam,
    competition: record.competition, family: 'match-result', selection: 'home-win', probability: 0.7, odds: '2.00', oddsBasis: 'bookmaker' }] };
const source = { source: 'best', day: today, slipId: slip.id };
const request = (body, origin = 'https://goalhint.com') => new Request('https://goalhint.com/api/slips/share', {
  method: 'POST', headers: { origin, host: 'goalhint.com', 'content-type': 'application/json' }, body: JSON.stringify(body) });
function fixture(access = async () => ({ tier: 'full' })) {
  let reads = 0;
  const handle = createShareSlipHandler({ access, members: async () => ({ config: { production: false }, settings: {settings:null}, sessions: { verify: async () => ({ accountId: 'member' }) } }),
    services: async () => ({ database: {transaction: async run => run({$queryRaw: async () => [{number:1}]})} }), published: () => ({ day: async () => { reads++; return {
      slips: [{ id: 'a'.repeat(64), rank: 21, publicationDay: today, publishedAt: now, slip }] }; } }) });
  return { handle, reads: () => reads };
}
test('personal exports contain only an image snapshot in memory and no public token URL', () => {
  const shared = createLocalSlipShare(slip);
  assert.equal(shared.url, null); assert.equal('estimatedProbability' in shared.slip, false);
  assert.doesNotMatch(slipShareCaption(shared, 'en'), /null|undefined|\/s\//);
  assert.equal(shareSlipSourceSchema.safeParse({ source: 'builder', slipId: slip.id, criteria: '' }).success, false);
  assert.equal(shareSlipSourceSchema.safeParse({ ...source, slip }).success, false);
});

test('shared responses retain bounded observed scores, including a goalless result',()=>{
  const local=createLocalSlipShare(slip), score={home:2,away:0};
  const input={...local,url:`https://goalhint.com/s/${local.id}`,selectionScores:{[record.fixtureId]:score}};
  assert.deepEqual(sharedSlipSchema.parse(input).selectionScores[record.fixtureId],score);
  for(const home of [-1,1001,0.5])assert.equal(sharedSlipSchema.safeParse({...input,selectionScores:{[record.fixtureId]:{home,away:0}}}).success,false);
});
test('published sharing resolves an existing canonical link with only a minimal stable number registry', async () => {
  const f = fixture(), response = await f.handle(request(source));
  assert.equal(response.status, 200); const shared = await response.json();
  assert.ok(shared.url.endsWith(`/en/best-slips/${today}/21`)); assert.equal(f.reads(), 1);
  assert.equal('estimatedProbability' in shared.slip, false);
});
test('personal sources, foreign origins and expired access cannot export a public snapshot', async () => {
  const f = fixture();
  assert.equal((await f.handle(request({ source: 'builder', criteria: '', slipId: slip.id }))).status, 400);
  assert.equal((await f.handle(request(source, 'https://foreign.test'))).status, 403); assert.equal(f.reads(), 0);
  let checks = 0; const expired = fixture(async () => ({ tier: ++checks === 1 ? 'full' : 'free' }));
  const response = await expired.handle(request(source)); assert.equal(response.status, 403);
  assert.doesNotMatch(await response.text(), /home-win|original/);
});

test('legacy links retain their original custom snapshot and access rules without changing the token', async () => {
  const id='b'.repeat(32), original=createLocalSlipShare(slip).slip;
  let integrity=1;
  const database={transaction: async run=>run({$queryRaw:async()=>[{id,createdAt:new Date(now),snapshotJson:original,validIntegrity:integrity}]})};
  const service=createSharedSlips(database,{resolveResults:async()=>[]});
  assert.equal((await service.landing(id,false)).state,'restricted');
  const result=await service.landing(id,true);
  assert.equal(result.state,'available'); assert.deepEqual(result.shared.slip,original);
  assert.equal(result.shared.url,`https://goalhint.com/s/${id}`);
  integrity=0; await assert.rejects(service.landing(id,true));
  assert.equal((await service.landing('invalid',true)).state,'missing');
});
