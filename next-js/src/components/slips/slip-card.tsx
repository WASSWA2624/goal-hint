"use client";

import type { BuiltSlip } from "@/domain/slip-builder";
import { memo } from "react";
import type { SlipResultView } from "@/domain/slip-snapshot";
import type { SlipMatchState } from "@/domain/slip-match-state";
import type { SlipStatus } from "@/domain/slip-status";
import type { SharedSlip, ShareSlipSource } from "@/domain/shared-slips";
import { SlipShareAction } from "./slip-share-action";
import { useDesktopLayout } from "@/components/ui/use-desktop-layout";
import styled from "styled-components";
import { CompactSlip, CompactSlipDisclosure } from "./compact-slip/compact-slip";
import { DesktopSlip, DesktopSlipDisclosure, type DesktopSlipDisclosureProps } from "./desktop-slip/desktop-slip";
import type { SlipHeaderPublication } from "./slip-header-meta";

/** Phone markup remains visible while hydration selects the desktop presentation. */
const PhoneSlipFallback = styled.div`
  position: relative; min-inline-size: 0;
  [data-phone-shareable] { position: relative; }
  &:has([data-header-only]) [data-phone-share-action] { inset-inline-end: var(--gh-spacing-1_5); }
  [data-phone-share-action] {
    position: absolute; inset-block-start: var(--gh-spacing-2);
    inset-inline-end: calc(var(--gh-spacing-1_5) + var(--slip-header-action-size) + var(--slip-header-action-gap));
  }
`;

export type SlipCardProps = {
  slip: BuiltSlip; index: number; locale: string; estimatedProbability?: number; results?: SlipResultView["results"]; matchStates?: readonly SlipMatchState[];
  publicShareHref?: string; shareSource?: ShareSlipSource; sharedSlip?: SharedSlip; initiallyOpen?: boolean; outcome?: SlipResultView["outcome"]; status?: SlipStatus;
} & SlipHeaderPublication;

/** The shared production slip card for Best Slips, the builder, history and shared snapshots. */
export const SlipCard = memo(function SlipCard({ slip, index, locale, results, matchStates, shareSource, sharedSlip, initiallyOpen = true, publicShareHref,
  publicationDay, publishedAt, outcome, status }: SlipCardProps) {
  const desktop = useDesktopLayout();
  const publication = { ...(publicationDay ? { publicationDay } : {}), ...(publishedAt !== undefined ? { publishedAt } : {}),
    ...(outcome ? { outcome } : {}), ...(status ? { status } : {}) };
  if (desktop) return <DesktopSlip slip={slip} index={index} locale={locale} initiallyOpen={initiallyOpen}
    {...publication} {...(publicShareHref ? { publicShareHref } : {})}
    {...(shareSource ? { shareSource } : {})} {...(sharedSlip ? { sharedSlip } : {})} {...(results ? { results } : {})}
    {...(matchStates ? { matchStates } : {})} />;
  return <PhoneSlipFallback><CompactSlip slip={slip} index={index} locale={locale} variant="clean-ledger" initiallyOpen={initiallyOpen} showRank={!sharedSlip}
    {...publication}
    {...(results ? { results } : {})} {...(matchStates ? { matchStates } : {})}
    action={shareSource || sharedSlip ? <SlipShareAction key={sharedSlip?.id ?? slip.id} localSlip={slip} locale={locale} iconOnly {...(publicShareHref ? { publicHref: publicShareHref } : {})}
      {...(shareSource ? { source: shareSource } : {})} {...(sharedSlip ? { sharedSlip } : {})} /> : undefined} />
  </PhoneSlipFallback>;
});

/** Aggregate-only previews use the same responsive header and disclosure as complete slip cards. */
export function SlipCardSummary({ children, collapsible = false, headerAction, ...props }: DesktopSlipDisclosureProps) {
  const desktop = useDesktopLayout();
  if (desktop) return <DesktopSlipDisclosure {...props} collapsible={collapsible} headerAction={headerAction}>{children}</DesktopSlipDisclosure>;
  return <PhoneSlipFallback><CompactSlipDisclosure {...props} collapsible={collapsible} action={headerAction}>{children}</CompactSlipDisclosure></PhoneSlipFallback>;
}
