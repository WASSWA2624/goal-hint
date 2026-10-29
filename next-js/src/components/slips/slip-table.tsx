"use client";

import type { BuiltSlip } from "@/domain/slip-builder";
import { memo } from "react";
import type { SavedSlipView } from "@/domain/saved-slips";
import type { SlipMatchState } from "@/domain/slip-match-state";
import type { SharedSlip, ShareSlipSource } from "@/domain/shared-slips";
import { useDesktopLayout } from "@/components/ui/use-desktop-layout";
import styled from "styled-components";
import { media } from "@/styles/theme";
import { CompactSlip } from "./compact-slip/compact-slip";
import { DesktopSlip } from "./desktop-slip/desktop-slip";

/** Keep desktop content visually collapsed until hydration selects its native disclosure. */
const PhoneSlipFallback = styled.div`
  min-inline-size: 0;
  ${media.desktop} {
    @media (scripting: enabled) { [data-slip-content] { display: none; } }
  }
`;

/** One responsive slip renderer preserves the selected phone and desktop presentations. */
export const SlipTable = memo(function SlipTable({ slip, index, locale, results, matchStates, shareSource, sharedSlip, initiallyOpen = false }: {
  slip: BuiltSlip; index: number; locale: string; estimatedProbability?: number; results?: SavedSlipView["results"]; matchStates?: readonly SlipMatchState[];
  shareSource?: ShareSlipSource; sharedSlip?: SharedSlip; initiallyOpen?: boolean;
}) {
  const desktop = useDesktopLayout();
  if (desktop) return <DesktopSlip slip={slip} index={index} locale={locale} initiallyOpen={initiallyOpen}
    {...(shareSource ? { shareSource } : {})} {...(sharedSlip ? { sharedSlip } : {})} {...(results ? { results } : {})}
    {...(matchStates ? { matchStates } : {})} />;
  return <PhoneSlipFallback><CompactSlip slip={slip} index={index} locale={locale} variant="clean-ledger" initiallyOpen={initiallyOpen} showRank={!sharedSlip}
    {...(results ? { results } : {})} {...(matchStates ? { matchStates } : {})} /></PhoneSlipFallback>;
});
