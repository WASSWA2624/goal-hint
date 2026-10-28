"use client";

import { useId } from "react";
import type { BuiltSlip } from "@/domain/slip-builder";
import type { SavedSlipView } from "@/domain/saved-slips";
import { CompactCard } from "../compact-slip/compact-slip-styles";
import { CleanLedgerSelection } from "../compact-slip/clean-ledger-selection";
import type { MobileSlipHeaderVariant } from "./designs";
import { HeaderRow } from "./mobile-slip-header-styles";

/** Review-only disclosure: header variants share exactly the same production match rows. */
export function MobileSlipHeaderSample({ slip, index, locale, variant, outcome, results, initiallyOpen = false, headerOnly = false }: {
  slip: BuiltSlip; index: number; locale: string; variant: MobileSlipHeaderVariant; outcome: SavedSlipView["outcome"];
  results?: SavedSlipView["results"]; initiallyOpen?: boolean; headerOnly?: boolean;
}) {
  const headingId = useId();
  const header = <HeaderRow totalOdds={slip.totalOdds} averageProbability={slip.averageProbability}
    selectionCount={slip.selections.length} index={index} locale={locale} variant={variant}
    outcome={outcome} headingId={headingId} headerOnly={headerOnly} />;
  return <CompactCard data-compact-slip="clean-ledger" data-header-sample={variant} data-slip-id={slip.id}>
    {headerOnly ? header : <details open={initiallyOpen} data-header-disclosure>
      {header}
      <ul aria-labelledby={headingId}>{slip.selections.map((selection) => {
        const result = results?.find((item) => item.fixtureId === selection.fixtureId);
        return <CleanLedgerSelection key={selection.fixtureId} selection={selection} locale={locale} analysisLinks={false} {...(result ? { result } : {})} />;
      })}</ul>
    </details>}
  </CompactCard>;
}
