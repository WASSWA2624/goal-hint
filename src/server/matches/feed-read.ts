import "server-only";

import { addReportingDays, type ReportingDateRange, type ReportingDate } from "../../domain/calendar.ts";
import type { FeedQuery } from "../../domain/feed-query.ts";
import type { MatchFeedResponse } from "../../domain/match-feed.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { catalogScopeKey, normalizeCatalogSearch, parseCatalogImportRequest } from "../football/catalog-input.ts";
import { storedSelectionManifest } from "../selection/selection-read.ts";
import { MatchFeedError } from "./feed-error.ts";

type Tx = Prisma.TransactionClient;
/** Shared indexed fixture cohort; aliases f/l/c denote fixture, competition and applicable cycle. */
export function publicFixtureScope(competitionIds: readonly number[]) {
  return Prisma.sql`f.provider='api-football' AND (EXISTS (SELECT 1 FROM FootballCompetitionProvider cp WHERE cp.competitionId=l.id AND cp.provider='api-football' AND cp.externalId IN (${Prisma.join(competitionIds)}))
      OR (c.state IN ('closed','void') AND (c.lockedSetId IS NOT NULL OR c.currentSetId IS NOT NULL))
      OR (c.state='void' AND EXISTS (SELECT 1 FROM PredictionSet p WHERE p.cycleId=c.id)))`;
}
export function publicFixtureCohortScope(range: ReportingDateRange, competitionIds: readonly number[]) {
  return Prisma.sql`${publicFixtureScope(competitionIds)} AND f.kickoff>=${new Date(range.window.startInclusive)} AND f.kickoff<${new Date(range.window.endExclusive)}`;
}
export function feedSql(query: FeedQuery, range: ReportingDateRange, competitionIds: readonly number[]) {
  const joins = Prisma.sql`FROM FootballFixture f JOIN FootballTeam h ON h.id=f.homeTeamId JOIN FootballTeam a ON a.id=f.awayTeamId
    JOIN FootballSeason s ON s.id=f.seasonId JOIN FootballCompetition l ON l.id=s.competitionId
    LEFT JOIN PredictionCycle c ON c.id=f.activeCycleId AND c.fixtureId=f.id
    LEFT JOIN MarketPrediction m ON m.family=${query.market} AND m.setId=CASE
      WHEN c.state='open' THEN c.currentSetId WHEN c.state='closed' THEN c.lockedSetId
      WHEN c.state='void' THEN COALESCE(c.lockedSetId,c.currentSetId,
        (SELECT p.id FROM PredictionSet p WHERE p.cycleId=c.id ORDER BY p.cycleRevision DESC LIMIT 1)) END`;
  const scope = publicFixtureCohortScope(range, competitionIds);
  const filters: Prisma.Sql[] = [scope];
  if (query.league) filters.push(Prisma.sql`l.id=${query.league}`);
  if (query.status !== "all") filters.push(query.status === "finished"
    ? Prisma.sql`f.status IN ('finished-regulation','finished-extra-time','finished-penalties')` : Prisma.sql`f.status=${query.status}`);
  if (query.search) {
    // Match %, _ and the escape character literally. Values never become SQL.
    const pattern = `%${normalizeCatalogSearch(query.search).replace(/[!%_]/gu, "!$&")}%`;
    filters.push(Prisma.sql`(h.nameSearch LIKE ${pattern} ESCAPE '!' OR h.countrySearch LIKE ${pattern} ESCAPE '!'
      OR a.nameSearch LIKE ${pattern} ESCAPE '!' OR a.countrySearch LIKE ${pattern} ESCAPE '!'
      OR l.nameSearch LIKE ${pattern} ESCAPE '!' OR l.countrySearch LIKE ${pattern} ESCAPE '!'
      OR EXISTS (SELECT 1 FROM FootballTeamAlias t WHERE t.teamId=h.id AND t.normalizedSearch LIKE ${pattern} ESCAPE '!')
      OR EXISTS (SELECT 1 FROM FootballTeamAlias t WHERE t.teamId=a.id AND t.normalizedSearch LIKE ${pattern} ESCAPE '!')
      OR EXISTS (SELECT 1 FROM FootballCompetitionAlias ca WHERE ca.competitionId=l.id AND ca.normalizedSearch LIKE ${pattern} ESCAPE '!'))`);
  }
  return { joins, scope, where: Prisma.join(filters, " AND "), order: query.sort.by === "probability"
    ? Prisma.sql`CASE WHEN m.available=TRUE THEN m.selectedProbability ELSE NULL END IS NULL ASC,
        CASE WHEN m.available=TRUE THEN m.selectedProbability ELSE NULL END DESC, f.kickoff ASC, f.id ASC`
    : Prisma.sql`f.kickoff ASC, f.id ASC` };
}

export async function storedFeedCoverage(tx: Tx, range: ReportingDateRange): Promise<MatchFeedResponse["coverage"]["dates"]> {
  const dates: MatchFeedResponse["coverage"]["dates"] = [];
  for (let offset = 0; offset < range.dayCount; offset++) {
    const date = addReportingDays(range.startDate, offset), scopeKey = catalogScopeKey({ kind: "fixtures", query: { date } });
    const receipt = await tx.footballImport.findFirst({ where: { scopeKey }, orderBy: [{ observedAt: "desc" }, { sequence: "desc" }] });
    const attempt = await tx.dailyRunImport.findFirst({ where: { eatDate: new Date(`${date}T00:00:00Z`) }, orderBy: [{ run: { sequence: "desc" } }, { attempt: "desc" }] });
    let status = receipt?.status ?? "unknown", observedAt = receipt?.observedAt.getTime() ?? null;
    if (attempt && attempt.id !== receipt?.id && !await tx.footballImport.findUnique({ where: { id: attempt.id }, select: { id: true } })) {
      const request = parseCatalogImportRequest(attempt.requestJson);
      if (attempt.finishedAt === null && (observedAt === null || observedAt < request.bounds.deadlineAt)) status = "pending";
      else if (attempt.failure !== null && attempt.finishedAt !== null && (observedAt === null || attempt.finishedAt.getTime() >= observedAt)) {
        status = "failed"; observedAt = attempt.finishedAt.getTime();
      }
    }
    if (!["complete", "partial", "degraded", "failed", "unknown", "pending"].includes(status)) throw new MatchFeedError("unavailable");
    dates.push({ date, status: status as typeof dates[number]["status"], observedAt, authoritative: status === "complete" });
  }
  return dates;
}

export async function storedFeedRun(tx: Tx, today: ReportingDate, range: ReportingDateRange): Promise<MatchFeedResponse["run"]> {
  if (range.endDate < today || range.startDate > addReportingDays(today, 6)) return null;
  const row = await tx.dailyRun.findUnique({ where: { eatDate: new Date(`${today}T00:00:00Z`) } });
  if (!row) return { id: null, sequence: null, date: today, phase: "not-started", total: null, completed: 0, terminal: 0, failed: 0, published: 0, partialCoverage: false, message: null };
  const manifest = await storedSelectionManifest(tx, row);
  if (!manifest) return { id: row.id, sequence: String(row.sequence), date: today, phase: "selecting", total: null, completed: 0, terminal: 0, failed: 0, published: 0, partialCoverage: false, message: null };
  const entries = await tx.runFixture.findMany({ where: { runId: row.id }, select: { fixtureId: true, cycleId: true, job: { select: { state: true } } } });
  const membership = new Set(manifest.entries.map((item) => `${item.fixtureId}:${item.cycleId}`));
  if (entries.length !== manifest.entries.length || new Set(entries.map((item) => `${item.fixtureId}:${item.cycleId}`)).size !== entries.length ||
    entries.some((item) => !membership.has(`${item.fixtureId}:${item.cycleId}`))) throw new MatchFeedError("unavailable");
  const completed = entries.filter((item) => item.job?.state === "succeeded").length;
  const failed = entries.filter((item) => item.job && ["failed", "expired"].includes(item.job.state)).length;
  const terminal = completed + failed;
  const published = await tx.predictionRefreshResult.count({ where: { runId: row.id, outcome: "published" } });
  return { id: row.id, sequence: String(row.sequence), date: today, phase: terminal < entries.length ? "updating" : manifest.partial || failed > 0 ? "partial" : "complete",
    total: entries.length, completed, terminal, failed, published, partialCoverage: manifest.partial, message: null };
}
