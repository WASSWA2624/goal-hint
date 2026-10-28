"use client";

import { useId } from "react";
import Image from "next/image";
import Link from "@/components/navigation/navigation-link";
import { TeamLogo } from "@/components/match/team-logo";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { toUtcIsoString, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { compactLeagueName, compactMarketName, compactTeamName } from "@/domain/compact-fixture-label";
import { countryCode, countryDisplayName } from "@/domain/country-code";
import { countryFlagAsset } from "@/domain/country-flag";
import { snapshotCardPrediction } from "@/domain/match-card";
import { canonicalMatchSlug } from "@/domain/match-slug";
import { matchHref } from "@/domain/navigation";
import { predictionDescription, predictionLabel } from "@/domain/prediction-label";
import { isSafeRemoteImageUrl } from "@/domain/remote-image";
import type { SavedSlipView } from "@/domain/saved-slips";
import type { SlipSelection } from "@/domain/slip-builder";
import { slipSelectionCard } from "@/domain/slip-card";
import { useMessages } from "@/i18n/use-messages";
import { formatSlipProbability } from "../slip-format";
import { CleanLedgerRow } from "./clean-ledger-styles";

function logoSource(url: string | null | undefined): string | undefined {
  if (url?.startsWith("/") && !url.startsWith("//") && !/[\\\u0000-\u0020]/u.test(url)) return url;
  return isSafeRemoteImageUrl(url) ? url : undefined;
}

/** Production and review share the original selected snapshot, compact labels and three-row order. */
export function CleanLedgerSelection({ selection, locale, result, analysisLinks = false }: {
  selection: SlipSelection; locale: string; result?: SavedSlipView["results"][number]; analysisLinks?: boolean;
}) {
  const m = useMessages(locale), id = useId();
  const savedResult = result?.fixtureId === selection.fixtureId ? result : undefined;
  const { fixture, snapshotPick } = slipSelectionCard(selection, savedResult);
  const prediction = snapshotCardPrediction(snapshotPick), kickoff = fixture.kickoffAt!;
  const home = selection.homeTeam.name?.trim() || m.text("match.homeUnknown");
  const away = selection.awayTeam.name?.trim() || m.text("match.awayUnknown");
  const league = selection.competition.name || m.text("match.competitionUnknown");
  const country = countryDisplayName(selection.competition.country), flag = countryFlagAsset(selection.competition.country);
  const family = m.text(`market.family.${selection.family}`), description = predictionDescription(m, selection.selection);
  const outcome = prediction.status === "correct" ? m.text("match.result.won")
    : prediction.status === "incorrect" ? m.text("match.result.lost") : m.text(`outcome.${prediction.status}`);
  const publication = selection.forecast ? ` · ${m.text("match.published")}: ${m.reportingInstant(utcInstantFromEpochMilliseconds(selection.forecast.publishedAt))}` : "";
  const props = {
    "data-ledger-row": "", "data-mobile-row": "", "data-fixture-id": selection.fixtureId,
    "data-market": selection.family, "data-outcome": prediction.status, "data-status": fixture.status,
    "data-match-state": "snapshot", "aria-labelledby": `${id}-${analysisLinks ? "analysis" : "teams"}`,
    "aria-describedby": `${id}-meta ${id}-facts${savedResult ? ` ${id}-result` : ""}`,
  };
  const content = <>
    <div data-ledger-meta data-mobile-meta id={`${id}-meta`}>
      <time data-ledger-kickoff data-mobile-kickoff data-kickoff dateTime={toUtcIsoString(kickoff)} title={m.reportingInstant(kickoff)}>
        <span data-date data-mobile-date>{m.shortKickoffDate(kickoff)}</span><span data-clock data-mobile-clock>{m.shortKickoffTime(kickoff)}</span>
        <VisuallyHidden> {m.timeZone(kickoff)}</VisuallyHidden>
      </time>
      <span data-ledger-competition data-mobile-competition>
        <span data-ledger-league data-mobile-league data-competition title={league} aria-label={league}>
          <TeamLogo name={league} url={logoSource(selection.competition.logoUrl)} eager={false} size={12} />
          <span data-ledger-name data-short-name>{compactLeagueName(league)}</span>
        </span>
        {country && <span data-ledger-country data-mobile-country data-country title={country} aria-label={country}>
          {flag && <Image data-country-flag src={flag} alt="" width={15} height={10} loading="lazy" unoptimized />}
          <span data-ledger-name data-short-name>{countryCode(selection.competition.country)}</span>
        </span>}
      </span>
    </div>
    <h4 data-ledger-teams data-mobile-teams data-teams id={`${id}-teams`}>
      <span data-ledger-home data-home data-team-side="home" title={home} aria-label={home}>
        <span data-ledger-name data-short-name>{compactTeamName(home)}</span><TeamLogo name={home} url={logoSource(selection.homeTeam.logoUrl)} eager={false} size={14} />
      </span>
      <span data-ledger-versus data-mobile-versus data-versus>VS</span>
      <span data-ledger-away data-away data-team-side="away" title={away} aria-label={away}>
        <TeamLogo name={away} url={logoSource(selection.awayTeam.logoUrl)} eager={false} size={14} /><span data-ledger-name data-short-name>{compactTeamName(away)}</span>
      </span>
    </h4>
    <div data-ledger-facts data-mobile-facts id={`${id}-facts`}>
      <span data-ledger-field="market" data-mobile-field="market" title={family}><span data-field-label aria-hidden="true">Mkt</span>
        <span data-field-value data-market-label aria-hidden="true">{compactMarketName(selection.family)}</span><VisuallyHidden>{family}</VisuallyHidden></span>
      <span data-ledger-field="prediction" data-mobile-field="prediction" data-pick title={`${family}: ${description}${publication}`}>
        <span data-field-label aria-hidden="true">Pick</span><strong data-field-value data-pick-label title={`${family}: ${description}`} aria-hidden="true">{predictionLabel(m, selection.selection)}</strong>
        <VisuallyHidden>{description}</VisuallyHidden></span>
      <span data-ledger-field="odds" data-mobile-field="odds" data-leg-odds><span data-field-label data-number-label>{m.text("slips.odds")}</span><strong data-field-value>{selection.odds}</strong></span>
      <span data-ledger-field="probability" data-mobile-field="probability" data-leg-probability><span data-field-label data-number-label aria-hidden="true">Prob.</span><VisuallyHidden>{m.text("slips.probability")}: </VisuallyHidden>
        <strong data-field-value>{formatSlipProbability(selection.probability, m)}</strong></span>
    </div>
    {savedResult && <span data-result data-mobile-result id={`${id}-result`}><span data-outcome-label>{outcome}</span>
      {fixture.score && <span data-saved-score title={m.text("match.regulationScoreNote")}><VisuallyHidden>{m.text("match.regulationScoreNote")}: </VisuallyHidden>
        {m.number(fixture.score.home)}–{m.number(fixture.score.away)}</span>}</span>}
    {analysisLinks && <VisuallyHidden id={`${id}-analysis`}>{m.text("match.analysisLabel", { home, away })}</VisuallyHidden>}
  </>;
  return <li data-compact-selection={selection.fixtureId} data-slip-selection={selection.fixtureId}>
    {analysisLinks ? <CleanLedgerRow as={Link} href={matchHref(selection.fixtureId, canonicalMatchSlug(selection.homeTeam.name, selection.awayTeam.name), locale)} prefetch={false} {...props}>{content}</CleanLedgerRow>
      : <CleanLedgerRow role="group" {...props}>{content}</CleanLedgerRow>}
  </li>;
}
