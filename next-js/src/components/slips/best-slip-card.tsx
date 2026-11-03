"use client";

import { MatchCard } from "@/components/match/match-card";
import { MatchCardLayoutContext } from "@/components/match/match-card-layout";
import { useDesktopLayout } from "@/components/ui/use-desktop-layout";
import type { SlipPreviewView } from "@/domain/best-slips";
import { canonicalMatchSlug } from "@/domain/match-slug";
import { publicBestSlipPath } from "@/domain/public-best-slip";
import { SlipCard, SlipCardSummary } from "./slip-card";
import { LockedSurface, UnlockButton, UnlockLabel, UnlockLink } from "@/components/members/prediction-unlock";

/** Both public previews and entitled slips retain the production disclosure and match layout. */
export function BestSlipCard({ view, day, locale, signedIn = false }: { view: SlipPreviewView; day: string; locale: string; signedIn?: boolean }) {
  const desktop = useDesktopLayout(), publicationDay = view.publicationDay ?? day;
  const returnTo = publicBestSlipPath(locale, publicationDay, view.rank);
  const publication = { ...(view.publicationDay ? { publicationDay: view.publicationDay } : {}),
    ...(view.publishedAt !== undefined ? { publishedAt: view.publishedAt } : {}),
    ...(view.outcome ? { outcome: view.outcome } : {}), ...(view.status ? { status: view.status } : {}) };
  if (view.slip) return <SlipCard index={view.rank - 1} locale={locale} {...publication}
    {...(view.completed ? { publicShareHref: publicBestSlipPath(locale, publicationDay, view.rank) } : {})}
    shareSource={{ source: "best", day: publicationDay, slipId: view.slip.id }} slip={view.slip}
    {...(view.matchStates ? { matchStates: view.matchStates } : {})} />;
  return <LockedSurface data-locked-slip><SlipCardSummary locale={locale} index={view.rank - 1} {...publication} collapsible={false}
    totalOdds={view.totalOdds} averageProbability={view.averageProbability} selectionCount={view.matchCount}
    headerAction={desktop ? <span aria-hidden="true"><UnlockLabel locale={locale} /></span>
      : <UnlockButton locale={locale} signedIn={signedIn} returnTo={returnTo} compact />}>
    <MatchCardLayoutContext value={desktop}>
      {view.preview?.map(({ fixture, pick }, index) => <MatchCard key={fixture.fixtureId} fixture={fixture} locale={locale}
        interactive={!desktop} signedIn={signedIn} position={index + 1} headingLevel={3} lockedPrediction={pick === null}
        analysisSlug={canonicalMatchSlug(fixture.homeTeam.name, fixture.awayTeam.name)} {...(pick ? { snapshotPick: pick } : {})} />)}
    </MatchCardLayoutContext>
  </SlipCardSummary>{desktop && <UnlockLink locale={locale} signedIn={signedIn} returnTo={returnTo} overlay />}</LockedSurface>;
}
