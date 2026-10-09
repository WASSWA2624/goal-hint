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
  return <Stack $gap="lg">
    <Inline>
      <Button id="change-family" onClick={() => setFamily(family === "match-result" ? "total-goals" : "match-result")}>Change first example market</Button>
      <Button id="recover-logo" onClick={() => setRecovered(true)}>Replace failed example logo URL</Button>
    </Inline>
    <MatchCardList id="example-cards">
      {examples.map(({ label, fixture, selectedFamily }, index) => {
        const displayed = recovered && fixture.fixtureId === "card-broken" ? {
          ...fixture, dataVersion: "10", homeTeam: { ...fixture.homeTeam, logoUrl: "https://static.match-card.test/recovered.svg" },
        } : fixture;
        return <li key={fixture.fixtureId}><Stack $gap="sm">
          <MutedText>{label}</MutedText>
          <MatchCard fixture={displayed} analysisSlug="example-home-v-example-away"
            selectedFamily={index === 0 ? family : selectedFamily} eagerLogos={index < 2} />
        </Stack></li>;
      })}
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
