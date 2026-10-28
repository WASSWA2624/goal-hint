"use client";

import type { BuiltSlip } from "@/domain/slip-builder";
import type { SavedSlipView } from "@/domain/saved-slips";
import { CompactSlip } from "../compact-slip/compact-slip";
import type { DesktopSlipVariant } from "./designs";
import { DesktopSlipLayout } from "./desktop-slip-styles";

/** Each candidate reuses production snapshot formatting and native disclosure behavior. */
export function DesktopSlipSample({ slip, index, locale, variant, initiallyOpen = false, showRank = true, results }: {
  slip: BuiltSlip; index: number; locale: string; variant: DesktopSlipVariant; initiallyOpen?: boolean;
  showRank?: boolean; results?: SavedSlipView["results"];
}) {
  return <DesktopSlipLayout data-desktop-design={variant}>
    <CompactSlip slip={slip} index={index} locale={locale} variant="inline-ledger" initiallyOpen={initiallyOpen}
      analysisLinks={false} showLogos showRank={showRank} {...(results ? { results } : {})} />
  </DesktopSlipLayout>;
}
