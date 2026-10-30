"use client";

import { useState } from "react";
import type { FixtureSnapshot } from "@/domain/fixture-snapshot";
import type { AcceptedMarket, MarketFamily } from "@/domain/markets";
import { MatchCard } from "@/components/match/match-card";
import { MatchCardList } from "@/components/match/match-card-list";
import { ProbabilityLabel } from "@/components/match/probability-label";
import { Button } from "@/components/ui/controls";
import { Inline, MutedText, SectionHeading, Stack } from "@/components/ui/layout";

export type CardExample = { label: string; fixture: FixtureSnapshot; selectedFamily: MarketFamily };

export function CardPreview({ examples, boundary, equal }: {
  examples: CardExample[]; boundary: AcceptedMarket; equal: AcceptedMarket;
}) {
  const [family, setFamily] = useState<MarketFamily>("match-result");
  const [recovered, setRecovered] = useState(false);
  const [finish, setFinish] = useState<"finished-extra-time" | "finished-penalties" | null>(null);
  const [livePhase, setLivePhase] = useState(0);
  const liveClocks: NonNullable<FixtureSnapshot["liveClock"]>[] = [
    { phase: "second-half", minute: 67 }, { phase: "first-half", minute: 45, stoppageMinutes: 2 },
    { phase: "half-time", minute: 45 }, { phase: "second-half", minute: 90, stoppageMinutes: 4 },
    { phase: "extra-time", minute: 104 }, { phase: "extra-time", minute: 120, stoppageMinutes: 1 },
    { phase: "penalties", minute: 120 },
  ];
  return <Stack $gap="lg">
    <Inline>
      <Button id="change-family" onClick={() => setFamily(family === "match-result" ? "total-goals" : "match-result")}>Change first example market</Button>
      <Button id="recover-logo" onClick={() => setRecovered(true)}>Replace failed example logo URL</Button>
      <Button id="show-extra-time" aria-pressed={finish === "finished-extra-time"} onClick={() => setFinish("finished-extra-time")}>Show regulation score after extra time</Button>
      <Button id="show-penalties" aria-pressed={finish === "finished-penalties"} onClick={() => setFinish("finished-penalties")}>Show regulation score after penalties</Button>
      <Button id="next-live-phase" onClick={() => setLivePhase((livePhase + 1) % liveClocks.length)}>Next live clock example</Button>
    </Inline>
    <MatchCardList id="example-cards">
      {examples.map(({ label, fixture, selectedFamily }, index) => {
        const recoveredFixture = recovered && fixture.fixtureId === "card-broken" ? {
          ...fixture, dataVersion: "10", homeTeam: { ...fixture.homeTeam, logoUrl: "https://static.match-card.test/recovered.svg" },
        } : fixture;
        const displayed: FixtureSnapshot = index === 0 && finish ? {
          ...recoveredFixture, status: finish, scorePeriod: "regulation", dataVersion: finish === "finished-extra-time" ? "11" : "12",
        } : fixture.fixtureId === "card-pending" ? { ...recoveredFixture, dataVersion: `${recoveredFixture.dataVersion}-clock-${livePhase}`, liveClock: liveClocks[livePhase]! } : recoveredFixture;
        return <li key={fixture.fixtureId}><Stack $gap="sm">
          <MutedText>{label}</MutedText>
          <MatchCard fixture={displayed} analysisSlug="example-home-v-example-away"
            selectedFamily={index === 0 ? family : selectedFamily} eagerLogos={index < 2} position={index + 1} />
        </Stack></li>;
      })}
      <li><Stack $gap="sm">
        <MutedText>Example: Any market chooses the highest probability without borrowing another pick&apos;s odds</MutedText>
        <MatchCard fixture={{ ...examples[0]!.fixture, fixtureId: "card-any" }} analysisSlug="example-home-v-example-away" position={examples.length + 1} />
      </Stack></li>
    </MatchCardList>
    <section id="example-rounding"><Stack $gap="sm">
      <SectionHeading>Example: complete-group probability rounding</SectionHeading>
      <div id="equal-probabilities">
        <ProbabilityLabel market={equal} selection="home-win" />
        <ProbabilityLabel market={equal} selection="draw" />
        <ProbabilityLabel market={equal} selection="away-win" />
      </div>
      <div id="boundary-probabilities">
        <ProbabilityLabel market={boundary} selection="over-2.5" />
        <ProbabilityLabel market={boundary} selection="under-2.5" />
      </div>
    </Stack></section>
  </Stack>;
}
