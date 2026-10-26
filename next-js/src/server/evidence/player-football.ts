import "server-only";

import { utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import type { NormalizedAvailability, NormalizedPlayerStatistics } from "../football/api-football-normalize.ts";
import type { EvidenceClaim, EvidenceContext, EvidenceSource } from "./evidence-contract.ts";
import { evidenceFingerprint, evidenceSourceId, freezeEvidence } from "./evidence-input.ts";

export const PLAYER_FOOTBALL_VERSION = "goal-hint-player-football-v1";
export type PlayerFootballScope = Readonly<{ competitionExternalId: number; season: number }>;
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const playerSummary = (value: EvidenceClaim["value"]) =>
  `Player ${value.playerExternalId} recorded ${value.goals} goals, ${value.assists} assists and ${value.minutes} minutes in competition ${value.competitionExternalId}, season ${value.season}; season contribution is not recent form.`;

/** Stable IDs and exact competition/season joins; no injury impact percentages or retrospective season totals. */
export function playerFootballClaims(context: EvidenceContext, scope: PlayerFootballScope,
  rows: readonly NormalizedPlayerStatistics[], availability: readonly NormalizedAvailability[]): readonly Readonly<{
    key: unknown; retrievedAt: EvidenceSource["retrievedAt"]; providerUpdatedAt: EvidenceSource["providerUpdatedAt"]; claims: readonly EvidenceClaim[];
  }>[] {
  const output: { key: unknown; retrievedAt: EvidenceSource["retrievedAt"]; providerUpdatedAt: EvidenceSource["providerUpdatedAt"]; claims: EvidenceClaim[] }[] = [];
  for (const row of rows) for (const statistic of row.statistics) {
    const team = [context.home, context.away].find((team) => team.externalId === statistic.team.id);
    if (!team || statistic.competition.id !== scope.competitionExternalId || statistic.competition.season !== scope.season ||
      !integer(row.player.id) || row.player.id === 0 || ![statistic.games.appearances, statistic.games.minutes, statistic.goals.total, statistic.goals.assists].every(integer)) continue;
    const value = { metric: "player-season-contribution", value: statistic.goals.total! + statistic.goals.assists!, unit: "goal-involvements",
      teamExternalId: team.externalId, playerExternalId: row.player.id, competitionExternalId: scope.competitionExternalId, season: scope.season,
      appearances: statistic.games.appearances!, minutes: statistic.games.minutes!, goals: statistic.goals.total!, assists: statistic.goals.assists! };
    output.push({ key: { kind: "player-statistics", player: row.player.id, team: team.externalId, ...scope },
      retrievedAt: row.source.retrievedAt, providerUpdatedAt: row.source.providerUpdatedAt,
      claims: [{ kind: "statistic", subjectTeamId: team.teamId, key: `player-${row.player.id}/season-contribution`, value,
        summary: playerSummary(value), certainty: "confirmed", asOfAt: row.source.providerUpdatedAt }] });
  }
  for (const row of availability) {
    const team = [context.home, context.away].find((team) => team.externalId === row.team.id);
    if (!team || row.fixtureId !== null && row.fixtureId !== context.externalFixtureId) continue;
    const claims: EvidenceClaim[] = [];
    if (row.kind === "injuries" && row.reportedInjury) {
      const injury = row.reportedInjury, status = injury.type === "Missing Fixture" ? "confirmed-absent" : injury.type === "Questionable" ? "doubtful" : "reported";
      claims.push({ kind: "injury", subjectTeamId: team.teamId, key: `injury-${injury.playerId}`,
        value: { playerExternalId: injury.playerId, playerName: injury.name, type: injury.type, reason: injury.reason, status, ...scope },
        summary: `Player ${injury.playerId} availability is ${status}; missing reports do not establish fitness.`, certainty: status === "doubtful" ? "unknown" : "confirmed",
        asOfAt: row.source.providerUpdatedAt });
    }
    if (row.kind === "lineups") for (const [role, players] of [["starting", row.startingPlayers], ["substitute", row.substitutes]] as const)
      for (const player of players) claims.push({ kind: "lineup", subjectTeamId: team.teamId, key: `lineup-${player.id}`,
        value: { playerExternalId: player.id, playerName: player.name, ...(player.number === null ? {} : { number: player.number }),
          position: player.position, grid: player.grid, formation: row.formation, role },
        summary: `Provider-confirmed ${role} lineup role for player ${player.id}; unavailable lineups remain unknown.`, certainty: "confirmed", asOfAt: row.source.providerUpdatedAt });
    if (claims.length) output.push({ key: { kind: row.kind, team: team.externalId, fixture: context.externalFixtureId },
      retrievedAt: row.source.retrievedAt, providerUpdatedAt: row.source.providerUpdatedAt, claims });
  }
  return freezeEvidence(output);
}

export function buildPlayerFootballSources(context: EvidenceContext, scope: PlayerFootballScope, rows: readonly NormalizedPlayerStatistics[],
  availability: readonly NormalizedAvailability[], refs: Readonly<{ evidence: string; retention: string }>): readonly EvidenceSource[] {
  const groups = new Map<string, { keys: unknown[]; retrievedAt: EvidenceSource["retrievedAt"]; providerUpdatedAt: EvidenceSource["providerUpdatedAt"]; claims: EvidenceClaim[] }>();
  for (const entry of playerFootballClaims(context, scope, rows, availability)) {
    const key = evidenceFingerprint({ retrievedAt: entry.retrievedAt, providerUpdatedAt: entry.providerUpdatedAt,
      kind: entry.claims[0]?.kind, team: entry.claims[0]?.subjectTeamId });
    const group = groups.get(key) ?? { keys: [], retrievedAt: entry.retrievedAt, providerUpdatedAt: entry.providerUpdatedAt, claims: [] };
    group.keys.push(entry.key); group.claims.push(...entry.claims); groups.set(key, group);
  }
  return freezeEvidence([...groups.values()].flatMap((entry) => {
    // Keep lineups and player groups within the shared evidence's per-source bound.
    const chunks: EvidenceClaim[][] = [];
    for (let index = 0; index < entry.claims.length; index += 16) chunks.push(entry.claims.slice(index, index + 16));
    return chunks.map((claims, index) => {
      const body: Omit<EvidenceSource, "id"> = { kind: "football", sourceKey: evidenceFingerprint({ keys: entry.keys, part: index }), syndicationKey: null,
        version: PLAYER_FOOTBALL_VERSION, publisher: "API-Football", title: "Verified player contribution and availability",
        sourceUrl: "https://www.api-football.com/documentation-v3", publishedAt: null, retrievedAt: entry.retrievedAt, providerUpdatedAt: entry.providerUpdatedAt,
        binding: { fixtureId: context.fixtureId, fixtureVersion: context.fixtureVersion, externalFixtureId: context.externalFixtureId,
          homeTeamId: context.home.teamId, awayTeamId: context.away.teamId, homeExternalId: context.home.externalId, awayExternalId: context.away.externalId },
        evidenceRef: refs.evidence, reuse: { evidenceRef: refs.retention, allowSummary: true,
          retainUntil: utcInstantFromEpochMilliseconds(entry.retrievedAt + 30 * 86_400_000) }, claims };
      return { ...body, id: evidenceSourceId(body) };
    });
  }));
}

export function verifyPlayerFootballClaims(source: EvidenceSource, context: EvidenceContext): boolean {
  if (source.version !== PLAYER_FOOTBALL_VERSION) return false;
  return source.claims.every((claim) => {
    const team = [context.home, context.away].find((team) => team.teamId === claim.subjectTeamId), value = claim.value;
    if (!team || !integer(value.playerExternalId) || value.playerExternalId === 0) return false;
    if (claim.kind === "statistic") return claim.certainty === "confirmed" && value.metric === "player-season-contribution" &&
      value.teamExternalId === team.externalId && [value.competitionExternalId, value.season, value.appearances, value.minutes, value.goals, value.assists].every(integer) &&
      Number(value.competitionExternalId) > 0 && Number(value.season) > 0 && Number(value.season) <= 9999 &&
      value.value === Number(value.goals) + Number(value.assists) && value.unit === "goal-involvements" && claim.summary === playerSummary(value);
    if (claim.kind === "injury") {
      const status = value.type === "Missing Fixture" ? "confirmed-absent" : value.type === "Questionable" ? "doubtful" : "reported";
      return value.status === status && claim.certainty === (status === "doubtful" ? "unknown" : "confirmed") &&
        integer(value.competitionExternalId) && integer(value.season) &&
        claim.summary === `Player ${value.playerExternalId} availability is ${status}; missing reports do not establish fitness.`;
    }
    return claim.kind === "lineup" && claim.certainty === "confirmed" && ["starting", "substitute"].includes(String(value.role)) &&
      claim.summary === `Provider-confirmed ${value.role} lineup role for player ${value.playerExternalId}; unavailable lineups remain unknown.`;
  });
}
