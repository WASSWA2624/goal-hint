"use client";

import type { BuiltSlip } from "@/domain/slip-builder";
import { memo } from "react";
import type { SavedSlipView } from "@/domain/saved-slips";
import type { SlipMatchState } from "@/domain/slip-match-state";
import type { SlipStatus } from "@/domain/slip-status";
import type { SharedSlip, ShareSlipSource } from "@/domain/shared-slips";
import { useDesktopLayout } from "@/components/ui/use-desktop-layout";
import styled from "styled-components";
import { media } from "@/styles/theme";
import { CompactSlip, CompactSlipDisclosure } from "./compact-slip/compact-slip";
import { DesktopSlip, DesktopSlipDisclosure, type DesktopSlipDisclosureProps } from "./desktop-slip/desktop-slip";
import type { SlipHeaderPublication } from "./slip-header-meta";

/** Keep desktop content visually collapsed until hydration selects its native disclosure. */
const PhoneSlipFallback = styled.div`
  min-inline-size: 0;
  ${media.belowDesktop} {
    [data-compact-slip="clean-ledger"] {
      border-radius: ${({ theme }) => theme.radius.control};
      border-start-start-radius: ${({ theme }) => theme.radius.none};
      border-end-start-radius: ${({ theme }) => theme.radius.none};
      border-inline-start: 4px solid ${({ theme }) => theme.color.accent.blue.text};
    }
  }
  ${media.desktop} {
    @media (scripting: enabled) { [data-slip-content] { display: none; } }
  }
`;

export type SlipCardProps = {
  slip: BuiltSlip; index: number; locale: string; estimatedProbability?: number; results?: SavedSlipView["results"]; matchStates?: readonly SlipMatchState[];
  shareSource?: ShareSlipSource; sharedSlip?: SharedSlip; initiallyOpen?: boolean; outcome?: SavedSlipView["outcome"]; status?: SlipStatus;
} & SlipHeaderPublication;

/** The shared production slip card for Best Slips, the builder, history and shared snapshots. */
export const SlipCard = memo(function SlipCard({ slip, index, locale, results, matchStates, shareSource, sharedSlip, initiallyOpen = false,
  publicationDay, publishedAt, outcome, status }: SlipCardProps) {
  const desktop = useDesktopLayout();
  const publication = { ...(publicationDay ? { publicationDay } : {}), ...(publishedAt !== undefined ? { publishedAt } : {}),
    ...(outcome ? { outcome } : {}), ...(status ? { status } : {}) };
  if (desktop) return <DesktopSlip slip={slip} index={index} locale={locale} initiallyOpen={initiallyOpen}
    {...publication}
    {...(shareSource ? { shareSource } : {})} {...(sharedSlip ? { sharedSlip } : {})} {...(results ? { results } : {})}
    {...(matchStates ? { matchStates } : {})} />;
  return <PhoneSlipFallback><CompactSlip slip={slip} index={index} locale={locale} variant="clean-ledger" initiallyOpen={initiallyOpen} showRank={!sharedSlip}
    {...publication}
    {...(results ? { results } : {})} {...(matchStates ? { matchStates } : {})} /></PhoneSlipFallback>;
});

/** Aggregate-only previews use the same responsive header and disclosure as complete slip cards. */
export function SlipCardSummary({ children, collapsible = false, ...props }: Omit<DesktopSlipDisclosureProps, "headerAction">) {
  const desktop = useDesktopLayout();
  if (desktop) return <DesktopSlipDisclosure {...props} collapsible={collapsible}>{children}</DesktopSlipDisclosure>;
  return <PhoneSlipFallback><CompactSlipDisclosure {...props} collapsible={collapsible}>{children}</CompactSlipDisclosure></PhoneSlipFallback>;
}
