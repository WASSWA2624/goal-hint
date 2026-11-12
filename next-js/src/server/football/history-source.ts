import "server-only";

import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";
import { z } from "zod";
import { utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { API_FOOTBALL_CONTRACT_VERSION } from "./api-football-contract.ts";
import { archivedFixtureCoachIds } from "./history-lineup-coaches.ts";
import { parseFootballHistoryOddsMappingPage, type FootballHistoryOddsMappingPage } from "./history-odds-mapping.ts";
import { footballHistoryPersonOmissionEndpoint, isFootballHistoryPersonRecord, isFootballHistoryPersonRecordEndpoint,
  readFootballHistoryPersonGroup, readFootballHistoryPersonSelector, type FootballHistoryPersonRecordEndpoint } from "./history-person-records.ts";
import { archivedCoachRowId, archivedPlayerProfileRowId, archivedPlayerStatisticsRowId, playerProfilePageSize, playerStatisticsPageSize, playerStatisticsProviderId,
  validPlayerArchivePageSize } from "./history-player-statistics-input.ts";
import type { FootballHistoryPlayerPaginationConflict, FootballHistoryPlayerProfilePage, FootballHistoryPlayerStatisticsPage, FootballHistoryPlayerStatisticsReceipt,
  FootballHistoryPlayerStatisticsTarget } from "./history-player-statistics.ts";
import { footballHistoryPlayerSubjectDatasets, indexHistorySubjects, type FootballHistorySubjectPage } from "./history-subjects.ts";

const compress = promisify(gzip);
const decompress = promisify(gunzip);
const maximumBytes = 48 * 1024 * 1024;
export const footballHistorySourceMaxRows = 10_000;
const hash = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
const selectors = {
  fixtures: new Set(["id", "ids", "date", "league", "season", "team", "from", "to", "round", "timezone"]),
  fixtureRounds: new Set(["league", "season", "dates", "timezone"]),
  fixtureHalfStatistics: new Set(["fixture", "half"]),
  oddsMapping: new Set(["archiveDay"]),
  countries: new Set<string>(),
  timezones: new Set<string>(),
  leagueSeasons: new Set<string>(),
  teamCountries: new Set<string>(),
  playerSeasons: new Set<string>(),
  competitions: new Set(["id", "season"]),
  teams: new Set(["league", "season"]),
  teamsByCountry: new Set(["country"]),
  teamSeasons: new Set(["team"]),
  teamStatistics: new Set(["league", "season", "team"]),
  playerStatistics: new Set(["league", "season", "generation"]),
  playerProfiles: new Set(["generation"]),
  playerArchiveGeneration: new Set(["dataset", "league", "season"]),
  playerArchiveConflict: new Set(["dataset", "league", "season", "generation", "page", "reason"]),
  playerTeams: new Set(["player"]),
  playerSeasonHistory: new Set(["player"]),
  playerTransfers: new Set(["player"]),
  venues: new Set(["id"]),
  venuesByCountry: new Set(["country"]),
  standings: new Set(["league", "season"]),
  topScorers: new Set(["league", "season"]),
  topAssists: new Set(["league", "season"]),
  topYellowCards: new Set(["league", "season"]),
  topRedCards: new Set(["league", "season"]),
  injuries: new Set(["league", "season"]),
  transfers: new Set(["team"]),
  trophies: new Set(["player", "players", "coach", "coachs"]),
  sidelined: new Set(["player", "players", "coach", "coachs"]),
  trophiesOmitted: new Set(["player", "coach"]),
  sidelinedOmitted: new Set(["player", "coach"]),
  coaches: new Set(["team"]),
  coachProfiles: new Set(["id"]),
  squads: new Set(["team"]),
} as const;
type Endpoint = keyof typeof selectors;
type Selection = Readonly<{ endpoint: Endpoint; parameters: unknown }>;
type PlayerArchiveMarker = "playerArchiveGeneration" | "playerArchiveConflict";
const isPlayerArchiveMarker = (endpoint: string): endpoint is PlayerArchiveMarker =>
  endpoint === "playerArchiveGeneration" || endpoint === "playerArchiveConflict";
export const footballHistoryReferencePhases = ["playerStatistics", "playerProfiles", ...footballHistoryPlayerSubjectDatasets,
  "oddsMapping", "reference"] as const;
export type FootballHistoryReferencePhase = typeof footballHistoryReferencePhases[number];
const globalReferenceSources = new Set(["playerProfiles", ...footballHistoryPlayerSubjectDatasets, "trophies", "sidelined",
  "trophiesOmitted", "sidelinedOmitted", "coachProfiles", "teamsByCountry", "venuesByCountry", "oddsMapping"]);

function archiveSelector({ endpoint, parameters: input }: Selection) {
  if (!Object.hasOwn(selectors, endpoint) || !input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid historical archive selector.");
  const allowedParameters = selectors[endpoint];
  const entries = Object.entries(input).sort(([left], [right]) => left.localeCompare(right));
  if ((!entries.length && allowedParameters.size > 0 && endpoint !== "competitions" && endpoint !== "playerProfiles") ||
    (endpoint === "teamStatistics" && entries.length !== allowedParameters.size) ||
    (endpoint === "playerStatistics" && entries.filter(([key]) => key !== "generation").length !== 2) ||
    entries.some(([key, value]) => !allowedParameters.has(key) || typeof value !== "string" || !value || value.length > 512)) {
    throw new Error("Invalid historical archive selector.");
  }
  const parameters = Object.fromEntries(entries) as Record<string, string>;
  if (parameters.generation !== undefined && !/^[a-f0-9]{64}$/u.test(parameters.generation)) {
    throw new Error("Invalid historical player archive generation.");
  }
  if ((endpoint === "playerSeasonHistory" || endpoint === "playerTransfers") &&
    (!playerStatisticsProviderId(Number(parameters.player)) || String(Number(parameters.player)) !== parameters.player)) {
    throw new Error("Invalid historical player selector.");
  }
  if (isFootballHistoryPersonRecordEndpoint(endpoint) && !readFootballHistoryPersonSelector(parameters)) {
    throw new Error("Invalid historical person-record selector.");
  }
  return parameters;
}

async function verifiedBody(page: { compressedRows: Uint8Array; contentHash: string }): Promise<unknown> {
  const body = await decompress(page.compressedRows, { maxOutputLength: maximumBytes });
  if (hash(body) !== page.contentHash) throw new Error("Historical archive page failed verification.");
  return JSON.parse(body.toString("utf8"));
}

const personProjection = z.strictObject({ batchPageId: z.string().regex(/^[a-f0-9]{64}$/u),
  batchParameters: z.record(z.string(), z.string()), rows: z.array(z.unknown()).max(footballHistorySourceMaxRows) });

async function verifiedRows(page: { compressedRows: Uint8Array; rowCount: number; contentHash: string }, fromPersonBatch = false) {
  const body = await verifiedBody(page);
  const rows = fromPersonBatch && !Array.isArray(body) ? personProjection.parse(body).rows : body;
  if (!Array.isArray(rows) || rows.length !== page.rowCount) throw new Error("Historical archive page failed verification.");
  return rows as readonly unknown[];
}

const playerPageEnvelope = z.strictObject({ provider: z.literal("api-football"), contract: z.literal(API_FOOTBALL_CONTRACT_VERSION),
  page: z.number().int().positive(), totalPages: z.number().int().positive(), retrievedAt: z.number().int().nonnegative(),
  rows: z.array(z.unknown()).max(playerProfilePageSize) });
type PlayerPageSource = Readonly<{ endpoint: "playerStatistics" | "playerProfiles"; parameters: Record<string, string>;
  pageSize: number; rowId(row: unknown): number | null }>;
const profilePages = { endpoint: "playerProfiles", parameters: {}, pageSize: playerProfilePageSize, rowId: archivedPlayerProfileRowId } satisfies PlayerPageSource;

function playerStatisticsParameters({ competitionId, season }: FootballHistoryPlayerStatisticsTarget) {
  if (!playerStatisticsProviderId(competitionId) || !Number.isInteger(season) || season < 1000 || season > 9999) {
    throw new RangeError("Invalid historical player-statistics selector.");
  }
  return { league: String(competitionId), season: String(season) };
}

function playerStatisticsPages(target: FootballHistoryPlayerStatisticsTarget): PlayerPageSource {
  return { endpoint: "playerStatistics", parameters: playerStatisticsParameters(target), pageSize: playerStatisticsPageSize,
    rowId: (row) => archivedPlayerStatisticsRowId(row, target) };
}

function playerPageGeneration(source: PlayerPageSource, generation?: string): PlayerPageSource {
  if (!generation) return source;
  return { ...source, parameters: archiveSelector({ endpoint: source.endpoint, parameters: { ...source.parameters, generation } }) };
}

function playerIdsForPage(rows: readonly unknown[], rowId: PlayerPageSource["rowId"]) {
  const ids = new Set<number>();
  for (const row of rows) {
    const id = rowId(row);
    if (id === null || ids.has(id)) return null;
    ids.add(id);
  }
  return [...ids];
}

type StoredPage = Pick<FootballHistorySubjectPage, "parameters" | "contract" | "retrievedAt" | "contentHash" | "compressedRows"> &
  Readonly<{ rowCount: number }>;

async function verifiedPlayerPage(page: StoredPage, source: PlayerPageSource): Promise<FootballHistoryPlayerStatisticsReceipt | null> {
  const parameters = archiveSelector({ endpoint: source.endpoint, parameters: page.parameters });
  if (page.contract !== API_FOOTBALL_CONTRACT_VERSION || JSON.stringify(parameters) !== JSON.stringify(source.parameters)) return null;
  const { page: current, totalPages, retrievedAt, rows } = playerPageEnvelope.parse(await verifiedBody(page));
  const playerIds = playerIdsForPage(rows, source.rowId);
  if (retrievedAt !== page.retrievedAt.getTime() || rows.length !== page.rowCount ||
    !validPlayerArchivePageSize(current, totalPages, page.rowCount, source.pageSize) || !playerIds) return null;
  return { page: current, totalPages, retrievedAt: utcInstantFromEpochMilliseconds(retrievedAt), rowCount: page.rowCount, playerIds };
}

function archivedSubjectId(value: unknown) {
  return value && typeof value === "object" && "id" in value && playerStatisticsProviderId(value.id) ? value.id : null;
}

async function archivedSubjectIds(page: FootballHistorySubjectPage): Promise<readonly number[] | null> {
  // Prisma's MySQL raw path can return an unsigned INT as bigint, unlike model reads.
  if (typeof page.rowCount !== "number" && typeof page.rowCount !== "bigint" ||
    !(page.retrievedAt instanceof Date) || !Number.isFinite(page.retrievedAt.getTime()) || !(page.compressedRows instanceof Uint8Array)) {
    throw new Error("The historical subject source has an unsupported database shape.");
  }
  const rowCount = Number(page.rowCount);
  if (!Number.isSafeInteger(rowCount) || rowCount < 0 || rowCount > footballHistorySourceMaxRows) return null;
  try {
    const { endpoint } = page;
    const parameters = archiveSelector({ endpoint, parameters: typeof page.parameters === "string" ? JSON.parse(page.parameters) : page.parameters });
    if (page.contract !== API_FOOTBALL_CONTRACT_VERSION || hash(JSON.stringify(parameters)) !== page.selectorHash) return null;
    if (endpoint === "playerProfiles" || endpoint === "playerStatistics") {
      const source = endpoint === "playerProfiles" ? profilePages : playerStatisticsPages({
        competitionId: Number(parameters.league), season: Number(parameters.season),
      });
      return (await verifiedPlayerPage({ ...page, parameters, rowCount }, playerPageGeneration(source, parameters.generation)))?.playerIds ?? null;
    }
    const rows = await verifiedRows({ ...page, rowCount });
    if (endpoint === "coaches") return playerIdsForPage(rows, (row) => archivedCoachRowId(row, Number(parameters.team)));
    if (endpoint === "coachProfiles") return playerIdsForPage(rows, (row) => {
      const id = archivedCoachRowId(row);
      return id === Number(parameters.id) ? id : null;
    });
    if (endpoint === "fixtures") return archivedFixtureCoachIds(rows, parameters);
    if (endpoint === "teamsByCountry") return playerIdsForPage(rows, (row) =>
      row && typeof row === "object" && "team" in row && row.team && typeof row.team === "object" &&
      "country" in row.team && row.team.country === parameters.country ? archivedSubjectId(row.team) : null);
    if (!rows.length) return [];
    const [squad] = rows;
    if (rows.length !== 1 || !squad || typeof squad !== "object" || !("team" in squad) ||
      archivedSubjectId(squad.team) !== Number(parameters.team) || !("players" in squad) || !Array.isArray(squad.players)) return null;
    return playerIdsForPage(squad.players, archivedSubjectId);
  } catch { return null; }
}

function sameFixtureScope(rows: readonly unknown[], parameters: Readonly<Record<string, string>>): boolean {
  const fixtures = new Set<number>();
  for (const value of rows) {
    if (!value || typeof value !== "object" || !("fixture" in value) || !("league" in value)) return false;
    const { fixture, league } = value;
    if (!fixture || typeof fixture !== "object" || !("id" in fixture) || typeof fixture.id !== "number" ||
        !Number.isSafeInteger(fixture.id) || fixture.id < 1 || fixtures.has(fixture.id) ||
        !league || typeof league !== "object" || !("id" in league) || league.id !== Number(parameters.league) ||
        !("season" in league) || league.season !== Number(parameters.season) ||
        (parameters.round !== undefined && (!("round" in league) || league.round !== parameters.round))) return false;
    fixtures.add(fixture.id);
  }
  return fixtures.size > 0;
}

/** Private replay storage. Only validated response rows and their request identity are retained. */
export function createFootballHistorySource(database: DatabaseRuntime) {
  async function preparePage(endpoint: Endpoint, parameters: Record<string, string>, value: unknown, observedAt: number, rowCount: number) {
    const retrievedAt = new Date(observedAt);
    if (!Number.isFinite(retrievedAt.getTime()) || observedAt > Date.now()) throw new Error("Invalid historical archive page.");
    const body = Buffer.from(JSON.stringify(value));
    if (body.length > maximumBytes) throw new Error("Historical archive page exceeds the archive limit.");
    const selectorHash = hash(JSON.stringify(parameters)), contentHash = hash(body);
    const id = hash(JSON.stringify([endpoint, selectorHash, observedAt, contentHash]));
    const compressedRows = new Uint8Array(await compress(body));
    return { id, endpoint, selectorHash, parameters, contract: API_FOOTBALL_CONTRACT_VERSION, retrievedAt, rowCount, contentHash, compressedRows };
  }

  async function writePage(endpoint: Endpoint, parameters: Record<string, string>, value: unknown, observedAt: number, rowCount: number) {
    const data = await preparePage(endpoint, parameters, value, observedAt, rowCount);
    return database.query((client) => client.footballHistorySourcePage.createMany({ skipDuplicates: true, data }));
  }

  async function savePersonRecordPage(endpoint: FootballHistoryPersonRecordEndpoint, parameters: Record<string, string>,
    rows: readonly unknown[], retrievedAt: number) {
    const selector = readFootballHistoryPersonSelector(parameters);
    if (!selector) throw new Error("Invalid historical person-record selector.");
    const { kind, subjectIds } = selector;
    if (subjectIds.length === 1) {
      if (!rows.every((row) => isFootballHistoryPersonRecord(endpoint, row))) throw new Error("Invalid historical person records.");
      return writePage(endpoint, parameters, rows, retrievedAt, rows.length);
    }

    const groups = new Map<number, readonly unknown[]>();
    for (const row of rows) {
      const group = readFootballHistoryPersonGroup(endpoint, row, subjectIds);
      if (!group || group.rows.length > footballHistorySourceMaxRows || groups.has(group.subjectId)) {
        throw new Error("Invalid historical person-record batch.");
      }
      groups.set(group.subjectId, group.rows);
    }
    const batch = await preparePage(endpoint, parameters, rows, retrievedAt, rows.length);
    const subjects = await Promise.all(subjectIds.map((id) => {
      const records = groups.get(id);
      const subjectEndpoint = records ? endpoint : footballHistoryPersonOmissionEndpoint(endpoint);
      return preparePage(subjectEndpoint, { [kind]: String(id) },
        { batchPageId: batch.id, batchParameters: parameters, rows: records ?? [] }, retrievedAt, records?.length ?? 0);
    }));
    // Store the original response and its subject receipts in the same insert.
    return database.query((client) => client.footballHistorySourcePage.createMany({ skipDuplicates: true, data: [batch, ...subjects] }));
  }

  async function savePlayerPage(input: FootballHistoryPlayerProfilePage, source: PlayerPageSource) {
    const { page, totalPages, retrievedAt, rows, rowCount } = input;
    if (!Array.isArray(rows) || rowCount !== rows.length || !validPlayerArchivePageSize(page, totalPages, rowCount, source.pageSize) ||
      !playerIdsForPage(rows, source.rowId)) throw new Error("Invalid historical player archive page.");
    const body = { provider: "api-football", contract: API_FOOTBALL_CONTRACT_VERSION, page, totalPages, retrievedAt, rows };
    return writePage(source.endpoint, playerPageGeneration(source, input.generation).parameters, body, retrievedAt, rowCount);
  }

  async function readPlayerMarker(endpoint: PlayerArchiveMarker, input: Record<string, string>) {
    const selector = JSON.stringify(archiveSelector({ endpoint, parameters: input })), selectorHash = hash(selector);
    const page = await database.query((client) => client.footballHistorySourcePage.findFirst({ where: { endpoint, selectorHash },
      orderBy: [{ retrievedAt: "desc" }, { id: "desc" }] }));
    if (!page) return undefined;
    try {
      const retrievedAt = page.retrievedAt.getTime();
      if (!Number.isSafeInteger(retrievedAt) || retrievedAt < 0 || retrievedAt > Date.now() ||
        page.contract !== API_FOOTBALL_CONTRACT_VERSION || page.rowCount !== 0 ||
        JSON.stringify(archiveSelector({ endpoint, parameters: page.parameters })) !== selector ||
        page.id !== hash(JSON.stringify([endpoint, selectorHash, retrievedAt, page.contentHash])) ||
        (await verifiedRows(page)).length !== 0) return null;
      return { id: page.id, retrievedAt };
    } catch { return null; }
  }

  async function recordPlayerConflict(source: PlayerPageSource, generation: string | null, conflict: FootballHistoryPlayerPaginationConflict) {
    const scope = { dataset: source.endpoint, ...source.parameters };
    const { page, retrievedAt, reason } = conflict;
    const active = await readPlayerMarker("playerArchiveGeneration", scope);
    if (active === null || (active?.id ?? null) !== generation || (active && active.retrievedAt >= retrievedAt)) return;
    const evidence = { ...scope, ...(generation ? { generation } : {}), page: String(page), reason };
    const earlier = await readPlayerMarker("playerArchiveConflict", evidence);
    if (earlier === null || earlier && earlier.retrievedAt >= retrievedAt) return;
    // An independent confirmation can restart the scan. The previous pages remain under their own selector.
    const endpoint = earlier ? "playerArchiveGeneration" : "playerArchiveConflict";
    const parameters = archiveSelector({ endpoint, parameters: earlier ? scope : evidence });
    await writePage(endpoint, parameters, [], retrievedAt, 0);
  }

  async function readPlayerPages(base: PlayerPageSource) {
    const active = await readPlayerMarker("playerArchiveGeneration", { dataset: base.endpoint, ...base.parameters });
    if (active === null) return null;
    const { endpoint, parameters, pageSize, rowId } = playerPageGeneration(base, active?.id);
    const selector = JSON.stringify(parameters);
    const pages = await database.query((client) => client.footballHistorySourcePage.findMany({ where: { endpoint, selectorHash: hash(selector) },
      select: { parameters: true, contract: true, retrievedAt: true, rowCount: true, contentHash: true, compressedRows: true },
      orderBy: [{ retrievedAt: "asc" }, { id: "asc" }] }));
    const receipts: FootballHistoryPlayerStatisticsReceipt[] = [];
    try {
      for (const page of pages) {
        const receipt = await verifiedPlayerPage(page, { endpoint, parameters, pageSize, rowId });
        if (!receipt) return null;
        receipts.push(receipt);
      }
    } catch { return null; }
    return { generation: active?.id ?? null, receipts };
  }

  return {
    indexSubjects: () => indexHistorySubjects(database, archivedSubjectIds),
    async referencePhaseOrder(globalScope: boolean): Promise<FootballHistoryReferencePhase[]> {
      const inScope = (endpoint: string) => globalScope || !globalReferenceSources.has(endpoint);
      const endpoints = Object.keys(selectors).filter((endpoint) => endpoint !== "fixtures" && endpoint !== "competitions" &&
        !isPlayerArchiveMarker(endpoint) && inScope(endpoint));
      // The endpoint/selector/time index covers this query without opening any compressed pages.
      const latest = await database.query((client) => client.footballHistorySourcePage.groupBy({ by: ["endpoint"],
        where: { endpoint: { in: endpoints } }, _max: { retrievedAt: true } }));
      const observations = { playerStatistics: 0, playerProfiles: 0, playerTeams: 0, playerSeasonHistory: 0, playerTransfers: 0,
        oddsMapping: 0, reference: 0 };
      for (const { endpoint, _max } of latest) {
        const phase = Object.hasOwn(observations, endpoint) ? endpoint as FootballHistoryReferencePhase : "reference";
        observations[phase] = Math.max(observations[phase], _max.retrievedAt?.getTime() ?? 0);
      }
      return footballHistoryReferencePhases.filter(inScope).sort((left, right) => observations[left] - observations[right]);
    },
    async hasPage(input: Selection, observedSince?: number) {
      const parameters = archiveSelector(input);
      const retrievedAt = observedSince === undefined ? undefined : { gte: new Date(observedSince) };
      const scope = { endpoint: input.endpoint, contract: API_FOOTBALL_CONTRACT_VERSION, ...(retrievedAt && { retrievedAt }) };
      const subjects = isFootballHistoryPersonRecordEndpoint(input.endpoint) ? readFootballHistoryPersonSelector(parameters) : null;
      if (subjects && subjects.subjectIds.length > 1) {
        // The raw batch can be valid while the provider omits individual subjects.
        const selectors = subjects.subjectIds.map((id) => hash(JSON.stringify({ [subjects.kind]: String(id) })));
        const receipts = await database.query((client) => client.footballHistorySourcePage.findMany({
          where: { ...scope, selectorHash: { in: selectors } }, distinct: ["selectorHash"], select: { selectorHash: true },
        }));
        return receipts.length === selectors.length;
      }
      const selectorHash = hash(JSON.stringify(parameters));
      return await database.query((client) => client.footballHistorySourcePage.count({ where: { ...scope, selectorHash } })) > 0;
    },
    async hasExactPage(input: Selection, observed: Readonly<{ retrievedAt: number; rowCount: number }>) {
      const selectorHash = hash(JSON.stringify(archiveSelector(input)));
      return await database.query((client) => client.footballHistorySourcePage.count({ where: { endpoint: input.endpoint, selectorHash,
        retrievedAt: new Date(observed.retrievedAt), rowCount: observed.rowCount, contract: API_FOOTBALL_CONTRACT_VERSION } })) > 0;
    },
    async hasExactFixtureScope(parameters: unknown, observed: Readonly<{ retrievedAt: number; rowCount: number }>) {
      const selector = archiveSelector({ endpoint: "fixtures", parameters });
      const selectorHash = hash(JSON.stringify(selector));
      const page = await database.query((client) => client.footballHistorySourcePage.findFirst({ where: { endpoint: "fixtures", selectorHash,
        retrievedAt: new Date(observed.retrievedAt), rowCount: observed.rowCount, contract: API_FOOTBALL_CONTRACT_VERSION },
        orderBy: { id: "desc" } }));
      return page !== null && sameFixtureScope(await verifiedRows(page), selector);
    },
    async readExactFixtureScope(parameters: unknown, observed: Readonly<{ retrievedAt: number; rowCount: number }>) {
      const endpoint = "fixtures";
      const selector = archiveSelector({ endpoint, parameters });
      const serialized = JSON.stringify(selector), selectorHash = hash(serialized);
      const pages = await database.query((client) => client.footballHistorySourcePage.findMany({ where: { endpoint, selectorHash,
        retrievedAt: new Date(observed.retrievedAt), rowCount: observed.rowCount, contract: API_FOOTBALL_CONTRACT_VERSION },
        take: 2 }));
      const [page] = pages;
      try {
        if (pages.length !== 1 || !page || JSON.stringify(archiveSelector({ endpoint, parameters: page.parameters })) !== serialized ||
          page.id !== hash(JSON.stringify([endpoint, selectorHash, observed.retrievedAt, page.contentHash]))) return null;
        const rows = await verifiedRows(page);
        return rows.length === 0 || sameFixtureScope(rows, selector) ? { id: page.id, rows } : null;
      } catch { return null; }
    },
    async savePage(input: Selection & Readonly<{ rows: readonly unknown[]; retrievedAt: number }>) {
      const { endpoint } = input, parameters = archiveSelector(input);
      if (endpoint === "playerStatistics" || endpoint === "playerProfiles" || endpoint === "oddsMapping" || isPlayerArchiveMarker(endpoint) ||
          endpoint === "trophiesOmitted" || endpoint === "sidelinedOmitted" ||
          !Array.isArray(input.rows) || input.rows.length > footballHistorySourceMaxRows) {
        throw new Error("Invalid historical archive page.");
      }
      if (isFootballHistoryPersonRecordEndpoint(endpoint)) return savePersonRecordPage(endpoint, parameters, input.rows, input.retrievedAt);
      return writePage(endpoint, parameters, input.rows, input.retrievedAt, input.rows.length);
    },
    async savePlayerStatisticsPage(input: FootballHistoryPlayerStatisticsPage) {
      return savePlayerPage(input, playerStatisticsPages(input));
    },
    async readPlayerStatisticsPages(target: FootballHistoryPlayerStatisticsTarget) {
      return readPlayerPages(playerStatisticsPages(target));
    },
    async recordPlayerStatisticsConflict(target: FootballHistoryPlayerStatisticsTarget, generation: string | null, conflict: FootballHistoryPlayerPaginationConflict) {
      await recordPlayerConflict(playerStatisticsPages(target), generation, conflict);
    },
    async savePlayerProfilePage(input: FootballHistoryPlayerProfilePage) {
      return savePlayerPage(input, profilePages);
    },
    async readPlayerProfilePages() {
      return readPlayerPages(profilePages);
    },
    async recordPlayerProfileConflict(_target: Readonly<Record<never, never>>, generation: string | null, conflict: FootballHistoryPlayerPaginationConflict) {
      await recordPlayerConflict(profilePages, generation, conflict);
    },
    async saveOddsMappingPage(day: string, input: FootballHistoryOddsMappingPage) {
      const page = parseFootballHistoryOddsMappingPage(input, day);
      if (!page) throw new Error("Invalid historical odds mapping page.");
      return writePage("oddsMapping", { archiveDay: day }, page, page.retrievedAt, page.rows.length);
    },
    async readOddsMappingPages(day: string) {
      const parameters = { archiveDay: day }, selector = JSON.stringify(parameters);
      const pages = await database.query((client) => client.footballHistorySourcePage.findMany({
        where: { endpoint: "oddsMapping", selectorHash: hash(selector) },
        select: { parameters: true, contract: true, retrievedAt: true, rowCount: true, contentHash: true, compressedRows: true },
        orderBy: [{ retrievedAt: "asc" }, { id: "asc" }],
      }));
      const verified: FootballHistoryOddsMappingPage[] = [];
      try {
        for (const stored of pages) {
          const page = parseFootballHistoryOddsMappingPage(await verifiedBody(stored), day);
          if (stored.contract !== API_FOOTBALL_CONTRACT_VERSION || JSON.stringify(archiveSelector({ endpoint: "oddsMapping", parameters: stored.parameters })) !== selector ||
            !page || stored.retrievedAt.getTime() !== page.retrievedAt || stored.rowCount !== page.rows.length) return null;
          verified.push(page);
        }
      } catch { return null; }
      return verified;
    },
    async verifySavedPages(at: number) {
      const scope = { contract: API_FOOTBALL_CONTRACT_VERSION, retrievedAt: { lte: new Date(at) } };
      let checked = 0, invalid = 0, after: string | undefined;
      for (;;) {
        const pages = await database.query((client) => client.footballHistorySourcePage.findMany({
          where: { ...scope, ...(after !== undefined ? { id: { gt: after } } : {}) },
          orderBy: { id: "asc" }, take: 8,
        }));
        if (!pages.length) break;
        for (const page of pages) {
          checked++;
          try {
            const endpoint = page.endpoint as Endpoint;
            const selector = archiveSelector({ endpoint, parameters: page.parameters });
            const selectorHash = hash(JSON.stringify(selector));
            const id = hash(JSON.stringify([endpoint, selectorHash, page.retrievedAt.getTime(), page.contentHash]));
            const body = await verifiedBody(page);
            const rows = body !== null && typeof body === "object" && "rows" in body ? body.rows : body;
            if (page.selectorHash !== selectorHash || page.id !== id || !Array.isArray(rows) || rows.length !== page.rowCount) invalid++;
          } catch { invalid++; }
        }
        after = pages.at(-1)!.id;
      }
      const current = await database.query((client) => client.footballHistorySourcePage.count({ where: scope }));
      return { checked, invalid, stable: current === checked };
    },
    async latestPage(input: Selection) {
      const selectorHash = hash(JSON.stringify(archiveSelector(input)));
      const page = await database.query((client) => client.footballHistorySourcePage.findFirst({ where: { endpoint: input.endpoint, selectorHash },
        orderBy: [{ retrievedAt: "desc" }, { id: "desc" }] }));
      if (!page) return null;
      return { rows: await verifiedRows(page, isFootballHistoryPersonRecordEndpoint(input.endpoint)),
        retrievedAt: page.retrievedAt, parameters: page.parameters, contract: page.contract };
    },
  };
}
