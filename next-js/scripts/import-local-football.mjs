import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { addReportingDays, getReportingDate, parseReportingDate } from "../src/domain/calendar.ts";
import { liveMatchSnapshotSchema } from "../src/domain/live-match.ts";
import { isPlayedFinalStatus } from "../src/domain/market-settlement.ts";
import { parseRuntimePolicy } from "../src/server/config/runtime-policy.ts";
import { createDatabase } from "../src/server/database/client.ts";
import { evidenceFingerprint, evidenceSerialize } from "../src/server/evidence/evidence-input.ts";
import { normalizeEvent, normalizeFixture, normalizeStatistics, parseOffsetInstant } from "../src/server/football/api-football-normalize.ts";
import { catalogScopeKey, normalizeCatalogSearch } from "../src/server/football/catalog-input.ts";
import { Prisma } from "../src/server/generated/prisma/client.ts";
import { projectMatchEvents, projectMatchStatistics } from "../src/server/live-match/live-match-service.ts";

const provider = "api-football";
const timezone = "Africa/Kampala";
const transaction = { timeout: 120_000, maxWait: 10_000 };
const unavailable = (reason) => ({ state: "unavailable", reason, retrievedAt: null, providerUpdatedAt: null, items: [] });

// Stable UUIDs let a stopped import resume without duplicating provider identities.
function localId(kind, ...parts) {
  const bytes = createHash("sha256").update(JSON.stringify(["goal-hint-local-fixture-snapshot-v1", kind, ...parts])).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = bytes.toString("hex");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function orderedDays(start, end, baseline) {
  if (start > baseline || baseline > end || Date.parse(end) - Date.parse(start) > 30 * 86_400_000)
    throw new Error("Use an inclusive window of at most 31 days containing the baseline date.");
  const earliestRecent = [start, addReportingDays(baseline, -7)].sort().at(-1);
  const days = [];
  for (let day = baseline; day >= earliestRecent; day = addReportingDays(day, -1)) days.push(day);
  for (let day = addReportingDays(baseline, 1); day <= end; day = addReportingDays(day, 1)) days.push(day);
  for (let day = addReportingDays(earliestRecent, -1); day >= start; day = addReportingDays(day, -1)) days.push(day);
  return days;
}

function timestamp(value) {
  const time = typeof value === "string" ? parseOffsetInstant(value) : false;
  if (time === false || time > Date.now() + 1_000) throw new Error("Invalid provider retrieval time in the snapshot.");
  return time;
}

function listProvenance(source, day) {
  if (!source || source.listQuery === undefined && source.listRetrievedAt === undefined) return null;
  const query = source.listQuery;
  const scope = query?.date !== undefined ? Object.keys(query).length === 2 && query.date === day
    : query?.from && query.to && Object.keys(query).length === 3 && parseReportingDate(query.from) <= day && day <= parseReportingDate(query.to);
  if (!scope || query.timezone !== timezone) throw new Error(`Fixture-list provenance does not cover ${day}.`);
  return { provider, endpoint: "fixtures", requestParameters: query, retrievedAt: timestamp(source.listRetrievedAt), providerUpdatedAt: null };
}

function detailSection(raw, normalize, project, context, target) {
  if (!Array.isArray(raw)) return unavailable("not-collected");
  const rows = raw.map((value) => normalize(value, context));
  if (rows.some((row) => !row.valid)) return unavailable("invalid-response");
  return project(rows.map((row) => row.data), target, { retrievedAt: context.retrievedAt, providerUpdatedAt: null });
}

function snapshotFixture(entry, seen, days) {
  const raw = entry.fixture;
  const retrievedAt = timestamp(entry.retrievedAt);
  const context = { endpoint: "/fixtures", retrievedAt,
    verifyRegulationScore: (score) => score.sourceField === "score.fulltime" && score.fixtureId === raw.fixture.id,
    verifyHalfTimeScore: (score) => score.sourceField === "score.halftime" && score.fixtureId === raw.fixture.id };
  const normal = normalizeFixture(raw, context);
  if (!normal.valid || normal.data.kickoff === null || normal.data.competition.season === null)
    throw new Error(`Invalid provider fixture ${Number.isSafeInteger(raw?.fixture?.id) ? raw.fixture.id : "without an ID"}.`);
  const value = normal.data;
  const date = getReportingDate(value.kickoff);
  if (!days.has(date) || seen.has(value.id)) throw new Error(`Fixture ${value.id} is duplicated or outside the requested window.`);
  seen.add(value.id);
  const list = listProvenance(entry, date);
  if (list && list.retrievedAt > retrievedAt) throw new Error(`Fixture ${value.id} predates its list observation.`);
  return { raw, value, date, list, context, id: localId("fixture", value.id) };
}

async function loadSnapshot(path, days) {
  const byDay = new Map(days.map((day) => [day, []]));
  const seen = new Set();
  const hash = createHash("sha256");
  let lineNumber = 0;
  const input = createReadStream(path);
  input.on("data", (chunk) => hash.update(chunk));
  const reader = createInterface({ input, crlfDelay: Infinity });
  for await (const line of reader) {
    lineNumber++;
    if (!line.trim()) continue;
    if (Buffer.byteLength(line) > 2_000_000 || seen.size >= 100_000) throw new Error("The staged fixture snapshot exceeds the local import limit.");
    try {
      const fixture = snapshotFixture(JSON.parse(line), seen, byDay);
      byDay.get(fixture.date).push(fixture);
    } catch (error) {
      throw new Error(`Snapshot row ${lineNumber}: ${error instanceof SyntaxError ? "invalid JSON" : error.message}`);
    }
  }
  if (!seen.size) throw new Error("The staged fixture snapshot is empty.");
  return { byDay, fingerprint: hash.digest("hex"), count: seen.size };
}

async function loadCoverage(path, byDay) {
  let coverage;
  try { coverage = JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const result = new Map();
  for (const [day, entries] of byDay) {
    const explicit = coverage?.dates?.[day];
    const manifestList = explicit?.complete === true ? listProvenance(explicit, day) : null;
    const sources = new Map(entries.filter(({ list }) => list !== null).map(({ list }) => [evidenceFingerprint(list), list]));
    const rowList = sources.size === 1 && entries.every(({ list }) => list !== null) ? sources.values().next().value : null;
    if (manifestList && sources.size && (sources.size !== 1 || !sources.has(evidenceFingerprint(manifestList))))
      throw new Error(`The fixture rows and coverage disagree for ${day}.`);
    result.set(day, manifestList ?? rowList);
  }
  return result;
}

const searchable = (value) => value === null ? null : normalizeCatalogSearch(value);
const common = (value, id) => ({ id, name: value.name, nameSearch: searchable(value.name),
  country: value.country, countrySearch: searchable(value.country), retrievedAt: new Date(value.source.retrievedAt) });
const positiveId = (value) => Number.isSafeInteger(value) && value > 0 ? BigInt(value) : null;
const optionalText = (value) => typeof value === "string" ? value.replace(/\p{Cc}/gu, " ").trim().slice(0, 256) || null : null;
const chunks = function* (items, size) { for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size); };

function fixtureRows(entries, reference) {
  const rows = { teams: new Map(), competitions: new Map(), seasons: new Map(), fixtures: [], facts: [], results: [], live: [] };
  for (const item of entries) {
    const { raw, value, id, context, date } = item;
    const at = new Date(context.retrievedAt);
    const sides = [value.homeTeam, value.awayTeam];
    for (const team of sides) rows.teams.set(team.id, { ...common(team, localId("team", team.id)), code: team.code, national: team.national });
    const [homeTeamId, awayTeamId] = sides.map((team) => rows.teams.get(team.id).id);
    const competition = value.competition, competitionId = localId("competition", competition.id);
    rows.competitions.set(competition.id, { ...common(competition, competitionId), type: competition.type });
    const seasonId = localId("season", competition.id, competition.season);
    rows.seasons.set(seasonId, { id: seasonId, competitionId, year: competition.season, retrievedAt: at });
    const score = value.regulationScore?.verified ? value.regulationScore : null;
    const evidenceRef = score ? `${provider}:fixture:${value.id}:${score.providerStatus}:${score.sourceField}` : null;
    const fixture = { id, provider, externalId: BigInt(value.id), homeTeamId, awayTeamId, seasonId, round: competition.round,
      kickoff: new Date(value.kickoff), eatDate: new Date(`${date}T00:00:00Z`), status: value.status, providerStatus: value.providerStatus,
      elapsedMinutes: value.elapsedMinutes, regulationHome: score?.home ?? null, regulationAway: score?.away ?? null,
      regulationEvidenceRef: evidenceRef, regulationVerifiedAt: score ? at : null, retrievedAt: at };
    rows.fixtures.push(fixture);
    const events = Array.isArray(raw.events) ? raw.events : null;
    const statistics = Array.isArray(raw.statistics) ? raw.statistics : null;
    const lineups = Array.isArray(raw.lineups) ? raw.lineups : null;
    const playerStatistics = Array.isArray(raw.players) ? raw.players : null;
    rows.facts.push({ fixtureId: id, providerFixtureId: fixture.externalId, venueExternalId: positiveId(raw.fixture.venue?.id),
      venueName: optionalText(raw.fixture.venue?.name), venueCity: optionalText(raw.fixture.venue?.city), referee: optionalText(raw.fixture.referee),
      infoRetrievedAt: at, ...(events && { events, eventsHash: evidenceFingerprint(events), eventsRetrievedAt: at }),
      ...(statistics && { statistics, statisticsHash: evidenceFingerprint(statistics), statisticsRetrievedAt: at }),
      ...(lineups && { lineups }), ...(playerStatistics && { playerStatistics }),
      detailsRetrievedAt: events || statistics || lineups || playerStatistics ? at : null, updatedAt: at });
    if (value.status === "live" || isPlayedFinalStatus(value.status) || value.status === "abandoned" || value.status === "awarded") {
      const halfTime = value.halfTimeScore?.verified ? value.halfTimeScore : null;
      const body = { status: value.status, providerStatus: value.providerStatus, elapsedMinutes: value.elapsedMinutes,
        ...(value.stoppageMinutes !== undefined ? { stoppageMinutes: value.stoppageMinutes } : {}),
        reportedGoals: value.reportedGoals, extraTimeScore: value.extraTimeScore, penaltyScore: value.penaltyScore,
        regulation: { verified: score !== null, home: score?.home ?? null, away: score?.away ?? null, evidenceRef },
        ...(halfTime && { halfTime: { verified: true, period: halfTime.period, home: halfTime.home, away: halfTime.away,
          evidenceRef: `${provider}:fixture:${value.id}:${halfTime.providerStatus}:${halfTime.sourceField}` } }) };
      const observationId = evidenceFingerprint({ reference, fixtureId: id, retrievedAt: context.retrievedAt });
      const resultId = evidenceFingerprint({ observationId, kind: "fixture-result" });
      const content = evidenceSerialize({ id: resultId, fixtureId: id, fixtureVersion: 1n, previousId: null, observationId,
        observedAt: context.retrievedAt, providerUpdatedAt: null, regulationVerifiedAt: score ? context.retrievedAt : null, ...body });
      rows.results.push({ fixture, resultId, content, contentHash: evidenceFingerprint(body) });
    }
    if (events || statistics) {
      const target = { homeExternalId: value.homeTeam.id, awayExternalId: value.awayTeam.id, previous: null,
        statisticsCoverage: null, eventsCoverage: null };
      const snapshot = liveMatchSnapshotSchema.parse({ version: 1, fixtureId: id, cycleId: null, kickoffAt: value.kickoff,
        status: value.status, collectedAt: context.retrievedAt, staleAfterMs: 86_400_000,
        statistics: detailSection(statistics, normalizeStatistics, projectMatchStatistics, context, target),
        events: detailSection(events, normalizeEvent, projectMatchEvents, context, target) });
      rows.live.push({ fixture, id: evidenceFingerprint({ kind: "local-match-snapshot", id }), content: evidenceSerialize(snapshot) });
    }
  }
  return rows;
}

async function insertResults(tx, results) {
  for (const group of chunks(results, 100)) {
    const values = group.map(({ fixture, resultId, content, contentHash }) => Prisma.sql`(${resultId}, ${fixture.id}, ${1n},
      ${fixture.retrievedAt}, ${fixture.status}, ${fixture.regulationEvidenceRef !== null}, ${fixture.regulationHome}, ${fixture.regulationAway},
      ${contentHash}, SHA2(CAST(JSON_EXTRACT(${content}, '$') AS CHAR), 256), JSON_EXTRACT(${content}, '$'))`);
    await tx.$executeRaw(Prisma.sql`INSERT INTO FixtureResult (id, fixtureId, fixtureVersion, observedAt, status, regulationVerified,
      regulationHome, regulationAway, contentHash, integrity, body) VALUES ${Prisma.join(values)}`);
    await tx.fixtureResultState.createMany({ data: group.map(({ fixture, resultId }) => ({ fixtureId: fixture.id, resultId,
      firstTrackedAt: fixture.retrievedAt, firstFinalAt: isPlayedFinalStatus(fixture.status) ? fixture.retrievedAt : null,
      lastSyncAt: fixture.retrievedAt, lastAttemptAt: fixture.retrievedAt })) });
  }
}

async function insertLive(tx, live) {
  for (const group of chunks(live, 25)) {
    const values = group.map(({ fixture, id, content }) => Prisma.sql`(${id}, ${fixture.id}, ${fixture.kickoff}, ${fixture.homeTeamId},
      ${fixture.awayTeamId}, ${fixture.retrievedAt}, JSON_EXTRACT(${content}, '$'),
      SHA2(CAST(JSON_EXTRACT(${content}, '$') AS CHAR CHARACTER SET utf8mb4), 256), ${fixture.retrievedAt}, ${fixture.retrievedAt})`);
    await tx.$executeRaw(Prisma.sql`INSERT INTO LiveMatchSnapshot (id, fixtureId, kickoffAt, homeTeamId, awayTeamId, receivedAt,
      bodyJson, integrity, attemptedAt, nextPollAt) VALUES ${Prisma.join(values)}`);
  }
}

async function persistDay(tx, date, entries, list, fingerprint) {
  await tx.$executeRaw`INSERT INTO FootballCatalogLock (provider) VALUES (${provider}) ON DUPLICATE KEY UPDATE provider = VALUES(provider)`;
  const importId = localId("import", fingerprint, date);
  const receipt = await tx.footballImport.findUnique({ where: { id: importId }, select: { importedCount: true } });
  if (receipt?.importedCount === entries.length) return false;
  if (receipt) throw new Error(`The existing local receipt disagrees with ${date}.`);
  if (!entries.length && !list) return false;
  const reference = `local-api-football-snapshot:${fingerprint}`;
  const rows = fixtureRows(entries, reference);
  if (entries.length) {
    await tx.footballTeam.createMany({ data: [...rows.teams.values()], skipDuplicates: true });
    await tx.footballTeamProvider.createMany({ data: [...rows.teams].map(([externalId, row]) => ({ provider, externalId: BigInt(externalId),
      teamId: row.id, sourceRef: reference, mappedAt: row.retrievedAt })), skipDuplicates: true });
    await tx.footballCompetition.createMany({ data: [...rows.competitions.values()], skipDuplicates: true });
    await tx.footballCompetitionProvider.createMany({ data: [...rows.competitions].map(([externalId, row]) => ({ provider, externalId: BigInt(externalId),
      competitionId: row.id, sourceRef: reference, mappedAt: row.retrievedAt })), skipDuplicates: true });
    await tx.footballSeason.createMany({ data: [...rows.seasons.values()], skipDuplicates: true });
    await tx.footballFixture.createMany({ data: rows.fixtures });
    for (const group of chunks(rows.facts, 25)) await tx.fixtureFacts.createMany({ data: group });
    await insertResults(tx, rows.results);
    await insertLive(tx, rows.live);
  }
  const selection = { kind: "fixtures", query: { date } };
  const requestFingerprint = evidenceFingerprint({ selection, list });
  const observedAt = list?.retrievedAt ?? Math.max(...rows.fixtures.map((fixture) => fixture.retrievedAt.getTime()));
  const fixtureIds = rows.fixtures.map(({ id }) => id);
  await tx.footballImport.create({ data: { id: importId, fingerprint: evidenceFingerprint({ fingerprint, selection }),
    requestFingerprint, selection, scopeKey: catalogScopeKey(selection), provider, kind: "fixtures", status: list ? "complete" : "partial",
    observedAt: new Date(observedAt), recordedAt: new Date(), receivedCount: entries.length, importedCount: entries.length, rejectedCount: 0,
    requestsDispatched: 0, reasons: list ? [] : ["missing-source-provenance"], missingIds: [], missingCoverage: [], provenance: list ? [list] : [],
    retentionEvidenceRef: reference, fixtureIds, changedFixtureIds: fixtureIds } });
  for (const group of chunks(rows.fixtures, 500)) await tx.footballFixtureAudit.createMany({ data: group.map((fixture) => ({
    id: localId("audit", fingerprint, fixture.id), fixtureId: fixture.id, importId, dataVersion: 1n, observedAt: fixture.retrievedAt,
    changes: { source: reference, kind: "local-fixture-snapshot" } })) });
  return true;
}

async function databaseTarget(start) {
  const schema = `goal_hint_football_${start.slice(0, 7).replace("-", "")}`;
  const value = process.env.GOAL_HINT_LOCAL_FOOTBALL_DATABASE_URL;
  let url;
  try { url = new URL(value); } catch { throw new Error("An explicit local football database target is required."); }
  if (url.protocol !== "mysql:" || url.hostname !== "127.0.0.1" || url.pathname !== `/${schema}` || !url.port || url.search || url.hash)
    throw new Error(`The import requires the isolated ${schema} loopback schema.`);
  const expectedDatadir = process.env.GOAL_HINT_LOCAL_FOOTBALL_DATADIR;
  if (!expectedDatadir) throw new Error("The isolated MySQL data directory must be configured.");
  const database = createDatabase(parseRuntimePolicy({ NODE_ENV: "development", GOAL_HINT_DATABASE_ENABLED: "true", DATABASE_URL: value }));
  try {
    const [target] = await database.query((tx) => tx.$queryRaw`SELECT DATABASE() AS schemaName, @@datadir AS dataDirectory`);
    const [expected, actual] = await Promise.all([realpath(expectedDatadir), realpath(target.dataDirectory)]);
    if (target.schemaName !== schema || (process.platform === "win32" ? expected.toLowerCase() !== actual.toLowerCase() : expected !== actual))
      throw new Error("The connected MySQL server is not the configured local snapshot target.");
    return database;
  } catch (error) {
    await database.disconnect();
    throw error;
  }
}

async function main() {
  const [path, start, end, baseline] = process.argv.slice(2);
  if (process.argv.length !== 6) throw new Error("Usage: import-local-football.mjs SNAPSHOT.ndjson START END BASELINE");
  const days = orderedDays(parseReportingDate(start), parseReportingDate(end), parseReportingDate(baseline));
  const snapshot = await loadSnapshot(path, days);
  const coverage = await loadCoverage(join(dirname(path), "fixture-coverage.json"), snapshot.byDay);
  const fingerprint = evidenceFingerprint({ fixtures: snapshot.fingerprint, coverage: [...coverage] });
  const database = await databaseTarget(start);
  try {
    const owner = `local-api-football-snapshot:${fingerprint}`;
    const existing = await database.query((tx) => tx.footballImport.count({ where: { retentionEvidenceRef: { not: owner } } }));
    if (existing) throw new Error("The staging schema contains a different import. Use a fresh isolated schema for a new snapshot.");
    for (const [date, entries] of snapshot.byDay) {
      const applied = await database.transaction((tx) => persistDay(tx, date, entries, coverage.get(date), fingerprint), transaction)
        .catch((error) => { throw new Error(`MySQL rolled back ${date}: ${error.message}`); });
      if (applied) console.log(`${date}: ${entries.length} fixtures stored`);
    }
    const verified = await database.query(async (tx) => ({
      fixtures: await tx.footballFixture.count({ where: { provider } }),
      facts: await tx.fixtureFacts.count(), predictions: await tx.predictionSet.count(),
      providerStatuses: await tx.footballFixture.count({ where: { provider, providerStatus: { not: null } } }),
      liveSnapshots: await tx.liveMatchSnapshot.count(), results: await tx.fixtureResult.count(),
    }));
    if (verified.fixtures !== snapshot.count || verified.facts !== snapshot.count || verified.predictions !== 0)
      throw new Error("The local MySQL fixture snapshot failed count verification.");
    console.log(JSON.stringify(verified));
  } finally { await database.disconnect(); }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "The local football import failed.");
  process.exitCode = 1;
});
