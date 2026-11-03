import assert from 'node:assert/strict';
import test from 'node:test';
import { bestSlipOddsBands, bestSlipOddsBandFor, bestSlipPublicRank } from '../src/domain/best-slip-odds-bands.ts';
import { bestSlipBandCriteria } from '../src/domain/best-slips.ts';
import { parseBestSlipsQuery, serializeBestSlipsQuery, selectSlipSummaryResult, defaultBestSlipsQuery } from '../src/domain/best-slips-query.ts';
import { bestSlipsRangeKey } from '../src/domain/best-slips-client.ts';
import { createDailySlipPublisher } from '../src/server/slips/daily-slip-publication.ts';
import { liveRecord, now, today } from './helpers/live-refresh-fixtures.mjs';

test('odds bands have unambiguous boundaries and preserve their scope through dates, summary and pagination', () => {
  const quotes = ['1.49','1.50','4.99','5.00','9.99','10.00','19.99','20.00','49.99','50.00','100.00','100.01'];
  assert.deepEqual(quotes.map(bestSlipOddsBandFor),[null,'1.5-5','1.5-5','5-10','5-10','10-20','10-20','20-50','20-50','50-100','50-100',null]);
  for(const [index,band] of bestSlipOddsBands.entries()){
    const query={...defaultBestSlipsQuery(),oddsBand:band.id,page:2};
    assert.deepEqual(parseBestSlipsQuery(serializeBestSlipsQuery(query),today),query);
    assert.deepEqual(selectSlipSummaryResult(query,'won'),{period:'yesterday',status:'won',oddsBand:band.id,page:1});
    assert.equal(bestSlipBandCriteria(today,band.id).slips,20); assert.equal(bestSlipPublicRank(band.id,20),(index+1)*20);
  }
  assert.notEqual(bestSlipsRangeKey({...defaultBestSlipsQuery(),oddsBand:'5-10'},today),bestSlipsRangeKey(defaultBestSlipsQuery(),today));
  assert.throws(()=>parseBestSlipsQuery({oddsBand:'5-500'},today));
});
test('publisher fills missing bands only, publishes no more than twenty and resumes without duplicating prior cohorts', async () => {
  const published=new Set(['1.5-5']), calls=[], record=liveRecord();
  const model={calibrationReference:'test',correlationReference:'test',validFrom:now-1000,validUntil:now+86400000,estimate:()=>0.7};
  const options={database:{},competitionIds:[],model,providerOdds:true,now:()=>now,verifyModel:()=>true,verifyPublicOdds:()=>true,
    store:{publishedBands:async()=>[...published],publish:async(input)=>{calls.push(input);published.add(input.oddsBand);return 'published';}},
    read:async(criteria)=>{const price=(criteria.totalMin/100).toFixed(2);return {state:'generated',searchLimited:false,partialCoverage:false,
      data:{slips:[{id:'single',totalOdds:price,oddsBasis:'bookmaker',averageProbability:0.7,estimatedProbability:0.7,
        selections:[{fixtureId:record.fixtureId,kickoffAt:now+3600000,homeTeam:record.homeTeam,awayTeam:record.awayTeam,competition:record.competition,
          family:'match-result',selection:'home-win',odds:price,oddsBasis:'bookmaker',probability:0.7}]}]}};}};
  const publisher=createDailySlipPublisher(options);
  assert.equal((await publisher.publish()).status,'published'); assert.equal(calls.length,4);
  assert.deepEqual(calls.map(input=>input.oddsBand),bestSlipOddsBands.slice(1).map(band=>band.id));
  assert.ok(calls.every(input=>input.slips.length<=20));
  assert.equal((await publisher.publish()).status,'already-published');assert.equal(calls.length,4);
  const unavailable=createDailySlipPublisher({...options,store:{...options.store,publishedBands:async()=>[]},read:async()=>({state:'data-unavailable',data:null})});
  assert.equal((await unavailable.publish()).status,'unavailable');
});
