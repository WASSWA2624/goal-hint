import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFixtureModelEvidence } from '../src/server/evidence/fixture-model-evidence.ts';
import { readArchivedFixtureContext } from '../src/server/evidence/fixture-context-evidence.ts';
import { buildEvidenceSnapshot } from '../src/server/evidence/evidence-snapshot.ts';
import { API_FOOTBALL_CONTRACT_VERSION } from '../src/server/football/api-football-contract.ts';
import { encodeFootballSourcePage } from '../src/server/football/source-page-payload.ts';
import { EVIDENCE_NOW, evidenceAuthority, evidenceContext, evidenceHash, evidencePolicy, evidenceSource } from './helpers/evidence-fixtures.mjs';

const context = evidenceContext();
const fixture = { fixtureId: context.fixtureId, competitionId: 'competition-1', homeTeamId: context.home.teamId,
  awayTeamId: context.away.teamId, kickoffAt: context.kickoffAt, forecastAt: context.cutoffAt };
const row = (fixtureId, homeTeamId, awayTeamId, overrides = {}) => ({ fixtureId, homeTeamId, awayTeamId,
  competitionId: fixture.competitionId, kickoffAt: EVIDENCE_NOW - 86_400_000, availableAt: EVIDENCE_NOW - 100,
  homeGoals: 1, awayGoals: 0, period: 'regulation-including-stoppage-time', observationHash: evidenceHash(fixtureId),
  evidenceRef: 'synthetic-result', halfTime: null, ...overrides });

test('a fixture has one bounded result corpus with direct, shared and connected relationship references', () => {
  const home = row('home-common', fixture.homeTeamId, 'common'), away = row('away-common', 'common', fixture.awayTeamId);
  const direct = row('direct', fixture.awayTeamId, fixture.homeTeamId, { halfTime: { home: 1, away: 0 } });
  const connected = row('graph', 'common', 'other'), unrelated = row('unrelated', 'far', 'farther');
  const evidence = buildFixtureModelEvidence({ fixture, history: [home, away, connected, unrelated, home, direct] });
  assert.equal(evidence.history.length, 5);
  assert.deepEqual(evidence.relationships, { home: ['direct', 'home-common'], away: ['away-common', 'direct'], direct: ['direct'],
    commonOpponents: [{ teamId: 'common', home: ['home-common'], away: ['away-common'] }],
    connected: ['away-common', 'direct', 'graph', 'home-common'] });
  assert.equal(evidence.coverage.verifiedHalfTime, 1);
  const ordered = buildFixtureModelEvidence({ fixture, history: [direct, home, unrelated, connected, away] });
  assert.equal(evidence.hash, ordered.hash, 'duplicate pages and input order cannot alter the evidence');
  assert.equal(Object.isFrozen(evidence.history[0]), true);
});

test('the latest eligible result correction wins, while later and ambiguous observations cannot inform the forecast', () => {
  const old = row('verified', fixture.homeTeamId, 'opponent');
  const corrected = { ...old, availableAt: EVIDENCE_NOW - 10, homeGoals: 2, observationHash: evidenceHash('correction') };
  const late = { ...corrected, availableAt: EVIDENCE_NOW + 1, homeGoals: 9, observationHash: evidenceHash('late-correction') };
  const conflict = row('conflicted', fixture.awayTeamId, 'opponent');
  const moved = row('different-occurrence', 'other', fixture.awayTeamId);
  const rows = [old, conflict, late, corrected, { ...conflict, homeGoals: 0 }, moved, { ...moved, kickoffAt: moved.kickoffAt - 1 },
    row('wrong-league', 'another', fixture.awayTeamId, { competitionId: 'competition-2' }),
    row('bad-half', 'another', fixture.awayTeamId, { halfTime: { home: 2, away: 0 } })];
  const evidence = buildFixtureModelEvidence({ fixture, history: rows });
  assert.deepEqual(evidence.history, [corrected]);
  assert.equal(evidence.coverage.ambiguousOccurrences, 2);
  assert.equal(evidence.coverage.excludedRows, 3);
  assert.equal(evidence.hash, buildFixtureModelEvidence({ fixture, history: [...rows].reverse() }).hash);
  const reconfirmed = buildFixtureModelEvidence({ fixture, history: [{ ...corrected, availableAt: EVIDENCE_NOW,
    observationHash: evidenceHash('reconfirmed'), evidenceRef: 'synthetic-reconfirmation' }] });
  assert.equal(evidence.materialHash, reconfirmed.materialHash);
  assert.notEqual(evidence.hash, reconfirmed.hash);
  assert.notEqual(evidence.materialHash, buildFixtureModelEvidence({ fixture, history: [old] }).materialHash);
});

test('context only uses proof-checked, bounded fields and never includes archive text or later facts', () => {
  const authority = evidenceAuthority();
  const lineup = { kind: 'lineup', subjectTeamId: fixture.homeTeamId, key: 'lineup-42', certainty: 'confirmed',
    asOfAt: EVIDENCE_NOW - 2_000, value: { playerExternalId: 42, role: 'starting', formation: '4-3-3',
      playerName: 'Untrusted archive text' }, summary: 'Untrusted archive text' };
  const injury = { kind: 'injury', subjectTeamId: fixture.awayTeamId, key: 'injury-17', certainty: 'unknown',
    asOfAt: null, value: { playerExternalId: 17, status: 'doubtful', reason: 'Untrusted archive text' }, summary: 'Untrusted archive text' };
  const sources = [evidenceSource(context, { claims: [lineup, injury] }),
    evidenceSource(context, { retrievedAt: EVIDENCE_NOW + 1, claims: [{ ...lineup, key: 'future', value: { ...lineup.value, playerExternalId: 333 } }] })];
  const snapshot = buildEvidenceSnapshot({ context, policy: evidencePolicy(), sources }, authority);
  const input = { fixture, history: [], snapshot: { value: snapshot, authority } };
  const evidence = buildFixtureModelEvidence(input);
  assert.deepEqual(evidence.coverage.contextKinds, ['availability', 'lineup']);
  assert.equal(evidence.context.length, 2);
  assert.deepEqual(evidence.context.find(({ kind }) => kind === 'lineup').value, { playerExternalId: 42, role: 'starting', formation: '4-3-3' });
  assert.ok(evidence.context.every(({ sourceIds, claimIds }) => sourceIds[0] === sources[0].id && claimIds.length === 1));
  assert.equal(JSON.stringify(evidence).includes('Untrusted archive text'), false);
  assert.throws(() => buildFixtureModelEvidence({ ...input, fixture: { ...fixture, forecastAt: EVIDENCE_NOW - 1 } }), /scope mismatch/);
  authority.verifySource = () => false;
  assert.throws(() => buildFixtureModelEvidence(input), /unavailable/);
});

test('sealed archive context uses the exact scope as of the cutoff and drops stale, future, conflicting and tampered pages', async () => {
  const team = context.home.externalId, opposing = context.away.externalId, league = 90, season = 2026;
  const seasonScope = { league: String(league), season: String(season) }, homeScope = { team: String(team) }, pages = [];
  async function archive(endpoint, parameters, observedAt, rows) {
    const page = await encodeFootballSourcePage({ endpoint, parameters, observedAt, contract: API_FOOTBALL_CONTRACT_VERSION,
      rowCount: rows.length, body: Buffer.from(JSON.stringify(rows)) });
    pages.push(page);
    return page;
  }
  const received = EVIDENCE_NOW - 20_000;
  const table = rank => [{ league: { id: league, season, standings: [[{ team: { id: team, name: 'Private ignored text' }, rank,
    points: 18, goalsDiff: 4, all: { played: 8 } }]] } }];
  const genuine = await archive('standings', seasonScope, received, table(3));
  await archive('standings', seasonScope, EVIDENCE_NOW + 1, table(1));
  await archive('teamStatistics', { ...seasonScope, ...homeScope }, received, [{ league: { id: league + 1, season }, team: { id: team },
    fixtures: { played: { total: 8 } }, goals: { for: { total: { total: 15 } }, against: { total: { total: 11 } } } }]);
  await archive('squads', homeScope, received, [{ team: { id: team }, players: [{ id: 7, position: 'Goalkeeper', name: 'Private ignored text' }] }]);
  await archive('squads', { team: String(opposing) }, received, [{ team: { id: opposing }, players: [{ id: 8, position: 'Goalkeeper' }] }]);
  await archive('squads', { team: String(opposing) }, received, [{ team: { id: opposing }, players: [{ id: 9, position: 'Goalkeeper' }] }]);
  await archive('coaches', homeScope, EVIDENCE_NOW - 2 * 86_400_000, [{ id: 3, career: [{ team: { id: team }, start: '2026-01-01', end: null }] }]);
  const transferPage = await archive('transfers', homeScope, received, [{ player: { id: 17 }, transfers: [
    { date: '2026-10-01', teams: { in: { id: team }, out: { id: 88 } } },
    { date: '2026-10-09', teams: { in: { id: team }, out: { id: 99 } } },
    { date: '2026-10-01', teams: { in: { id: 44 }, out: { id: 54 } } },
  ] }]);
  const tampered = await archive('coaches', { team: String(opposing) }, received,
    [{ id: 3, career: [{ team: { id: opposing }, start: '2026-01-01', end: null }] }]);
  tampered.compressedRows[5] ^= 0xff;
  tampered.compressedRows[tampered.compressedRows.length - 6] ^= 0xff;

  let archiveReads = 0;
  const mappings = id => ({ providers: [{ externalId: BigInt(id) }] });
  const db = { query: operation => operation({ footballFixture: { findUnique: () => ({ provider: 'api-football',
    externalId: BigInt(context.externalFixtureId), dataVersion: context.fixtureVersion, homeTeamId: fixture.homeTeamId, awayTeamId: fixture.awayTeamId,
    homeTeam: mappings(team), awayTeam: mappings(opposing), kickoff: new Date(fixture.kickoffAt), retrievedAt: new Date(received), providerUpdatedAt: null,
    season: { competitionId: fixture.competitionId, year: season, competition: mappings(league) } }) },
  footballHistorySourcePage: { findMany({ where, take }) {
    archiveReads++;
    return pages.filter(page => page.endpoint === where.endpoint && page.selectorHash === where.selectorHash && page.contract === where.contract &&
      page.retrievedAt <= where.retrievedAt.lte && page.retrievedAt >= where.retrievedAt.gte)
      .sort((a, b) => b.retrievedAt - a.retrievedAt || a.id.localeCompare(b.id)).slice(0, take);
  } } }) };
  assert.equal(await readArchivedFixtureContext(db, context, () => false), null);
  assert.equal(archiveReads, 0);
  assert.equal(await readArchivedFixtureContext(db, { ...context, home: { ...context.home, externalId: 999 } }, () => true), null);
  assert.equal(archiveReads, 0);
  const archivedContext = await readArchivedFixtureContext(db, context, () => true);
  assert.equal(archiveReads, 9);
  const modelEvidence = buildFixtureModelEvidence({ fixture, history: [], archivedContext });
  assert.deepEqual(modelEvidence.coverage.contextKinds, ['squad', 'standings', 'transfer']);
  assert.equal(modelEvidence.context.find(({ kind }) => kind === 'standings').value.rank, 3);
  assert.equal(modelEvidence.context.find(({ kind }) => kind === 'standings').sourceIds[0], genuine.id);
  assert.equal(modelEvidence.context.find(({ kind }) => kind === 'transfer').sourceIds[0], transferPage.id);
  assert.deepEqual(modelEvidence.context.find(({ kind }) => kind === 'transfer').value,
    { playerExternalId: 17, fromExternalId: 88, toExternalId: team, transferredOn: '2026-10-01' });
  assert.equal(JSON.stringify(modelEvidence).includes('Private ignored text'), false);
  assert.throws(() => buildFixtureModelEvidence({ fixture, history: [], archivedContext: { ...archivedContext } }), /scope mismatch/);
});
