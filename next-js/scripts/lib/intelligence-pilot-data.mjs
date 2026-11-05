import { createHash } from 'node:crypto';
import { evidenceFingerprint, freezeEvidence } from '../../src/server/evidence/evidence-input.ts';
import { localGoalDefaults, localGoalModelVersion } from '../../src/server/intelligence/local-goals-model.ts';

// This adapter is deliberately restricted to one immutable public vintage.
// Repository metadata and file bytes must additionally be pinned by the caller's
// acquisition manifest. A local hash is integrity evidence, not a trusted clock.
const RECORD = 7831873, DOI = '10.5281/zenodo.7831873';
const CSV_MD5 = 'a5a318463beeea776c2e99be4924113c';
const CREATED = '2023-04-15T17:27:06.400823+00:00';
const UPDATED = '2023-04-16T02:26:44.681565+00:00';
const DAY = 86_400_000, COMPETITION = 'zenodo:7831873:laliga-men';
const HEADER = ['Temporada', 'Jornada', 'Fecha', 'Hora', 'Equipo Local', 'Equipo Visitante', 'Resultado', 'Arbitro'];
const archives = new WeakSet(), datasets = new WeakSet();
const bytes = (value) => {
  if (!Buffer.isBuffer(value) && typeof value !== 'string') throw new Error('raw-source-bytes-required');
  return Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
};
const digest = (value, algorithm = 'sha256') => createHash(algorithm).update(bytes(value)).digest('hex');
const instant = (value) => Number.isSafeInteger(value) && value > 0 && value <= Date.now();
const same = (left, right) => evidenceFingerprint(left) === evidenceFingerprint(right);
const slug = (name) => name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');
const teamId = (name) => `zenodo:7831873:team:${slug(name)}`;

// Explicit source-name to ESPN identity mapping; never fuzzy matched. The IDs
// and names were checked against ESPN's public team metadata, without results.
export const pilotTeamMapping = freezeEvidence({
  'Athletic Club': { id: '93', names: ['Athletic Club'] },
  'Atlético de Madrid': { id: '1068', names: ['Atlético Madrid', 'Atletico Madrid'] },
  'FC Barcelona': { id: '83', names: ['Barcelona'] },
  'RC Celta': { id: '85', names: ['Celta Vigo'] },
  'Cádiz CF': { id: '3842', names: ['Cádiz', 'Cadiz'] },
  'Elche CF': { id: '3751', names: ['Elche'] },
  'RCD Espanyol de Barcelona': { id: '88', names: ['Espanyol'] },
  'Getafe CF': { id: '2922', names: ['Getafe'] },
  'Girona FC': { id: '9812', names: ['Girona'] },
  'RCD Mallorca': { id: '84', names: ['Mallorca'] },
  'CA Osasuna': { id: '97', names: ['Osasuna'] },
  'Rayo Vallecano': { id: '101', names: ['Rayo Vallecano'] },
  'Real Betis': { id: '244', names: ['Real Betis'] },
  'Real Madrid': { id: '86', names: ['Real Madrid'] },
  'Real Sociedad': { id: '89', names: ['Real Sociedad'] },
  'Real Valladolid CF': { id: '95', names: ['Real Valladolid'] },
  'Sevilla FC': { id: '243', names: ['Sevilla'] },
  'UD Almería': { id: '6832', names: ['Almería', 'Almeria'] },
  'Valencia CF': { id: '94', names: ['Valencia'] },
  'Villarreal CF': { id: '102', names: ['Villarreal'] },
});

/** Bounded RFC 4180 reader. Row numbers refer to CSV records, including header. */
export function parsePilotCsv(input) {
  const raw = bytes(input);
  if (!raw.length || raw.length > 2_000_000) throw new Error('invalid-csv-size');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(raw).replace(/^\uFEFF/u, '');
  const records = []; let fields = [], field = '', quoted = false, closed = false;
  const pushField = () => { fields.push(field); field = ''; closed = false; };
  const pushRecord = () => {
    pushField();
    if (fields.some((value) => value !== '')) records.push(fields);
    fields = [];
    if (records.length > 10_001) throw new Error('too-many-csv-records');
  };
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { field += '"'; index++; }
      else if (character === '"') { quoted = false; closed = true; }
      else field += character;
    } else if (character === ',') pushField();
    else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index++;
      pushRecord();
    } else if (character === '"' && !field && !closed) quoted = true;
    else if (closed || character === '"') throw new Error('invalid-csv-quoting');
    else field += character;
    if (field.length > 4096 || fields.length > 8) throw new Error('invalid-csv-field');
  }
  if (quoted) throw new Error('unterminated-csv-field');
  if (field || fields.length || closed) pushRecord();
  if (!records.length || !same(records[0], HEADER)) throw new Error('invalid-csv-header');
  return records.slice(1).map((record, index) => {
    if (record.length !== HEADER.length) throw new Error('invalid-csv-column-count');
    return { ...Object.fromEntries(HEADER.map((key, column) => [key, record[column]])), sourceRow: index + 2 };
  });
}

const madrid = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit',
  day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** The archive's zone is inferred, then independently corroborated for targets.
 * DST gaps/ambiguous wall times are rejected rather than silently shifted. */
export function madridKickoffAt(date, time) {
  const match = /^(LUN|MAR|MIE|JUE|VIE|SAB|DOM) (\d{2})\.(\d{2})\.(\d{4})$/u.exec(date);
  if (!match || !/^([01]\d|2[0-3]):[0-5]\d$/u.test(time)) throw new Error('invalid-source-kickoff');
  const [, weekday, d, m, y] = match, [h, minute] = time.split(':');
  const nominal = Date.UTC(Number(y), Number(m) - 1, Number(d), Number(h), Number(minute));
  const check = new Date(nominal);
  if (Number(y) < 2000 || Number(y) > 2100 || check.getUTCFullYear() !== Number(y) ||
    check.getUTCMonth() + 1 !== Number(m) || check.getUTCDate() !== Number(d) ||
    ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'][check.getUTCDay()] !== weekday) throw new Error('invalid-source-date');
  const candidates = [60, 120].map((offset) => nominal - offset * 60_000).filter((candidate) => {
    const parts = Object.fromEntries(madrid.formatToParts(candidate).map(({ type, value }) => [type, value]));
    return parts.year === y && parts.month === m && parts.day === d && parts.hour === h && parts.minute === minute;
  });
  if (candidates.length !== 1) throw new Error('ambiguous-source-kickoff');
  return candidates[0];
}

export function preparePilotArchive({ metadata, csv }) {
  const raw = bytes(csv), file = metadata?.files?.find((entry) => entry.key === 'partidos_LaLiga.csv');
  if (metadata?.id !== RECORD || metadata.metadata?.doi !== DOI || metadata.metadata?.version !== '1' ||
    metadata.metadata?.publication_date !== '2023-04-15' || metadata.metadata?.access_right !== 'open' ||
    metadata.metadata?.license?.id !== 'cc-by-sa-4.0' || Date.parse(metadata.created) !== Date.parse(CREATED) ||
    Date.parse(metadata.updated) !== Date.parse(UPDATED) || metadata.files.length !== 1 ||
    file?.size !== 326064 || file?.checksum !== `md5:${CSV_MD5}` || raw.length !== 326064 || digest(raw, 'md5') !== CSV_MD5)
    throw new Error('unverified-pilot-source');
  // JavaScript truncates microseconds; rounding up one millisecond is conservative.
  const availableAt = Date.parse(metadata.updated) + 1;
  const source = { recordId: RECORD, doi: DOI, version: '1', availableAt, csvMd5: CSV_MD5,
    csvSha256: digest(raw), metadataSha256: evidenceFingerprint(metadata), timezone: 'Europe/Madrid',
    timezoneBasis: 'inferred-source-wall-time-with-independent-target-utc-corroboration' };
  const history = [], targets = [], historyUnavailable = [], ids = new Set(), names = new Map();
  const rows = parsePilotCsv(raw);
  if (rows.length !== 3800) throw new Error('unexpected-pilot-row-count');
  for (const row of rows) {
    const season = row.Temporada, homeName = row['Equipo Local'], awayName = row['Equipo Visitante'];
    if (!/^20(1[3-9]|2[0-2])-\d{2}$/u.test(season) || Number(season.slice(5)) !== (Number(season.slice(0, 4)) + 1) % 100 ||
      !/^(?:[1-9]|[12]\d|3[0-8])$/u.test(row.Jornada) || !homeName || !awayName || homeName === awayName ||
      !slug(homeName) || !slug(awayName) || homeName.length > 100 || awayName.length > 100) throw new Error('invalid-archive-row');
    for (const name of [homeName, awayName]) {
      if (names.has(teamId(name)) && names.get(teamId(name)) !== name) throw new Error('ambiguous-archive-team');
      names.set(teamId(name), name);
    }
    const fixtureId = `zenodo:7831873:match:${season}:${slug(homeName)}:${slug(awayName)}`;
    if (ids.has(fixtureId)) throw new Error('duplicate-archive-fixture');
    ids.add(fixtureId);
    const result = /^(\d{1,2})-(\d{1,2})$/u.exec(row.Resultado);
    if (!result && row.Resultado !== '-') throw new Error('unknown-archive-result');
    if (row.Hora === '-- : --') {
      if (result) historyUnavailable.push({ sourceRow: row.sourceRow, reason: 'unknown-original-kickoff' });
      continue;
    }
    const kickoffAt = madridKickoffAt(row.Fecha, row.Hora);
    const fixture = { fixtureId, competitionId: COMPETITION, homeTeamId: teamId(homeName), awayTeamId: teamId(awayName),
      kickoffAt, forecastAt: kickoffAt - DAY, cohort: 'men' };
    if (result) {
      if (kickoffAt >= availableAt) throw new Error('future-archive-result');
      const value = { fixtureId, cycleId: `zenodo:7831873:row:${row.sourceRow}`, competitionId: COMPETITION,
        homeTeamId: fixture.homeTeamId, awayTeamId: fixture.awayTeamId, kickoffAt, availableAt,
        homeGoals: Number(result[1]), awayGoals: Number(result[2]), period: 'regulation-including-stoppage-time',
        evidenceRef: `https://zenodo.org/records/7831873#partidos_LaLiga.csv-row-${row.sourceRow}` };
      history.push({ ...value, observationHash: evidenceFingerprint({ sourceHash: source.csvSha256, row, result: value }) });
    } else if (season === '2022-23' && fixture.forecastAt > availableAt) {
      if (!pilotTeamMapping[homeName] || !pilotTeamMapping[awayName]) throw new Error('unmapped-pilot-team');
      targets.push({ fixture, targetDate: new Date(kickoffAt).toISOString().slice(0, 10).replaceAll('-', ''),
        sourceRow: row.sourceRow, homeName, awayName });
    }
  }
  targets.sort((a, b) => a.fixture.kickoffAt - b.fixture.kickoffAt || a.fixture.fixtureId.localeCompare(b.fixture.fixtureId));
  if (targets.length !== 41) throw new Error('unexpected-pilot-target-membership');
  const archive = freezeEvidence({ source, history, targets, historyUnavailable,
    targetHash: evidenceFingerprint(targets), requiredScoreboardDates: [...new Set(targets.map((target) => target.targetDate))].sort() });
  archives.add(archive);
  return archive;
}

export function preparePilotProtocol({ archive, frozenAt }) {
  if (!archives.has(archive) || !instant(frozenAt) || frozenAt <= archive.targets.at(-1).fixture.kickoffAt)
    throw new Error('invalid-pilot-protocol');
  return freezeEvidence({ version: 'laliga-2023-vintage-pilot-v1', frozenAt, archiveSha256: archive.source.csvSha256,
    metadataSha256: archive.source.metadataSha256, targetHash: archive.targetHash,
    fixtureIds: archive.targets.map(({ fixture }) => fixture.fixtureId), forecastHorizonMs: DAY,
    configuration: 'unchanged-defaults', modelConfiguration: { ...localGoalDefaults }, modelVersion: localGoalModelVersion(),
    teamMappingHash: evidenceFingerprint(pilotTeamMapping),
    resultPolicy: 'captured-after-protocol-labels-only', publicationAuthorized: false });
}

function parseScoreboard(receipt) {
  if (!receipt || !/^\d{8}$/u.test(receipt.date) || !instant(receipt.capturedAt) ||
    !/^[a-f0-9]{64}$/u.test(receipt.sha256) || bytes(receipt.body).length > 8_000_000 || digest(receipt.body) !== receipt.sha256)
    throw new Error('unverified-scoreboard-receipt');
  let body;
  try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes(receipt.body))); }
  catch { throw new Error('invalid-scoreboard-json'); }
  if (!body || !Array.isArray(body.leagues) || !body.leagues.some((league) => league?.slug === 'esp.1') ||
    !Array.isArray(body.events) || body.events.length > 1000) throw new Error('invalid-scoreboard-scope');
  return body;
}
const isFinal = (status) => status?.type?.name === 'STATUS_FULL_TIME' && status.type.completed === true &&
  status.type.state === 'post' && status.period === 2;
const exactTeam = (competitor, mapping) => competitor?.id === mapping.id && competitor.team?.id === mapping.id &&
  mapping.names.includes(competitor.team.displayName);
const goals = (value) => typeof value === 'string' && /^(?:0|[1-9]\d?)$/u.test(value) ? Number(value) : null;
const explicitInstant = (value) => typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) ? Date.parse(value) : NaN;

/** Pure matching helper, also exercised with explicitly synthetic test receipts.
 * This helper alone does not issue an authenticated dataset or publication proof. */
export function resolvePilotTarget(target, receipt) {
  const absent = (reason) => ({ status: 'unavailable', result: null, reason });
  if (!receipt) return absent('missing-scoreboard');
  const body = parseScoreboard(receipt);
  if (receipt.date !== target.targetDate || receipt.capturedAt <= target.fixture.kickoffAt) return absent('invalid-label-clock');
  const homeMap = pilotTeamMapping[target.homeName], awayMap = pilotTeamMapping[target.awayName];
  if (!homeMap || !awayMap) return absent('unknown-team-mapping');
  const matches = body.events.flatMap((event) => (Array.isArray(event?.competitions) ? event.competitions : []).map((competition) => {
    const competitors = competition?.competitors;
    if (!Array.isArray(competitors) || competitors.length !== 2) return null;
    const home = competitors.find((team) => team.homeAway === 'home'), away = competitors.find((team) => team.homeAway === 'away');
    return home?.team?.id === homeMap.id && away?.team?.id === awayMap.id ? { event, competition, home, away } : null;
  }).filter(Boolean));
  if (matches.length !== 1) return absent(matches.length ? 'ambiguous-scoreboard-match' : 'unmatched-fixture');
  const { event, competition, home, away } = matches[0];
  if (!exactTeam(home, homeMap) || !exactTeam(away, awayMap) || typeof event.id !== 'string' || !/^\d+$/u.test(event.id) ||
    competition.id !== event.id) return absent('inconsistent-source-identity');
  if (explicitInstant(event.date) !== target.fixture.kickoffAt || explicitInstant(competition.date) !== target.fixture.kickoffAt)
    return absent('rescheduled-or-timezone-mismatch');
  if (!isFinal(event.status) || !isFinal(competition.status)) return absent('unverified-regulation-final');
  const homeGoals = goals(home.score), awayGoals = goals(away.score);
  if (homeGoals === null || awayGoals === null) return absent('invalid-regulation-score');
  const fixture = target.fixture;
  const value = { fixtureId: fixture.fixtureId, cycleId: `espn:label:${event.id}`, competitionId: fixture.competitionId,
    homeTeamId: fixture.homeTeamId, awayTeamId: fixture.awayTeamId, kickoffAt: fixture.kickoffAt,
    availableAt: receipt.capturedAt, homeGoals, awayGoals, period: 'regulation-including-stoppage-time',
    evidenceRef: `https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard?dates=${receipt.date}#event-${event.id}` };
  return { status: 'settled', reason: null, result: { ...value,
    observationHash: evidenceFingerprint({ receiptHash: receipt.sha256, eventId: event.id, result: value }) } };
}

export function buildPilotDataset({ archive, scoreboards, protocol }) {
  if (!archives.has(archive) || !Array.isArray(scoreboards) || scoreboards.length > archive.requiredScoreboardDates.length ||
    !same(protocol, preparePilotProtocol({ archive, frozenAt: protocol?.frozenAt }))) throw new Error('unverified-pilot-protocol');
  const receipts = new Map();
  for (const receipt of scoreboards) {
    if (!archive.requiredScoreboardDates.includes(receipt.date) || receipts.has(receipt.date) || receipt.capturedAt <= protocol.frozenAt)
      throw new Error('unfrozen-or-duplicate-scoreboard');
    parseScoreboard(receipt);
    receipts.set(receipt.date, receipt);
  }
  const decisions = archive.targets.map((target) => ({ target, ...resolvePilotTarget(target, receipts.get(target.targetDate)) }));
  const dataset = freezeEvidence({ mode: 'historical', history: archive.history, fixtures: decisions.map(({ target, status, result }) =>
    ({ fixture: target.fixture, status, result })) });
  datasets.add(dataset);
  return freezeEvidence({ dataset, audit: { version: protocol.version, source: archive.source,
    protocolHash: evidenceFingerprint(protocol), targetHash: archive.targetHash, selected: archive.targets.length,
    history: archive.history.length, historyUnavailable: archive.historyUnavailable,
    settled: decisions.filter((entry) => entry.status === 'settled').length,
    unavailable: decisions.filter((entry) => entry.status !== 'settled').map(({ target, reason }) => ({ fixtureId: target.fixture.fixtureId, reason })),
    providerRequests: 0, aiRequests: 0, publicationAuthorized: false,
    limitations: ['Retrospective fixed-vintage pilot; no prospective prediction receipts.',
      'Archive timezone is inferred and each accepted target must match independently captured UTC kickoff.',
      'Historical score and kickoff quality relies on the frozen contributed archive; its upstream source is undocumented.',
      'Newly captured results are labels only and unavailable at all historical forecast cutoffs.',
      'No provider, contextual model, odds, slips, calibration qualification or production claim is evaluated.'] } });
}

/** Reconstruct with pinned source files before invoking this factory. Only this
 * module's source-checked builder can issue datasets; exact membership is pinned
 * in the returned authority, including all later result rows and absence fields. */
export function createPilotAuthority({ dataset }) {
  if (!datasets.has(dataset)) throw new Error('source-checked-dataset-required');
  const expected = evidenceFingerprint(dataset);
  const results = new Set([...dataset.history, ...dataset.fixtures.flatMap((entry) => entry.result ? [entry.result] : [])].map(evidenceFingerprint));
  return Object.freeze({
    authorizeDataset(candidate) {
      if (!candidate || evidenceFingerprint(candidate) !== expected) throw new Error('pilot-dataset-mismatch');
    },
    verifyHistory(row) { try { return results.has(evidenceFingerprint(row)); } catch { return false; } },
    verifyProvider() { return false; }, verifyContext() { return false; },
  });
}
