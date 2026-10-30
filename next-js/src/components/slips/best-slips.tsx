"use client";

import { useCallback, useEffect, useMemo, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AppBrandBar } from "@/components/navigation/app-brand-bar";
import { PerformanceSummary } from "@/components/performance/performance-summary";
import { TextLink } from "@/components/ui/controls";
import { Stack } from "@/components/ui/layout";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { useDesktopLayout } from "@/components/ui/use-desktop-layout";
import { matchesHref } from "@/domain/navigation";
import type { BestSlipsResult } from "@/domain/best-slips";
import { defaultBestSlipsQuery, resolveBestSlipsDates } from "@/domain/best-slips-query";
import { createMessages } from "@/i18n/messages";
import { CriteriaPanel, Note, SlipList, SlipStack } from "./slip-styles";
import { CompactSlipDisclosure } from "./compact-slip/compact-slip";
import { DesktopSlipDisclosure } from "./desktop-slip/desktop-slip";
import { SlipTable } from "./slip-table";
import { SlipMatchRefreshProvider } from "./slip-match-refresh";
import { BestSlipsFilters } from "./best-slips-filters";
import { BestSlipsPagination, BestSlipsSummary } from "./best-slips-browse-presentation";
import { BestSlipsAccess } from "./best-slips-access";
import { FilterButton } from "./best-slips-filter-styles";
import { useBestSlipsBrowse } from "./use-best-slips-browse";

export function BestSlips({ result, locale, signedIn = false }: { result: BestSlipsResult; locale: string; signedIn?: boolean }) {
  const m = createMessages(locale), router = useRouter();
  const desktop = useDesktopLayout();
  const [refreshing, startRefresh] = useTransition();
  const recheckAccess = useCallback(() => { startRefresh(() => router.refresh()); }, [router]);
  const browse = useBestSlipsBrowse(result, desktop, recheckAccess), content = browse.result;
  const dates = resolveBestSlipsDates(desktop ? browse.query : defaultBestSlipsQuery(browse.entitled), result.day);
  const requiresSubscription = !browse.entitled && (dates.to === null || dates.to >= result.day);
  const period = dates.from && dates.to
    ? dates.from === dates.to ? `${m.reportingDateMedium(dates.from)} · EAT`
      : m.text("bestSlips.filters.dateRange", { from: m.reportingDateMedium(dates.from), to: m.reportingDateMedium(dates.to) })
    : m.text("bestSlips.filters.allDates");
  const SummaryDisclosure = desktop ? DesktopSlipDisclosure : CompactSlipDisclosure;
  const watchedSlips = useMemo(() => content?.slips.flatMap((view) => view.slip ? [view.slip] : []) ?? [], [content]);
  const initialStates = useMemo(() => content?.slips.flatMap((view) => view.matchStates ?? []) ?? [], [content]);
  const pageRefreshMs = desktop && browse.entitled && watchedSlips.length ? 60_000 : 20_000;
  const refreshInFlight = useRef(false);
  useEffect(() => {
    refreshInFlight.current = refreshing;
    if (refreshing) return;
    const refresh = () => {
      // A later refresh can replace a navigation that has not committed yet.
      if (refreshInFlight.current || document.visibilityState !== "visible" || !navigator.onLine
        || document.querySelector("[data-navigation-pending]") || browse.loading) return;
      refreshInFlight.current = true;
      startRefresh(() => router.refresh());
    };
    const timer = setInterval(refresh, pageRefreshMs);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [refreshing, router, pageRefreshMs, browse.loading]);
  return <SlipStack>
    <AppBrandBar locale={locale} />
    <VisuallyHidden as="h1">{m.text("bestSlips.title")}</VisuallyHidden>
    {desktop && <BestSlipsFilters query={browse.query} today={result.day} locale={locale} entitled={browse.entitled} busy={browse.loading}
      statistics={content?.statistics} countSummary={content && (!requiresSubscription || content.slips.length > 0)
        ? <BestSlipsSummary result={content} period={period} locale={locale} /> : null} onChange={browse.change} />}
    {requiresSubscription && <BestSlipsAccess signedIn={signedIn} locale={locale} />}
    {!desktop && content?.statistics && <PerformanceSummary counts={content.statistics} locale={locale} kind="slips" period={period} />}
    {browse.loading ? <CriteriaPanel role="status" aria-busy="true">{m.text("bestSlips.filters.loading")}</CriteriaPanel>
    : browse.failed ? <CriteriaPanel role="alert"><Stack $gap="sm"><p>{m.text("bestSlips.filters.dataUnavailable")}</p>
      <FilterButton type="button" onClick={browse.retry}>{m.text("bestSlips.filters.retry")}</FilterButton></Stack></CriteriaPanel>
    : content && content.slips.length === 0 && requiresSubscription && content.state !== "data-unavailable" ? null
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
      <SlipMatchRefreshProvider slips={watchedSlips} initialStates={initialStates} enabled={desktop && browse.entitled} onAccessRevoked={recheckAccess}
        accessFallback={requiresSubscription ? null : <BestSlipsAccess signedIn={signedIn} locale={locale} />}>
      <SlipList data-slip-list>{content.slips.map((view) => <div key={view.id ?? view.slip?.id ?? view.rank}>
        {view.slip ? <SlipTable index={view.rank - 1} locale={locale}
        {...(view.publicationDay ? { publicationDay: view.publicationDay } : {})}
        {...(view.publishedAt !== undefined ? { publishedAt: view.publishedAt } : {})} {...(view.outcome ? { outcome: view.outcome } : {})}
        {...(view.status ? { status: view.status } : {})}
        shareSource={{ source: "best", day: view.publicationDay ?? content.day, slipId: view.slip.id }}
        slip={view.slip} {...(view.matchStates ? { matchStates: view.matchStates } : {})} /> : <SummaryDisclosure key={view.rank} locale={locale} index={view.rank - 1}
          totalOdds={view.totalOdds} averageProbability={view.averageProbability} selectionCount={view.matchCount}
          {...(view.publicationDay ? { publicationDay: view.publicationDay } : {})}
          {...(view.publishedAt !== undefined ? { publishedAt: view.publishedAt } : {})} {...(view.outcome ? { outcome: view.outcome } : {})}
          {...(view.status ? { status: view.status } : {})} collapsible={false}>
        {null}
      </SummaryDisclosure>}</div>)}</SlipList>
      </SlipMatchRefreshProvider>
    </>}
    {desktop && (browse.loading || browse.canPrevious || content?.browse?.hasMore) && <BestSlipsPagination previous={browse.previous} next={browse.next}
      canPrevious={browse.canPrevious} canNext={content?.browse?.hasMore ?? false} page={browse.query.page} busy={browse.loading} locale={locale} />}
    <Note>{m.text("bestSlips.disclaimer")}</Note>
  </SlipStack>;
}
