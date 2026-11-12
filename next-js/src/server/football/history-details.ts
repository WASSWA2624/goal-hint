import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { utcInstantFromEpochMilliseconds, type UtcInstant } from "../../domain/calendar.ts";
import { isPlayedFinalStatus } from "../../domain/market-settlement.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { historyJson } from "../predictions/history-read.ts";
import type { createApiFootballAdapter } from "./api-football-adapter.ts";
import { API_FOOTBALL_CONTRACT_VERSION, type ApiFootballResult } from "./api-football-contract.ts";
import { FIXTURE_FACTS_MAX_BYTES, saveFixtureFacts } from "./fixture-facts-store.ts";
import type { FixtureDetailFacts, NormalizedFixtureMatchDetails } from "./fixture-match-details.ts";

const MINUTE = 60_000, DAY = 24 * 60 * MINUTE;
const stopReasons = new Set(["quota-denied", "rate-limited", "operation-not-authorized", "authentication-error",
  "invalid-credential", "subscription-expired", "shared-work-pending"]);
const sectionNames = ["info", "events", "statistics", "lineups", "players"] as const;
const sectionState = z.enum(["available", "known-empty", "unsupported", "partial", "missing"]);
type Section = typeof sectionNames[number];
type SectionState = z.infer<typeof sectionState>;
const stateSchema = z.strictObject({ version: z.literal(1), attempts: z.number().int().nonnegative(),
  observations: z.number().int().nonnegative(), reservation: z.uuid().nullable(),
  sections: z.record(z.enum(sectionNames), sectionState) });
type DetailState = z.infer<typeof stateSchema>;
type StoredFlags = Readonly<{ hasInfo: number; hasEvents: number; hasStatistics: number; hasLineups: number; hasPlayers: number }>;
type Target = Readonly<{ fixtureId: string; externalId: number; competitionId: number; season: number; kickoffAt: Date;
  homeExternalId: number; awayExternalId: number; homeGoals: number; awayGoals: number; coverage: unknown;
  archiveState: unknown; nextCheckAt: Date | null }> & StoredFlags;
type ClaimedTarget = Readonly<{ target: Target; previous: DetailState; reservation: string }>;
type BatchReport = Readonly<{ requested: number; received: number; written: number; completed: number; deferred: number; requests: number }>;

const eligibleFixture = Prisma.sql`f.provider='api-football' AND f.kickoff<=UTC_TIMESTAMP(3)
  AND f.status IN ('finished-regulation','finished-extra-time','finished-penalties')
  AND f.regulationVerifiedAt IS NOT NULL AND f.regulationVerifiedAt<=UTC_TIMESTAMP(3)
  AND f.regulationEvidenceRef IS NOT NULL AND f.regulationHome IS NOT NULL AND f.regulationAway IS NOT NULL`;

const storedFacts = {
  info: Prisma.sql`(facts.venueExternalId IS NOT NULL OR facts.venueName IS NOT NULL OR facts.venueCity IS NOT NULL OR facts.referee IS NOT NULL)`,
  events: Prisma.sql`COALESCE(JSON_TYPE(facts.events)='ARRAY' AND JSON_LENGTH(facts.events)>0, FALSE)`,
  statistics: Prisma.sql`COALESCE(JSON_LENGTH(facts.statistics,'$[0].statistics')>0 AND JSON_LENGTH(facts.statistics,'$[1].statistics')>0, FALSE)`,
  lineups: Prisma.sql`COALESCE(JSON_LENGTH(facts.lineups,'$[0].startXI')>0 AND JSON_LENGTH(facts.lineups,'$[1].startXI')>0, FALSE)`,
  players: Prisma.sql`COALESCE(JSON_LENGTH(facts.playerStatistics,'$[0].players')>0 AND JSON_LENGTH(facts.playerStatistics,'$[1].players')>0, FALSE)`,
};
const factFlags = Prisma.sql`${storedFacts.info} AS hasInfo, ${storedFacts.events} AS hasEvents, ${storedFacts.statistics} AS hasStatistics,
  ${storedFacts.lineups} AS hasLineups, ${storedFacts.players} AS hasPlayers`;
const candidateQuery = Prisma.sql`SELECT f.id AS fixtureId, f.externalId, cp.externalId AS competitionId, s.year AS season,
  f.kickoff AS kickoffAt, h.externalId AS homeExternalId, a.externalId AS awayExternalId,
  f.regulationHome AS homeGoals, f.regulationAway AS awayGoals, s.coverage, ${factFlags},
  detail.state AS archiveState, detail.nextCheckAt
  FROM FootballFixture f JOIN FootballSeason s ON s.id=f.seasonId
  JOIN FootballCompetitionProvider cp ON cp.competitionId=s.competitionId AND cp.provider='api-football'
  JOIN FootballTeamProvider h ON h.teamId=f.homeTeamId AND h.provider='api-football'
  JOIN FootballTeamProvider a ON a.teamId=f.awayTeamId AND a.provider='api-football'
  LEFT JOIN FixtureFacts facts ON facts.fixtureId=f.id
  LEFT JOIN FootballHistoryDetailState detail ON detail.fixtureId=f.id`;

const unambiguous = Prisma.sql`NOT EXISTS (SELECT 1 FROM FootballTeamProvider m WHERE m.teamId=f.homeTeamId
  AND m.provider='api-football' AND m.externalId<>h.externalId)
  AND NOT EXISTS (SELECT 1 FROM FootballTeamProvider m WHERE m.teamId=f.awayTeamId
  AND m.provider='api-football' AND m.externalId<>a.externalId)
  AND NOT EXISTS (SELECT 1 FROM FootballCompetitionProvider m WHERE m.competitionId=s.competitionId
  AND m.provider='api-football' AND m.externalId<>cp.externalId)`;

function target(row: Target): Target {
  const normalized = { ...row, externalId: Number(row.externalId), competitionId: Number(row.competitionId),
    homeExternalId: Number(row.homeExternalId), awayExternalId: Number(row.awayExternalId),
    homeGoals: Number(row.homeGoals), awayGoals: Number(row.awayGoals) };
  if (![normalized.externalId, normalized.competitionId, normalized.homeExternalId, normalized.awayExternalId]
    .every((value) => Number.isSafeInteger(value) && value > 0)) throw new Error("Invalid archived football identity.");
  return normalized;
}

function storedSections(row: StoredFlags): Record<Section, SectionState> {
  const status = (available: number): SectionState => Number(available) === 1 ? "available" : "missing";
  return { info: status(row.hasInfo), events: status(row.hasEvents), statistics: status(row.hasStatistics),
    lineups: status(row.hasLineups), players: status(row.hasPlayers) };
}

function initialState(row: Target): DetailState {
  if (row.archiveState !== null) return stateSchema.parse(historyJson(row.archiveState));
  return { version: 1, attempts: 0, observations: 0, reservation: null, sections: storedSections(row) };
}

function coverage(row: Target, name: string): boolean | null {
  const value = historyJson(row.coverage);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const flag = (value as Record<string, unknown>)[name];
  return typeof flag === "boolean" ? flag : null;
}

const completeSection = (state: SectionState) => state === "available" || state === "known-empty" || state === "unsupported";
const sectionCoverage = { events: "fixtures.events", statistics: "fixtures.statistics_fixtures",
  lineups: "fixtures.lineups", players: "fixtures.statistics_players" } as const;

function teamEntries(rows: readonly unknown[] | null, ...fields: string[]): readonly unknown[] | null {
  if (!rows) return null;
  const populated = rows.filter((row) => {
    if (!row || typeof row !== "object") return false;
    return fields.some((field) => {
      const values = (row as Record<string, unknown>)[field];
      return Array.isArray(values) && values.length > 0;
    });
  });
  return populated.length ? populated : null;
}

function detailValues(facts: FixtureDetailFacts): FixtureDetailFacts {
  return {
    events: facts.events,
    statistics: teamEntries(facts.statistics, "statistics"),
    lineups: teamEntries(facts.lineups, "startXI", "substitutes"),
    players: teamEntries(facts.players, "players"),
    ...(facts.info ? { info: facts.info } : {}),
  };
}

function archiveSections(row: Target, flags: StoredFlags, state: DetailState, values: FixtureDetailFacts | null) {
  const retained = storedSections(flags), sections = { ...state.sections };
  for (const name of sectionNames) {
    if (retained[name] === "available") { sections[name] = "available"; continue; }
    if (sections[name] === "available") sections[name] = "missing";
    if (!values || name === "info") continue;
    const entries = values[name];
    if (entries?.length) sections[name] = "partial";
    else if (sections[name] === "missing") {
      const advertised = coverage(row, sectionCoverage[name]);
      if (advertised === false) sections[name] = "unsupported";
      else if (name === "events" && advertised === true && entries?.length === 0) sections.events = "known-empty";
    }
  }
  return sections;
}

function sameFixture(left: Target, right: Target): boolean {
  return left.externalId === right.externalId && left.competitionId === right.competitionId && left.season === right.season &&
    left.kickoffAt.getTime() === right.kickoffAt.getTime() && left.homeExternalId === right.homeExternalId &&
    left.awayExternalId === right.awayExternalId && left.homeGoals === right.homeGoals && left.awayGoals === right.awayGoals;
}

function acceptDetails(response: ApiFootballResult<NormalizedFixtureMatchDetails>, ids: readonly number[], started: number, finished: number) {
  const [page] = response.provenance;
  const key = ids.length === 1 ? "id" : "ids";
  if (response.status === "failed" || response.requestsDispatched !== 1 || response.provenance.length !== 1 || !page ||
    page.provider !== "api-football" || page.endpoint !== "fixtures" || page.contractVersion !== API_FOOTBALL_CONTRACT_VERSION ||
    page.fromCache || page.quota.kind !== "success" || page.currentPage !== 1 || page.totalPages !== 1 ||
    (page.requestParameters[key] !== ids.join("-") && !(ids.length === 1 && page.requestParameters.ids === String(ids[0]))) ||
    page.retrievedAt < started || page.retrievedAt > finished) return null;
  const expected = new Set(ids), result = new Map<number, NormalizedFixtureMatchDetails>();
  for (const item of response.data) {
    if (!expected.has(item.id) || result.has(item.id) || item.source.provider !== "api-football" ||
      item.source.endpoint !== "/fixtures" || item.source.retrievedAt !== page.retrievedAt) return null;
    result.set(item.id, item);
  }
  return result;
}

function matchesDetail(row: Target, detail: NormalizedFixtureMatchDetails | undefined) {
  return detail && detail.id === row.externalId && detail.competition.id === row.competitionId && detail.competition.season === row.season &&
    detail.kickoff === row.kickoffAt.getTime() && detail.homeTeam.id === row.homeExternalId && detail.awayTeam.id === row.awayExternalId &&
    isPlayedFinalStatus(detail.status) && detail.regulationScore?.verified === true &&
    detail.regulationScore.home === row.homeGoals && detail.regulationScore.away === row.awayGoals &&
    Buffer.byteLength(JSON.stringify(detail.facts)) <= FIXTURE_FACTS_MAX_BYTES ? detail : undefined;
}

/** Private archive work shares the adapter's provider account and yields to live work at enrichment priority. */
export function createFootballHistoryDetails(options: Readonly<{
  database: DatabaseRuntime;
  adapter: Pick<ReturnType<typeof createApiFootballAdapter>["evidence"], "matchDetails">;
  competitionIds: readonly number[];
  batchSize?: number;
  now(): UtcInstant;
  providerDayEndsAt(): number | null;
}>) {
  const { database, adapter, now, providerDayEndsAt } = options;
  const approved = new Set(options.competitionIds), batchSize = options.batchSize ?? 1;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 20 || !approved.size ||
    [...approved].some((value) => !Number.isSafeInteger(value) || value < 1)) throw new RangeError("Invalid archive detail scope.");

  const due = (at: number) => Prisma.sql`(detail.nextCheckAt<=${new Date(at)} OR detail.fixtureId IS NULL AND
    NOT (${Prisma.join(Object.values(storedFacts), " AND ")}))`;

  async function claim(ids: readonly number[], at: number) {
    // Do not lock the candidate scan or its league, season and team joins.
    const rows = await database.query((tx) => tx.$queryRaw<Target[]>(Prisma.sql`${candidateQuery}
      WHERE cp.externalId IN (${Prisma.join(ids)}) AND ${eligibleFixture} AND ${unambiguous} AND ${due(at)}
      ORDER BY f.kickoff DESC,f.id LIMIT ${batchSize}`));
    const claimed = await database.transaction(async (tx) => {
      const claimed: ClaimedTarget[] = [];
      for (const { fixtureId } of rows) {
        const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM FootballFixture WHERE id=${fixtureId} FOR UPDATE SKIP LOCKED`;
        if (!locked) continue;
        const [raw] = await tx.$queryRaw<Target[]>(Prisma.sql`${candidateQuery} WHERE f.id=${fixtureId}
          AND cp.externalId IN (${Prisma.join(ids)}) AND ${eligibleFixture} AND ${unambiguous} AND ${due(at)}`);
        if (!raw) continue;
        const row = target(raw), previous = initialState(row), reservation = randomUUID();
        const state = { ...previous, reservation }, checkedAt = new Date(at), nextCheckAt = new Date(at + 5 * MINUTE);
        await tx.footballHistoryDetailState.upsert({ where: { fixtureId: row.fixtureId },
          create: { fixtureId: row.fixtureId, state, checkedAt, nextCheckAt }, update: { state, nextCheckAt } });
        claimed.push({ target: row, previous, reservation });
      }
      return claimed;
    }, { isolationLevel: "ReadCommitted", timeout: 15_000 });
    return { claimed, busy: !claimed.length && rows.length > 0 };
  }

  async function save(claimed: readonly ClaimedTarget[], accepted: ReadonlyMap<number, NormalizedFixtureMatchDetails> | null,
    requests: number, checkedAt: number): Promise<BatchReport> {
    let received = 0, written = 0, completed = 0;
    for (const item of claimed) {
      const result = await database.transaction(async (tx) => {
        const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM FootballFixture WHERE id=${item.target.fixtureId} FOR UPDATE`;
        if (!locked) return null;
        const [raw] = await tx.$queryRaw<Target[]>(Prisma.sql`${candidateQuery} WHERE f.id=${item.target.fixtureId}
          AND ${eligibleFixture} AND ${unambiguous}`);
        if (!raw) return null;
        const row = target(raw);
        if (initialState(row).reservation !== item.reservation || !sameFixture(row, item.target)) return null;
        const detail = matchesDetail(row, accepted?.get(row.externalId));
        const values = detail ? detailValues(detail.facts) : null;
        const saved = detail && values ? await saveFixtureFacts(tx, row, { values, retrievedAt: detail.source.retrievedAt }, new Date(checkedAt), false) : false;
        const [stored] = saved ? await tx.$queryRaw<StoredFlags[]>(Prisma.sql`SELECT ${factFlags} FROM FixtureFacts facts
          WHERE facts.fixtureId=${row.fixtureId}`) : [row];
        const sections = archiveSections(row, stored ?? row, item.previous, values);
        const observations = item.previous.observations + Number(accepted !== null);
        const done = Object.values(sections).every(completeSection);
        const nextCheckAt = done || observations >= 3 ? null : new Date(checkedAt + (accepted === null ? 15 * MINUTE : observations * DAY));
        await tx.footballHistoryDetailState.update({ where: { fixtureId: row.fixtureId }, data: { checkedAt: new Date(checkedAt), nextCheckAt,
          state: { version: 1, attempts: item.previous.attempts + requests, observations, reservation: null, sections } } });
        return { received: Boolean(detail), saved, done };
      }, { isolationLevel: "ReadCommitted", timeout: 15_000 });
      if (result) { received += Number(result.received); written += Number(result.saved); completed += Number(result.done); }
    }
    return { requested: claimed.length, received, written, completed, deferred: claimed.length - completed, requests };
  }

  return async function run(input: Readonly<{ maxRequests: number; competitionId?: number }>, onBatch?: (batch: BatchReport) => void, signal?: AbortSignal) {
    const { maxRequests, competitionId } = input;
    if (!Number.isSafeInteger(maxRequests) || maxRequests < 1 || maxRequests > 100 || competitionId !== undefined && !approved.has(competitionId))
      throw new RangeError("Choose an approved competition and a detail request limit between 1 and 100.");
    const scope = competitionId === undefined ? [...approved] : [competitionId], dayEnd = providerDayEndsAt();
    if (dayEnd === null || now() >= dayEnd) throw new Error("The historical detail import needs a verified provider day.");
    const requestSignal = signal ?? new AbortController().signal;
    const totals = { requested: 0, received: 0, written: 0, completed: 0, deferred: 0, requests: 0 };
    let stopped: string | null = null;
    while (totals.requests < maxRequests) {
      if (requestSignal.aborted) { stopped = "interrupted"; break; }
      if (providerDayEndsAt() !== dayEnd || now() >= dayEnd) { stopped = "provider-day-ended"; break; }
      const { claimed, busy } = await claim(scope, now());
      if (!claimed.length) { if (busy) stopped = "detail-work-busy"; break; }
      const started = now(), deadlineAt = utcInstantFromEpochMilliseconds(Math.min(dayEnd, started + 45_000));
      const ids = claimed.map(({ target: row }) => row.externalId).sort((left, right) => left - right);
      const check = () => {
        if (requestSignal.aborted || providerDayEndsAt() !== dayEnd || now() >= deadlineAt)
          throw new Error("The historical detail request expired.");
      };
      let response: ApiFootballResult<NormalizedFixtureMatchDetails> | null = null;
      try {
        check();
        response = await adapter.matchDetails(ids, { priority: "enrichment", deadlineAt, timeoutMs: 30_000, maxRequests: 1,
          maxPages: 1, maxRows: batchSize, maxResponseBytes: 8_000_000, retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 },
          cacheMaxAgeMs: 0 }, { signal: requestSignal, deadlineAt, check, beforeReserve: check, beforeDispatch: check });
      } catch { /* Unconfirmed work is deferred rather than recording it as an empty fixture. */ }
      const checkedAt = now(), requests = response?.requestsDispatched ?? 0;
      const batch = await save(claimed, response ? acceptDetails(response, ids, started, checkedAt) : null, requests, checkedAt);
      for (const key of Object.keys(totals) as (keyof BatchReport)[]) totals[key] += batch[key];
      onBatch?.(batch);
      const reason = response?.error?.reason;
      if (reason && stopReasons.has(reason)) { stopped = reason; break; }
      if (!requests) { stopped = requestSignal.aborted ? "interrupted" : reason ?? "detail-unavailable"; break; }
    }
    if (stopped === null && totals.requests >= maxRequests) stopped = "request-budget";
    return { status: stopped || totals.deferred ? "partial" as const : "complete" as const, ...totals, stopped };
  };
}
