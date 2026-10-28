"use client";

import { useId, type CSSProperties } from "react";
import { CheckIcon, CloseIcon, ClockIcon } from "@/components/ui/icons";
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
const shortStatusNames = { ...statusNames, pending: "Pend" } as const;

function MetricIcon({ kind }: { kind: "odds" | "probability" | "count" }) {
  return <svg data-label-icon={kind === "count" ? undefined : ""} data-count-icon={kind === "count" ? "" : undefined}
    viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" focusable="false">
    {kind === "odds" ? <path d="m4 4 8 8m0-8-8 8" /> : kind === "probability"
      ? <><path d="M8 2a6 6 0 1 0 6 6H8Z" /><path d="M10 2.4A6 6 0 0 1 13.6 6H10Z" /></>
      : <><path d="M6 4h8M6 8h8M6 12h8" /><path d="M2 4h1M2 8h1M2 12h1" /></>}
  </svg>;
}

/** Review-only disclosure: header variants share exactly the same production match rows. */
export function MobileSlipHeaderSample({ slip, index, locale, variant, outcome, results, initiallyOpen = false, headerOnly = false }: {
  slip: BuiltSlip; index: number; locale: string; variant: MobileSlipHeaderVariant; outcome: SavedSlipView["outcome"];
  results?: SavedSlipView["results"]; initiallyOpen?: boolean; headerOnly?: boolean;
}) {
  const m = createMessages(locale), id = useId();
  const headingId = `${id}-heading`, noteId = `${id}-average`, label = statusNames[outcome];
  const StatusIcon = outcome === "won" ? CheckIcon : outcome === "lost" ? CloseIcon : ClockIcon;
  const header = <HeaderRow as={headerOnly ? "header" : "summary"} data-header-summary data-header-variant={variant}
    data-header-outcome={outcome} data-header-only={headerOnly ? "" : undefined} aria-describedby={noteId}
    style={{ "--header-probability": `${Math.max(0, Math.min(1, slip.averageProbability)) * 100}%` } as CSSProperties}>
    <h3 id={headingId} data-header-identity>{m.text("slips.slipTitle", { number: m.number(index + 1) })}</h3>
    <span data-header-field="odds" title={m.text("slips.totalOdds")}>
      <span data-header-label aria-hidden="true"><span data-label-word>Odds</span><span data-label-symbol>×</span><MetricIcon kind="odds" /></span>
      <VisuallyHidden>{m.text("slips.totalOdds")}: </VisuallyHidden><strong>{slip.totalOdds}</strong>
    </span>
    <span data-header-field="probability" title={m.text("slips.averageHint")}>
      <span data-header-label aria-hidden="true"><span data-label-word>Avg</span><span data-label-symbol>Avg</span><MetricIcon kind="probability" /></span>
      <VisuallyHidden>{m.text("slips.average")}: </VisuallyHidden><strong>{formatSlipProbability(slip.averageProbability, m)}</strong>
    </span>
    <span data-header-field="count" title={m.plural("slips.selections", slip.selections.length)}>
      <MetricIcon kind="count" /><strong>{m.number(slip.selections.length)}</strong>
      <span data-header-label aria-hidden="true"><span data-count-word>picks</span><span data-count-compact>p</span></span>
      <VisuallyHidden> {m.text("slips.selectionCount")}</VisuallyHidden>
    </span>
    <span data-header-status title={label}>
      <span data-status-icon aria-hidden="true">{outcome === "void" ? "—" : <StatusIcon />}</span>
      <span data-status-full aria-hidden="true">{label}</span><span data-status-compact aria-hidden="true">{shortStatusNames[outcome]}</span>
      <VisuallyHidden>{label}</VisuallyHidden>
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
