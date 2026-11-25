"use client";

import { memo, useCallback, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AppBrandBar } from "@/components/navigation/app-brand-bar";
import { TextLink } from "@/components/ui/controls";
import { Stack } from "@/components/ui/layout";
import { useDesktopLayout } from "@/components/ui/use-desktop-layout";
import { matchesHref } from "@/domain/navigation";
import type { SlipsBrowseResult } from "@/domain/best-slips";
import { bestSlipBand } from "@/domain/best-slip-odds-bands";
import { createMessages } from "@/i18n/messages";
import { CriteriaPanel, SlipList, SlipStack } from "./slip-styles";
import { BestSlipCard } from "./best-slip-card";
import { SlipMatchRefreshProvider } from "./slip-match-refresh";
import { BestSlipsFilters } from "./best-slips-filters";
import { BestSlipsArchivePagination, BestSlipsPagination, BestSlipsSummary } from "./best-slips-browse-presentation";
import { slipViewKey } from "@/domain/slip-browse-window";
import { FilterButton } from "./best-slips-filter-styles";
import { useBestSlipsBrowse } from "./use-best-slips-browse";

const MemoBestSlipCard = memo(BestSlipCard);

export function BestSlips({ result, locale, signedIn = false }: { result: SlipsBrowseResult; locale: string; signedIn?: boolean }) {
  const m = createMessages(locale), router = useRouter();
  const desktop = useDesktopLayout();
  const [, startRefresh] = useTransition();
  const recheckAccess = useCallback(() => { startRefresh(() => router.refresh()); }, [router]);
  const { root, ...browse } = useBestSlipsBrowse(result, recheckAccess, "/api/best-slips");
  const content = browse.result;
  const oddsRange = bestSlipBand(browse.displayQuery.oddsBand).label, listWindow = content.browse;
  const searchContinues = listWindow?.total === null && listWindow.hasMore;
  const pageOutOfBounds = listWindow?.total != null && listWindow.query.page > 1
    && (listWindow.query.page - 1) * listWindow.pageSize >= listWindow.total;
  const watchedSlips = useMemo(() => content.slips.flatMap((view) => view.slip ? [view.slip] : []), [content.slips]);
  const initialStates = useMemo(() => content.slips.flatMap((view) => view.matchStates ?? []), [content.slips]);
  return <SlipStack data-best-slips-page>
    <AppBrandBar locale={locale} />
    <BestSlipsFilters query={browse.displayQuery} today={content.day} locale={locale} busy={browse.updating}
      scannedDates={listWindow?.total === null ? listWindow : undefined}
      summary={content.summary} statistics={content.summary ? content.summary.statistics : content.statistics} countSummary={content.state === "generated" || content.state === "awaiting-publication" && listWindow?.bandTotal === 0
        ? <BestSlipsSummary result={content} locale={locale} /> : null} onChange={browse.change} />
    {content.state === "data-unavailable" ? <CriteriaPanel role="alert"><Stack $gap="sm">
      <h2>{m.text("bestSlips.filters.dataUnavailable")}</h2>
      <FilterButton type="button" onClick={browse.retry}>{m.text("bestSlips.filters.retry")}</FilterButton>
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
        <div ref={root} tabIndex={-1} aria-busy={browse.updating}><SlipList data-slip-list>{content.slips.map(view => <div key={slipViewKey(view)} data-slip-key={slipViewKey(view)}>
          <MemoBestSlipCard view={view} day={content.day} locale={locale} signedIn={content.access?.signedIn ?? signedIn} />
        </div>)}</SlipList></div>
      </SlipMatchRefreshProvider>}
    {listWindow && (listWindow.total === null ? <BestSlipsArchivePagination query={listWindow.query} nextCursor={listWindow.nextCursor}
      onFirst={browse.goToFirstPage} onOlder={browse.goToOlder} busy={browse.navigating} locale={locale} />
      : <BestSlipsPagination onPage={browse.goToPage} total={listWindow.total} page={browse.displayQuery.page}
        busy={browse.navigating} locale={locale} />)}
  </SlipStack>;
}
