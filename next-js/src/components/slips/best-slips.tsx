"use client";

import { memo, useCallback, useMemo, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AppBrandBar } from "@/components/navigation/app-brand-bar";
import { TextLink } from "@/components/ui/controls";
import { MutedText, Stack } from "@/components/ui/layout";
import { useDesktopLayout } from "@/components/ui/use-desktop-layout";
import { matchesHref } from "@/domain/navigation";
import type { SlipsBrowseResult } from "@/domain/best-slips";
import { bestSlipBand } from "@/domain/best-slip-odds-bands";
import { createMessages } from "@/i18n/messages";
import { CriteriaPanel, SlipList, SlipStack } from "./slip-styles";
import { BestSlipCard } from "./best-slip-card";
import { SlipMatchRefreshProvider } from "./slip-match-refresh";
import { BestSlipsFilters } from "./best-slips-filters";
import { BestSlipsPagination, BestSlipsSummary } from "./best-slips-browse-presentation";
import { slipViewKey } from "@/domain/slip-browse-window";
import { FilterButton } from "./best-slips-filter-styles";
import { useBestSlipsBrowse } from "./use-best-slips-browse";

const MemoBestSlipCard = memo(BestSlipCard);

export function BestSlips({ result, locale, signedIn = false, initialRead = false, emptyNavigation }: {
  result: SlipsBrowseResult; locale: string; signedIn?: boolean; initialRead?: boolean; emptyNavigation?: ReactNode;
}) {
  const m = createMessages(locale), router = useRouter();
  const desktop = useDesktopLayout();
  const [, startRefresh] = useTransition();
  const recheckAccess = useCallback(() => { startRefresh(() => router.refresh()); }, [router]);
  const browse = useBestSlipsBrowse(result, recheckAccess, "/api/best-slips", initialRead);
  const content = browse.result;
  const oddsRange = bestSlipBand(browse.displayQuery.oddsBand).label, listWindow = content.browse;
  const searchContinues = listWindow?.total === null && browse.hasMore;
  const pageOutOfBounds = listWindow?.total != null && listWindow.query.page > 1
    && (listWindow.query.page - 1) * listWindow.pageSize >= listWindow.total;
  const watchedSlips = useMemo(() => content.slips.flatMap((view) => view.slip ? [view.slip] : []), [content.slips]);
  const initialStates = useMemo(() => content.slips.flatMap((view) => view.matchStates ?? []), [content.slips]);
  const page = <SlipStack data-best-slips-page data-best-slips-initial-loading={browse.initialLoading ? "" : undefined}
    aria-busy={browse.initialLoading || undefined}>
    <AppBrandBar locale={locale} />
    <BestSlipsFilters query={browse.displayQuery} today={content.day} locale={locale} busy={browse.updating}
      scannedDates={listWindow?.total === null ? listWindow : undefined}
      summary={content.summary} statistics={content.summary ? content.summary.statistics : content.statistics} countSummary={content.state === "generated" || content.state === "awaiting-publication" && listWindow?.bandTotal === 0
        ? <BestSlipsSummary result={content} locale={locale} /> : null} onChange={browse.change} />
    {browse.stale && <MutedText role="status" data-best-slips-stale>{m.text("bestSlips.filters.stale")}</MutedText>}
    {browse.readError && content.state !== "data-unavailable" && <CriteriaPanel role="alert" data-best-slips-update-failed><Stack $gap="sm">
      <h2>{m.text(browse.readError === "limited" ? "bestSlips.filters.rateLimited" : "bestSlips.filters.updateUnavailable")}</h2>
      <FilterButton type="button" onClick={browse.retry} disabled={browse.updating}>{m.text("bestSlips.filters.retry")}</FilterButton>
    </Stack></CriteriaPanel>}
    {browse.initialLoading ? null : content.state === "data-unavailable" ? <CriteriaPanel role="alert"><Stack $gap="sm">
      <h2>{m.text(browse.readError === "limited" ? "slips.state.rate-limited.description"
        : browse.readError === "access" ? "bestSlips.filters.accessUnconfirmed"
        : browse.readError === "changed" ? "bestSlips.filters.resultsChanged" : "bestSlips.filters.dataUnavailable")}</h2>
      <FilterButton type="button" onClick={browse.retry} disabled={browse.updating}>{m.text("bestSlips.filters.retry")}</FilterButton>
    </Stack></CriteriaPanel>
    : content.slips.length === 0 && listWindow && content.state === "generated" ? <CriteriaPanel role="status"><Stack $gap="sm">
      <h2>{m.text(searchContinues ? "bestSlips.filters.emptyPage" : listWindow.bandTotal === 0 ? "bestSlips.filters.emptyBand" : "bestSlips.filters.empty", { oddsRange })}</h2>
      <p>{m.text(searchContinues ? "bestSlips.filters.emptyPageHint" : "bestSlips.filters.emptyHint")}</p>
      {pageOutOfBounds && <FilterButton type="button" onClick={browse.goToFirstPage} disabled={browse.updating}>{m.text("pagination.firstPage")}</FilterButton>}
    </Stack></CriteriaPanel>
    : content.slips.length === 0 ? <CriteriaPanel role="status"><Stack $gap="sm">
      <h2>{m.text("bestSlips.emptyTitle")}</h2>
      <p>{m.text(content.state === "odds-unavailable" ? "bestSlips.oddsUnavailable" : content.state === "model-unavailable"
        ? "bestSlips.modelUnavailable" : content.state === "awaiting-publication" ? "bestSlips.awaitingPublication"
        : content.state === "rate-limited" ? "slips.state.rate-limited.description" : "bestSlips.insufficient", { oddsRange })}</p>
      <TextLink href={matchesHref(locale)} prefetch={false}>{m.text("bestSlips.browseMatches")}</TextLink>
    </Stack></CriteriaPanel> :
      <SlipMatchRefreshProvider slips={watchedSlips} initialStates={initialStates} enabled={desktop && browse.entitled} editorial onAccessRevoked={browse.revokeAccess}
        {...(content.summary?.asOf !== undefined ? { initialAsOf: content.summary.asOf } : {})}>
        <div tabIndex={-1} aria-busy={browse.updating}><SlipList data-slip-list>{content.slips.map(view => <div key={slipViewKey(view)} data-slip-key={slipViewKey(view)}>
          <MemoBestSlipCard view={view} day={content.day} locale={locale} signedIn={content.access?.signedIn ?? signedIn} />
        </div>)}</SlipList></div>
      </SlipMatchRefreshProvider>}
    <BestSlipsPagination onShowMore={browse.showMore} hasMore={browse.hasMore} loading={browse.loadingMore}
      failed={browse.appendError} disabled={browse.updating} locale={locale} />
  </SlipStack>;
  return emptyNavigation ? <Stack $gap="sm">{page}{!browse.initialLoading && content.slips.length === 0 && emptyNavigation}</Stack> : page;
}
