import assert from 'node:assert/strict';
import test from 'node:test';
import { assessBaselineEvidence, baselineEvidencePolicy } from '../src/server/evidence/baseline-evidence.ts';
import { buildEvidenceSnapshot } from '../src/server/evidence/evidence-snapshot.ts';
import { buildPlayerFootballSources, playerFootballClaims, verifyPlayerFootballClaims } from '../src/server/evidence/player-football.ts';
import { evidenceSource, evidenceContext, evidencePolicy, evidenceAuthority, evidenceHash } from './helpers/evidence-fixtures.mjs';
import { createLiveFootballPreparation, fitLiveFootballSources, verifyLiveFootballSource } from '../src/server/live/live-ai-evidence.ts';
import { API_FOOTBALL_CONTRACT_VERSION } from '../src/server/football/api-football-contract.ts';
import { liveAiEvidencePolicy } from '../src/server/live/live-ai-plan.ts';
import { evidenceSerialize } from '../src/server/evidence/evidence-input.ts';

const context = evidenceContext(), DAY = 86_400_000;
const policy = evidencePolicy(), authority = evidenceAuthority();
const candidate = { family: 'match-result', selection: 'home-win' };
function historical(team, index, { home = true, scored = 2, conceded = 0, opponent = 99, fixtureId = 200 + team.externalId * 10 + index, kickoffAt = context.cutoffAt - (index + 1) * DAY } = {}) {
  const value = { fixtureId, homeExternalId: home ? team.externalId : opponent, awayExternalId: home ? opponent : team.externalId,
    kickoffAt, homeGoals: home ? scored : conceded, awayGoals: home ? conceded : scored,
    regulationVerified: true, period: 'regulation-including-stoppage-time' };
  return evidenceSource(context, { sourceKey: evidenceHash(`${team.teamId}-${fixtureId}`),
    claims: [{ kind: 'history', subjectTeamId: team.teamId, key: `fixture-${fixtureId}`, value,
      summary: 'Synthetic verified regulation result.', certainty: 'confirmed', asOfAt: null }] });
}
function history({ homeScores, awayScores, count = 3 } = {}) {
  return [evidenceSource(context), ...Array.from({length: count}, (_, i) => historical(context.home, i, homeScores)),
    ...Array.from({length: count}, (_, i) => historical(context.away, i, { home: false, scored: 0, conceded: 2, ...awayScores }))];
}
function snapshot(sources = history()) { return buildEvidenceSnapshot({context, policy, sources}, authority); }
function player(id = 5, teamId = context.home.externalId, overrides = {}) {
  const source = { provider: 'api-football', endpoint: '/players', retrievedAt: context.cutoffAt - 500, providerUpdatedAt: null };
  return { player: { id }, source, statistics: [{ team: { id: teamId }, competition: { id: 39, season: 2026 },
    games: { appearances: 6, minutes: 540 }, goals: { total: 4, assists: 1 }, ...overrides }] };
}
function absence(id = 5, type = 'Missing Fixture') {
  return { kind: 'injuries', team: {id:context.home.externalId}, fixtureId: context.externalFixtureId,
    startingPlayers:[], substitutes:[], formation:null, fitnessConclusion:'unknown',
    reportedInjury: { playerId: id, name: 'Synthetic scorer', type, reason: 'Synthetic absence' },
    source: { provider:'api-football', endpoint:'/injuries', retrievedAt:context.cutoffAt - 100, providerUpdatedAt:null } };
}
function sources(players = [player()], availability = [absence()], scope = {competitionExternalId:39, season:2026}) {
  return buildPlayerFootballSources(context, scope, players, availability, {evidence:'synthetic-evidence', retention:'synthetic-retention'});
}

test('recent form and supported historical event frequencies change baseline eligibility, without changing forecasts', () => {
  const good = assessBaselineEvidence(snapshot(), candidate);
  assert.equal(good.eligible, true); assert.equal(good.cohorts[0].wins, 3); assert.ok(good.historicalSupport > 0.7);
  const poor = assessBaselineEvidence(snapshot(history({homeScores:{scored:0,conceded:2},awayScores:{scored:2,conceded:0}})), candidate);
  assert.equal(poor.eligible, false); assert.ok(poor.reasons.includes('adverse-recent-form-home'));
  assert.ok(poor.reasons.includes('historical-event-support-below-minimum'));
  assert.equal(good.version, baselineEvidencePolicy.version);
});
test('each exact supported event uses the regulation settlement rules', () => {
  const data = snapshot();
  assert.equal(assessBaselineEvidence(data, {family:'total-goals',selection:'under-2.5'}).eligible,true);
  assert.equal(assessBaselineEvidence(data, {family:'total-goals',selection:'over-2.5'}).eligible,false);
  assert.equal(assessBaselineEvidence(data, {family:'both-teams-to-score',selection:'no'}).eligible,true);
  assert.equal(assessBaselineEvidence(data, {family:'both-teams-to-score',selection:'yes'}).eligible,false);
  assert.equal(assessBaselineEvidence(data, {family:'double-chance',selection:'home-or-draw'}).eligible,true);
});
test('reversed historical venue maps the canonical team correctly and does not assert home advantage', () => {
  const data = history({homeScores:{home:false,scored:2,conceded:0}});
  const decision = assessBaselineEvidence(snapshot(data), candidate);
  assert.equal(decision.eligible,true); assert.equal(decision.cohorts[0].venueSampleSize,0);
  assert.equal(decision.cohorts[0].goalsFor,6);
});
test('tiny head-to-head samples cannot satisfy team minimums or manufacture independent confirmations', () => {
  const home = historical(context.home,0,{home:false,scored:2,conceded:0,opponent:context.away.externalId,fixtureId:999});
  const away = evidenceSource(context,{ ...home, sourceKey:evidenceHash('same-h2h-away'), claims:home.claims.map(claim=>({...claim,subjectTeamId:context.away.teamId})) });
  const result=assessBaselineEvidence(snapshot([evidenceSource(context),home,away]),candidate);
  assert.equal(result.eligible,false); assert.equal(result.headToHeadSampleSize,1);
  assert.equal(result.cohorts[0].sampleSize,1); assert.equal(result.cohorts[1].sampleSize,1);
});
test('later completed results are excluded and cannot establish historical support', () => {
  const result=assessBaselineEvidence(snapshot([evidenceSource(context),historical(context.home,0,{kickoffAt:context.cutoffAt+1})]),candidate);
  assert.equal(result.eligible,false); assert.equal(result.cohorts[0].sampleSize,0);
});
test('missing injuries and player stats remain optional unknown evidence', () => {
  const result=assessBaselineEvidence(snapshot(),candidate);
  assert.equal(result.eligible,true); assert.equal(result.absentImportantPlayers.length,0);
  assert.ok(result.uncertainties.some(value=>value.includes('unknown')));
});
test('confirmed scorer absence joins stable player/team/competition-season contributions and affects eligibility', () => {
  const observations=sources();
  assert.ok(observations.every(source=>verifyPlayerFootballClaims(source,context)));
  const result=assessBaselineEvidence(snapshot([...history(),...observations]),candidate);
  assert.equal(result.eligible,false); assert.deepEqual(result.absentImportantPlayers,[5]);
  assert.ok(result.reasons.includes('important-scorer-absence-without-verified-replacement'));
  assert.ok(result.sourceIds.includes(observations[0].id));
});
test('doubtful status, another player, and incorrect competition-season do not invent scorer impact', () => {
  for (const observations of [sources([player()],[absence(5,'Questionable')]),sources([player()],[absence(6)]),
    sources([player(5,10,{competition:{id:40,season:2026}})]),sources([player(5,10,{competition:{id:39,season:2025}})])]) {
    assert.equal(assessBaselineEvidence(snapshot([...history(),...observations]),candidate).eligible,true);
  }
});
test('player season aggregates retain original clocks and are labeled separately from recent form', () => {
  const claims=playerFootballClaims(context,{competitionExternalId:39,season:2026},[player()],[]);
  assert.equal(claims[0].retrievedAt,context.cutoffAt-500);
  assert.ok(claims[0].claims[0].summary.includes('season contribution is not recent form'));
  const result=assessBaselineEvidence(snapshot([...history(),...sources([{...player(),source:{...player().source,retrievedAt:context.cutoffAt+1}}])]),candidate);
  assert.equal(result.eligible,true); assert.deepEqual(result.absentImportantPlayers,[]);
});
test('a confirmed comparable starting replacement resolves the conservative scorer-absence veto', () => {
  const lineup={...absence(),kind:'lineups',reportedInjury:null,startingPlayers:[{id:6,name:'Synthetic replacement',number:9,position:'F',grid:null}]};
  const result=assessBaselineEvidence(snapshot([...history(),...sources([player(),player(6)],[absence(),lineup])]),candidate);
  assert.equal(result.eligible,true); assert.deepEqual(result.absentImportantPlayers,[5]);
});

test('live football preparation collects bounded available player evidence with AI absent and preserves original clocks', async () => {
  const calls=[], usage=[], refs={evidence:'synthetic-evidence',retention:'synthetic-retention'};
  const fixture={dataVersion:context.fixtureVersion,homeTeamId:context.home.teamId,awayTeamId:context.away.teamId,
    season:{year:2026,coverage:{players:true,injuries:true,'fixtures.lineups':true},competition:{providers:[{externalId:39n}]}}};
  const result=(endpoint,params,data)=>({status:'complete',data,requestsDispatched:1,error:null,provenance:[{
    provider:'api-football',endpoint,contractVersion:API_FOOTBALL_CONTRACT_VERSION,requestParameters:params,
    retrievedAt:data[0]?.source.retrievedAt??context.cutoffAt-100,providerUpdatedAt:null,quota:{kind:'success'}}]});
  const prepare=createLiveFootballPreparation({refs,pacing:'standard',database:{async query(fn){return fn({footballFixture:{async findUnique(){return fixture;}}});}},
    importer:{async import(){return {requestsDispatched:1};}},adapter:{
      async availability(id,kind,bounds){calls.push({kind,bounds});return result(kind,{fixture:String(id)},kind==='injuries'?[absence()]:[]);},
      async playerStatistics(query,bounds){calls.push({kind:'players',query,bounds});return result('playerStatistics',{
        league:'39',season:'2026',team:String(query.teamId),page:'1'},[player(query.teamId,query.teamId)]);}
    }});
  const member={context,now:context.analysisAt,jobId:'a'.repeat(64),entry:{envelope:{fallbackReserveMs:200000}}};
  const prepared=await prepare(member,{deadlineAt:context.cutoffAt+600000,remainingMs:()=>600000,async checkpoint(){},async recordUsage(item){usage.push(item);}});
  assert.equal(calls.length,4);assert.equal(usage.length,6);assert.equal(prepared.sources.length,3);
  assert.ok(calls.every(call=>call.bounds.maxRequests===1&&call.bounds.maxPages===1&&call.bounds.retry.maxAttempts===1));
  assert.ok(prepared.sources.every(source=>verifyLiveFootballSource(source,context,refs)));
  assert.equal(prepared.sources.find(source=>source.claims[0].kind==='injury').retrievedAt,context.cutoffAt-100);
  fixture.season.coverage={players:false,injuries:false,'fixtures.lineups':false};calls.length=0;
  assert.deepEqual((await prepare(member,{deadlineAt:context.cutoffAt+600000,remainingMs:()=>600000,async checkpoint(){},async recordUsage(){}})).sources,[]);
  assert.equal(calls.length,0);
});

test('full squad evidence is narrowed deterministically to actual snapshot bounds without removing baseline cohorts', () => {
  const completeHistory=history({count:8});
  const completePlayers=[context.home,context.away].flatMap(team=>Array.from({length:20},(_,index)=>player(team.externalId*100+index,team.externalId)));
  const availability=[context.home,context.away].map(team=>({...absence(),kind:'lineups',team:{id:team.externalId},reportedInjury:null,
    startingPlayers:Array.from({length:11},(_,index)=>({id:team.externalId*100+index,name:`Synthetic player ${index}`,number:index+1,position:'F',grid:'1:1'})),
    substitutes:Array.from({length:12},(_,index)=>({id:team.externalId*100+index+11,name:`Synthetic substitute ${index}`,number:index+12,position:'F',grid:null}))}));
  const extra=sources(completePlayers,availability), boundedPolicy=liveAiEvidencePolicy({evidence:'synthetic-evidence'});
  // The real policy requires derived form/rest too; this synthetic archive isolates capacity from those separate minimums.
  const bounded={...boundedPolicy,minimum:{...boundedPolicy.minimum,formPerTeam:0,requireRest:false}};
  assert.throws(()=>buildEvidenceSnapshot({context,policy:bounded,sources:[...completeHistory,...extra]},authority));
  const fitted=fitLiveFootballSources(context,bounded,authority,completeHistory,extra);
  const result=buildEvidenceSnapshot({context,policy:bounded,sources:fitted},authority);
  assert.ok(Buffer.byteLength(evidenceSerialize(result))<=bounded.bounds.maxSnapshotBytes);
  assert.equal(result.coverage.sufficient,true);
  assert.equal(fitted.filter(source=>source.claims.some(claim=>claim.kind==='history')).length,16);
  assert.ok(fitted.flatMap(source=>source.claims).length<completeHistory.concat(extra).flatMap(source=>source.claims).length);
  assert.deepEqual(fitted,fitLiveFootballSources(context,bounded,authority,completeHistory,extra));
  for(const source of fitted.filter(source=>source.version==='goal-hint-player-football-v1')) {
    assert.equal(source.retrievedAt,extra.find(original=>original.sourceKey===source.sourceKey).retrievedAt);
  }
});

test('capacity fitting keeps confirmed scorer absence with its scoped contribution before other optional claims', () => {
  const bounded={...policy,bounds:{...policy.bounds,maxSources:9,maxSnapshotBytes:30000}};
  const completeHistory=history(), extra=sources(Array.from({length:20},(_,index)=>player(index+5)),[absence()]);
  const fitted=fitLiveFootballSources(context,bounded,authority,completeHistory,extra), result=snapshot(fitted);
  const decision=assessBaselineEvidence(result,candidate);
  assert.deepEqual(decision.absentImportantPlayers,[5]); assert.equal(decision.eligible,false);
  assert.ok(fitted.length<=bounded.bounds.maxSources);
  const denied=evidenceAuthority({authorize(){throw new Error('permission revoked');}});
  assert.throws(()=>fitLiveFootballSources(context,bounded,denied,completeHistory,extra));
});
