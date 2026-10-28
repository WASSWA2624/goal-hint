"use client";

import { useId } from "react";
import { MatchCard } from "@/components/match/match-card";
import { MatchCardList } from "@/components/match/match-card-list";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { canonicalMatchSlug } from "@/domain/match-slug";
import { slipSelectionCard } from "@/domain/slip-card";
import type { BuiltSlip } from "@/domain/slip-builder";
import { independentSlipProbability } from "@/domain/slip-probability";
import type { SavedSlipView } from "@/domain/saved-slips";
import { createMessages, type Messages } from "@/i18n/messages";
import { SlipProbabilityNote, SlipSummary } from "./slip-styles";
import { SlipDisclosure, SlipFact } from "./slip-disclosure";

function percent(value: number, messages: Messages): string {
  if (value < 1 && Math.round(value * 1000) === 1000) return messages.text("probability.compact.more-than-ninety-nine");
  if (value > 0 && Math.round(value * 1000) === 0) return messages.text("probability.compact.less-than-one");
  return messages.number(value, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

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
      <SlipSummary data-slip-summary>
        <SlipFact label={messages.text("slips.totalOdds")}>{slip.totalOdds}</SlipFact>
        <SlipFact data-slip-combined-probability label={independentEstimate ? <>
          <span aria-hidden="true">{messages.text("slips.combinedShort")}</span><VisuallyHidden>{messages.text("slips.combinedProbability")}</VisuallyHidden>
        </> : messages.text("bestSlips.probability")}>
          {combinedProbability === null ? "—" : percent(combinedProbability, messages)}</SlipFact>
        <SlipFact label={<><span aria-hidden="true">{messages.text("slips.averageShort")}</span><VisuallyHidden>{messages.text("slips.average")}</VisuallyHidden></>}>
          {percent(slip.averageProbability, messages)}</SlipFact>
        <SlipFact label={<VisuallyHidden>{messages.text("slips.selectionCount")}</VisuallyHidden>}>
          {messages.plural("slips.selections", slip.selections.length)}</SlipFact>
      </SlipSummary>
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
