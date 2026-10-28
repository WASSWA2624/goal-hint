import { MatchCard } from "@/components/match/match-card";
import { MatchCardList } from "@/components/match/match-card-list";
import { SlipTable } from "@/components/slips/slip-table";
import { PageHeading, PageMain, Stack } from "@/components/ui/layout";
import type { FixtureSnapshot } from "@/domain/fixture-snapshot";
import { slipSelectionCard } from "@/domain/slip-card";
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
  return <PageMain><Stack $gap="sm"><PageHeading>Saved selection boundaries</PageHeading>
    <MatchCardList>{cases.map(({ id, props }, index) => <li key={id}>
      <MatchCard {...props} fixture={{ ...props.fixture, fixtureId: id }} locale="en" analysisSlug="synthetic-preview" position={index + 1} />
    </li>)}</MatchCardList>
    <section data-compact-snapshot>
      <SlipTable locale="en" index={0} slip={{ id: "compact-snapshot", totalOdds: selection.odds,
        oddsBasis: selection.oddsBasis, averageProbability: selection.probability,
        selections: [{ ...selection, fixtureId: "snapshot-compact-authorized" }] }}
        results={[{ fixtureId: "snapshot-compact-authorized", home: 2, away: 1, outcome: "incorrect" }]} />
    </section>
  </Stack></PageMain>;
}
