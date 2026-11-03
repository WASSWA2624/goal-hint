import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getReportingDate, addReportingDays, utcInstantFromEpochMilliseconds } from '../src/domain/calendar.ts';
import { defaultBestSlipsQuery } from '../src/domain/best-slips-query.ts';
import { createPublishedSlips, slipPublicationIdentity } from '../src/server/slips/published-slips.ts';
import { evidenceFingerprint } from '../src/server/evidence/evidence-input.ts';
import { liveRecord } from './helpers/live-refresh-fixtures.mjs';
import { MysqlServerUnavailableError } from './helpers/mysql-instance.mjs';
import { paidDatabase } from './helpers/paid-database.mjs';

const migration = name => readFile(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url), 'utf8');
test('MySQL cleanup preserves presets, legacy publications and explicit public links; bands seal independently and concurrently', { timeout: 180000 }, async t => {
  let f;
  try { f = await paidDatabase(); }
  catch (error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(error.message); return; }
  t.after(() => f.close());
  const { root, database } = f;
  await root.query(`CREATE TABLE FootballFixture (id CHAR(36) PRIMARY KEY) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
    CREATE TABLE PredictionSet (id CHAR(36) NOT NULL, cycleId CHAR(36) NOT NULL, fixtureId CHAR(36) NOT NULL,
      PRIMARY KEY(id), UNIQUE KEY(id,cycleId,fixtureId)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;`);
  for (const name of ['20261021110000_saved_slips','20261025113516_daily_slip_publications','20261028130000_daily_slip_capacity','20261029180000_shared_slips']) await root.query(await migration(name));
  const at = (await root.query('SELECT UTC_TIMESTAMP(3) AS at'))[0].at.getTime();
  const day = getReportingDate(utcInstantFromEpochMilliseconds(at)), yesterday = addReportingDays(day,-1);
  const fixtureId = randomUUID(), cycleId = randomUUID(), revisionId = randomUUID(), accountId = randomUUID();
  await root.query('INSERT INTO FootballFixture(id) VALUES (?)', [fixtureId]);
  await root.query('INSERT INTO PredictionSet(id,cycleId,fixtureId) VALUES (?,?,?)', [revisionId,cycleId,fixtureId]);
  await database.query(tx => tx.memberAccount.create({data:{id:accountId,phone:'256700009111',passwordHash:'test-hash',phoneVerifiedAt:new Date(at),createdAt:new Date(at),lastSignInAt:new Date(at)}}));
  await database.query(tx => tx.slipConfiguration.create({data:{id:randomUUID(),accountId,name:'Keep this filter',nameKey:'keep this filter',parameters:'slips=10',createdAt:new Date(at),updatedAt:new Date(at)}}));
  const record = liveRecord(), legacyAt = Date.parse(`${yesterday}T01:00:00Z`);
  const slip = { id:'synthetic-editorial',totalOdds:'4.00',oddsBasis:'bookmaker',averageProbability:0.7,
    selections:[{fixtureId,kickoffAt:Date.parse(`${yesterday}T20:00:00Z`),homeTeam:record.homeTeam,awayTeam:record.awayTeam,competition:record.competition,
      family:'match-result',selection:'home-win',probability:0.7,odds:'4.00',oddsBasis:'bookmaker',forecast:{cycleId,revisionId,publishedAt:legacyAt-1000}}] };
  const model = {calibrationReference:'synthetic',correlationReference:'synthetic',validFrom:legacyAt-60000,validUntil:at+86400000};
  const body = {version:1,day:yesterday,publishedAt:legacyAt,model:{id:evidenceFingerprint(model),...model},criteria:'totalMin=4.50&totalMax=5.50&slips=100',count:1,searchLimited:false,partialCoverage:false};
  const parentId=slipPublicationIdentity(yesterday), snapshot={slip,estimatedProbability:0.7}, rowId=evidenceFingerprint({publicationId:parentId,rank:1,snapshot});
  await root.query("INSERT INTO DailySlipPublication(id,eatDate,publishedAt,modelId,bodyJson,integrity) VALUES (?,?,?,?,?,SHA2(CAST(JSON_EXTRACT(?,'$') AS CHAR),256))",[parentId,`${yesterday} 00:00:00`,new Date(legacyAt),body.model.id,JSON.stringify(body),JSON.stringify(body)]);
  await root.query("INSERT INTO PublishedSlip(id,publicationId,`rank`,snapshotJson,integrity) VALUES (?,?,1,?,SHA2(CAST(JSON_EXTRACT(?,'$') AS CHAR),256))",[rowId,parentId,JSON.stringify(snapshot),JSON.stringify(snapshot)]);
  await root.query('INSERT INTO PublishedSlipLeg(slipId,fixtureId,cycleId,revisionId) VALUES (?,?,?,?)',[rowId,fixtureId,cycleId,revisionId]);
  const savedId=randomUUID();
  await root.query('INSERT INTO SavedSlip(id,accountId,fingerprint,snapshotJson,createdAt) VALUES (?,?,?,?,?)',[savedId,accountId,'e'.repeat(64),JSON.stringify(slip),new Date(at)]);
  await root.query('INSERT INTO SavedSlipFixture(slipId,fixtureId) VALUES (?,?)',[savedId,fixtureId]);
  for (const [id,value] of [['a',slip],['b',{...slip,id:'personal-only'}]]) {
    const json=JSON.stringify(value);
    await root.query("INSERT INTO SharedSlip(id,ownerKey,fingerprint,snapshotJson,integrity,createdAt) VALUES (?,?,?,?,SHA2(CAST(JSON_EXTRACT(?,'$') AS CHAR),256),?)",[id.repeat(32),'c'.repeat(64),id.repeat(64),json,json,new Date(at)]);
  }
  const before=await root.query('SELECT bodyJson,integrity FROM DailySlipPublication');
  await root.query(await migration('20261103120000_transient_slips_and_odds_bands'));
  assert.deepEqual(await root.query('SELECT bodyJson,integrity FROM DailySlipPublication'),before);
  assert.equal((await root.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('SavedSlip','SavedSlipFixture')")).length,0);
  assert.equal(await database.query(tx=>tx.slipConfiguration.count()),1);
  const publicLinks=await root.query('SELECT id,snapshotJson FROM SharedSlip'); assert.equal(publicLinks.length,2);
  assert.equal(publicLinks[0].snapshotJson.id,slip.id);
  for (const table of ['DailySlipPublication','PublishedSlip','PublishedSlipLeg','SharedSlip']) await root.query(`GRANT SELECT, INSERT ON goal_hint_test.${table} TO 'paid_application'@'127.0.0.1'`);
  await root.query("GRANT SELECT ON goal_hint_test.FootballFixture TO 'paid_application'@'127.0.0.1'");
  const store=createPublishedSlips(database,{bindForecasts:async(_tx,value)=>value,
    resolveResults:async(_tx,selections)=>selections.map(selection=>({...selection,completed:true,status:'finished-regulation',regulationVerified:true,regulationHome:0,regulationAway:1}))});
  assert.equal((await store.day(yesterday)).slips[0].id,rowId); assert.deepEqual(await store.publishedBands(yesterday),['legacy']);
  for(const table of ['DailySlipPublication','PublishedSlip','PublishedSlipLeg','SharedSlip']) await assert.rejects(root.query(`DELETE FROM ${table}`),/append-only|permanent/);
  const kickoffAt=Date.parse(`${day}T20:59:00Z`);
  if(kickoffAt-at<600000){t.diagnostic('Cleanup and legacy checks passed; live publication skipped at the EAT day cutoff.');return;}
  const current={...slip,estimatedProbability:0.7,selections:slip.selections.map(selection=>({...selection,kickoffAt,forecast:{...selection.forecast,publishedAt:at-1000}}))};
  const input={day,slips:[current],searchLimited:false,partialCoverage:false,model:{...model,estimate:()=>0.7},verifyModel:()=>true,verifyPublicOdds:()=>true};
  assert.deepEqual((await Promise.all([store.publish(input),store.publish(input)])).sort(),['already-published','published']);
  assert.equal((await store.browse(defaultBestSlipsQuery(),day)).slips.length,2);
  assert.equal((await store.history({from:day,to:day,page:1,pageSize:10})).records[0].outcome,'lost');
  const high={...current,totalOdds:'7.00',selections:current.selections.map(selection=>({...selection,odds:'7.00'}))};
  assert.equal(await store.publish({...input,oddsBand:'5-10',slips:[high]}),'published');
  assert.equal((await store.day(day,false,'5-10')).slips[0].rank,21);
  await assert.rejects(root.query(`INSERT INTO DailySlipPublication(id,eatDate,oddsBand,publishedAt,modelId,bodyJson,integrity)
    SELECT REPEAT('d',64),DATE_ADD(eatDate,INTERVAL 1 DAY),oddsBand,publishedAt,modelId,JSON_SET(bodyJson,'$.count',21),integrity FROM DailySlipPublication WHERE oddsBand='1.5-5' LIMIT 1`),/check|constraint/);
  await assert.rejects(root.query(`INSERT INTO DailySlipPublication(id,eatDate,publishedAt,modelId,bodyJson,integrity)
    SELECT REPEAT('f',64),DATE_ADD(eatDate,INTERVAL 2 DAY),publishedAt,modelId,bodyJson,integrity FROM DailySlipPublication LIMIT 1`),/odds band/);
});
