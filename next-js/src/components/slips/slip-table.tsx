"use client";

import { useId } from "react";
import { MatchCard } from "@/components/match/match-card";
import { MatchCardList } from "@/components/match/match-card-list";
import { canonicalMatchSlug } from "@/domain/match-slug";
import { slipSelectionCard } from "@/domain/slip-card";
import type { BuiltSlip } from "@/domain/slip-builder";
import { independentSlipProbability } from "@/domain/slip-probability";
import type { SavedSlipView } from "@/domain/saved-slips";
import { createMessages } from "@/i18n/messages";
import { SlipProbabilityNote } from "./slip-styles";
import { SlipDisclosure } from "./slip-disclosure";
import { SlipSummaryFacts } from "./slip-summary-facts";

/** Slip summaries retain their own facts; every match uses the shared responsive match card. */
export function SlipTable({ slip, index, locale, estimatedProbability, results, collapsible = false }: {
  slip: BuiltSlip; index: number; locale: string; estimatedProbability?: number; results?: SavedSlipView["results"]; collapsible?: boolean;
}) {
  const messages = createMessages(locale), headingId = useId();
  const independentEstimate = estimatedProbability === undefined;
  const combinedProbability = estimatedProbability ?? independentSlipProbability(slip.selections);
  return <SlipDisclosure slipId={slip.id} locale={locale} collapsible={collapsible} summary={<>
      <h3 id={headingId}>{messages.text("slips.slipTitle", { number: messages.number(index + 1) })}</h3>
      {index === 0 && <span data-slip-rank>{messages.text("slips.topRanked")}</span>}
      <SlipSummaryFacts locale={locale} totalOdds={slip.totalOdds} probability={combinedProbability}
        selectionCount={slip.selections.length} averageProbability={slip.averageProbability} independentEstimate={independentEstimate} />
    </>}>
    {independentEstimate && <SlipProbabilityNote>{messages.text("slips.independentProbabilityHint")}</SlipProbabilityNote>}
    <MatchCardList locale={locale} aria-labelledby={headingId} rowNumberMaximum={slip.selections.length} showPredictionDefinitions={false}>
      {slip.selections.map((selection, selectionIndex) => {
        const card = slipSelectionCard(selection, results?.find((item) => item.fixtureId === selection.fixtureId));
        return <li key={selection.fixtureId} data-slip-selection={selection.fixtureId}>
          <MatchCard {...card} locale={locale} headingLevel={4} position={selectionIndex + 1}
            analysisSlug={canonicalMatchSlug(selection.homeTeam.name, selection.awayTeam.name)} />
        </li>;
      })}
    </MatchCardList>
  </SlipDisclosure>;
}
