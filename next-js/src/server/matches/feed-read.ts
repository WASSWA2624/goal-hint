import "server-only";
import { kickoffTimeWindows } from "../../domain/kickoff-time.ts";
import { completedFixtureStatuses } from "../../domain/market-settlement.ts";

import { addReportingDays, createPredictionWindow, type PredictionWindow, type ReportingDateRange, type ReportingDate } from "../../domain/calendar.ts";
import { isAnyProbability, probabilityFraction, type FeedQuery } from "../../domain/feed-query.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import type { StoredMatchFeedResponse } from "../../domain/match-feed.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { catalogScopeKey, parseCatalogImportRequest } from "../football/catalog-input.ts";
import { selectionRunWindow, storedSelectionManifest } from "../selection/selection-read.ts";
import { MatchFeedError } from "./feed-error.ts";
import type { FeedSearch } from "./feed-search.ts";

type Tx = Prisma.TransactionClient;
/** Shared indexed fixture cohort; aliases f/l/c denote fixture, competition and applicable cycle. */
export function publicFixtureScope(competitionIds: readonly number[], completedOnly = false) {
  return Prisma.sql`f.provider='api-football' AND (EXISTS (SELECT 1 FROM FootballCompetitionProvider cp WHERE cp.competitionId=l.id AND cp.provider='api-football' AND cp.externalId IN (${Prisma.join(competitionIds)}))
      OR (c.state IN ('closed','void') AND (c.lockedSetId IS NOT NULL OR c.currentSetId IS NOT NULL))
      OR (c.state='void' AND EXISTS (SELECT 1 FROM PredictionSet p WHERE p.cycleId=c.id)))
      ${completedOnly ? Prisma.sql`AND f.status IN (${Prisma.join(completedFixtureStatuses)})` : Prisma.empty}`;
}
export function publicFixtureCohortScope(range: ReportingDateRange, competitionIds: readonly number[], completedOnly = false) {
  return Prisma.sql`${publicFixtureScope(competitionIds, completedOnly)} AND f.kickoff>=${new Date(range.window.startInclusive)} AND f.kickoff<${new Date(range.window.endExclusive)}`;
}
/** Displayed revision for the applicable cycle: current while open, locked when closed, latest retained when void. */
export const displayedSet = Prisma.sql`CASE
      WHEN c.state='open' THEN c.currentSetId WHEN c.state='closed' THEN c.lockedSetId
      WHEN c.state='void' THEN COALESCE(c.lockedSetId,c.currentSetId,
        (SELECT p.id FROM PredictionSet p WHERE p.cycleId=c.id ORDER BY p.cycleRevision DESC LIMIT 1)) END`;

/** `providerOdds` is the caller's effective odds flag (publicPolicy.features.providerOdds unless an isolated test
 * overrides it), so the SQL join and filter always follow the same rule as the record prices. */
export function feedSql(query: FeedQuery, range: ReportingDateRange, competitionIds: readonly number[],
  providerOdds: boolean = publicPolicy.features.providerOdds, search: FeedSearch | null = null, completedOnly = false) {
  const markets = Prisma.join(query.markets);
  const hasDecision = Prisma.sql`rp.feedRecommendation IS NOT NULL`;
  const recommendedFamily = Prisma.sql`NULLIF(JSON_UNQUOTE(JSON_EXTRACT(rp.feedRecommendation,'$.family')),'null')`;
  const useRecommendation = Prisma.sql`(${hasDecision} AND (${recommendedFamily} IN (${markets})
    ${query.markets.length === publicPolicy.markets.length ? Prisma.sql`OR TRUE` : Prisma.empty}))`;
  const chosen = Prisma.sql`(${hasDecision} AND m.family=${recommendedFamily})`;
  const pickProbability = Prisma.sql`CASE WHEN ${chosen} THEN (JSON_UNQUOTE(JSON_EXTRACT(rp.feedRecommendation,
    '$.probability'))+0e0) ELSE m.selectedProbability END`;
  const pickSelection = Prisma.sql`CASE WHEN ${chosen} THEN JSON_UNQUOTE(JSON_EXTRACT(rp.feedRecommendation,
    '$.selection')) ELSE m.selection END`;
  const pickPrice = providerOdds ? Prisma.sql`CASE WHEN ${chosen} THEN FLOOR(CAST(JSON_UNQUOTE(JSON_EXTRACT(rp.feedRecommendation,
    '$.decimal')) AS DECIMAL(10,4))*100+0.5) ELSE op.displayHundredths END` : Prisma.sql`NULL`;
  // One shown pick per fixture: highest unrounded probability, then the exact fresh public price,
  // then policy order. Candidate odds remain unread while their public feature is disabled.
  const candidatePriceJoin = providerOdds ? Prisma.sql`LEFT JOIN FixtureOddsPrice bp ON bp.fixtureId=f.id
      AND bp.marketKey=b.family AND bp.selection=b.selection AND bp.stale=FALSE` : Prisma.empty;
  const candidatePriceOrder = providerOdds ? Prisma.sql`CASE WHEN ${hasDecision} THEN NULL ELSE bp.displayHundredths END DESC,` : Prisma.empty;
  // The cohort joins alone serve the known count and league options: each shown-pick join below matches a full primary
  // key, (setId, family) and (fixtureId, marketKey, selection), so it never adds or removes a cohort row.
  // The provider equality is low-selectivity across a season archive. Keep this
  // date-bounded read on the kickoff index instead of scanning every provider row.
  const fixtureRelations = Prisma.sql`JOIN FootballSeason s ON s.id=f.seasonId JOIN FootballCompetition l ON l.id=s.competitionId
    LEFT JOIN PredictionCycle c ON c.id=f.activeCycleId AND c.fixtureId=f.id`;
  const cohortJoins = Prisma.sql`FROM FootballFixture f FORCE INDEX (FootballFixture_kickoff_idx) ${fixtureRelations}`;
  const timeWindows = query.time ? kickoffTimeWindows(range, query.time) : null;
  const days = query.time ? kickoffTimeWindows(range, { ...query.time, from: "00:00", to: "23:59" }) : null;
  const inWindows = (windows: { start: number; end: number }[]) => windows.length
    ? Prisma.sql`(${Prisma.join(windows.map((window) => Prisma.sql`(f.kickoff>=${new Date(window.start)} AND f.kickoff<${new Date(window.end)})`), " OR ")})`
    : Prisma.sql`FALSE`;
  const scope = days ? Prisma.sql`${publicFixtureScope(competitionIds, completedOnly)} AND ${inWindows(days)}` : publicFixtureCohortScope(range, competitionIds, completedOnly);
  const filters: Prisma.Sql[] = [scope];
  if (timeWindows) filters.push(inWindows(timeWindows));
  if (query.leagues.length > 0) filters.push(Prisma.sql`l.id IN (${Prisma.join(query.leagues)})`);
  if (query.countries.length > 0) filters.push(Prisma.sql`l.country IN (${Prisma.join(query.countries)})`);
  if (query.status !== "all") filters.push(query.status === "finished"
    ? Prisma.sql`f.status IN ('finished-regulation','finished-extra-time','finished-penalties')` : Prisma.sql`f.status=${query.status}`);
  const cohortFilters = [...filters];
  // Rank a date-bounded set in one pass instead of running a sorting subquery
  // for every fixture in a large historical range. LIMIT/page never enters it.
  const joinsForFixtures = (ids?: readonly string[]) => {
    const fixtures = ids ? Prisma.sql`AND f.id IN (${Prisma.join(ids)})` : Prisma.empty;
    const source = ids ? Prisma.sql`FROM FootballFixture f FORCE INDEX (PRIMARY) ${fixtureRelations}` : cohortJoins;
    const ranked = Prisma.sql`SELECT STRAIGHT_JOIN f.id AS fixtureId,b.setId,b.family,
    ROW_NUMBER() OVER (PARTITION BY f.id ORDER BY b.selectedProbability DESC,
      ${candidatePriceOrder} FIELD(b.family,${Prisma.join(publicPolicy.markets)}) ASC) AS pickRank
    ${source} LEFT JOIN PredictionSet rp ON rp.id=${displayedSet}
    JOIN MarketPrediction b FORCE INDEX (MarketPrediction_feed_choice_idx) ON b.setId=rp.id AND CASE WHEN ${useRecommendation} THEN b.family=${recommendedFamily}
      ELSE b.family IN (${markets}) AND b.available=TRUE END
    ${candidatePriceJoin} ${searchJoin} WHERE ${Prisma.join(cohortFilters, " AND ")} ${fixtures}`;
    return Prisma.sql`${source}
    LEFT JOIN PredictionSet rp ON rp.id=${displayedSet}
    LEFT JOIN (${ranked}) picked ON picked.fixtureId=f.id AND picked.pickRank=1
    LEFT JOIN MarketPrediction m USE INDEX (MarketPrediction_feed_choice_idx) ON m.setId=picked.setId AND m.family=picked.family
    ${providerOdds ? Prisma.sql`LEFT JOIN FixtureOddsPrice op ON op.fixtureId=f.id AND op.marketKey=m.family
      AND op.selection=${pickSelection} AND op.stale=FALSE` : Prisma.empty}`;
  };
  if (query.picks === "only") filters.push(Prisma.sql`m.available=TRUE`);
  if (!isAnyProbability(query.probability)) {
    // Inclusive unrounded bounds. Decimal-text scaling avoids introducing an arithmetic rounding error at equality.
    filters.push(Prisma.sql`m.available=TRUE AND ${pickProbability}>=${probabilityFraction(query.probability.min)}
      AND ${pickProbability}<=${probabilityFraction(query.probability.max)}`);
  }
  // Inclusive bounds on the shown pick's own stored two-place price. A fixture without a fresh price for exactly
  // that family and selection drops out through NULL semantics; another family's price never qualifies it.
  // Odds stay unread while provider odds are not public, so the feed never depends on the odds tables then
  // (parseFeedQuery already rejects `odds` in that case; this guard keeps a hand-built query from joining).
  if (query.odds && providerOdds) filters.push(Prisma.sql`m.available=TRUE AND ${pickPrice} BETWEEN ${query.odds.min} AND ${query.odds.max}`);
  let searchJoin = Prisma.empty, exact: Prisma.Sql | null = null, ranking: Prisma.Sql | null = null;
  if (query.search) {
    if (!search || search.query !== query.search) throw new MatchFeedError("unavailable");
    // No matching identity is an ordinary empty result; masks need 1–16 words.
    if (search.teams.length + search.competitions.length === 0) { filters.push(Prisma.sql`FALSE`); cohortFilters.push(Prisma.sql`FALSE`); }
    else if (!Number.isInteger(search.words) || search.words < 1 || search.words > feedSearchWords) throw new MatchFeedError("unavailable");
    else {
      const matched = searchMatches(search, range);
      searchJoin = matched.join;
      filters.push(matched.stands);
      cohortFilters.push(matched.stands);
      exact = matched.exact;
      ranking = matched.order;
    }
  }
  const descending = query.sort.direction === "desc";
  const order = query.sort.by === "probability"
    ? Prisma.sql`${pickProbability} IS NULL ASC, ${pickProbability} ${descending ? Prisma.sql`DESC` : Prisma.sql`ASC`}, f.kickoff ASC, f.id ASC`
    : descending ? Prisma.sql`f.kickoff DESC, f.id DESC` : Prisma.sql`f.kickoff ASC, f.id ASC`;
  // `searchJoin` belongs to the filtered reads only: known counts and league options keep the whole date cohort.
  // Availability counts and kickoff pagination need only the existence of an
  // eligible pick. They do not need probability/price ranking across the cohort.
  const joins = joinsForFixtures();
  const countJoins = isAnyProbability(query.probability) && !query.odds ? Prisma.sql`${cohortJoins}
    LEFT JOIN PredictionSet rp ON rp.id=${displayedSet}
    LEFT JOIN MarketPrediction m USE INDEX (MarketPrediction_feed_choice_idx) ON m.setId=rp.id
      AND m.family=CASE WHEN ${useRecommendation} THEN ${recommendedFamily} ELSE (
        SELECT b.family FROM MarketPrediction b FORCE INDEX (MarketPrediction_feed_choice_idx)
        WHERE b.setId=rp.id AND b.family IN (${markets}) AND b.available=TRUE LIMIT 1) END` : joins;
  return { joins, countJoins, pageJoins: query.sort.by === "kickoff" ? countJoins : joins, joinsForFixtures, cohortJoins, cohortWhere: Prisma.join(cohortFilters, " AND "), searchJoin, scope, where: Prisma.join(filters, " AND "), order: ranking ? Prisma.sql`${ranking}, ${order}` : order,
    exact, pickProbability, pickSelection };
}

const feedSearchWords = 16;
/** Per-fixture search coverage. Each identity packs its relevance and word masks into one integer (bits 0–15 words its
 * names cover, 16–31 words they match directly, 32–47 words covered by a name rather than a country, 48+ relevance), so
 * one derived row per candidate fixture carries its home, away and competition values and the outer query ORs them:
 * - a fixture qualifies when its names together cover every word, or cover a distinctive word through a team or
 *   competition name ("Leeds" for "Leeds United", either team of "Barcelona vs Real Madrid"); a country alone never does;
 * - it is exact when every word is matched directly, otherwise a similar result;
 * - exact fixtures come first, then fixtures covering more words, then the best single relevance, then the chosen sort. */
function searchMatches(search: FeedSearch, range: ReportingDateRange) {
  const grouped = (identities: FeedSearch["teams"]) => {
    // Broad country/name matches share values. Grouped IN predicates avoid one CASE branch per club.
    const groups = new Map<bigint, string[]>();
    for (const { id, score, covered, direct, anchor } of identities) {
      const value = BigInt(score) << 48n | BigInt(anchor) << 32n | BigInt(direct) << 16n | BigInt(covered);
      const ids = groups.get(value);
      if (ids) ids.push(id); else groups.set(value, [id]);
    }
    return [...groups].sort(([left], [right]) => left > right ? -1 : left < right ? 1 : 0);
  };
  const packed = (field: Prisma.Sql, groups: ReturnType<typeof grouped>) => groups.length > 0
    ? Prisma.sql`CASE ${Prisma.join(groups.map(([value, ids]) => Prisma.sql`WHEN ${field} IN (${Prisma.join(ids)}) THEN ${value}`), " ")} ELSE 0 END`
    : Prisma.sql`0`;
  const teams = grouped(search.teams), competitions = grouped(search.competitions);
  const candidates: Prisma.Sql[] = [];
  if (search.teams.length > 0) {
    const ids = Prisma.join(search.teams.map((item) => item.id));
    candidates.push(Prisma.sql`sf.homeTeamId IN (${ids})`, Prisma.sql`sf.awayTeamId IN (${ids})`);
  }
  if (search.competitions.length > 0) candidates.push(Prisma.sql`ss.competitionId IN (${Prisma.join(search.competitions.map((item) => item.id))})`);
  const join = Prisma.sql`JOIN (SELECT sf.id AS fixtureId, ${packed(Prisma.sql`sf.homeTeamId`, teams)} AS home,
      ${packed(Prisma.sql`sf.awayTeamId`, teams)} AS away, ${packed(Prisma.sql`ss.competitionId`, competitions)} AS competition
    FROM FootballFixture sf JOIN FootballSeason ss ON ss.id=sf.seasonId
    WHERE sf.kickoff>=${new Date(range.window.startInclusive)} AND sf.kickoff<${new Date(range.window.endExclusive)}
      AND (${Prisma.join(candidates, " OR ")})) sm ON sm.fixtureId=f.id`;
  const all = 2 ** search.words - 1, mask = Prisma.sql`(sm.home | sm.away | sm.competition)`;
  const covered = Prisma.sql`(${mask} & ${all})`, direct = Prisma.sql`((${mask} >> 16) & ${all})`;
  const stands = search.distinctive === 0 ? Prisma.sql`${covered}=${all}`
    : Prisma.sql`(${covered}=${all} OR ((${mask} >> 32) & ${search.distinctive})<>0)`;
  const exact = Prisma.sql`${direct}=${all}`;
  return { join, stands, exact,
    order: Prisma.sql`${exact} DESC, BIT_COUNT(${covered}) DESC, GREATEST(sm.home >> 48, sm.away >> 48, sm.competition >> 48) DESC` };
}

/** Three batched reads cover the whole range (latest receipt per day, latest run attempt per day, and which of those
 * attempts stored a receipt), so long ranges cost the same number of round trips as one day. */
export async function storedFeedCoverage(tx: Tx, range: ReportingDateRange): Promise<StoredMatchFeedResponse["coverage"]["dates"]> {
  const days = Array.from({ length: range.dayCount }, (_, offset) => addReportingDays(range.startDate, offset));
  const scopeKeys = days.map((date) => catalogScopeKey({ kind: "fixtures", query: { date } }));
  // Rows arrive newest first, so the first row per day is that day's latest receipt or attempt.
  const receiptRows = await tx.footballImport.findMany({ where: { scopeKey: { in: scopeKeys } },
    select: { id: true, scopeKey: true, status: true, observedAt: true }, orderBy: [{ observedAt: "desc" }, { sequence: "desc" }] });
  const receipts = new Map<string, (typeof receiptRows)[number]>();
  for (const row of receiptRows) if (!receipts.has(row.scopeKey)) receipts.set(row.scopeKey, row);
  const attemptRows = await tx.dailyRunImport.findMany({ where: { eatDate: { in: days.map((date) => new Date(`${date}T00:00:00Z`)) } },
    orderBy: [{ run: { sequence: "desc" } }, { attempt: "desc" }] });
  const attempts = new Map<string, (typeof attemptRows)[number]>();
  for (const row of attemptRows) {
    const date = row.eatDate.toISOString().slice(0, 10);
    if (!attempts.has(date)) attempts.set(date, row);
  }
  const unmatched = days.flatMap((date, index) => {
    const attempt = attempts.get(date);
    return attempt && attempt.id !== receipts.get(scopeKeys[index]!)?.id ? [attempt.id] : [];
  });
  const stored = new Set(unmatched.length ? (await tx.footballImport.findMany({ where: { id: { in: unmatched } }, select: { id: true } }))
    .map((row) => row.id) : []);
  const dates: StoredMatchFeedResponse["coverage"]["dates"] = [];
  for (const [index, date] of days.entries()) {
    const receipt = receipts.get(scopeKeys[index]!), attempt = attempts.get(date);
    let status = receipt?.status ?? "unknown", observedAt = receipt?.observedAt.getTime() ?? null;
    if (attempt && attempt.id !== receipt?.id && !stored.has(attempt.id)) {
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
  window: PredictionWindow; run: StoredMatchFeedResponse["run"];
}>> {
  const row = await tx.dailyRun.findUnique({ where: { eatDate: new Date(`${today}T00:00:00Z`) } });
  const window = row ? selectionRunWindow(row) : createPredictionWindow(today);
  const result = (run: StoredMatchFeedResponse["run"]) => ({ window, run });
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

export async function storedFeedRun(tx: Tx, today: ReportingDate, range: ReportingDateRange): Promise<StoredMatchFeedResponse["run"]> {
  return (await storedFeedRunContext(tx, today, range)).run;
}
