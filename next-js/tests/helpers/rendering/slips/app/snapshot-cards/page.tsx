import { MatchCard } from "@/components/match/match-card";
import { MatchCardList } from "@/components/match/match-card-list";
import { SlipCard } from "@/components/slips/slip-card";
import { PageHeading, PageMain, Stack } from "@/components/ui/layout";
import type { FixtureSnapshot } from "@/domain/fixture-snapshot";
import { slipSelectionCard } from "@/domain/slip-card";
import type { SlipMatchState } from "@/domain/slip-match-state";
import { syntheticBuild, now } from "../stored";

/** Synthetic display-boundary checks only. Public slip transports never receive a private snapshotPick. */
export default function Page() {
  const original = syntheticBuild().data!.slips[0]!.selections[0]!;
  const selection = { ...original, family: "match-result" as const, selection: "home-win" as const, probability: 0.2345, odds: "7.73" };
  const card = slipSelectionCard(selection, { fixtureId: selection.fixtureId, home: 2, away: 1, outcome: "incorrect" });
  const redacted: FixtureSnapshot = { ...card.fixture, cycleId: "synthetic-cycle", forecast: {
    gated: true, runId: "synthetic-run", revisionId: "synthetic-revision", publishedAt: now,
    families: [selection.family], probabilities: [],
  } };
  const cases = [
    { id: "snapshot-authorized", props: card },
    { id: "snapshot-gated", props: { ...card, gated: true } },
    { id: "snapshot-redacted", props: { ...card, fixture: redacted } },
    { id: "snapshot-offline", props: { ...card, offline: true } },
  ];
  const liveClocks: NonNullable<SlipMatchState["liveClock"]>[] = [
    { phase: "second-half", minute: 67 }, { phase: "half-time", minute: 45 },
    { phase: "first-half", minute: 45, stoppageMinutes: 2 }, { phase: "second-half", minute: 90, stoppageMinutes: 4 },
    { phase: "extra-time", minute: 104 }, { phase: "extra-time", minute: 120, stoppageMinutes: 1 },
    { phase: "penalties", minute: 120 },
  ];
  const liveSelections = ["live-minute", "live-break", "live-first-added", "live-second-added", "live-extra", "live-extra-added", "live-penalties"].map((fixtureId) => ({ ...selection, fixtureId }));
  const liveStates = liveSelections.map((leg, index): SlipMatchState => ({
    fixtureId: leg.fixtureId, family: leg.family, selection: leg.selection,
    ...(leg.forecast ? { forecast: leg.forecast } : {}), status: "live", outcome: "pending",
    score: { home: 1, away: 0 }, liveClock: liveClocks[index]!,
  }));
  return <PageMain><Stack $gap="sm"><PageHeading>Saved selection boundaries</PageHeading>
    <MatchCardList>{cases.map(({ id, props }, index) => <li key={id}>
      <MatchCard {...props} fixture={{ ...props.fixture, fixtureId: id }} locale="en" analysisSlug="synthetic-preview" position={index + 1} />
    </li>)}</MatchCardList>
    <section data-compact-snapshot>
      <SlipCard locale="en" index={0} slip={{ id: "compact-snapshot", totalOdds: selection.odds,
        oddsBasis: selection.oddsBasis, averageProbability: selection.probability,
        selections: [{ ...selection, fixtureId: "snapshot-compact-authorized" }] }}
        results={[{ fixtureId: "snapshot-compact-authorized", home: 2, away: 1, outcome: "incorrect" }]} />
    </section>
    <section data-live-snapshot>
      <SlipCard locale="en" index={1} slip={{ id: "live-progress", totalOdds: (Number(selection.odds) ** 2).toFixed(2),
        oddsBasis: selection.oddsBasis, averageProbability: selection.probability, selections: liveSelections }} matchStates={liveStates} />
    </section>
  </Stack></PageMain>;
}
