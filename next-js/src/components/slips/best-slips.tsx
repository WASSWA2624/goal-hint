"use client";

import { memo, useCallback, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AppBrandBar } from "@/components/navigation/app-brand-bar";
import { TextLink } from "@/components/ui/controls";
import { Stack } from "@/components/ui/layout";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { useDesktopLayout } from "@/components/ui/use-desktop-layout";
import { matchesHref } from "@/domain/navigation";
import type { SlipsBrowseResult } from "@/domain/best-slips";
import { createMessages } from "@/i18n/messages";
import { CriteriaPanel, Note, SlipList, SlipStack } from "./slip-styles";
import { BestSlipCard } from "./best-slip-card";
import { SlipMatchRefreshProvider } from "./slip-match-refresh";
import { BestSlipsFilters } from "./best-slips-filters";
import { BestSlipsPagination, BestSlipsSummary } from "./best-slips-browse-presentation";
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
  const watchedSlips = useMemo(() => content.slips.flatMap((view) => view.slip ? [view.slip] : []), [content.slips]);
  const initialStates = useMemo(() => content.slips.flatMap((view) => view.matchStates ?? []), [content.slips]);
  return <SlipStack data-best-slips-page>
    <AppBrandBar locale={locale} />
    <VisuallyHidden as="h1">{m.text("bestSlips.title")}</VisuallyHidden>
    <BestSlipsFilters query={browse.query} appliedQuery={browse.displayQuery} today={result.day} locale={locale}
      entitled={browse.entitled} busy={browse.loading || browse.updating}
      scannedDates={content?.browse?.total === null ? content.browse : undefined}
      summary={content?.summary} statistics={content?.summary?.statistics ?? (content?.summary ? null : content?.statistics)} countSummary={content?.state === "generated"
        ? <BestSlipsSummary result={content} locale={locale} /> : null} onChange={browse.change} />
    {browse.loading ? null
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
      <div ref={root} tabIndex={-1}><SlipList data-slip-list>{content.slips.map(view => <div key={slipViewKey(view)} data-slip-key={slipViewKey(view)}>
        <MemoBestSlipCard view={view} day={content.day} locale={locale} signedIn={content.access?.signedIn ?? signedIn} />
      </div>)}</SlipList></div>
      </SlipMatchRefreshProvider>
    </>}
    {content.browse && !content.browse.hasMore && content.slips.length > 0 && <Note>{m.text("bestSlips.filters.end")}</Note>}
    {content?.browse?.total !== null && content?.browse?.total !== undefined && <BestSlipsPagination onPage={browse.goToPage}
      total={content.browse.total} page={browse.displayQuery.page}
      busy={browse.navigating || browse.retained} locale={locale} />}
    <Note>{m.text("bestSlips.disclaimer")}</Note>
  </SlipStack>;
}
