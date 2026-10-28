"use client";

import type { BuiltSlip } from "@/domain/slip-builder";
import type { SavedSlipView } from "@/domain/saved-slips";
import { useId } from "react";
import { CompactSlipDisclosure } from "../compact-slip/compact-slip";
import type { DesktopSlipVariant } from "./designs";
import { DesktopSlipLayout } from "./desktop-slip-styles";
import { DesktopSlipRow } from "./desktop-slip-row";

/** Each candidate reuses production snapshot formatting and native disclosure behavior. */
export function DesktopSlipSample({ slip, index, locale, variant, initiallyOpen = false, showRank = true, results }: {
  slip: BuiltSlip; index: number; locale: string; variant: DesktopSlipVariant; initiallyOpen?: boolean;
  showRank?: boolean; results?: SavedSlipView["results"];
}) {
  const headingId = useId();
  return <DesktopSlipLayout data-desktop-design={variant}>
    <CompactSlipDisclosure index={index} locale={locale} variant="inline-ledger" initiallyOpen={initiallyOpen} showRank={showRank}
      totalOdds={slip.totalOdds} averageProbability={slip.averageProbability} selectionCount={slip.selections.length} slipId={slip.id} headingId={headingId}>
      <ul aria-labelledby={headingId}>{slip.selections.map((selection) => {
        const result = results?.find((item) => item.fixtureId === selection.fixtureId);
        return <DesktopSlipRow key={selection.fixtureId} selection={selection} locale={locale} {...(result ? { result } : {})} />;
      })}</ul>
    </CompactSlipDisclosure>
  </DesktopSlipLayout>;
}
