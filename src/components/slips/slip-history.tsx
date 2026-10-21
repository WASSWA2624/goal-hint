"use client";

import type { SavedSlipView } from "@/domain/saved-slips";
import { utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { createMessages } from "@/i18n/messages";
import { EmptyState } from "@/components/ui/feedback";
import { HeadingRow, Note, Results, SlipStack } from "./slip-styles";
import { SlipTable } from "./slip-table";

/** Completed slips carry no owner identity and can be read by every visitor. */
export function SlipHistory({ slips, locale }: { slips: readonly SavedSlipView[] | null; locale: string }) {
  const m = createMessages(locale);
  return <Results aria-labelledby="completed-slips" data-slip-history>
    <HeadingRow><h2 id="completed-slips">{m.text("slips.history")}</h2></HeadingRow>
    <Note>{m.text("slips.historyHint")}</Note>
    {slips?.length ? <SlipStack>{slips.map((item, index) => <div key={item.id}>
      <HeadingRow><strong>{m.text(`slips.outcome.${item.outcome}`)}</strong><time dateTime={item.savedAt}>{m.reportingInstant(utcInstantFromEpochMilliseconds(Date.parse(item.savedAt)))}</time></HeadingRow>
      <SlipTable slip={item.slip} index={index} locale={locale} results={item.results} />
    </div>)}</SlipStack> : <EmptyState headingLevel={3} title={m.text(slips === null ? "slips.historyUnavailable" : "slips.historyEmpty")} />}
  </Results>;
}
