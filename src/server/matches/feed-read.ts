import "server-only";
import { kickoffTimeWindows } from "../../domain/kickoff-time.ts";

import { addReportingDays, createPredictionWindow, type PredictionWindow, type ReportingDateRange, type ReportingDate } from "../../domain/calendar.ts";
import { isAnyProbability, probabilityFraction, type FeedQuery } from "../../domain/feed-query.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import type { MatchFeedResponse } from "../../domain/match-feed.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { catalogScopeKey, parseCatalogImportRequest } from "../football/catalog-input.ts";
import { oddsPriceJoin } from "../odds/odds-read.ts";
import { selectionRunWindow, storedSelectionManifest } from "../selection/selection-read.ts";
import { MatchFeedError } from "./feed-error.ts";
import type { FeedSearch } from "./feed-search.ts";

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
/** Displayed revision for the applicable cycle: current while open, locked when closed, latest retained when void. */
export const displayedSet = Prisma.sql`CASE
      WHEN c.state='open' THEN c.currentSetId WHEN c.state='closed' THEN c.lockedSetId
      WHEN c.state='void' THEN COALESCE(c.lockedSetId,c.currentSetId,
        (SELECT p.id FROM PredictionSet p WHERE p.cycleId=c.id ORDER BY p.cycleRevision DESC LIMIT 1)) END`;

/** `providerOdds` is the caller's effective odds flag (publicPolicy.features.providerOdds unless an isolated test
 * overrides it), so the SQL join and filter always follow the same rule as the record prices. */
export function feedSql(query: FeedQuery, range: ReportingDateRange, competitionIds: readonly number[],
  providerOdds: boolean = publicPolicy.features.providerOdds, search: FeedSearch | null = null) {
  const markets = Prisma.join(query.markets);
  // One shown pick per fixture: highest unrounded probability, then the exact fresh public price,
  // then policy order. Candidate odds remain unread while their public feature is disabled.
  const candidatePriceJoin = providerOdds ? Prisma.sql`LEFT JOIN FixtureOddsPrice bp ON bp.fixtureId=f.id
      AND bp.marketKey=b.family AND bp.selection=b.selection AND bp.stale=FALSE` : Prisma.empty;
  const candidatePriceOrder = providerOdds ? Prisma.sql`bp.displayHundredths DESC,` : Prisma.empty;
  const joins = Prisma.sql`FROM FootballFixture f JOIN FootballTeam h ON h.id=f.homeTeamId JOIN FootballTeam a ON a.id=f.awayTeamId
    JOIN FootballSeason s ON s.id=f.seasonId JOIN FootballCompetition l ON l.id=s.competitionId
    LEFT JOIN PredictionCycle c ON c.id=f.activeCycleId AND c.fixtureId=f.id
    LEFT JOIN MarketPrediction m ON m.setId=${displayedSet} AND m.family=(SELECT b.family FROM MarketPrediction b
      ${candidatePriceJoin}
      WHERE b.setId=${displayedSet} AND b.family IN (${markets}) AND b.available=TRUE
      ORDER BY b.selectedProbability DESC, ${candidatePriceOrder} FIELD(b.family, ${Prisma.join(publicPolicy.markets)}) ASC LIMIT 1)
    ${providerOdds ? oddsPriceJoin : Prisma.empty}`;
  const timeWindows = query.time ? kickoffTimeWindows(range, query.time) : null;
  const days = query.time ? kickoffTimeWindows(range, { ...query.time, from: "00:00", to: "23:59" }) : null;
  const inWindows = (windows: { start: number; end: number }[]) => windows.length
    ? Prisma.sql`(${Prisma.join(windows.map((window) => Prisma.sql`(f.kickoff>=${new Date(window.start)} AND f.kickoff<${new Date(window.end)})`), " OR ")})`
    : Prisma.sql`FALSE`;
  const scope = days ? Prisma.sql`${publicFixtureScope(competitionIds)} AND ${inWindows(days)}` : publicFixtureCohortScope(range, competitionIds);
  const filters: Prisma.Sql[] = [scope];
  if (timeWindows) filters.push(inWindows(timeWindows));
  if (query.leagues.length > 0) filters.push(Prisma.sql`l.id IN (${Prisma.join(query.leagues)})`);
  if (query.countries.length > 0) filters.push(Prisma.sql`l.country IN (${Prisma.join(query.countries)})`);
  if (query.status !== "all") filters.push(query.status === "finished"
    ? Prisma.sql`f.status IN ('finished-regulation','finished-extra-time','finished-penalties')` : Prisma.sql`f.status=${query.status}`);
  if (query.picks === "only") filters.push(Prisma.sql`m.available=TRUE`);
  if (!isAnyProbability(query.probability)) {
    // Inclusive unrounded bounds. Decimal-text scaling avoids introducing an arithmetic rounding error at equality.
    filters.push(Prisma.sql`m.available=TRUE AND m.selectedProbability>=${probabilityFraction(query.probability.min)}
      AND m.selectedProbability<=${probabilityFraction(query.probability.max)}`);
  }
  // Inclusive bounds on the shown pick's own stored two-place price. A fixture without a fresh price for exactly
  // that family and selection drops out through NULL semantics; another family's price never qualifies it.
  // Odds stay unread while provider odds are not public, so the feed never depends on the odds tables then
  // (parseFeedQuery already rejects `odds` in that case; this guard keeps a hand-built query from joining).
  if (query.odds && providerOdds) filters.push(Prisma.sql`m.available=TRUE AND op.displayHundredths BETWEEN ${query.odds.min} AND ${query.odds.max}`);
  if (query.search) {
    if (!search || search.query !== query.search) throw new MatchFeedError("unavailable");
    const matches: Prisma.Sql[] = [];
    if (search.teams.length > 0) {
      const ids = Prisma.join(search.teams.map((item) => item.id));
      matches.push(Prisma.sql`h.id IN (${ids})`, Prisma.sql`a.id IN (${ids})`);
    }
    if (search.competitions.length > 0) matches.push(Prisma.sql`l.id IN (${Prisma.join(search.competitions.map((item) => item.id))})`);
    filters.push(matches.length > 0 ? Prisma.sql`(${Prisma.join(matches, " OR ")})` : Prisma.sql`FALSE`);
  }
  const descending = query.sort.direction === "desc";
  const order = query.sort.by === "probability"
    ? Prisma.sql`m.selectedProbability IS NULL ASC, m.selectedProbability ${descending ? Prisma.sql`DESC` : Prisma.sql`ASC`}, f.kickoff ASC, f.id ASC`
    : descending ? Prisma.sql`f.kickoff DESC, f.id DESC` : Prisma.sql`f.kickoff ASC, f.id ASC`;
  let rankedOrder = order;
  if (query.search && search && search.teams.length + search.competitions.length > 0) {
    // Broad country/name matches often share a score. Grouped IN predicates avoid one CASE branch per club.
    const grouped = (matches: FeedSearch["teams"]) => {
      const groups = new Map<number, string[]>();
      for (const { id, score } of matches) {
        const ids = groups.get(score);
        if (ids) ids.push(id); else groups.set(score, [id]);
      }
      return [...groups].sort(([left], [right]) => right - left);
    };
    const rank = (field: Prisma.Sql, groups: ReturnType<typeof grouped>) => groups.length > 0
      ? Prisma.sql`CASE ${Prisma.join(groups.map(([score, ids]) => Prisma.sql`WHEN ${field} IN (${Prisma.join(ids)}) THEN ${score}`), " ")} ELSE 0 END`
      : Prisma.sql`0`;
    const teams = grouped(search.teams), competitions = grouped(search.competitions);
    rankedOrder = Prisma.sql`GREATEST(${rank(Prisma.sql`h.id`, teams)}, ${rank(Prisma.sql`a.id`, teams)},
        ${rank(Prisma.sql`l.id`, competitions)}) DESC, ${order}`;
  }
  return { joins, scope, where: Prisma.join(filters, " AND "), order: rankedOrder };
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

/** The frozen current run authorizes its projection horizon; a deployment cannot extend an old seven-day run. */
export async function storedFeedRunContext(tx: Tx, today: ReportingDate, range: ReportingDateRange): Promise<Readonly<{
  window: PredictionWindow; run: MatchFeedResponse["run"];
}>> {
  const row = await tx.dailyRun.findUnique({ where: { eatDate: new Date(`${today}T00:00:00Z`) } });
  const window = row ? selectionRunWindow(row) : createPredictionWindow(today);
  const result = (run: MatchFeedResponse["run"]) => ({ window, run });
  if (range.window.endExclusive <= window.startInclusive || range.window.startInclusive >= window.endExclusive) return result(null);
  if (!row) return result({ id: null, sequence: null, date: today, phase: "not-started", total: null, completed: 0, terminal: 0, failed: 0, published: 0, partialCoverage: false, message: null });
  const manifest = await storedSelectionManifest(tx, row);
  if (!manifest) return result({ id: row.id, sequence: String(row.sequence), date: today, phase: "selecting", total: null, completed: 0, terminal: 0, failed: 0, published: 0, partialCoverage: false, message: null });
  const entries = await tx.runFixture.findMany({ where: { runId: row.id }, select: { fixtureId: true, cycleId: true, job: { select: { state: true } } } });
  const membership = new Set(manifest.entries.map((item) => `${item.fixtureId}:${item.cycleId}`));
  if (entries.length !== manifest.entries.length || new Set(entries.map((item) => `${item.fixtureId}:${item.cycleId}`)).size !== entries.length ||
    entries.some((item) => !membership.has(`${item.fixtureId}:${item.cycleId}`))) throw new MatchFeedError("unavailable");
  const completed = entries.filter((item) => item.job?.state === "succeeded").length;
  const failed = entries.filter((item) => item.job && ["failed", "expired"].includes(item.job.state)).length;
  const terminal = completed + failed;
  const published = await tx.predictionRefreshResult.count({ where: { runId: row.id, outcome: "published" } });
  return result({ id: row.id, sequence: String(row.sequence), date: today, phase: terminal < entries.length ? "updating" : manifest.partial || failed > 0 ? "partial" : "complete",
    total: entries.length, completed, terminal, failed, published, partialCoverage: manifest.partial, message: null });
}

export async function storedFeedRun(tx: Tx, today: ReportingDate, range: ReportingDateRange): Promise<MatchFeedResponse["run"]> {
  return (await storedFeedRunContext(tx, today, range)).run;
}
