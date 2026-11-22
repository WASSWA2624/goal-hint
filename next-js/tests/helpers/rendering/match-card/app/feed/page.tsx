import { MatchCard } from "@/components/match/match-card";
import { MatchCardList } from "@/components/match/match-card-list";
import { PerformanceSummary } from "@/components/performance/performance-summary";
import { Container, PageMain } from "@/components/ui/layout";
import { utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import type { FeaturedPrediction } from "@/domain/extended-markets";
import { parseFixtureSnapshot, type FixtureSnapshot } from "@/domain/fixture-snapshot";
import type { MarketFamily } from "@/domain/markets";
import examples from "../examples.json";

const example = (id: string) => parseFixtureSnapshot(examples.find(({ fixture }) => fixture.fixtureId === id)!.fixture);

export default function FeedCardExamples() {
  const live = example("card-pending"), final = example("card-unavailable"), pick = example("card-correct");
  const names = (fixture: FixtureSnapshot, home: string, away: string) => ({ ...fixture,
    homeTeam: { ...fixture.homeTeam, name: home }, awayTeam: { ...fixture.awayTeam, name: away } });
  const local = { ...pick, prices: [], forecast: pick.forecast && !("gated" in pick.forecast) ? {
    ...pick.forecast, markets: pick.forecast.markets.map((row) => ({ ...row, market: { ...row.market, source: "local-engine" as const } })),
  } : null };
  const kickoffAt = pick.kickoffAt!, generatedAt = utcInstantFromEpochMilliseconds(kickoffAt + 86_400_000);
  const homeUnder = { key: "goal:full-time:totals:home:5.5:binary", family: "total-goals", label: "Full time · Home team goals 5.5",
    code: "O/U 5.5", selection: "under", selectionLabel: "Under 5.5", probability: 0.96, source: "local-engine" } as const;
  const quote = { bookmakerId: 6, bookmakerName: "Synthetic second bookmaker", betId: 16, betName: "Total - Home", providerSelection: "Under 5.5",
    decimal: "1.1543", observedAt: kickoffAt - 360_000, checkedAt: kickoffAt - 360_000, providerUpdatedAt: null };
  const standard: FeaturedPrediction = { ...homeUnder, odds: quote.decimal, featuredExpectedNetReturn: "0.108128", featuredQuote: quote, tier: "standard" };
  const replay = { revisionId: "replayed-forecast", sourceRevisionId: pick.forecast!.revisionId,
    evidenceCutoffAt: utcInstantFromEpochMilliseconds(kickoffAt - 300_000), generatedAt, activatedAt: generatedAt,
    pick: { key: "goal:full-time:totals:away:5.5:binary", family: "total-goals" as const, label: "Full time · Away team goals 5.5",
      code: "O/U 5.5", selection: "under", selectionLabel: "Under 5.5", probability: 0.96, odds: null, source: "local-engine" as const } };
  const cases: { fixture: FixtureSnapshot; gated?: boolean; signedIn?: boolean; featured?: boolean; family?: MarketFamily }[] = [
    { fixture: { ...names(live, "Brighton", "Everton"), fixtureId: "feed-live", score: { home: 2, away: 1 } } },
    { fixture: { ...live, fixtureId: "feed-stoppage", liveClock: { phase: "second-half", minute: 90, stoppageMinutes: 4 } } },
    { fixture: { ...live, fixtureId: "feed-first-half-stoppage", liveClock: { phase: "first-half", minute: 45, stoppageMinutes: 2 } } },
    { fixture: { ...live, fixtureId: "feed-halftime", liveClock: { phase: "half-time", minute: null } } },
    { fixture: { ...names(final, "Lyon", "Lille"), fixtureId: "feed-aet", status: "finished-extra-time", score: { home: 1, away: 1 },
      scorePeriod: "regulation", phaseScores: { extraTime: { home: 2, away: 1 }, shootout: null } } },
    { fixture: { ...names(final, "KCCA", "Vipers SC"), fixtureId: "feed-pen", status: "finished-penalties", score: { home: 1, away: 1 },
      scorePeriod: "regulation", phaseScores: { extraTime: { home: 1, away: 1 }, shootout: { home: 3, away: 4 } } } },
    { fixture: { ...final, fixtureId: "feed-incomplete", status: "finished-extra-time", score: { home: 1, away: 1 }, scorePeriod: "regulation" } },
    { fixture: { ...local, fixtureId: "feed-missing-odds" } },
    { fixture: { ...example("card-delayed"), fixtureId: "feed-gated" }, gated: true, signedIn: false },
    { fixture: { ...pick, fixtureId: "feed-guest-completed" }, signedIn: false },
    { fixture: { ...example("card-delayed"), fixtureId: "feed-expired", forecast: null }, gated: true },
    { fixture: { ...pick, fixtureId: "feed-double-chance" }, family: "double-chance" },
    { fixture: { ...example("card-limited"), fixtureId: "feed-btts" }, family: "both-teams-to-score" },
    { fixture: { ...example("card-overdue"), fixtureId: "feed-overdue" } },
    { featured: true, fixture: { ...example("card-delayed"), fixtureId: "feed-upcoming", forecast: null } },
    { featured: true, fixture: { ...local, fixtureId: "feed-extended", status: "scheduled", score: null, featuredPrediction: standard } },
    { featured: true, fixture: { ...local, fixtureId: "feed-priced-fallback", status: "scheduled", score: null,
      featuredPrediction: { ...homeUnder, odds: "1.01", tier: "priced-fallback", featuredQuote: { ...quote, decimal: "1.01" }, featuredExpectedNetReturn: "-0.0304" } } },
    { featured: true, fixture: { ...local, fixtureId: "feed-forecast-only", status: "scheduled", score: null,
      featuredPrediction: { ...homeUnder, probability: 0.66, odds: null, tier: "forecast-only", forecastOnlyReason: "no-comparable-quote" } } },
    { featured: true, fixture: { ...local, fixtureId: "feed-frozen-lost", score: { home: 3, away: 2 }, featuredDecisionFrozen: true,
      featuredPrediction: { ...standard, key: "goal:full-time:totals:total:4.5:binary", code: "O/U 4.5", label: "Full time · Total goals 4.5", selectionLabel: "Under 4.5",
        featuredQuote: { ...quote, betId: 5, betName: "Goals Over/Under", providerSelection: "Under 4.5" }, settlementStatus: "incorrect" } } },
    { featured: true, fixture: { ...local, fixtureId: "feed-frozen-pending", featuredDecisionFrozen: true,
      featuredPrediction: { ...standard, settlementStatus: "pending" } } },
    { featured: true, fixture: { ...local, fixtureId: "feed-frozen-void", featuredDecisionFrozen: true,
      featuredPrediction: { ...standard, settlementStatus: "void" } } },
    { featured: true, fixture: { ...final, fixtureId: "feed-cancelled", status: "canceled", score: null, scorePeriod: null } },
    { featured: true, fixture: { ...local, fixtureId: "feed-featured-abstained", status: "scheduled", score: null,
      featuredPrediction: null } },
    { featured: true, fixture: { ...pick, fixtureId: "feed-replay-empty", retrospective: replay } },
    { featured: true, fixture: { ...pick, fixtureId: "feed-replay-live", status: "live", retrospective: { ...replay, pick: {
      ...replay.pick, odds: "1.9", historicalOdds: { bookmakerId: 8, bookmakerName: "Example Bookmaker", observedAt: generatedAt,
        providerUpdatedAt: utcInstantFromEpochMilliseconds(kickoffAt - 60_000) } } } } },
  ];

  return <PageMain><Container>
    <PerformanceSummary locale="en" kind="matches" counts={{ total: 5, won: 1, lost: 1, pending: 1, void: 1, cancelled: 1 }} />
    <section data-feed-match-results>
    <MatchCardList id="feed-card-examples">
      {cases.map(({ fixture, gated = false, signedIn = true, featured = false, family = "match-result" }) => <li key={fixture.fixtureId}>
        <MatchCard fixture={fixture} analysisSlug="example-home-v-away" selectedFamily={family} phoneFeed
          gated={gated} signedIn={signedIn} publishedMarket={featured} />
      </li>)}
    </MatchCardList>
    </section>
  </Container></PageMain>;
}
