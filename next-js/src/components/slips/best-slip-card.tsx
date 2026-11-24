"use client";

import { useMemo, useSyncExternalStore } from "react";
import { MatchCard } from "@/components/match/match-card";
import { MatchCardLayoutContext } from "@/components/match/match-card-layout";
import { useDesktopLayout } from "@/components/ui/use-desktop-layout";
import type { SlipPreviewView } from "@/domain/best-slips";
import { canonicalMatchSlug } from "@/domain/match-slug";
import { publicBestSlipPath } from "@/domain/public-best-slip";
import { SlipCard, SlipCardSummary } from "./slip-card";
import { createSlipKickoffExpiry } from "./slip-match-observations";
import { LockedSurface, UnlockButton } from "@/components/members/prediction-unlock";

/** Both public previews and entitled slips retain the production disclosure and match layout. */
export function BestSlipCard({ view, day, locale, signedIn = false }: { view: SlipPreviewView; day: string; locale: string; signedIn?: boolean }) {
  const desktop = useDesktopLayout(), publicationDay = view.publicationDay ?? day;
  const kickoffAt = view.status === "not-started" || view.status === "pending"
    ? Math.min(...(view.slip?.selections.map(selection => selection.kickoffAt)
      ?? view.preview?.map(({ fixture }) => fixture.kickoffAt ?? Infinity) ?? []))
    : Infinity;
  const expiry = useMemo(() => createSlipKickoffExpiry(kickoffAt), [kickoffAt]);
  const preMatchExpired = useSyncExternalStore(expiry.subscribe, expiry.getSnapshot, () => false);
  const status = preMatchExpired && view.status === "not-started" ? "pending" : view.status;
  const returnTo = publicBestSlipPath(locale, publicationDay, view.rank);
  const publication = { ...(view.publicationDay ? { publicationDay: view.publicationDay } : {}),
    ...(view.publishedAt !== undefined ? { publishedAt: view.publishedAt } : {}),
    ...(view.outcome ? { outcome: view.outcome } : {}), ...(status ? { status } : {}) };
  if (view.slip) return <SlipCard index={view.rank - 1} locale={locale} {...publication}
    wholeSlipProbability={view.estimatedProbability} preMatchExpired={preMatchExpired}
    {...(view.completed ? { publicShareHref: publicBestSlipPath(locale, publicationDay, view.rank) } : {})}
    shareSource={{ source: "best", day: publicationDay, slipId: view.slip.id }} slip={view.slip}
    {...(view.matchStates ? { matchStates: view.matchStates } : {})} />;
  return <LockedSurface data-locked-slip><SlipCardSummary locale={locale} index={view.rank - 1} {...publication} collapsible={false}
    totalOdds={view.totalOdds} averageProbability={view.averageProbability} estimatedProbability={view.estimatedProbability} selectionCount={view.matchCount}
    headerAction={<UnlockButton locale={locale} signedIn={signedIn} returnTo={returnTo} label="paywall.unlockSlip" compact />}>
    <MatchCardLayoutContext value={desktop}>
      {view.preview?.map(({ fixture, pick }, index) => <MatchCard key={fixture.fixtureId} fixture={fixture} locale={locale}
        interactive={!desktop} signedIn={signedIn} accessReturnTo={returnTo} position={index + 1} headingLevel={3} lockedPrediction={pick === null}
        analysisSlug={canonicalMatchSlug(fixture.homeTeam.name, fixture.awayTeam.name)} {...(pick ? { snapshotPick: pick } : {})} />)}
    </MatchCardLayoutContext>
  </SlipCardSummary></LockedSurface>;
}
