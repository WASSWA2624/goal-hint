import "server-only";

import { getReportingDate, utcInstantFromEpochMilliseconds, type ReportingDate } from "../../domain/calendar.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { jobFingerprint, jobInstant, parseJobEnvelope } from "../jobs/job-input.ts";
import { defineJob } from "../jobs/job-registry.ts";
import { z } from "zod";
import { apiFootballLeaderboards } from "./api-football-contract.ts";
import { catalogScopeKey } from "./catalog-input.ts";
import type { createFootballHistoryReference, FootballHistoryReferenceTarget } from "./history-reference.ts";
import type { FootballHistoryPlayerStatisticsTarget } from "./history-player-statistics.ts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const maximumRequests = 40;
export const footballRefreshCadence = Object.freeze({
  currentDay: HOUR, standings: HOUR, predictions: HOUR, odds: 3 * HOUR, injuries: 4 * HOUR,
  teamStatistics: 12 * HOUR, activeReferences: DAY, playerStatistics: DAY, careerReferences: 7 * DAY,
});

export function currentReferenceFreshness(endpoint: FootballHistoryReferenceTarget["endpoint"]): number | undefined {
  switch (endpoint) {
    case "timezones": return undefined;
    case "standings": return footballRefreshCadence.standings;
    case "injuries": return footballRefreshCadence.injuries;
    case "teamStatistics": return footballRefreshCadence.teamStatistics;
    case "coachProfiles": case "playerTeams": case "playerSeasonHistory": case "playerTransfers": case "trophies": case "sidelined":
      return footballRefreshCadence.careerReferences;
    default: return footballRefreshCadence.activeReferences;
  }
}

type Scope = Readonly<{ competitionId: number; season: number; coverage: unknown; teamIds: readonly number[] }>;
const supported = (coverage: unknown, field: string) => coverage === null || typeof coverage !== "object" || Reflect.get(coverage, field) !== false;
export function currentReferenceTargets(scopes: readonly Scope[], slot: number): readonly FootballHistoryReferenceTarget[] {
  const targets = new Map<string, FootballHistoryReferenceTarget>();
  const add = (target: FootballHistoryReferenceTarget) => targets.set(JSON.stringify(target), target);
  for (const { competitionId, season, coverage, teamIds } of scopes) {
    if (supported(coverage, "standings")) add({ endpoint: "standings", competitionId, season });
    if (supported(coverage, "injuries")) add({ endpoint: "injuries", competitionId, season });
    add({ endpoint: "teams", competitionId, season });
    add({ endpoint: "fixtureRounds", competitionId, season });
    for (const endpoint of Object.keys(apiFootballLeaderboards) as Array<keyof typeof apiFootballLeaderboards>) {
      if (supported(coverage, apiFootballLeaderboards[endpoint].coverage)) add({ endpoint, competitionId, season });
    }
    for (const teamId of teamIds) {
      add({ endpoint: "teamStatistics", competitionId, season, teamId });
      add({ endpoint: "coaches", teamId });
      add({ endpoint: "squads", teamId });
      add({ endpoint: "transfers", teamId });
    }
  }
  if (!targets.size) return [];
  // When budget is limited, rotate the start instead of repeatedly serving the first leagues.
  const ordered = [...targets.values()], start = Math.floor(slot / HOUR) * maximumRequests % ordered.length;
  return [...ordered.slice(start), ...ordered.slice(0, start)];
}

const currentDayContextType = "football.current-day-context";
const payload = z.strictObject({ slot: jobInstant.refine(value => value % HOUR === 0) });
export function currentDayContextEnvelope(slot: number) {
  return parseJobEnvelope({ version: 1, type: currentDayContextType, handlerVersion: 1, payload: payload.parse({ slot }), refresh: null,
    idempotencyKey: jobFingerprint([currentDayContextType, slot]), priority: 2, notBefore: slot,
    expiresAt: slot + footballRefreshCadence.currentDay, maxAttempts: 12, timeoutMs: 7 * 60_000, leaseMs: 30_000,
    fallbackReserveMs: 0, backoff: { baseMs: 60_000, maxMs: 5 * 60_000 } });
}

const provider = "api-football";
export const currentPlayerRequestLimit = 8;
export function createCurrentDayContextJob(options: Readonly<{
  database: DatabaseRuntime; competitionIds: readonly number[]; retentionEvidenceRef: string;
  reference: ReturnType<typeof createFootballHistoryReference>;
  refreshPlayers?(date: ReportingDate, targets: readonly FootballHistoryPlayerStatisticsTarget[], signal: AbortSignal): Promise<Readonly<{
    requested: number; archived: number; deferred: number; stopped: string | null;
  }>>;
  onCoverage?: (report: Readonly<{ requested: number; archived: number; skipped: number; deferred: number; stopped: string | null }>) => void;
}>) {
  const { database, reference, competitionIds } = options;
  const providerTeams = { where: { provider }, select: { externalId: true }, take: 2 } as const;
  return defineJob({ type: currentDayContextType, handlerVersion: 1, payload, async handle({ slot }, context) {
    await context.checkpoint();
    const today = getReportingDate(utcInstantFromEpochMilliseconds(slot));
    const discovered = await database.query(tx => tx.footballImport.findFirst({ where: { provider, kind: "fixtures", status: "complete",
      retentionEvidenceRef: options.retentionEvidenceRef, observedAt: { gte: new Date(slot) },
      scopeKey: catalogScopeKey({ kind: "fixtures", query: { date: today } }) }, select: { id: true } }));
    if (!discovered) {
      options.onCoverage?.({ requested: 0, archived: 0, skipped: 0, deferred: 0, stopped: "awaiting-fixture-discovery" });
      return { status: "failed", reason: "handler-failed", retryable: true };
    }
    const competitionFilter = { provider, externalId: { in: competitionIds.map(BigInt) } };
    const fixtures = await database.query(tx => tx.footballFixture.findMany({
      where: { provider, eatDate: new Date(`${today}T00:00:00Z`), status: { in: ["scheduled", "live"] },
        season: { competition: { providers: { some: competitionFilter } } } },
      select: { season: { select: { year: true, coverage: true, competition: { select: {
        providers: { where: competitionFilter, select: { externalId: true }, take: 2 },
      } } } }, homeTeam: { select: { providers: providerTeams } }, awayTeam: { select: { providers: providerTeams } } },
      orderBy: [{ kickoff: "asc" }, { id: "asc" }],
    }));
    const uniqueId = (providers: readonly { externalId: bigint }[]) => {
      const value = providers.length === 1 ? Number(providers[0]!.externalId) : null;
      return value !== null && Number.isSafeInteger(value) && value > 0 ? value : null;
    };
    const scopes = fixtures.flatMap(({ season, homeTeam, awayTeam }) => {
      const competitionId = uniqueId(season.competition.providers);
      const teamIds = [uniqueId(homeTeam.providers), uniqueId(awayTeam.providers)].filter((value): value is number => value !== null);
      return competitionId === null ? [] : [{ competitionId, season: season.year, coverage: season.coverage, teamIds }];
    });
    const targets = currentReferenceTargets(scopes, slot);
    const result = await reference.run({ targets, maxRequests: maximumRequests, signal: context.signal });
    await context.checkpoint();
    const mayRefreshPlayers = result.stopped === null || result.stopped === "request-budget" || result.stopped === "target-limit";
    const uniquePlayers = new Map(scopes.filter(({ coverage }) => supported(coverage, "players"))
      .map(({ competitionId, season }) => [`${competitionId}:${season}`, { competitionId, season }] as const));
    const playerScopes = [...uniquePlayers.values()];
    const firstPlayerScope = playerScopes.length ? Math.floor(slot / HOUR) * currentPlayerRequestLimit % playerScopes.length : 0;
    const playerTargets = [...playerScopes.slice(firstPlayerScope), ...playerScopes.slice(0, firstPlayerScope)];
    const players = mayRefreshPlayers && playerTargets.length ? await options.refreshPlayers?.(today, playerTargets, context.signal) : undefined;
    const report = players ? { requested: result.requested + players.requested, archived: result.archived + players.archived,
      deferred: result.deferred + players.deferred, skipped: result.skipped, stopped: players.stopped ?? result.stopped } : result;
    options.onCoverage?.(report);
    const retryable = report.stopped === "provider-transport-unavailable" || report.stopped === "archive-unavailable";
    return retryable ? { status: "failed", reason: "handler-failed", retryable: true } : { status: "succeeded" };
  } });
}
