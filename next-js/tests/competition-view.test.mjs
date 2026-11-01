import test from 'node:test';
import assert from 'node:assert/strict';
import { competitionViewSchema, knockoutStage, bracketFromFixtures, layoutBracket, bracketGeometry, tieScore } from '../src/domain/competition-view.ts';
import { normalizeStoredStandings, readCompetitionView } from '../src/server/matches/competition-read.ts';
import { sampleCompetitionViews } from './helpers/competition-fixtures.mjs';
import { evidenceFingerprint, evidenceSerialize } from '../src/server/evidence/evidence-input.ts';

const now=Date.parse('2026-10-09T09:00:00Z'), team=id=>({id,name:id,logoUrl:null});
const views=()=>sampleCompetitionViews(now,{home:[],away:[]});
const row=(id,extra={})=>({rank:id,team:{id,name:`Team ${id}`},points:10-id,goalsDiff:3-id,group:'League',form:'WDLWW',
  all:{played:5,win:3,draw:1,lose:1,goals:{for:8,against:5}},...extra});
const response=rows=>({response:[{league:{id:39,season:2026,standings:[rows]}}]});
const context={season:2026,competitionName:'League',externalId:39,retrievedAt:now,provider:'api-football'};
const source=(id,round,home,away,kickoffAt,status='finished-regulation')=>({id,slug:'home-away',round,home:team(home),away:team(away),
  kickoffAt,status,homeGoals:2,awayGoals:1,penaltyHome:null,penaltyAway:null,scorePeriod:'regulation'});

test('full tables preserve source ranks, signed points and complete statistics without a repeated league column',()=>{
  const table=normalizeStoredStandings(response([row(2),row(1,{points:-3})]),context,id=>id===1?{...team('canonical-1'),shortName:'T1'}:null);
  assert.equal(table.groups[0].name,null); assert.equal(table.groups[0].rows.length,2); assert.equal(table.complete,true);
  assert.equal(table.groups[0].rows[0].team.id,'canonical-1'); assert.equal(table.groups[0].rows[0].points,-3);
  assert.equal(table.groups[0].rows[0].played,5); assert.equal(table.groups[0].rows[0].wins,3);
  assert.deepEqual(table.groups[0].rows[1].form.map(item=>item.result),['W','D','L','W','W']);
  assert.equal(table.groups[0].rows[1].team.logoUrl,null);
});

test('provider groups keep their own ranks and abbreviated group labels; bad or duplicated rows mark partial coverage',()=>{
  const raw={response:[{league:{id:39,season:2026,standings:[[row(1,{group:'League - Group A'}),row(1),row(0)],
    [row(2,{group:'League - Group B',all:null,form:'invalid'})]]}}]};
  const table=normalizeStoredStandings(raw,context,()=>null);
  assert.equal(table.complete,false); assert.deepEqual(table.groups.map(group=>group.name),['Group A','Group B']);
  assert.equal(table.groups[0].rows.length,1); assert.equal(table.groups[1].rows[0].played,null);
  assert.deepEqual(table.groups[1].rows[0].form,[]);
  assert.equal(normalizeStoredStandings(raw,{...context,season:2025},()=>null),null);
  assert.equal(normalizeStoredStandings(raw,{...context,externalId:99},()=>null),null);
  assert.equal(normalizeStoredStandings({bad:'body'},context,()=>null),null);
  assert.equal(normalizeStoredStandings({...response([row(1)]),paging:{current:1,total:2}},context,()=>null).complete,false);
});

test('only explicit knockout stage names become bracket rounds',()=>{
  for(const name of ['Regular Season - 3','Group Stage - 1','Final Stage','Championship Round',null]) assert.equal(knockoutStage(name),null);
  assert.equal(knockoutStage('Quarter-finals').id,'quarter-finals'); assert.equal(knockoutStage('Semi Finals').id,'semi-finals');
  assert.equal(knockoutStage('Round of 16').id,'round-of-16'); assert.equal(knockoutStage('Final - 2nd Leg').id,'final');
  assert.equal(knockoutStage('Third-place play-off').id,'third-place');
});

test('catalog subsets group returned fixtures, retain score periods, and connect only unambiguous observed progression',()=>{
  const matches=[source('q1','Quarter-finals','a','b',100),source('q2','Quarter-finals','c','d',100),
    source('s1','Semi-finals','a','c',200,'scheduled')];
  const bracket=bracketFromFixtures(matches,now), quarter=bracket.rounds[0];
  assert.equal(bracket.complete,false); assert.equal(quarter.ties[0].nextTieId,'s1'); assert.equal(quarter.ties[0].winnerId,'a');
  assert.equal(quarter.ties[0].fixtures[0].scorePeriod,'regulation'); assert.equal(quarter.ties[0].aggregateHome,null);
  const ambiguous=bracketFromFixtures([...matches,source('s2','Semi-finals','a','e',210,'scheduled')],now);
  assert.equal(ambiguous.rounds[0].ties[0].nextTieId,null);
  const pending=bracketFromFixtures([{...matches[0],status:'scheduled'},...matches.slice(1)],now);
  assert.equal(pending.rounds[0].ties[0].winnerId,null);
  assert.equal(bracketFromFixtures([source('league','Regular Season - 3','a','b',100)],now),null);
  const bronze=bracketFromFixtures([matches[0],source('bronze','Third-place play-off','b','c',200)],now);
  assert.equal(bronze.rounds[0].ties[0].winnerId,null);
});

test('complete and incomplete draws, byes and TBD slots lay out without overlapping cards or invented edges',()=>{
  for(const bracket of [views().cup.bracket,views().partial.bracket,views().mixed.bracket]) {
    const geometry=layoutBracket(bracket), nodes=bracket.rounds.flatMap(round=>round.ties);
    assert.equal(geometry.positions.size,nodes.length);
    for(const round of bracket.rounds) {
      const positions=round.ties.map(tie=>geometry.positions.get(tie.id));
      for(const [index,a] of positions.entries()) for(const b of positions.slice(index+1)) assert.ok(Math.abs(a.y-b.y)>=bracketGeometry.cardHeight);
      for(const point of positions) {assert.ok(point.y>=0);assert.ok(point.y+bracketGeometry.cardHeight<=geometry.height);}
    }
    const before=JSON.stringify(bracket); layoutBracket(bracket); assert.equal(JSON.stringify(bracket),before);
  }
  const bye=structuredClone(views().cup); bye.bracket.rounds[0].ties=bye.bracket.rounds[0].ties.slice(0,1);
  assert.equal(competitionViewSchema.safeParse(bye).success,true); assert.ok(layoutBracket(bye.bracket).height>0);
});

test('invalid draw references, cycles, participants and duplicate groups cannot enter the presentation',()=>{
  for(const mutate of [
    view=>{view.bracket.rounds[0].ties[0].nextTieId='missing';},
    view=>{view.bracket.rounds[0].ties[0].nextTieId=view.bracket.rounds[0].ties[0].id;},
    view=>{view.bracket.rounds[0].ties[0].winnerId='other';},
    view=>{view.bracket.rounds[0].ties[0].fixtures[0].homeId='other';},
    view=>{view.bracket.rounds[0].ties.push(view.bracket.rounds[0].ties[0]);},
  ]) {const view=structuredClone(views().cup);mutate(view);assert.equal(competitionViewSchema.safeParse(view).success,false);}
  const league=structuredClone(views().league);league.tables.groups[0].rows.push(league.tables.groups[0].rows[0]);
  assert.equal(competitionViewSchema.safeParse(league).success,false);
});

test('aggregate and shootout metadata remain distinct from final or regulation match scores',()=>{
  const bracket=views().cup.bracket, quarter=bracket.rounds[1].ties;
  assert.deepEqual(tieScore(quarter[2]),{home:3,away:2,aggregate:true});
  assert.deepEqual(tieScore(quarter[0]),{home:2,away:2,aggregate:false});
  assert.equal(quarter[0].fixtures[0].penaltyHome,5);
  assert.deepEqual(tieScore(bracket.rounds.at(-1).ties[0]),{home:null,away:null,aggregate:false});
});

test('sealed single-match finals identify the winner without a next round, while conflicting progression is withheld',()=>{
  const final={...source('final','Final','a','b',100),homeGoals:3,awayGoals:1,scorePeriod:'final'};
  assert.equal(bracketFromFixtures([final],now).rounds[0].ties[0].winnerId,'a');
  assert.equal(bracketFromFixtures([{...final,homeGoals:2,awayGoals:2,penaltyHome:4,penaltyAway:5}],now).rounds[0].ties[0].winnerId,'b');
  assert.equal(bracketFromFixtures([{...final,scorePeriod:'regulation'}],now).rounds[0].ties[0].winnerId,null);
  const conflict=bracketFromFixtures([{...final,round:'Semi-finals'},source('next','Final','b','c',200,'scheduled')],now);
  assert.equal(conflict.rounds[0].ties[0].winnerId,'a');assert.equal(conflict.rounds[0].ties[0].nextTieId,null);
});

test('stored competition reads are season-bound and never fetch a provider or calculate ranks from partial fixtures',async()=>{
  let fixtures=0;
  const tx={seasonStandings:{findUnique:async query=>{assert.equal(query.where.seasonId,'season-1');return{status:'available',body:response([row(1)]),retrievedAt:new Date(now)};}},
    footballCompetitionProvider:{findFirst:async()=>({externalId:39n})},footballTeamProvider:{findMany:async()=>[]},
    footballFixture:{findMany:async()=>{fixtures++;return[];}}};
  const binding={seasonId:'season-1',season:2026,competitionId:'league',competitionName:'League',competitionType:'League',round:'Regular Season - 3',provider:'api-football'};
  const value=await readCompetitionView(tx,binding,now);
  assert.equal(value.tables.groups[0].rows.length,1);assert.equal(value.bracket,null);assert.equal(fixtures,0);
  tx.seasonStandings.findUnique=async()=>({status:'available',body:response([row(1)]),retrievedAt:new Date(now+1)});
  assert.equal(await readCompetitionView(tx,binding,now),null);
  tx.seasonStandings.findUnique=async()=>({status:'available',body:{...views().league,tables:{...views().league.tables,retrievedAt:now+1}},retrievedAt:new Date(now)});
  assert.equal(await readCompetitionView(tx,binding,now),null);
});

test('brackets use coherent sealed total scores and penalties, never a tainted result or unverified catalog goals',async()=>{
  const fixtureId='10000000-0000-4000-8000-000000000007';
  const content={status:'finished-penalties',providerStatus:'PEN',elapsedMinutes:120,
    reportedGoals:{home:3,away:3},extraTimeScore:{home:3,away:3},penaltyScore:{home:5,away:4},
    regulation:{verified:true,home:2,away:2,evidenceRef:'synthetic-result'}};
  const body={id:'a'.repeat(64),fixtureId,fixtureVersion:1n,previousId:null,observationId:'b'.repeat(64),observedAt:now,
    providerUpdatedAt:null,regulationVerifiedAt:now,...content};
  let rows=[{id:body.id,fixtureId,fixtureVersion:1n,body:evidenceSerialize(body),validIntegrity:1,observedAt:new Date(now),
    status:content.status,regulationVerified:true,regulationHome:2,regulationAway:2,contentHash:evidenceFingerprint(content)}];
  const fixture={id:fixtureId,round:'Quarter-finals',kickoff:new Date(now-86400000),retrievedAt:new Date(now),
    status:content.status,regulationHome:2,regulationAway:2,regulationVerifiedAt:new Date(now),regulationEvidenceRef:'synthetic-result',
    homeTeam:{...team('a'),code:'A'},awayTeam:{...team('b'),code:'B'},lifecycleState:null,resultState:{resultId:body.id}};
  let queries=0;
  const tx={seasonStandings:{findUnique:async()=>null},footballFixture:{findMany:async()=>[fixture]},$queryRaw:async()=>{queries++;return rows;}};
  const binding={seasonId:'cup-season',season:2026,competitionId:'cup',competitionName:'Cup',competitionType:'Cup',round:'Quarter-finals',provider:'api-football'};
  const read=async()=> (await readCompetitionView(tx,binding,now)).bracket.rounds[0].ties[0].fixtures[0];
  let match=await read(); assert.equal(match.homeGoals,3);assert.equal(match.penaltyHome,5);assert.equal(match.scorePeriod,'final');
  rows=[{...rows[0],validIntegrity:0}]; match=await read(); assert.equal(match.homeGoals,null);assert.equal(match.penaltyHome,null);
  fixture.resultState=null; rows=[]; match=await read();assert.equal(match.homeGoals,2);assert.equal(match.scorePeriod,'regulation');
  fixture.lifecycleState={issue:'identity-mismatch'}; match=await read();assert.equal(match.homeGoals,null);
  assert.equal(queries,4,'one batch result read per complete bracket projection');
});
