"use client";

import { useId } from "react";
import type { BuiltSlip } from "@/domain/slip-builder";
import type { SavedSlipView } from "@/domain/saved-slips";
import { CompactSlipDisclosure } from "../compact-slip/compact-slip";
import type { MobileSlipVariant } from "./designs";
import { MobileSlipRow } from "./mobile-slip-row";
import { MobileSlipLayout } from "./mobile-slip-styles";

/** The approved aggregate summary stays shared; the mobile candidates vary only the selection presentation. */
export function MobileSlipSample({ slip, index, locale, variant, initiallyOpen = false, results }: {
  slip: BuiltSlip; index: number; locale: string; variant: MobileSlipVariant; initiallyOpen?: boolean; results?: SavedSlipView["results"];
}) {
  const headingId = useId();
  return <MobileSlipLayout data-mobile-design={variant}>
    <CompactSlipDisclosure index={index} locale={locale} initiallyOpen={initiallyOpen}
      totalOdds={slip.totalOdds} averageProbability={slip.averageProbability} selectionCount={slip.selections.length} slipId={slip.id} headingId={headingId}>
      <ul aria-labelledby={headingId}>{slip.selections.map((selection) => {
        const result = results?.find((item) => item.fixtureId === selection.fixtureId);
        return <MobileSlipRow key={selection.fixtureId} selection={selection} locale={locale} {...(result ? { result } : {})} />;
      })}</ul>
    </CompactSlipDisclosure>
  </MobileSlipLayout>;
}
