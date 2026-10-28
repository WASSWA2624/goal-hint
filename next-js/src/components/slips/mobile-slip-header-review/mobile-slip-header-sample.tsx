"use client";

import { useId } from "react";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import type { BuiltSlip } from "@/domain/slip-builder";
import type { SavedSlipView } from "@/domain/saved-slips";
import { createMessages } from "@/i18n/messages";
import { CompactCard } from "../compact-slip/compact-slip-styles";
import { CleanLedgerSelection } from "../compact-slip/clean-ledger-selection";
import { formatSlipProbability } from "../slip-format";
import type { MobileSlipHeaderVariant } from "./designs";
import { HeaderRow } from "./mobile-slip-header-styles";

const statusNames = { won: "Won", lost: "Lost", pending: "Pending", void: "Void" } as const;

/** Review-only disclosure: header variants share exactly the same production match rows. */
export function MobileSlipHeaderSample({ slip, index, locale, variant, outcome, results, initiallyOpen = false, headerOnly = false }: {
  slip: BuiltSlip; index: number; locale: string; variant: MobileSlipHeaderVariant; outcome: SavedSlipView["outcome"];
  results?: SavedSlipView["results"]; initiallyOpen?: boolean; headerOnly?: boolean;
}) {
  const m = createMessages(locale), id = useId();
  const headingId = `${id}-heading`, noteId = `${id}-probability-note`, label = statusNames[outcome];
  const count = slip.selections.length;
  const header = <HeaderRow as={headerOnly ? "header" : "summary"} data-header-summary data-header-variant={variant}
    data-header-outcome={outcome} data-header-only={headerOnly ? "" : undefined} data-large-odds={slip.totalOdds.length > 5 ? "" : undefined}
    aria-describedby={noteId}>
    <h3 id={headingId} data-header-identity data-dense-identity={index >= 99 ? "" : undefined}>{m.text("slips.slipTitle", { number: m.number(index + 1) })}</h3>
    <span data-header-field="odds" title={m.text("slips.totalOdds")}>
      <span data-header-label aria-hidden="true">Odds</span>
      <VisuallyHidden>{m.text("slips.totalOdds")}: </VisuallyHidden><strong>{slip.totalOdds}</strong>
    </span>
    <span data-header-field="probability" title={m.text("slips.averageHint")}>
      <span data-header-label aria-hidden="true"><span data-label-full>Probability</span><span data-label-compact>Prob.</span></span>
      <VisuallyHidden>Probability: </VisuallyHidden><strong>{formatSlipProbability(slip.averageProbability, m)}</strong>
    </span>
    <span data-header-field="count" title={`${m.number(count)} ${count === 1 ? "match" : "matches"}`}>
      <strong>{m.number(count)}</strong><span data-header-label aria-hidden="true">Matches</span>
      <VisuallyHidden> Matches</VisuallyHidden>
    </span>
    <span data-header-status title={label}>
      <span data-status-full>{label}</span>
    </span>
    <span data-header-chevron aria-hidden="true" />
  </HeaderRow>;
  return <CompactCard data-compact-slip="clean-ledger" data-header-sample={variant} data-slip-id={slip.id}>
    <VisuallyHidden id={noteId}>{m.text("slips.averageHint")}</VisuallyHidden>
    {headerOnly ? header : <details open={initiallyOpen} data-header-disclosure>
      {header}
      <ul aria-labelledby={headingId}>{slip.selections.map((selection) => {
        const result = results?.find((item) => item.fixtureId === selection.fixtureId);
        return <CleanLedgerSelection key={selection.fixtureId} selection={selection} locale={locale} analysisLinks={false} {...(result ? { result } : {})} />;
      })}</ul>
    </details>}
  </CompactCard>;
}
