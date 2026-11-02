"use client";

import { Fragment, useCallback, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MatchListDivider } from "@/components/match/match-card-list";
import { AppBrandBar } from "@/components/navigation/app-brand-bar";
import { TextLink } from "@/components/ui/controls";
import { Stack } from "@/components/ui/layout";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { useDesktopLayout } from "@/components/ui/use-desktop-layout";
import { matchesHref } from "@/domain/navigation";
import type { SlipsBrowseResult } from "@/domain/best-slips";
import { resolveBestSlipsDates } from "@/domain/best-slips-query";
import { createMessages } from "@/i18n/messages";
import { CriteriaPanel, Note, SlipList, SlipStack } from "./slip-styles";
import { BestSlipCard } from "./best-slip-card";
import { SlipLoading } from "./slip-loading";
import { SlipMatchRefreshProvider } from "./slip-match-refresh";
import { BestSlipsFilters } from "./best-slips-filters";
import { BestSlipsPagination, BestSlipsSummary } from "./best-slips-browse-presentation";
import { InfiniteResults } from "@/components/ui/infinite-results";
import { slipViewKey } from "@/domain/slip-browse-window";
import { FilterButton, FiltersRow } from "./best-slips-filter-styles";
import { useBestSlipsBrowse } from "./use-best-slips-browse";

export function BestSlips({ result, locale, signedIn = false, source = "best" }: { result: SlipsBrowseResult; locale: string; signedIn?: boolean; source?: "best" | "saved" }) {
  const m = createMessages(locale), router = useRouter();
  const desktop = useDesktopLayout();
  const [, startRefresh] = useTransition();
  const recheckAccess = useCallback(() => { startRefresh(() => router.refresh()); }, [router]);
  const { root, ...browse } = useBestSlipsBrowse(result, recheckAccess, source === "saved" ? "/api/slips/history" : "/api/best-slips");
  const content = browse.result;
  const dates = resolveBestSlipsDates(desktop ? browse.query : browse.displayQuery, result.day);
  const period = dates.from && dates.to
    ? dates.from === dates.to ? `${m.reportingDateMedium(dates.from)} · EAT`
      : m.text("bestSlips.filters.dateRange", { from: m.reportingDateMedium(dates.from), to: m.reportingDateMedium(dates.to) })
    : m.text("bestSlips.filters.allDates");
  const watchedSlips = useMemo(() => content?.slips.flatMap((view) => view.slip ? [view.slip] : []) ?? [], [content]);
  const initialStates = useMemo(() => content?.slips.flatMap((view) => view.matchStates ?? []) ?? [], [content]);
  return <SlipStack data-best-slips-page>
    {source === "best" ? <AppBrandBar locale={locale} /> : <Stack $gap="sm"><h2>{m.text("history.savedTitle")}</h2><Note>{m.text("history.savedHint")}</Note></Stack>}
    <VisuallyHidden as={source === "best" ? "h1" : "h2"}>{m.text("bestSlips.title")}</VisuallyHidden>
    <BestSlipsFilters query={browse.query} appliedQuery={browse.displayQuery} today={result.day} locale={locale}
      entitled={browse.entitled} busy={browse.loading || browse.updating} updating={browse.updating}
      summary={content?.summary} statistics={content?.summary?.statistics ?? (content?.summary ? null : content?.statistics)} countSummary={content?.state === "generated"
        ? <BestSlipsSummary result={content} period={period} locale={locale} /> : null} onChange={browse.change} />
    {browse.failed && content && <FiltersRow role="alert" data-best-slips-update-failed>
      <Note>{m.text("bestSlips.filters.updateFailed")}</Note>
      <FilterButton type="button" onClick={browse.retry}>{m.text("bestSlips.filters.retry")}</FilterButton>
    </FiltersRow>}
    {browse.loading ? <SlipLoading locale={locale} />
    : browse.failed && !content ? <CriteriaPanel role="alert"><Stack $gap="sm"><p>{m.text("bestSlips.filters.dataUnavailable")}</p>
      <FilterButton type="button" onClick={browse.retry}>{m.text("bestSlips.filters.retry")}</FilterButton></Stack></CriteriaPanel>
    : content.state === "data-unavailable" ? <CriteriaPanel role="alert"><Stack $gap="sm">
      <h2>{m.text("bestSlips.filters.dataUnavailable")}</h2>
      <FilterButton type="button" onClick={browse.retry}>{m.text("bestSlips.filters.retry")}</FilterButton>
    </Stack></CriteriaPanel>
    : content && content.slips.length === 0 && content.browse && content.state === "generated" ? <CriteriaPanel role="status"><Stack $gap="sm">
      <h2>{m.text(content.browse.total === null && content.browse.hasMore ? "bestSlips.filters.emptyPage" : "bestSlips.filters.empty")}</h2>
      <p>{m.text(content.browse.total === null && content.browse.hasMore ? "bestSlips.filters.emptyPageHint" : "bestSlips.filters.emptyHint")}</p>
    </Stack></CriteriaPanel>
    : content && content.slips.length === 0 ? <CriteriaPanel role="status"><Stack $gap="sm">
      <h2>{m.text("bestSlips.emptyTitle")}</h2>
      <p>{m.text(content.state === "odds-unavailable" ? "bestSlips.oddsUnavailable" : content.state === "model-unavailable"
        ? "bestSlips.modelUnavailable" : content.state === "rate-limited" ? "slips.state.rate-limited.description" : "bestSlips.insufficient")}</p>
      <TextLink href={matchesHref(locale)} prefetch={false}>{m.text("bestSlips.browseMatches")}</TextLink>
    </Stack></CriteriaPanel> : content && <>
      {(content.searchLimited || content.partialCoverage) && <Note role="status">{m.text("bestSlips.partial")}</Note>}
      <SlipMatchRefreshProvider slips={watchedSlips} initialStates={initialStates} enabled={desktop && browse.entitled} onAccessRevoked={browse.revokeAccess}>
      <div ref={root} tabIndex={-1}><SlipList data-slip-list>{content.slips.map((view, index) => <Fragment key={slipViewKey(view)}>
        {view.publicationDay && (index === 0 || content.slips[index - 1]?.publicationDay !== view.publicationDay) && <MatchListDivider as="div" title={`${m.reportingDateMedium(view.publicationDay)} · EAT`} />}
        <div data-slip-key={slipViewKey(view)}>
        <BestSlipCard source={source} view={view} day={content.day} locale={locale} signedIn={content.access?.signedIn ?? signedIn} /></div></Fragment>)}</SlipList></div>
      </SlipMatchRefreshProvider>
    </>}
    <InfiniteResults hasMore={content.browse?.hasMore === true} busy={browse.updating} failed={browse.failed}
      onMore={browse.failed ? browse.retry : browse.loadMore} locale={locale} />
    {content.browse && !content.browse.hasMore && content.slips.length > 0 && <Note>{m.text("history.end")}</Note>}
    {content?.browse?.total !== null && content?.browse?.total !== undefined && <BestSlipsPagination onPage={browse.goToPage}
      total={content.browse.total} page={browse.displayQuery.page}
      busy={browse.navigating || browse.retained} locale={locale} />}
    <Note>{m.text("bestSlips.disclaimer")}</Note>
  </SlipStack>;
}
