import "server-only";

import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";
import { z } from "zod";
import { utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { API_FOOTBALL_CONTRACT_VERSION } from "./api-football-contract.ts";
import { archivedPlayerProfileRowId, archivedPlayerStatisticsRowId, playerProfilePageSize, playerStatisticsPageSize, playerStatisticsProviderId,
  validPlayerArchivePageSize } from "./history-player-statistics-input.ts";
import type { FootballHistoryPlayerProfilePage, FootballHistoryPlayerStatisticsPage, FootballHistoryPlayerStatisticsReceipt,
  FootballHistoryPlayerStatisticsTarget } from "./history-player-statistics.ts";

const compress = promisify(gzip);
const decompress = promisify(gunzip);
const maximumBytes = 48 * 1024 * 1024;
export const footballHistorySourceMaxRows = 10_000;
const hash = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
const selectors = {
  fixtures: new Set(["id", "ids", "date", "league", "season", "team", "from", "to", "round", "timezone"]),
  fixtureRounds: new Set(["league", "season", "dates", "timezone"]),
  fixtureHalfStatistics: new Set(["fixture", "half"]),
  countries: new Set<string>(),
  timezones: new Set<string>(),
  leagueSeasons: new Set<string>(),
  competitions: new Set(["id", "season"]),
  teams: new Set(["league", "season"]),
  teamSeasons: new Set(["team"]),
  teamStatistics: new Set(["league", "season", "team"]),
  playerStatistics: new Set(["league", "season"]),
  playerProfiles: new Set<string>(),
  venues: new Set(["id"]),
  standings: new Set(["league", "season"]),
  topScorers: new Set(["league", "season"]),
  topAssists: new Set(["league", "season"]),
  topYellowCards: new Set(["league", "season"]),
  topRedCards: new Set(["league", "season"]),
  injuries: new Set(["league", "season"]),
  transfers: new Set(["team"]),
  coaches: new Set(["team"]),
  squads: new Set(["team"]),
} as const;
type Endpoint = keyof typeof selectors;
type Selection = Readonly<{ endpoint: Endpoint; parameters: unknown }>;
const referencePhases = ["playerStatistics", "playerProfiles", "reference"] as const;
export type FootballHistoryReferencePhase = typeof referencePhases[number];

function archiveSelector({ endpoint, parameters: input }: Selection) {
  if (!Object.hasOwn(selectors, endpoint) || !input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid historical archive selector.");
  const allowedParameters = selectors[endpoint];
  const entries = Object.entries(input).sort(([left], [right]) => left.localeCompare(right));
  if ((!entries.length && allowedParameters.size > 0 && endpoint !== "competitions") ||
    ((endpoint === "teamStatistics" || endpoint === "playerStatistics") && entries.length !== allowedParameters.size) ||
    entries.some(([key, value]) => !allowedParameters.has(key) || typeof value !== "string" || !value || value.length > 512)) {
    throw new Error("Invalid historical archive selector.");
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

async function verifiedBody(page: { compressedRows: Uint8Array; contentHash: string }): Promise<unknown> {
  const body = await decompress(page.compressedRows, { maxOutputLength: maximumBytes });
  if (hash(body) !== page.contentHash) throw new Error("Historical archive page failed verification.");
  return JSON.parse(body.toString("utf8"));
}

async function verifiedRows(page: { compressedRows: Uint8Array; rowCount: number; contentHash: string }) {
  const rows = await verifiedBody(page);
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

function playerIdsForPage(rows: readonly unknown[], rowId: PlayerPageSource["rowId"]) {
  const ids = new Set<number>();
  for (const row of rows) {
    const id = rowId(row);
    if (id === null || ids.has(id)) return null;
    ids.add(id);
  }
  return [...ids];
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
  async function writePage(endpoint: Endpoint, parameters: Record<string, string>, value: unknown, observedAt: number, rowCount: number) {
    const retrievedAt = new Date(observedAt);
    if (!Number.isFinite(retrievedAt.getTime()) || observedAt > Date.now()) throw new Error("Invalid historical archive page.");
    const body = Buffer.from(JSON.stringify(value));
    if (body.length > maximumBytes) throw new Error("Historical archive page exceeds the archive limit.");
    const selectorHash = hash(JSON.stringify(parameters)), contentHash = hash(body);
    const id = hash(JSON.stringify([endpoint, selectorHash, observedAt, contentHash]));
    const compressedRows = new Uint8Array(await compress(body));
    return database.query((client) => client.footballHistorySourcePage.createMany({ skipDuplicates: true, data: {
      id, endpoint, selectorHash, parameters, contract: API_FOOTBALL_CONTRACT_VERSION, retrievedAt, rowCount, contentHash, compressedRows,
    } }));
  }

  async function savePlayerPage(input: FootballHistoryPlayerProfilePage, source: PlayerPageSource) {
    const { page, totalPages, retrievedAt, rows, rowCount } = input;
    if (!Array.isArray(rows) || rowCount !== rows.length || !validPlayerArchivePageSize(page, totalPages, rowCount, source.pageSize) ||
      !playerIdsForPage(rows, source.rowId)) throw new Error("Invalid historical player archive page.");
    const body = { provider: "api-football", contract: API_FOOTBALL_CONTRACT_VERSION, page, totalPages, retrievedAt, rows };
    return writePage(source.endpoint, source.parameters, body, retrievedAt, rowCount);
  }

  async function readPlayerPages({ endpoint, parameters, pageSize, rowId }: PlayerPageSource): Promise<FootballHistoryPlayerStatisticsReceipt[] | null> {
    const selector = JSON.stringify(parameters);
    const pages = await database.query((client) => client.footballHistorySourcePage.findMany({ where: { endpoint, selectorHash: hash(selector) },
      select: { parameters: true, contract: true, retrievedAt: true, rowCount: true, contentHash: true, compressedRows: true },
      orderBy: [{ retrievedAt: "asc" }, { id: "asc" }] }));
    const receipts: FootballHistoryPlayerStatisticsReceipt[] = [];
    try {
      for (const page of pages) {
        if (page.contract !== API_FOOTBALL_CONTRACT_VERSION || JSON.stringify(archiveSelector({ endpoint, parameters: page.parameters })) !== selector) return null;
        const { page: current, totalPages, retrievedAt, rows } = playerPageEnvelope.parse(await verifiedBody(page));
        const playerIds = playerIdsForPage(rows, rowId);
        if (retrievedAt !== page.retrievedAt.getTime() || rows.length !== page.rowCount ||
          !validPlayerArchivePageSize(current, totalPages, page.rowCount, pageSize) || !playerIds) return null;
        receipts.push({ page: current, totalPages, retrievedAt: utcInstantFromEpochMilliseconds(retrievedAt), rowCount: page.rowCount, playerIds });
      }
    } catch { return null; }
    return receipts;
  }

  return {
    async referencePhaseOrder(globalScope: boolean): Promise<FootballHistoryReferencePhase[]> {
      const endpoints = Object.keys(selectors).filter((endpoint) => endpoint !== "fixtures" && endpoint !== "competitions" &&
        (globalScope || endpoint !== "playerProfiles"));
      // The endpoint/selector/time index covers this query without opening any compressed pages.
      const latest = await database.query((client) => client.footballHistorySourcePage.groupBy({ by: ["endpoint"],
        where: { endpoint: { in: endpoints } }, _max: { retrievedAt: true } }));
      const observations = { playerStatistics: 0, playerProfiles: 0, reference: 0 };
      for (const { endpoint, _max } of latest) {
        const phase = endpoint === "playerStatistics" || endpoint === "playerProfiles" ? endpoint : "reference";
        observations[phase] = Math.max(observations[phase], _max.retrievedAt?.getTime() ?? 0);
      }
      return referencePhases.filter((phase) => globalScope || phase !== "playerProfiles").sort((left, right) => observations[left] - observations[right]);
    },
    async hasPage(input: Selection, observedSince?: number) {
      const selectorHash = hash(JSON.stringify(archiveSelector(input)));
      const retrievedAt = observedSince === undefined ? undefined : { gte: new Date(observedSince) };
      return await database.query((client) => client.footballHistorySourcePage.count({ where: { endpoint: input.endpoint, selectorHash,
        ...(retrievedAt && { retrievedAt }) } })) > 0;
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
    async savePage(input: Selection & Readonly<{ rows: readonly unknown[]; retrievedAt: number }>) {
      const { endpoint } = input, parameters = archiveSelector(input);
      if (endpoint === "playerStatistics" || endpoint === "playerProfiles" || !Array.isArray(input.rows) || input.rows.length > footballHistorySourceMaxRows) {
        throw new Error("Invalid historical archive page.");
      }
      return writePage(endpoint, parameters, input.rows, input.retrievedAt, input.rows.length);
    },
    async savePlayerStatisticsPage(input: FootballHistoryPlayerStatisticsPage) {
      return savePlayerPage(input, playerStatisticsPages(input));
    },
    async readPlayerStatisticsPages(target: FootballHistoryPlayerStatisticsTarget) {
      return readPlayerPages(playerStatisticsPages(target));
    },
    async savePlayerProfilePage(input: FootballHistoryPlayerProfilePage) {
      return savePlayerPage(input, profilePages);
    },
    async readPlayerProfilePages() {
      return readPlayerPages(profilePages);
    },
    async latestPage(input: Selection) {
      const selectorHash = hash(JSON.stringify(archiveSelector(input)));
      const page = await database.query((client) => client.footballHistorySourcePage.findFirst({ where: { endpoint: input.endpoint, selectorHash },
        orderBy: [{ retrievedAt: "desc" }, { id: "desc" }] }));
      if (!page) return null;
      return { rows: await verifiedRows(page), retrievedAt: page.retrievedAt, parameters: page.parameters, contract: page.contract };
    },
  };
}
