"use client";

import { memo, useState } from "react";
import styled from "styled-components";
import { detailAnalysis } from "@/domain/detail-presentation";
import { ReasonIcon } from "./details-icons";
import { Card, CardHeader, Note, Panel, desktop, useStableDetails } from "./details-ui";
import { Explanation } from "./markets-card";

/** Desktop keeps the explanation inside each market panel; below desktop it is its own drawer. */
const Drawer = styled(Card)`
  ${desktop} { display: none; }
`;

/** Why we think so: the revision's reasons and key risk, one tap from the verdict. */
export const AnalysisDrawer = memo(function AnalysisDrawer() {
  const { data, messages } = useStableDetails();
  const [open, setOpen] = useState(false);
  const analysis = data.snapshot ? detailAnalysis(data.snapshot.analysis) : null;
  const meta = analysis?.state === "available"
    ? [messages.plural("details.reasonCount", analysis.reasons.length), analysis.uncertainty ? messages.text("details.whyRisk") : null].filter(Boolean).join(" · ")
    : messages.text("details.notAvailable");
  return <Drawer data-section="analysis" data-open={open || undefined} $open={open} $accent="teal" aria-labelledby="section-analysis-title">
    <CardHeader icon={<ReasonIcon />} accent="teal" title={messages.text("details.why")} meta={meta} open={open} controls="section-analysis"
      onToggle={() => setOpen(!open)} headingId="section-analysis-title" />
    <div id="section-analysis" hidden={!open}>
      {open && <Panel><Explanation /><Note>{messages.text("detail.probabilityDisclosure")}</Note></Panel>}
    </div>
  </Drawer>;
});
