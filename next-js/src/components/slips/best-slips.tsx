"use client";

import { useCallback, useEffect, useMemo, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AppBrandBar } from "@/components/navigation/app-brand-bar";
import { PerformanceSummary } from "@/components/performance/performance-summary";
import { ButtonLink, TextLink } from "@/components/ui/controls";
import { Stack } from "@/components/ui/layout";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { useDesktopLayout } from "@/components/ui/use-desktop-layout";
import { matchesHref } from "@/domain/navigation";
import { subscriberHref } from "@/domain/subscriber-navigation";
import type { BestSlipsResult } from "@/domain/best-slips";
import { createMessages } from "@/i18n/messages";
import { CriteriaPanel, Note, SlipList, SlipStack } from "./slip-styles";
import { CompactSlipDisclosure } from "./compact-slip/compact-slip";
import { DesktopSlipDisclosure } from "./desktop-slip/desktop-slip";
import { SlipTable } from "./slip-table";
import { SlipMatchRefreshProvider } from "./slip-match-refresh";

export function BestSlips({ result, locale, signedIn = false }: { result: BestSlipsResult; locale: string; signedIn?: boolean }) {
  const m = createMessages(locale), router = useRouter();
  const desktop = useDesktopLayout();
  const SummaryDisclosure = desktop ? DesktopSlipDisclosure : CompactSlipDisclosure;
  const watchedSlips = useMemo(() => result.slips.flatMap((view) => view.slip ? [view.slip] : []), [result.slips]);
  const initialStates = useMemo(() => result.slips.flatMap((view) => view.matchStates ?? []), [result.slips]);
  const pageRefreshMs = desktop && watchedSlips.length ? 60_000 : 20_000;
  const [refreshing, startRefresh] = useTransition();
  const recheckAccess = useCallback(() => { startRefresh(() => router.refresh()); }, [router]);
  const refreshInFlight = useRef(false);
  useEffect(() => {
    refreshInFlight.current = refreshing;
    if (refreshing) return;
    const refresh = () => {
      // A later refresh can replace a navigation that has not committed yet.
      if (refreshInFlight.current || document.visibilityState !== "visible" || !navigator.onLine
        || document.querySelector("[data-navigation-pending]")) return;
      refreshInFlight.current = true;
      startRefresh(() => router.refresh());
    };
    const timer = setInterval(refresh, pageRefreshMs);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [refreshing, router, pageRefreshMs]);
  return <SlipStack>
    <AppBrandBar locale={locale} />
    <VisuallyHidden as="h1">{m.text("bestSlips.title")}</VisuallyHidden>
    {result.statistics && <PerformanceSummary counts={result.statistics} locale={locale} kind="slips" period={`${m.reportingDateMedium(result.day)} · EAT`} />}
    {result.slips.length === 0 ? <CriteriaPanel role="status"><Stack $gap="sm">
      <h2>{m.text("bestSlips.emptyTitle")}</h2>
      <p>{m.text(result.state === "odds-unavailable" ? "bestSlips.oddsUnavailable" : result.state === "model-unavailable"
        ? "bestSlips.modelUnavailable" : result.state === "rate-limited" ? "slips.state.rate-limited.description" : "bestSlips.insufficient")}</p>
      <TextLink href={matchesHref(locale)} prefetch={false}>{m.text("bestSlips.browseMatches")}</TextLink>
    </Stack></CriteriaPanel> : <>
      {(result.searchLimited || result.partialCoverage) && <Note role="status">{m.text("bestSlips.partial")}</Note>}
      <SlipMatchRefreshProvider slips={watchedSlips} initialStates={initialStates} enabled={desktop} onAccessRevoked={recheckAccess}
        accessFallback={<CriteriaPanel role="status"><ButtonLink href={subscriberHref(signedIn, "/en", "login")} prefetch={false}>
          {m.text(signedIn ? "subscribe.title" : "bestSlips.loginToAccess")}
        </ButtonLink></CriteriaPanel>}>
      <SlipList data-slip-list>{result.slips.map((view) => view.slip ? <SlipTable key={view.slip.id} index={view.rank - 1} locale={locale}
        slip={view.slip} {...(view.matchStates ? { matchStates: view.matchStates } : {})} /> : <SummaryDisclosure key={view.rank} locale={locale} index={view.rank - 1}
          totalOdds={view.totalOdds} averageProbability={view.averageProbability} selectionCount={view.matchCount}>
        <CriteriaPanel>
          <ButtonLink href={subscriberHref(signedIn, "/en", "login")} prefetch={false}>
            {m.text(signedIn ? "subscribe.title" : "bestSlips.loginToAccess")}
          </ButtonLink>
        </CriteriaPanel>
      </SummaryDisclosure>)}</SlipList>
      </SlipMatchRefreshProvider>
    </>}
    <Note>{m.text("bestSlips.disclaimer")}</Note>
  </SlipStack>;
}
