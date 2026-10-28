"use client";

import type { SavedSlipView } from "@/domain/saved-slips";
import type { PerformanceSummaryCounts } from "@/domain/performance-summary";
import { utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { createMessages } from "@/i18n/messages";
import { EmptyState } from "@/components/ui/feedback";
import { PerformanceSummary } from "@/components/performance/performance-summary";
import { HeadingRow, Note, Results, SlipStack } from "./slip-styles";
import { SlipTable } from "./slip-table";

/** Completed slips carry no owner identity and can be read by every visitor. */
export function SlipHistory({ slips, locale, statistics, period }: {
  slips: readonly SavedSlipView[] | null; locale: string; statistics?: PerformanceSummaryCounts | null; period?: string;
}) {
  const m = createMessages(locale);
  return <Results aria-labelledby="completed-slips" data-slip-history>
    {statistics && <PerformanceSummary counts={statistics} locale={locale} kind="slips" period={period}
      title={m.text("performance.summary.savedTitle")} />}
    <HeadingRow><h2 id="completed-slips">{m.text("slips.history")}</h2></HeadingRow>
    <Note>{m.text("slips.historyHint")}</Note>
    {slips?.length ? <SlipStack>{slips.map((item, index) => <div key={item.id}>
      <HeadingRow><strong>{m.text(`slips.outcome.${item.outcome}`)}</strong><time dateTime={item.savedAt}>{m.reportingInstant(utcInstantFromEpochMilliseconds(Date.parse(item.savedAt)))}</time></HeadingRow>
      <SlipTable slip={item.slip} index={index} locale={locale} results={item.results} />
    </div>)}</SlipStack> : <EmptyState headingLevel={3} title={m.text(slips === null ? "slips.historyUnavailable" : "slips.historyEmpty")} />}
  </Results>;
}
