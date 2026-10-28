"use client";

import type { BuiltSlip } from "@/domain/slip-builder";
import type { SavedSlipView } from "@/domain/saved-slips";
import { CompactSlip } from "./compact-slip/compact-slip";

/** All production slip surfaces share the selected Inline ledger design and show the original mean. */
export function SlipTable({ slip, index, locale, results, collapsible = false }: {
  slip: BuiltSlip; index: number; locale: string; estimatedProbability?: number; results?: SavedSlipView["results"]; collapsible?: boolean;
}) {
  return <CompactSlip slip={slip} index={index} locale={locale} variant="inline-ledger" collapsible={collapsible}
    {...(results ? { results } : {})} />;
}
