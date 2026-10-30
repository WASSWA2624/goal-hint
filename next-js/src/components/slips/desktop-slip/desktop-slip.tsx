"use client";

import { useId, type ReactNode } from "react";
import type { BuiltSlip } from "@/domain/slip-builder";
import type { SavedSlipView } from "@/domain/saved-slips";
import type { SlipMatchState } from "@/domain/slip-match-state";
import type { SlipStatus } from "@/domain/slip-status";
import type { SharedSlip, ShareSlipSource } from "@/domain/shared-slips";
import { CompactSlipDisclosure } from "../compact-slip/compact-slip";
import { DesktopSlipRow } from "./desktop-slip-row";
import { DesktopSlipLayout } from "./desktop-slip-styles";
import { useRefreshedSlipMatchStates } from "../slip-match-refresh";
import { SlipShareAction } from "../slip-share-action";
import type { SlipHeaderPublication } from "../slip-header-meta";
import { slipHeaderState } from "../slip-header-outcome";

export type DesktopSlipDisclosureProps = {
  totalOdds: string; averageProbability: number; selectionCount: number; index: number; locale: string;
  initiallyOpen?: boolean; collapsible?: boolean; showRank?: boolean; slipId?: string; headingId?: string; children: ReactNode; headerAction?: ReactNode;
  outcome?: SavedSlipView["outcome"]; status?: SlipStatus;
} & SlipHeaderPublication;

/** Public aggregate previews and full desktop slips use the same selected native disclosure. */
export function DesktopSlipDisclosure({ children, headerAction, ...props }: DesktopSlipDisclosureProps) {
  return <DesktopSlipLayout data-desktop-design="aligned-ledger" data-production-desktop-slip data-shareable={headerAction ? "true" : undefined}>
    <CompactSlipDisclosure {...props} variant="inline-ledger" fullProbabilityLabel hasHeaderAction={!!headerAction}>{children}</CompactSlipDisclosure>
    {headerAction && <div data-slip-header-action>{headerAction}</div>}
  </DesktopSlipLayout>;
}

/** Original snapshot facts and any supplied regulation results remain unchanged by desktop presentation. */
export function DesktopSlip({ slip, index, locale, results, matchStates, initiallyOpen = false, shareSource, sharedSlip,
  publicationDay, publishedAt, outcome: suppliedOutcome, status: suppliedStatus }: {
  slip: BuiltSlip; index: number; locale: string; results?: SavedSlipView["results"]; matchStates?: readonly SlipMatchState[]; initiallyOpen?: boolean;
  shareSource?: ShareSlipSource; sharedSlip?: SharedSlip; outcome?: SavedSlipView["outcome"]; status?: SlipStatus;
} & SlipHeaderPublication) {
  const headingId = useId();
  const currentStates = useRefreshedSlipMatchStates() ?? matchStates;
  const { outcome, status } = slipHeaderState(slip, results, currentStates, suppliedOutcome, suppliedStatus);
  return <DesktopSlipDisclosure index={index} locale={locale} initiallyOpen={initiallyOpen} headingId={headingId} showRank={!sharedSlip}
    totalOdds={slip.totalOdds} averageProbability={slip.averageProbability} selectionCount={slip.selections.length} slipId={slip.id} outcome={outcome} status={status}
    {...(publicationDay ? { publicationDay } : {})} {...(publishedAt !== undefined ? { publishedAt } : {})}
    headerAction={shareSource || sharedSlip ? <SlipShareAction key={sharedSlip?.id ?? slip.id} {...(shareSource ? { source: shareSource } : {})}
      {...(sharedSlip ? { sharedSlip } : {})} locale={locale} /> : undefined}>
    <ul aria-labelledby={headingId}>{slip.selections.map((selection) => {
      const result = results?.find((item) => item.fixtureId === selection.fixtureId);
      return <DesktopSlipRow key={selection.fixtureId} selection={selection} locale={locale} analysisLinks {...(result ? { result } : {})}
        {...(currentStates ? { matchStates: currentStates } : {})} />;
    })}</ul>
  </DesktopSlipDisclosure>;
}
