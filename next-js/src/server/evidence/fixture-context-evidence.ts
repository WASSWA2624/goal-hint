import "server-only";

import { z } from "zod";
import type { DatabaseRuntime } from "../database/client.ts";
import { createFootballHistorySource, type FootballModelReferenceTarget } from "../football/history-source.ts";
import { provenTrue } from "../shared/authority-proof.ts";
import type { EvidenceContext, EvidenceValue } from "./evidence-contract.ts";
import { evidenceFingerprint, freezeEvidence } from "./evidence-input.ts";
import type { FixtureModelContextObservation } from "./fixture-model-evidence.ts";

const HOUR = 3_600_000, DAY = 24 * HOUR;
const position = z.enum(["Goalkeeper", "Defender", "Midfielder", "Attacker"]);
const providerId = z.number().int().positive().safe();
const count = z.number().int().min(0).max(100_000);
const team = z.object({ id: providerId });
const date = z.iso.date();
const standings = z.object({ league: z.object({ id: providerId, season: providerId,
  standings: z.array(z.array(z.unknown()).max(128)).max(32) }) });
const standingRow = z.object({ rank: count.min(1), team, points: z.number().int().min(-100_000).max(100_000),
  goalsDiff: z.number().int().min(-100_000).max(100_000), all: z.object({ played: count }) });
const total = z.object({ total: count });
const teamStatistic = z.object({ league: z.object({ id: providerId, season: providerId }), team,
  fixtures: z.object({ played: total }), goals: z.object({ for: z.object({ total }), against: z.object({ total }) }) });
const coach = z.object({ id: providerId, career: z.array(z.object({ team, start: date, end: date.nullable() })).max(256) });
const squad = z.object({ team, players: z.array(z.object({ id: providerId, position })).max(128) });
const transfer = z.object({ player: z.object({ id: providerId }), transfers: z.array(z.object({
  date, teams: z.object({ in: team, out: team }),
})).max(256) });

const archiveCadence = { standings: HOUR, teamStatistics: 12 * HOUR, coaches: DAY, squads: DAY, transfers: 7 * DAY } as const;
const knownBefore = (date: string, cutoff: number) => Date.parse(date) + DAY <= cutoff;

type FixtureContextTeam = EvidenceContext["home"];
type Scope = Readonly<{ competitionId: number; season: number }>;
type Page = NonNullable<Awaited<ReturnType<ReturnType<typeof createFootballHistorySource>["readModelReference"]>>>;
type ArchivedFacts = Readonly<{ kind: FixtureModelContextObservation["kind"]; value: EvidenceValue }>;

function validRows<Value>(rows: readonly unknown[], schema: z.ZodType<Value>): Value[] {
  return rows.flatMap((raw) => {
    const parsed = schema.safeParse(raw);
    return parsed.success ? [parsed.data] : [];
  });
}

function tableFacts(rows: readonly unknown[], target: FixtureContextTeam, scope: Scope): ArchivedFacts[] {
  const leagues = validRows(rows, standings).map(({ league }) => league)
    .filter(({ id, season }) => id === scope.competitionId && season === scope.season);
  if (leagues.length !== 1) return [];
  const matches = validRows(leagues[0]!.standings.flat(), standingRow).filter(({ team }) => team.id === target.externalId);
  if (matches.length !== 1) return [];
  const { rank, points, goalsDiff, all } = matches[0]!;
  return [{ kind: "standings", value: { ...scope, rank, points, goalDifference: goalsDiff, played: all.played } }];
}

function scopedFacts(endpoint: Exclude<FootballModelReferenceTarget["endpoint"], "standings">, rows: readonly unknown[],
  target: FixtureContextTeam, scope: Scope, cutoffAt: number): ArchivedFacts[] {
  switch (endpoint) {
    case "teamStatistics": {
      const row = rows.length === 1 && teamStatistic.safeParse(rows[0]);
      if (!row || !row.success || row.data.team.id !== target.externalId || row.data.league.id !== scope.competitionId ||
        row.data.league.season !== scope.season) return [];
      return [{ kind: "season-summary", value: { ...scope, played: row.data.fixtures.played.total,
        goalsFor: row.data.goals.for.total.total, goalsAgainst: row.data.goals.against.total.total } }];
    }
    case "coaches": {
      const current = validRows(rows, coach).flatMap((data) =>
        data.career.filter((entry) => entry.team.id === target.externalId && entry.end === null && knownBefore(entry.start, cutoffAt))
          .map(({ start }) => ({ coachExternalId: data.id, startedOn: start })));
      return current.length === 1 ? [{ kind: "coach", value: current[0]! }] : [];
    }
    case "squads": {
      const row = rows.length === 1 && squad.safeParse(rows[0]);
      if (!row || !row.success || row.data.team.id !== target.externalId ||
        new Set(row.data.players.map(({ id }) => id)).size !== row.data.players.length) return [];
      return row.data.players.sort((a, b) => a.id - b.id).slice(0, 32)
        .map(({ id: playerExternalId, position }) => ({ kind: "squad", value: { playerExternalId, position } }));
    }
    case "transfers": {
      const earliest = cutoffAt - 120 * DAY;
      const transfers = validRows(rows, transfer).flatMap((data) =>
        data.transfers.filter(({ date, teams }) => knownBefore(date, cutoffAt) && Date.parse(date) >= earliest && teams.in.id !== teams.out.id &&
          [teams.in.id, teams.out.id].includes(target.externalId))
          .map(({ date, teams }) => ({ playerExternalId: data.player.id, fromExternalId: teams.out.id, toExternalId: teams.in.id, transferredOn: date })));
      const distinct = new Map(transfers.map((value) => [evidenceFingerprint(value), value]));
      return [...distinct.values()].sort((a, b) => b.transferredOn.localeCompare(a.transferredOn) || a.playerExternalId - b.playerExternalId ||
        a.fromExternalId - b.fromExternalId || a.toExternalId - b.toExternalId).slice(0, 16).map((value) => ({ kind: "transfer", value }));
    }
  }
}

function observations(page: Page, target: FixtureContextTeam, facts: readonly ArchivedFacts[]): FixtureModelContextObservation[] {
  return facts.map((fact) => {
    const claim = { ...fact, teamId: target.teamId, availableAt: page.retrievedAt, sourceIds: [page.sourceId] },
      claimIds = [evidenceFingerprint(claim)];
    return { ...claim, claimIds, id: evidenceFingerprint({ ...claim, claimIds }) };
  });
}

export type ArchivedFixtureContext = Readonly<{ context: EvidenceContext; competitionId: string; observations: readonly FixtureModelContextObservation[] }>;
const issued = new WeakSet<ArchivedFixtureContext>();
export const isArchivedFixtureContext = (value: ArchivedFixtureContext) => issued.has(value);

/** Only sealed earlier pages for the exact canonical fixture's league, season and teams are eligible. */
export async function readArchivedFixtureContext(database: DatabaseRuntime, context: EvidenceContext,
  verifyPrivateUse: () => boolean, signal?: AbortSignal) {
  if (signal?.aborted || !provenTrue(verifyPrivateUse)) return null;
  const teamMapping = { select: { providers: { where: { provider: "api-football" }, select: { externalId: true }, take: 2 } } } as const;
  const fixture = await database.query((tx) => tx.footballFixture.findUnique({ where: { id: context.fixtureId }, select: {
    externalId: true, provider: true, dataVersion: true, homeTeamId: true, awayTeamId: true, kickoff: true, retrievedAt: true,
    providerUpdatedAt: true, homeTeam: teamMapping, awayTeam: teamMapping, season: { select: { competitionId: true, year: true, competition: {
      select: { providers: { where: { provider: "api-football" }, select: { externalId: true }, take: 2 } },
    } } },
  } }));
  const sameTeam = (providers: readonly { externalId: bigint }[], externalId: number) => providers.length === 1 &&
    Number(providers[0]!.externalId) === externalId;
  if (signal?.aborted || !fixture || fixture.provider !== context.provider || Number(fixture.externalId) !== context.externalFixtureId ||
    fixture.dataVersion !== context.fixtureVersion || fixture.homeTeamId !== context.home.teamId || fixture.awayTeamId !== context.away.teamId ||
    !sameTeam(fixture.homeTeam.providers, context.home.externalId) || !sameTeam(fixture.awayTeam.providers, context.away.externalId) ||
    fixture.kickoff?.getTime() !== context.kickoffAt || fixture.retrievedAt.getTime() > context.cutoffAt ||
    fixture.providerUpdatedAt !== null && fixture.providerUpdatedAt.getTime() > context.cutoffAt || fixture.season.competition.providers.length !== 1) return null;
  const scope = { competitionId: Number(fixture.season.competition.providers[0]!.externalId), season: fixture.season.year };
  const archive = createFootballHistorySource(database);
  const read = (target: FootballModelReferenceTarget) => archive.readModelReference(target, context.cutoffAt, archiveCadence[target.endpoint]);
  const rows: FixtureModelContextObservation[] = [];
  const table = await read({ endpoint: "standings", ...scope });
  for (const target of [context.home, context.away]) {
    if (table) rows.push(...observations(table, target, tableFacts(table.rows, target, scope)));
    for (const endpoint of ["teamStatistics", "coaches", "squads", "transfers"] as const) {
      if (signal?.aborted) return null;
      const page = await read({ endpoint, ...scope, teamId: target.externalId });
      if (page) rows.push(...observations(page, target, scopedFacts(endpoint, page.rows, target, scope, context.cutoffAt)));
    }
  }
  if (signal?.aborted || !provenTrue(verifyPrivateUse)) return null;
  const result = freezeEvidence({ context: { ...context, home: { ...context.home }, away: { ...context.away } },
    competitionId: fixture.season.competitionId, observations: rows });
  issued.add(result);
  return result;
}
