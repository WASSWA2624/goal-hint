import assert from "node:assert/strict";
import test from "node:test";
import { addReportingDays, getReportingDate, utcInstantFromEpochMilliseconds } from "../src/domain/calendar.ts";
import { defaultSlipCriteria } from "../src/domain/slip-builder.ts";
import { getDatabase, disconnectDatabase } from "../src/server/database/client.ts";
import { getRuntimePolicy } from "../src/server/config/runtime-policy.ts";
import { demoFootballCatalog, demoFixtureOdds, DEMO_MATCHES_PER_DAY } from "../src/server/demo/api-football.ts";
import { ensureDemoDates, verifyDemoDatabase } from "../src/server/demo/seed.ts";
import { createMatchFeedService } from "../src/server/matches/feed-service.ts";
import { createMatchDetailService } from "../src/server/matches/detail-service.ts";
import { createMatchInsightsService } from "../src/server/matches/insights-service.ts";
import { createPerformanceService } from "../src/server/performance/performance-service.ts";
import { createStoredSlipBuild } from "../src/server/slips/public-slips.ts";
import { ensureDemoSlipDates } from "../src/server/demo/slips-seed.ts";
import { createPublishedSlips } from "../src/server/slips/published-slips.ts";

test("development demo uses the production MySQL projections across football pages and slips", {
  skip: process.env.DEMO_DATABASE_INTEGRATION !== "1", timeout: 480_000,
}, async (t) => {
  const database = getDatabase(), at = utcInstantFromEpochMilliseconds(Date.now()), today = getReportingDate(at), yesterday = addReportingDays(today, -1);
  // Each service invocation captures its own request clock. Holding the complete
  // multi-page integration at one old instant would conflict with a running live UI.
  const competitionIds = demoFootballCatalog.leagues.map((league) => league.id), clock = { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
  t.after(disconnectDatabase);
  assert.deepEqual(getRuntimePolicy().choices.competitionIds, competitionIds, "development uses the complete demo league scope");
  const coverage = await verifyDemoDatabase(database);
  assert.equal(coverage.days, 334); assert.equal(coverage.fixtures, 6_680); assert.equal(coverage.minimumPerDay, DEMO_MATCHES_PER_DAY);
  t.diagnostic("All 334 schedule dates contain 20 fixtures.");
  await ensureDemoDates(database, [today, yesterday], at);
  const feedService = createMatchFeedService({ database, competitionIds, clock });
  const feed = await feedService.query({ date: today, pageSize: "100", dir: "asc" });
  assert.equal(feed.state, "ready"); assert.equal(feed.total, DEMO_MATCHES_PER_DAY); assert.equal(feed.coverage.partial, false);
  assert.equal(feed.records.length, DEMO_MATCHES_PER_DAY); assert.equal(feed.leagues.length, DEMO_MATCHES_PER_DAY);
  assert.ok(feed.records.every((record) => record.forecast?.markets.length === 4 && !record.forecast.provisional && record.prices.length === 4));
  t.diagnostic("Normal feed contains complete forecast and price projections.");
  const previous = await feedService.query({ date: yesterday, pageSize: "100", dir: "asc" });
  assert.ok(previous.performance.won > 0); assert.ok(previous.performance.lost > 0);
  const record = previous.records.find((row) => row.status === "finished-regulation");
  assert.ok(record);
  const detail = await createMatchDetailService({ database, clock }).query(record.fixtureId);
  assert.ok(detail.snapshot); assert.equal(detail.snapshot.markets.length, 4); assert.equal(detail.history.revisions.entries.length, 1);
  assert.equal(detail.snapshot.analysis.state, "available"); assert.ok(detail.snapshot.analysis.reasons.length >= 2);
  assert.ok(detail.liveMatch?.statistics.items.length > 0); assert.ok(detail.liveMatch?.events.items.length > 0);
  assert.ok(detail.snapshot.outcomes.every((outcome) => outcome.status === "correct" || outcome.status === "incorrect"));
  const insights = await createMatchInsightsService({ database, clock }).query(record.fixtureId);
  // The curated schedule can have fewer than five prior results for either team.
  assert.ok(insights.sections.form.home.length <= 5); assert.ok(insights.sections.form.away.length <= 5);
  assert.ok(insights.sections.stats.evidence.length > 0); assert.ok(insights.sections.players.players.length >= 22);
  assert.equal(insights.sections.lineups.home?.starters.length, 11); assert.equal(insights.sections.lineups.away?.starters.length, 11);
  assert.ok(insights.sections.news.items.length >= 3);
  t.diagnostic("Detail, settlement history and all insight sections contain stored data.");
  const performance = await createPerformanceService({ database, competitionIds, clock }).query(new URLSearchParams({ from: yesterday, to: yesterday }));
  assert.equal(performance.cohort.fixtureCount, DEMO_MATCHES_PER_DAY);
  assert.ok(performance.cells.some((cell) => cell.coverage.settled > 0)); assert.equal(performance.leagues.totalGroups, DEMO_MATCHES_PER_DAY);
  t.diagnostic("Normal performance aggregation includes all 20 fixtures.");
  const tomorrow = addReportingDays(today, 1);
  await ensureDemoDates(database, [tomorrow], at);
  const slip = await createStoredSlipBuild({ database: () => database, competitionIds: () => competitionIds, consume: async () => {} })(
    { ...defaultSlipCriteria(tomorrow), dateTo: tomorrow }, clock);
  assert.equal(slip.state, "generated"); assert.ok(slip.data.slips.length > 0);
  assert.ok(slip.data.slips.every((entry) => entry.selections.length > 0 && entry.selections.every((selection) => selection.forecast)));
  const quote = slip.data.slips[0].selections[0];
  const fixture = await database.query((tx) => tx.footballFixture.findUniqueOrThrow({ where: { id: quote.fixtureId }, select: { externalId: true } }));
  const labels = { "home-win": "Home", draw: "Draw", "away-win": "Away", "home-or-draw": "Home/Draw", "away-or-draw": "Draw/Away",
    "home-or-away": "Home/Away", "over-2.5": "Over 2.5", "under-2.5": "Under 2.5", yes: "Yes", no: "No" };
  const betIds = { "match-result": 1, "double-chance": 12, "total-goals": 5, "both-teams-to-score": 8 };
  const raw = demoFixtureOdds(Number(fixture.externalId), at, 8, betIds[quote.family]);
  assert.equal(quote.odds, raw.bookmakers[0].bets[0].values.find((value) => value.value === labels[quote.selection]).odd,
    "slip prices come from the exact corresponding raw demo bookmaker market");
  t.diagnostic("Normal slip builder generates selections with exact raw bookmaker prices.");
  const [provenance] = await database.query((tx) => tx.$queryRaw`SELECT COUNT(*) AS mismatches FROM FixtureOddsPrice p
    JOIN FootballFixture f ON f.id=p.fixtureId JOIN ProviderOddsSnapshot s ON s.id=p.snapshotId
    WHERE f.eatDate=${new Date(`${tomorrow}T00:00:00Z`)}
      AND (p.retrievedAt<>s.retrievedAt OR NOT (p.providerUpdatedAt<=>s.providerUpdatedAt))`);
  assert.equal(Number(provenance.mismatches), 0, "fresh quote clocks retain their exact immutable source observation");
  await ensureDemoSlipDates(database, [today, yesterday], at);
  const published = createPublishedSlips(database), best = await published.day(today);
  assert.ok(best); assert.equal(best.state, "generated"); assert.ok(best.slips.length > 0);
  assert.ok(best.slips.every((entry) => Number(entry.totalOdds) >= 1.5 && Number(entry.totalOdds) <= 100));
  const publishedHistory = await published.history({ from: yesterday, to: yesterday, page: 1, pageSize: 10 });
  assert.ok(publishedHistory.records.length > 0); assert.ok(publishedHistory.statistics.total > 0);
  t.diagnostic("Best Slips use original stored publications, with up to 20 slips in each odds band.");
});
