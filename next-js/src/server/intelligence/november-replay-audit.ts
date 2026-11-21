import "server-only";

import { utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { getDateInTimeZone } from "../../domain/device-calendar.ts";
import { LOCAL_FIRST_MARKET_REGISTRY_VERSION } from "../../domain/market-registry.ts";
import { localFeaturedDecisionVersion } from "../../domain/local-featured-decision.ts";
import { novemberReplayRange, novemberReplayZone } from "../../domain/november-replay.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { displayedSet, publicFixtureCohortScope, storedFeedCoverage } from "../matches/feed-read.ts";
import { localGoalModelVersion } from "./local-goals-model.ts";

type AuditFixture = {
  fixtureId: string; kickoffAt: Date; status: string; competitionId: string; league: string | null; country: string | null;
  homeTeamId: string; awayTeamId: string; homeTeam: string | null; awayTeam: string | null;
  cycleId: string | null; cycleState: string | null; scheduleVersion: bigint | number | null;
  cutoffAt: Date; closedAt: Date | null; barrierAt: Date | null; scheduleProofAt: Date | null; catalogCreatedAt: Date;
  sourceRevisionId: string | null; sourcePublishedAt: Date | null;
};
type AuditMarket = { family: string; source: string; setId: string; retrievedAt: Date; validSeal: number; providerProof: number };

function groupBy<Row>(rows: readonly Row[], key: (row: Row) => string) {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const id = key(row), group = groups.get(id);
    if (group) group.push(row);
    else groups.set(id, [row]);
  }
  return groups;
}

function tally(values: Iterable<string>) {
  const result = new Map<string, number>();
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
  return Object.fromEntries([...result].sort(([left], [right]) => left.localeCompare(right, "en")));
}

/** Read the exact ordinary Matches cohort and retain private occurrence/checkpoint identities. */
export async function auditNovemberReplay(database: Pick<DatabaseRuntime, "transaction">, competitionIds?: readonly number[],
  range = novemberReplayRange) {
  return database.transaction(async (tx) => {
    const [{ asOf }] = await tx.$queryRaw<[{ asOf: Date }]>`SELECT UTC_TIMESTAMP(3) AS asOf`;
    if (!Number.isFinite(asOf.getTime())) throw new Error("The database has no verified audit clock.");
    const scope = [...new Set(competitionIds ?? (await tx.$queryRaw<{ externalId: bigint }[]>`
      SELECT cp.externalId FROM FootballCompetitionProvider cp WHERE cp.provider='api-football' AND EXISTS (
        SELECT 1 FROM FootballSeason fs JOIN FootballFixture ff ON ff.seasonId=fs.id AND ff.provider=cp.provider
        WHERE fs.competitionId=cp.competitionId LIMIT 1
      )`).map(({ externalId }) => Number(externalId)))].sort((a, b) => a - b);
    if (!scope.length || scope.some((id) => !Number.isSafeInteger(id) || id < 1)) throw new Error("Supply a verified Matches competition scope.");
    const choices = publicFixtureCohortScope(range, scope);
    const cutoff = Prisma.sql`COALESCE(c.cutoffAt,TIMESTAMPADD(MINUTE,-5,f.kickoff))`;
    const fixtures = await tx.$queryRaw<AuditFixture[]>(Prisma.sql`
      SELECT f.id AS fixtureId,f.kickoff AS kickoffAt,f.status,s.competitionId,l.name AS league,l.country,
        f.homeTeamId,f.awayTeamId,h.name AS homeTeam,a.name AS awayTeam,c.id AS cycleId,c.state AS cycleState,c.scheduleVersion,${cutoff} AS cutoffAt,
        c.closedAt,b.closedAt AS barrierAt,ps.observedAt AS scheduleProofAt,f.createdAt AS catalogCreatedAt,
        rp.id AS sourceRevisionId,rp.publishedAt AS sourcePublishedAt
      FROM FootballFixture f FORCE INDEX (FootballFixture_kickoff_idx)
      JOIN FootballSeason s ON s.id=f.seasonId JOIN FootballCompetition l ON l.id=s.competitionId
      JOIN FootballTeam h ON h.id=f.homeTeamId JOIN FootballTeam a ON a.id=f.awayTeamId
      LEFT JOIN PredictionCycle c ON c.id=f.activeCycleId AND c.fixtureId=f.id
      LEFT JOIN PredictionSchedule ps ON ps.fixtureId=f.id AND ps.cycleId=c.id AND ps.version=c.scheduleVersion AND ps.kickoffAt=f.kickoff
      LEFT JOIN PredictionPublicationBarrier b ON b.cycleId=c.id AND b.fixtureId=f.id
      LEFT JOIN PredictionSet rp ON rp.id=${displayedSet}
      WHERE ${choices} ORDER BY f.kickoff,f.id`);
    const markets = await tx.$queryRaw<AuditMarket[]>(Prisma.sql`
      SELECT m.family,m.source,m.setId,m.retrievedAt,m.integrity=SHA2(CAST(m.payloadJson AS CHAR),256) AS validSeal,
        (m.source='api-football' AND m.family IN ('match-result','double-chance')
        AND JSON_UNQUOTE(JSON_EXTRACT(m.payloadJson,'$.provenance.kind'))='api-football'
        AND CHAR_LENGTH(JSON_UNQUOTE(JSON_EXTRACT(m.payloadJson,'$.provenance.source.observationHash')))=64) AS providerProof
      FROM FootballFixture f FORCE INDEX (FootballFixture_kickoff_idx)
      JOIN FootballSeason s ON s.id=f.seasonId JOIN FootballCompetition l ON l.id=s.competitionId
      LEFT JOIN PredictionCycle c ON c.id=f.activeCycleId AND c.fixtureId=f.id
      JOIN MarketPrediction m ON m.setId=${displayedSet} AND m.available=1
      WHERE ${choices} ORDER BY m.setId,m.family`);
    const coverage = await storedFeedCoverage(tx, range);
    const picks = groupBy(markets, ({ setId }) => setId);
    const occurrences = fixtures.map((row) => {
      const kickoffAt = row.kickoffAt.getTime(), effectiveCutoffAt = Math.min(row.cutoffAt.getTime(),
        row.barrierAt?.getTime() ?? Infinity, row.closedAt?.getTime() ?? Infinity);
      const published = picks.get(row.sourceRevisionId ?? "") ?? [];
      const sourcePublishedAt = row.sourcePublishedAt?.getTime() ?? null;
      return { fixtureId: row.fixtureId, kickoffAt, status: row.status, cycleId: row.cycleId, cycleState: row.cycleState,
        scheduleVersion: row.scheduleVersion === null ? null : Number(row.scheduleVersion), effectiveCutoffAt,
        scheduleProofAt: row.scheduleProofAt?.getTime() ?? null,
        scheduleKnownAtCutoff: row.scheduleProofAt !== null && row.scheduleProofAt.getTime() <= effectiveCutoffAt,
        catalogKnownAtCutoff: row.catalogCreatedAt.getTime() <= effectiveCutoffAt,
        date: getDateInTimeZone(utcInstantFromEpochMilliseconds(kickoffAt), novemberReplayZone), competitionId: row.competitionId,
        league: row.league, country: row.country, teams: [row.homeTeamId, row.awayTeamId], teamNames: [row.homeTeam, row.awayTeam],
        sourceRevisionId: row.sourceRevisionId, sourcePublishedAt, markets: published.map(({ family, source, retrievedAt, validSeal, providerProof }) => ({
          family, source, sealed: Boolean(validSeal), preCutoffProviderReceipt: Boolean(validSeal && providerProof && sourcePublishedAt !== null &&
            retrievedAt.getTime() <= sourcePublishedAt && sourcePublishedAt < effectiveCutoffAt),
        })),
      };
    });
    const identity = { zone: novemberReplayZone, range: range.window, auditedAt: asOf.getTime(), engineVersion: localGoalModelVersion(),
      registryVersion: LOCAL_FIRST_MARKET_REGISTRY_VERSION, featuredDecisionVersion: localFeaturedDecisionVersion,
      scope: evidenceFingerprint(scope), cohort: evidenceFingerprint(occurrences) };
    const byCompetition = Object.fromEntries([...groupBy(occurrences, ({ competitionId }) => competitionId)].map(([id, rows]) =>
      [id, { league: rows[0]!.league, country: rows[0]!.country, total: rows.length }]));
    const summary = { fixtures: occurrences.length, competitions: Object.keys(byCompetition).length,
      source: tally(occurrences.map(({ markets }) => [...new Set(markets.map(({ source }) => source))].sort().join("+") || "unforecast")),
      completeness: tally(occurrences.map(({ markets }) => String(markets.length))), status: tally(occurrences.map(({ status }) => status)),
      knownCatalogAtCutoff: occurrences.filter(({ catalogKnownAtCutoff }) => catalogKnownAtCutoff).length,
      knownCycleScheduleAtCutoff: occurrences.filter(({ scheduleKnownAtCutoff }) => scheduleKnownAtCutoff).length,
      sealedProviderFallbacks: occurrences.filter(({ markets }) => markets.some(({ preCutoffProviderReceipt }) => preCutoffProviderReceipt)).length,
      futureBeforeLock: occurrences.filter(({ status, effectiveCutoffAt }) => status === "scheduled" && effectiveCutoffAt > asOf.getTime()).length,
      authoritativeDates: coverage.filter(({ authoritative }) => authoritative).length };
    const teamNames = new Map(occurrences.flatMap(({ teams, teamNames }) => teams.map((id, index) => [id, teamNames[index]] as const)));
    const byTeam = Object.fromEntries(Object.entries(tally(occurrences.flatMap(({ teams }) => teams))).map(([id, total]) =>
      [id, { name: teamNames.get(id), total }]));
    return { ...identity, auditHash: evidenceFingerprint(identity), summary, coverage,
      byDate: tally(occurrences.map(({ date }) => date)), byCompetition, byTeam, occurrences };
  }, { isolationLevel: "RepeatableRead", maxWait: 5_000, timeout: 60_000 });
}
