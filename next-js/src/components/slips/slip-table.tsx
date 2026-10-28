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
import { SlipCard, SlipProbabilityNote, SlipSummary, SlipTitle } from "./slip-styles";

function percent(value: number, messages: Messages): string {
  if (value < 1 && Math.round(value * 1000) === 1000) return messages.text("probability.compact.more-than-ninety-nine");
  if (value > 0 && Math.round(value * 1000) === 0) return messages.text("probability.compact.less-than-one");
  return messages.number(value, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Slip summaries retain their own facts; every match uses the shared responsive match card. */
export function SlipTable({ slip, index, locale, estimatedProbability, results }: { slip: BuiltSlip; index: number; locale: string; estimatedProbability?: number; results?: SavedSlipView["results"] }) {
  const messages = createMessages(locale), headingId = useId();
  const independentEstimate = estimatedProbability === undefined;
  const combinedProbability = estimatedProbability ?? independentSlipProbability(slip.selections);
  return <SlipCard data-slip-id={slip.id}>
    <SlipTitle>
      <h3 id={headingId}>{messages.text("slips.slipTitle", { number: messages.number(index + 1) })}</h3>
      {index === 0 && <span>{messages.text("slips.topRanked")}</span>}
      <SlipSummary data-slip-summary>
        <div><dt>{messages.text("slips.totalOdds")}</dt><dd>{slip.totalOdds}</dd></div>
        <div data-slip-combined-probability><dt>{independentEstimate ? <>
          <span aria-hidden="true">{messages.text("slips.combinedShort")}</span><VisuallyHidden>{messages.text("slips.combinedProbability")}</VisuallyHidden>
        </> : messages.text("bestSlips.probability")}</dt>
          <dd>{combinedProbability === null ? "—" : percent(combinedProbability, messages)}</dd></div>
        <div><dt><span aria-hidden="true">{messages.text("slips.averageShort")}</span><VisuallyHidden>{messages.text("slips.average")}</VisuallyHidden></dt>
          <dd>{percent(slip.averageProbability, messages)}</dd></div>
        <div><dt><VisuallyHidden>{messages.text("slips.selectionCount")}</VisuallyHidden></dt>
          <dd>{messages.plural("slips.selections", slip.selections.length)}</dd></div>
      </SlipSummary>
    </SlipTitle>
    {independentEstimate && <SlipProbabilityNote>{messages.text("slips.independentProbabilityHint")}</SlipProbabilityNote>}
    <MatchCardList locale={locale} aria-labelledby={headingId} rowNumberMaximum={slip.selections.length}>
      {slip.selections.map((selection, selectionIndex) => {
        const card = slipSelectionCard(selection, results?.find((item) => item.fixtureId === selection.fixtureId));
        return <li key={selection.fixtureId} data-slip-selection={selection.fixtureId}>
          <MatchCard {...card} locale={locale} headingLevel={4} position={selectionIndex + 1}
            analysisSlug={canonicalMatchSlug(selection.homeTeam.name, selection.awayTeam.name)} />
        </li>;
      })}
    </MatchCardList>
  </SlipCard>;
}
