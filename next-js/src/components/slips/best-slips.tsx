"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AppBrandBar } from "@/components/navigation/app-brand-bar";
import { PerformanceSummary } from "@/components/performance/performance-summary";
import { ButtonLink, TextLink } from "@/components/ui/controls";
import { Stack } from "@/components/ui/layout";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { matchesHref } from "@/domain/navigation";
import { subscriberHref } from "@/domain/subscriber-navigation";
import { bestSlipsRules, type BestSlipsResult } from "@/domain/best-slips";
import { createMessages } from "@/i18n/messages";
import { CriteriaPanel, Note, SlipCard, SlipStack, SlipSummary, SlipTitle } from "./slip-styles";
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
  const complete = result.slips.length >= bestSlipsRules.count;
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
      {(!complete || result.searchLimited || result.partialCoverage) && <Note role="status">{m.text("bestSlips.partial")}</Note>}
      {result.slips.map((view) => view.slip ? <SlipTable key={view.rank} index={view.rank - 1} locale={locale}
        slip={view.slip} estimatedProbability={view.slip.estimatedProbability} /> : <SlipCard key={view.rank}>
        <SlipTitle><h3>{m.text("slips.slipTitle", { number: m.number(view.rank) })}</h3>
          <SlipSummary>
            <div><dt>{m.text("slips.totalOdds")}</dt><dd><TextLink href={subscriberHref(signedIn)} prefetch={false}>{m.text("paywall.lockedOdds")}</TextLink></dd></div>
            <div><dt>{m.text("bestSlips.probability")}</dt><dd><TextLink href={subscriberHref(signedIn)} prefetch={false}>{m.text("paywall.subscribersOnly")}</TextLink></dd></div>
            <div><dt>{m.text("slips.selectionCount")}</dt><dd>{m.number(view.matchCount)}</dd></div>
          </SlipSummary>
        </SlipTitle>
        <CriteriaPanel><Stack $gap="sm"><p>{m.text("bestSlips.subscriberMatches")}</p>
          <ButtonLink href={subscriberHref(signedIn)} prefetch={false}>{m.text(signedIn ? "subscribe.title" : "account.register")}</ButtonLink>
        </Stack></CriteriaPanel>
      </SlipCard>)}
    </>}
    <Note>{m.text("bestSlips.disclaimer")}</Note>
  </SlipStack>;
}
