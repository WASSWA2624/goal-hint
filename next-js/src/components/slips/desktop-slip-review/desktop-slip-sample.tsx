"use client";

import type { BuiltSlip } from "@/domain/slip-builder";
import { useId } from "react";
import { CompactSlipDisclosure } from "../compact-slip/compact-slip";
import type { DesktopPreviewMatchState } from "../desktop-slip-preview-data";
import type { DesktopSlipVariant } from "./designs";
import { DesktopSlipLayout } from "./desktop-slip-styles";
import { DesktopSlipRow } from "./desktop-slip-row";

/** Each candidate keeps the approved header while rendering explicit design-review match states. */
export function DesktopSlipSample({ slip, states, index, locale, variant, initiallyOpen = false, showRank = true }: {
  slip: BuiltSlip; index: number; locale: string; variant: DesktopSlipVariant; initiallyOpen?: boolean;
  showRank?: boolean; states: Readonly<Record<string, DesktopPreviewMatchState>>;
}) {
  const headingId = useId();
  return <DesktopSlipLayout data-desktop-design={variant}>
    <CompactSlipDisclosure index={index} locale={locale} variant="inline-ledger" initiallyOpen={initiallyOpen} showRank={showRank}
      totalOdds={slip.totalOdds} averageProbability={slip.averageProbability} selectionCount={slip.selections.length} slipId={slip.id} headingId={headingId}>
      <ul aria-labelledby={headingId}>{slip.selections.map((selection) => <DesktopSlipRow key={selection.fixtureId}
        selection={selection} locale={locale} state={states[selection.fixtureId]!} />)}</ul>
    </CompactSlipDisclosure>
  </DesktopSlipLayout>;
}
