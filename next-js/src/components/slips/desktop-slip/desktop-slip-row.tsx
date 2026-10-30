"use client";

import { DesktopMatchRow } from "@/components/match/desktop-match-row";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { snapshotCardPrediction } from "@/domain/match-card";
import { canonicalMatchSlug } from "@/domain/match-slug";
import { matchHref } from "@/domain/navigation";
import { predictionDescription, predictionLabel } from "@/domain/prediction-label";
import type { SavedSlipView } from "@/domain/saved-slips";
import { slipSelectionCard } from "@/domain/slip-card";
import type { SlipSelection } from "@/domain/slip-builder";
import { slipMatchStateForSelection, type SlipMatchState } from "@/domain/slip-match-state";
import { createMessages } from "@/i18n/messages";
import { formatSlipProbability } from "../slip-format";
import { SlipMatchNumber } from "../slip-match-number";

export { TruncatedText } from "@/components/match/truncated-text";

const shortMarkets = { "match-result": "Result", "double-chance": "DC", "total-goals": "Goals", "both-teams-to-score": "BTTS" } as const;

/** Slip-specific authorization and immutable selection binding feed the shared desktop match renderer. */
export function DesktopSlipRow({ selection, locale, result, matchStates, analysisLinks = false, preview = false, position }: {
  selection: SlipSelection; locale: string; result?: SavedSlipView["results"][number]; matchStates?: readonly SlipMatchState[];
  analysisLinks?: boolean; preview?: boolean; position?: number;
}) {
  const m = createMessages(locale);
  const { fixture, snapshotPick } = slipSelectionCard(selection, result), prediction = snapshotCardPrediction(snapshotPick);
  const hasResult = result?.fixtureId === selection.fixtureId;
  const state = slipMatchStateForSelection(selection, matchStates), status = state?.status ?? "unknown";
  const score = state ? state.score : hasResult ? fixture.score : null;
  const family = m.text(`market.family.${selection.family}`), description = predictionDescription(m, selection.selection);
  return <li data-slip-selection={selection.fixtureId} data-compact-selection={selection.fixtureId} data-preview-selection={preview ? selection.fixtureId : undefined}>
    <DesktopMatchRow fixtureId={selection.fixtureId} locale={locale} kickoffAt={fixture.kickoffAt}
      {...(position !== undefined ? { datePrefix: <SlipMatchNumber position={position} locale={locale} /> } : {})}
      homeTeam={selection.homeTeam} awayTeam={selection.awayTeam} competition={selection.competition}
      status={status} score={score} liveClock={state?.liveClock ?? null} outcome={state?.outcome ?? prediction.status}
      {...(status === "unknown" && !state && hasResult ? { matchState: "snapshot" } : {})}
      savedScore={hasResult && score !== null} preview={preview} marketFamily={selection.family}
      marketDescription={`${family}: ${description}`}
      market={<><span data-market-label data-row-market-label aria-hidden="true">{shortMarkets[selection.family]}</span>
        <strong data-pick-label aria-hidden="true">{predictionLabel(m, selection.selection)}</strong><VisuallyHidden>{family}: {description}</VisuallyHidden></>}
      odds={selection.odds} probability={formatSlipProbability(selection.probability, m)}
      {...(analysisLinks ? { analysisHref: matchHref(selection.fixtureId, canonicalMatchSlug(selection.homeTeam.name, selection.awayTeam.name), locale) } : {})} />
  </li>;
}
