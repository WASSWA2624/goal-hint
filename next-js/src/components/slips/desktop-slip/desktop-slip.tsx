"use client";

import { useId, type ReactNode } from "react";
import type { BuiltSlip } from "@/domain/slip-builder";
import type { SavedSlipView } from "@/domain/saved-slips";
import type { SlipMatchState } from "@/domain/slip-match-state";
import { CompactSlipDisclosure } from "../compact-slip/compact-slip";
import { DesktopSlipRow } from "./desktop-slip-row";
import { DesktopSlipLayout } from "./desktop-slip-styles";
import { useRefreshedSlipMatchStates } from "../slip-match-refresh";

export type DesktopSlipDisclosureProps = {
  totalOdds: string; averageProbability: number; selectionCount: number; index: number; locale: string;
  initiallyOpen?: boolean; showRank?: boolean; slipId?: string; headingId?: string; children: ReactNode;
};

/** Public aggregate previews and full desktop slips use the same selected native disclosure. */
export function DesktopSlipDisclosure({ children, ...props }: DesktopSlipDisclosureProps) {
  return <DesktopSlipLayout data-desktop-design="aligned-ledger" data-production-desktop-slip>
    <CompactSlipDisclosure {...props} variant="inline-ledger">{children}</CompactSlipDisclosure>
  </DesktopSlipLayout>;
}

/** Original snapshot facts and any supplied regulation results remain unchanged by desktop presentation. */
export function DesktopSlip({ slip, index, locale, results, matchStates, initiallyOpen = false }: {
  slip: BuiltSlip; index: number; locale: string; results?: SavedSlipView["results"]; matchStates?: readonly SlipMatchState[]; initiallyOpen?: boolean;
}) {
  const headingId = useId();
  const currentStates = useRefreshedSlipMatchStates() ?? matchStates;
  return <DesktopSlipDisclosure index={index} locale={locale} initiallyOpen={initiallyOpen} headingId={headingId}
    totalOdds={slip.totalOdds} averageProbability={slip.averageProbability} selectionCount={slip.selections.length} slipId={slip.id}>
    <ul aria-labelledby={headingId}>{slip.selections.map((selection) => {
      const result = results?.find((item) => item.fixtureId === selection.fixtureId);
      return <DesktopSlipRow key={selection.fixtureId} selection={selection} locale={locale} analysisLinks {...(result ? { result } : {})}
        {...(currentStates ? { matchStates: currentStates } : {})} />;
    })}</ul>
  </DesktopSlipDisclosure>;
}
