"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppBrandBar } from "@/components/navigation/app-brand-bar";
import { PerformanceSummary } from "@/components/performance/performance-summary";
import { ButtonLink, TextLink } from "@/components/ui/controls";
import { Inline, Stack } from "@/components/ui/layout";
import { matchesHref, slipsHref } from "@/domain/navigation";
import { subscriberHref } from "@/domain/subscriber-navigation";
import { bestSlipsRules, type BestSlipsResult } from "@/domain/best-slips";
import { createMessages } from "@/i18n/messages";
import { CriteriaPanel, Note, SlipCard, SlipHeading, SlipStack, SlipSummary, SlipTitle } from "./slip-styles";
import { SlipTable } from "./slip-table";

export function BestSlips({ result, locale, signedIn = false }: { result: BestSlipsResult; locale: string; signedIn?: boolean }) {
  const m = createMessages(locale), router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 20_000);
    const visible = () => { if (document.visibilityState === "visible") router.refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [router]);
  const complete = result.slips.length >= bestSlipsRules.count;
  return <SlipStack>
    <AppBrandBar locale={locale} />
    <Inline><SlipHeading>{m.text("bestSlips.title")}</SlipHeading><Note>{m.reportingDateMedium(result.day)} · EAT</Note></Inline>
    <Note>{m.text("bestSlips.description")}</Note>
    <Inline><TextLink href={matchesHref(locale)} prefetch={false}>{m.text("navigation.matches")}</TextLink>
      <TextLink href={slipsHref(locale)} prefetch={false}>{m.text("navigation.slips")}</TextLink></Inline>
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
