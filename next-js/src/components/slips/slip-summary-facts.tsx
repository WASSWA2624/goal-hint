"use client";

import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { createMessages, type Messages } from "@/i18n/messages";
import { SlipFact } from "./slip-disclosure";
import { SlipSummary } from "./slip-styles";

function percent(value: number, messages: Messages): string {
  if (value < 1 && Math.round(value * 1000) === 1000) return messages.text("probability.compact.more-than-ninety-nine");
  if (value > 0 && Math.round(value * 1000) === 0) return messages.text("probability.compact.less-than-one");
  return messages.number(value, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Public previews and unlocked slips share the same aggregate labels and probability precision. */
export function SlipSummaryFacts({ locale, totalOdds, probability, selectionCount, averageProbability, independentEstimate = false }: {
  locale: string; totalOdds: string; probability: number | null; selectionCount: number; averageProbability?: number; independentEstimate?: boolean;
}) {
  const messages = createMessages(locale);
  return <SlipSummary data-slip-summary>
    <SlipFact label={messages.text("slips.totalOdds")}>{totalOdds}</SlipFact>
    <SlipFact data-slip-combined-probability label={independentEstimate ? <>
      <span aria-hidden="true">{messages.text("slips.combinedShort")}</span><VisuallyHidden>{messages.text("slips.combinedProbability")}</VisuallyHidden>
    </> : messages.text("bestSlips.probability")}>
      {probability === null ? "—" : percent(probability, messages)}</SlipFact>
    {averageProbability !== undefined && <SlipFact label={<>
      <span aria-hidden="true">{messages.text("slips.averageShort")}</span><VisuallyHidden>{messages.text("slips.average")}</VisuallyHidden>
    </>}>{percent(averageProbability, messages)}</SlipFact>}
    <SlipFact label={<VisuallyHidden>{messages.text("slips.selectionCount")}</VisuallyHidden>}>
      {messages.plural("slips.selections", selectionCount)}</SlipFact>
  </SlipSummary>;
}
