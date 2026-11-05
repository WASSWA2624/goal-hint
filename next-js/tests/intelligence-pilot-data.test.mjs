import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { buildPilotDataset, createPilotAuthority, madridKickoffAt, parsePilotCsv, pilotTeamMapping,
  preparePilotArchive, preparePilotProtocol, resolvePilotTarget } from '../scripts/lib/intelligence-pilot-data.mjs';

// All scores/receipts below are invented functional fixtures, never accuracy data.
const header = 'Temporada,Jornada,Fecha,Hora,Equipo Local,Equipo Visitante,Resultado,Arbitro';
const target = () => ({ sourceRow: 999, targetDate: '20230417', homeName: 'RC Celta', awayName: 'RCD Mallorca',
  fixture: { fixtureId: 'synthetic-only-target', competitionId: 'synthetic-league', homeTeamId: 'synthetic-home',
    awayTeamId: 'synthetic-away', kickoffAt: Date.parse('2023-04-17T19:00:00Z'), forecastAt: Date.parse('2023-04-16T19:00:00Z'), cohort: 'men' } });
const status = () => ({ period: 2, type: { name: 'STATUS_FULL_TIME', state: 'post', completed: true } });
function body() {
  const competitors = [
    { id: '85', homeAway: 'home', team: { id: '85', displayName: 'Celta Vigo' }, score: '4' },
    { id: '84', homeAway: 'away', team: { id: '84', displayName: 'Mallorca' }, score: '3' },
  ];
  return { leagues: [{ slug: 'esp.1' }], events: [{ id: '999999999', date: '2023-04-17T19:00Z', status: status(),
    competitions: [{ id: '999999999', date: '2023-04-17T19:00Z', status: status(), competitors }] }] };
}
function receipt(value = body(), changes = {}) {
  const raw = JSON.stringify(value);
  return { date: '20230417', capturedAt: Date.parse('2026-01-01T00:00:00Z'), body: raw,
    sha256: createHash('sha256').update(raw).digest('hex'), ...changes };
}

test('synthetic CSV reader preserves quoted commas, escaped quotes and UTF-8 names', () => {
  const rows = parsePilotCsv(`${header}\r\n2022-23,29,LUN 17.04.2023,21:00,"Synthetic, Home",Synthetic Away,4-3,"Referee ""A"""\r\n`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]['Equipo Local'], 'Synthetic, Home');
  assert.equal(rows[0].Arbitro, 'Referee "A"');
  assert.equal(rows[0].sourceRow, 2);
  assert.equal(parsePilotCsv(`${header}\n2022-23,29,LUN 17.04.2023,21:00,Cádiz CF,UD Almería,4-3,-\n`)[0]['Equipo Local'], 'Cádiz CF');
});

test('synthetic CSV reader handles BOM, embedded newlines, CRLF and empty trailing lines', () => {
  const rows = parsePilotCsv(`\uFEFF${header}\r\n2022-23,29,LUN 17.04.2023,21:00,Synthetic Home,Synthetic Away,4-3,"line1\nline2"\r\r\n\r\n`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].Arbitro, 'line1\nline2');
});

test('synthetic CSV reader rejects ambiguous quoting, columns, headers, encoding and oversized data', () => {
  for (const row of ['a,b', '2022-23,29,LUN 17.04.2023,21:00,"unterminated',
    '2022-23,29,LUN 17.04.2023,21:00,"Home"suffix,Away,0-0,-',
    '2022-23,29,LUN 17.04.2023,21:00,Ho"me,Away,0-0,-']) assert.throws(() => parsePilotCsv(`${header}\n${row}`));
  assert.throws(() => parsePilotCsv('wrong,header\na,b'));
  assert.throws(() => parsePilotCsv(Buffer.from([0xff, 0xfe])));
  assert.throws(() => parsePilotCsv('x'.repeat(2_000_001)));
  assert.throws(() => parsePilotCsv(`${header}\n${'x'.repeat(4097)}`));
});

test('Madrid conversion applies historical summer and winter offsets without host-timezone dependence', () => {
  assert.equal(madridKickoffAt('LUN 17.04.2023', '21:00'), Date.parse('2023-04-17T19:00:00Z'));
  assert.equal(madridKickoffAt('VIE 13.01.2023', '21:00'), Date.parse('2023-01-13T20:00:00Z'));
  assert.equal(madridKickoffAt('DOM 26.03.2023', '03:00'), Date.parse('2023-03-26T01:00:00Z'));
});

test('Madrid conversion rejects invalid dates, weekdays, missing times and DST ambiguities', () => {
  for (const [date, time] of [['LUN 31.02.2023', '21:00'], ['DOM 17.04.2023', '21:00'],
    ['LUN 17.04.2023', '-- : --'], ['LUN 17.04.2023', '24:00'], ['DOM 26.03.2023', '02:30'], ['DOM 29.10.2023', '02:30']])
    assert.throws(() => madridKickoffAt(date, time));
});

test('real archive authority cannot be established by synthetic CSV or self-declared metadata', () => {
  const csv = `${header}\n2022-23,29,LUN 17.04.2023,21:00,RC Celta,RCD Mallorca,-,-`;
  assert.throws(() => preparePilotArchive({ metadata: { id: 7831873 }, csv }), /unverified-pilot-source/u);
  assert.throws(() => preparePilotProtocol({ archive: { targets: [target()] }, frozenAt: Date.now() }), /invalid-pilot-protocol/u);
  assert.throws(() => buildPilotDataset({ archive: { targets: [target()], requiredScoreboardDates: ['20230417'] }, scoreboards: [], protocol: {} }),
    /unverified-pilot-protocol/u);
  assert.throws(() => createPilotAuthority({ dataset: { mode: 'historical', history: [], fixtures: [] } }), /source-checked-dataset-required/u);
});

test('synthetic exact regulation match uses capture time, source hash and original fixture identity', () => {
  const capture = receipt(), selected = target(), actual = resolvePilotTarget(selected, capture);
  assert.equal(actual.status, 'settled');
  assert.equal(actual.result.homeGoals, 4);
  assert.equal(actual.result.awayGoals, 3);
  assert.equal(actual.result.availableAt, capture.capturedAt);
  assert.equal(actual.result.kickoffAt, selected.fixture.kickoffAt);
  assert.equal(actual.result.fixtureId, selected.fixture.fixtureId);
  assert.match(actual.result.observationHash, /^[a-f0-9]{64}$/u);
  assert.equal(actual.result.period, 'regulation-including-stoppage-time');
  const later = resolvePilotTarget(selected, { ...capture, capturedAt: capture.capturedAt + 1 });
  assert.notEqual(later.result.observationHash, actual.result.observationHash);
});

test('synthetic source byte mutations and invalid league scope fail closed', () => {
  const capture = receipt();
  assert.throws(() => resolvePilotTarget(target(), { ...capture, body: capture.body + ' ' }), /unverified-scoreboard-receipt/u);
  assert.throws(() => resolvePilotTarget(target(), { ...capture, body: body() }), /raw-source-bytes-required/u);
  assert.throws(() => resolvePilotTarget(target(), { ...capture, capturedAt: Date.now() + 60_000 }), /unverified-scoreboard-receipt/u);
  const wrongLeague = body(); wrongLeague.leagues = [{ slug: 'eng.1' }];
  assert.throws(() => resolvePilotTarget(target(), receipt(wrongLeague)), /invalid-scoreboard-scope/u);
});

test('synthetic missing, duplicate and reversed fixtures remain explicitly unavailable', () => {
  assert.equal(resolvePilotTarget(target(), null).reason, 'missing-scoreboard');
  const empty = body(); empty.events = [];
  assert.equal(resolvePilotTarget(target(), receipt(empty)).reason, 'unmatched-fixture');
  const duplicate = body(); duplicate.events.push(structuredClone(duplicate.events[0]));
  assert.equal(resolvePilotTarget(target(), receipt(duplicate)).reason, 'ambiguous-scoreboard-match');
  const reversed = body(); reversed.events[0].competitions[0].competitors.forEach((team) => { team.homeAway = team.homeAway === 'home' ? 'away' : 'home'; });
  assert.equal(resolvePilotTarget(target(), receipt(reversed)).reason, 'unmatched-fixture');
});

test('synthetic aliases must agree with exact provider IDs; similar or changed names are not guessed', () => {
  const changed = body(); changed.events[0].competitions[0].competitors[0].team.displayName = 'Celta Vigo B';
  assert.equal(resolvePilotTarget(target(), receipt(changed)).reason, 'inconsistent-source-identity');
  const wrongId = body(); wrongId.events[0].competitions[0].competitors[0].id = '999';
  assert.equal(resolvePilotTarget(target(), receipt(wrongId)).reason, 'inconsistent-source-identity');
  const wrongEvent = body(); wrongEvent.events[0].competitions[0].id = '12345';
  assert.equal(resolvePilotTarget(target(), receipt(wrongEvent)).reason, 'inconsistent-source-identity');
  assert.equal(resolvePilotTarget({ ...target(), homeName: 'Unknown Club' }, receipt()).reason, 'unknown-team-mapping');
  assert.equal(Object.keys(pilotTeamMapping).length, 20);
  assert.throws(() => { pilotTeamMapping['RC Celta'].id = '999'; }, TypeError);
});

test('synthetic rescheduled kickoffs or contradictory competition dates are never substituted', () => {
  const rescheduled = body(); rescheduled.events[0].date = '2023-04-17T20:00Z';
  assert.equal(resolvePilotTarget(target(), receipt(rescheduled)).reason, 'rescheduled-or-timezone-mismatch');
  const conflicting = body(); conflicting.events[0].competitions[0].date = '2023-04-17T19:01Z';
  assert.equal(resolvePilotTarget(target(), receipt(conflicting)).reason, 'rescheduled-or-timezone-mismatch');
  assert.equal(resolvePilotTarget(target(), receipt(body(), { date: '20230418' })).reason, 'invalid-label-clock');
  assert.equal(resolvePilotTarget(target(), receipt(body(), { capturedAt: target().fixture.kickoffAt })).reason, 'invalid-label-clock');
});

test('synthetic source timestamps require an explicit zone even when host-local parsing would match', () => {
  const local = new Date(target().fixture.kickoffAt);
  const pad = (value) => String(value).padStart(2, '0');
  const hostLocal = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}:00`;
  assert.equal(Date.parse(hostLocal), target().fixture.kickoffAt);
  for (const field of ['event', 'competition']) {
    const value = body();
    if (field === 'event') value.events[0].date = hostLocal;
    else value.events[0].competitions[0].date = hostLocal;
    assert.equal(resolvePilotTarget(target(), receipt(value)).reason, 'rescheduled-or-timezone-mismatch');
  }
  const offset = body(); offset.events[0].date = '2023-04-17T21:00:00+02:00';
  assert.equal(resolvePilotTarget(target(), receipt(offset)).status, 'settled');
});

test('synthetic extra time, penalties, non-final and inconsistent statuses remain unavailable', () => {
  for (const mutate of [
    (value) => { value.events[0].status.period = 4; },
    (value) => { value.events[0].status.type.name = 'STATUS_FINAL_AET'; },
    (value) => { value.events[0].status.type.name = 'STATUS_FINAL_PEN'; },
    (value) => { value.events[0].status.type.completed = false; },
    (value) => { value.events[0].status.type.state = 'in'; },
    (value) => { value.events[0].competitions[0].status.period = 3; },
    (value) => { delete value.events[0].competitions[0].status; },
  ]) {
    const value = body(); mutate(value);
    assert.equal(resolvePilotTarget(target(), receipt(value)).reason, 'unverified-regulation-final');
  }
});

test('synthetic unsupported scores cannot be coerced into regulation results', () => {
  for (const invalid of ['', '-1', '1.5', '1e1', '01', '100', 2, null]) {
    const value = body(); value.events[0].competitions[0].competitors[0].score = invalid;
    assert.equal(resolvePilotTarget(target(), receipt(value)).reason, 'invalid-regulation-score');
  }
});
