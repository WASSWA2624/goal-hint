"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AppBrandBar } from "@/components/navigation/app-brand-bar";
import { PredictionDefinitions } from "@/components/match/prediction-definitions";
import { PerformanceSummary } from "@/components/performance/performance-summary";
import { ButtonLink, TextLink } from "@/components/ui/controls";
import { Stack } from "@/components/ui/layout";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { matchesHref } from "@/domain/navigation";
import { subscriberHref } from "@/domain/subscriber-navigation";
import type { BestSlipsResult } from "@/domain/best-slips";
import { createMessages } from "@/i18n/messages";
import { CriteriaPanel, Note, SlipStack } from "./slip-styles";
import { SlipDisclosure } from "./slip-disclosure";
import { SlipSummaryFacts } from "./slip-summary-facts";
import { SlipTable } from "./slip-table";

export function BestSlips({ result, locale, signedIn = false }: { result: BestSlipsResult; locale: string; signedIn?: boolean }) {
  const m = createMessages(locale), router = useRouter();
  const [refreshing, startRefresh] = useTransition();
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
    const timer = setInterval(refresh, 20_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [refreshing, router]);
  return <SlipStack>
    <AppBrandBar locale={locale} />
    <VisuallyHidden as="h1">{m.text("bestSlips.title")}</VisuallyHidden>
    {result.statistics && <PerformanceSummary counts={result.statistics} locale={locale} kind="slips" period={`${m.reportingDateMedium(result.day)} · EAT`} />}
    {result.slips.some((view) => view.slip) && <PredictionDefinitions locale={locale} />}
    {result.slips.length === 0 ? <CriteriaPanel role="status"><Stack $gap="sm">
      <h2>{m.text("bestSlips.emptyTitle")}</h2>
      <p>{m.text(result.state === "odds-unavailable" ? "bestSlips.oddsUnavailable" : result.state === "model-unavailable"
        ? "bestSlips.modelUnavailable" : result.state === "rate-limited" ? "slips.state.rate-limited.description" : "bestSlips.insufficient")}</p>
      <TextLink href={matchesHref(locale)} prefetch={false}>{m.text("bestSlips.browseMatches")}</TextLink>
    </Stack></CriteriaPanel> : <>
      {(result.searchLimited || result.partialCoverage) && <Note role="status">{m.text("bestSlips.partial")}</Note>}
      {result.slips.map((view) => view.slip ? <SlipTable key={view.slip.id} index={view.rank - 1} locale={locale}
        slip={view.slip} estimatedProbability={view.slip.estimatedProbability} collapsible /> : <SlipDisclosure key={view.rank} locale={locale} summary={<>
        <h3>{m.text("slips.slipTitle", { number: m.number(view.rank) })}</h3>
        {view.rank === 1 && <span data-slip-rank>{m.text("slips.topRanked")}</span>}
        <SlipSummaryFacts locale={locale} totalOdds={view.totalOdds} probability={view.estimatedProbability} selectionCount={view.matchCount} />
        </>}>
        <CriteriaPanel>
          <ButtonLink href={subscriberHref(signedIn, "/en", "login")} prefetch={false}>
            {m.text(signedIn ? "subscribe.title" : "bestSlips.loginToAccess")}
          </ButtonLink>
        </CriteriaPanel>
      </SlipDisclosure>)}
    </>}
    <Note>{m.text("bestSlips.disclaimer")}</Note>
  </SlipStack>;
}
