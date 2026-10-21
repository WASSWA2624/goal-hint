"use client";

import { memo, useState } from "react";
import { detailAnalysis } from "@/domain/detail-presentation";
import type { MatchDetailResponse } from "@/domain/match-detail";
import { fullDetailSnapshot } from "@/domain/detail-snapshot";
import { SubscriberNotice } from "@/components/members/subscriber-notice";
import { ReasonIcon } from "./details-icons";
import { Card, CardHeader, SubscriberRow, Note, Panel, useStableDetails, type Messages } from "./details-ui";
import { Explanation } from "./markets-card";
import { useOpenByDefault } from "./use-match-view";

/** "3 reasons · key risk", or not available when the revision carries no explanation. */
function summary(messages: Messages, data: MatchDetailResponse): string {
  const snapshot = fullDetailSnapshot(data);
  const analysis = snapshot ? detailAnalysis(snapshot.analysis) : null;
  return analysis?.state === "available"
    ? [messages.plural("details.reasonCount", analysis.reasons.length), analysis.uncertainty ? messages.text("details.whyRisk") : null].filter(Boolean).join(" · ")
    : messages.text("details.notAvailable");
}

/** Why we think so: the revision's reasons and key risk, one tap from the verdict; open by default on desktop. */
export const AnalysisDrawer = memo(function AnalysisDrawer() {
  const { data, messages } = useStableDetails();
  const byDefault = useOpenByDefault();
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = choice ?? byDefault;
  if ("gated" in data.history) return <SubscriberRow><SubscriberNotice kind="analysis" signedIn={data.access.signedIn} returnTo={data.route.path} /></SubscriberRow>;
  return <Card data-section="analysis" data-open={open || undefined} data-open-by-default={(choice === null && byDefault) || undefined}
    aria-labelledby="section-analysis-title">
    <CardHeader icon={<ReasonIcon />} title={messages.text("details.why")} meta={summary(messages, data)} open={open} controls="section-analysis"
      onToggle={() => setChoice(!open)} headingId="section-analysis-title" />
    <div id="section-analysis" hidden={!open}>
      {open && <Panel><Explanation /><Note>{messages.text("detail.probabilityDisclosure")}</Note></Panel>}
    </div>
  </Card>;
});
