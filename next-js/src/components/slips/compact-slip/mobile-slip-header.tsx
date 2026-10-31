"use client";

import { useId } from "react";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import type { SavedSlipView } from "@/domain/saved-slips";
import type { SlipStatus } from "@/domain/slip-status";
import { createMessages } from "@/i18n/messages";
import { formatSlipProbability } from "../slip-format";
import { MobileHeaderRow } from "./mobile-slip-header-styles";
import { SlipHeaderDate, SlipStatusBadge, type SlipHeaderPublication } from "../slip-header-meta";

/** Shared by full slips, aggregate-only summaries and the design comparison. */
export function MobileSlipHeader({ totalOdds, averageProbability, selectionCount, index, locale, outcome = "pending", status = outcome,
  headingId, headerOnly = false, showRank = false, className, variant, publicationDay, publishedAt, hasAction = false }: {
  totalOdds: string; averageProbability: number; selectionCount: number; index: number; locale: string;
  outcome?: SavedSlipView["outcome"]; status?: SlipStatus; headingId?: string; headerOnly?: boolean; showRank?: boolean; className?: string; variant?: string; hasAction?: boolean;
} & SlipHeaderPublication) {
  const m = createMessages(locale), id = useId(), noteId = `${id}-probability-note`;
  const label = m.text(`slips.header.${status}`);
  const statusCaption = m.text("slips.header.status");
  const number = m.number(index + 1), slipTitle = m.text("slips.slipTitle", { number });
  const publication = <SlipHeaderDate locale={locale} {...(publicationDay ? { publicationDay } : {})} {...(publishedAt !== undefined ? { publishedAt } : {})} />;
  const metrics = <>
    <span data-header-field="odds" title={`${m.text("slips.totalOdds")}: ${totalOdds}`}>
      <span data-header-label aria-hidden="true">{m.text(variant ? "slips.odds" : "slips.totalOdds")}</span>
      <VisuallyHidden>{m.text("slips.totalOdds")}: </VisuallyHidden><strong>{totalOdds}</strong>
    </span>
    <span data-header-field="probability" title={m.text("slips.averageHint")}>
      <span data-header-label aria-hidden="true"><span data-label-full>{m.text("slips.probability")}</span><span data-label-compact>{m.text("slips.header.probabilityShort")}</span></span>
      <VisuallyHidden>{m.text("slips.probability")}: </VisuallyHidden><strong>{formatSlipProbability(averageProbability, m)}</strong>
    </span>
    <span data-header-field="count" title={m.plural("slips.header.matchCount", selectionCount)}>
      <strong>{m.number(selectionCount)}</strong><span data-header-label aria-hidden="true">{m.text("slips.header.matches")}</span>
      <VisuallyHidden> {m.text("slips.header.matches")}</VisuallyHidden>
    </span>
  </>;
  return <MobileHeaderRow as={headerOnly ? "header" : "summary"} className={className} data-slip-summary data-mobile-slip-header
      data-mobile-slip-layout={variant ? undefined : "compact-rail"}
      data-header-action={hasAction ? "" : undefined}
      data-slip-toggle={headerOnly ? undefined : ""} data-header-summary data-header-variant={variant}
      data-header-outcome={outcome} data-header-status-value={status} data-header-only={headerOnly ? "" : undefined} data-large-odds={totalOdds.length > 5 ? "" : undefined}
      data-header-publication={publicationDay || publishedAt !== undefined ? "" : undefined}
      aria-describedby={noteId}>
      <h3 id={headingId ?? `${id}-heading`} data-header-identity data-dense-identity={index >= 99 ? "" : undefined}>
        {variant ? slipTitle : <span data-header-slip-number>
          <span data-header-title-prefix aria-hidden="true">{m.text("slips.slipTitle", { number: "" }).trim()} </span>
          <span data-header-number aria-hidden="true">{number}</span>
          <VisuallyHidden>{slipTitle}</VisuallyHidden>
        </span>}
        {variant && publication}
        {!variant && (publicationDay || publishedAt !== undefined) && <span data-header-generation>
          {publication}
        </span>}
        {index === 0 && showRank && (variant && (publicationDay || publishedAt !== undefined)
          ? <span data-rank>{m.text("slips.topRanked")}</span> : <VisuallyHidden> · {m.text("slips.topRanked")}</VisuallyHidden>)}
      </h3>
      {variant ? metrics : <span data-header-metrics>{metrics}</span>}
      <span data-header-status title={variant ? label : `${statusCaption}: ${label}`}>
        {!variant && <>
          <span data-header-label aria-hidden="true">{statusCaption}</span>
        </>}
        {variant ? <span data-status-full>{label}</span> : <SlipStatusBadge outcome={outcome} status={status} locale={locale} />}
      </span>
      {variant && <span data-header-chevron aria-hidden="true" />}
      <span id={noteId} hidden>{m.text("slips.averageHint")}</span>
    </MobileHeaderRow>;
}
