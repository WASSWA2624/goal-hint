"use client";

import { useId } from "react";
import Image from "next/image";
import { TeamLogo } from "@/components/match/team-logo";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { getReportingDate, toUtcIsoString } from "@/domain/calendar";
import { countryCode, countryDisplayName } from "@/domain/country-code";
import { countryFlagAsset } from "@/domain/country-flag";
import { snapshotCardPrediction } from "@/domain/match-card";
import { predictionDescription, predictionLabel } from "@/domain/prediction-label";
import { publicPolicy } from "@/domain/public-policy";
import type { SavedSlipView } from "@/domain/saved-slips";
import type { SlipSelection } from "@/domain/slip-builder";
import { slipSelectionCard } from "@/domain/slip-card";
import { createMessages } from "@/i18n/messages";
import { formatSlipProbability } from "../slip-format";

const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: publicPolicy.reportingTimeZone, hour: "numeric", minute: "2-digit", hour12: true,
});
const markets = { "match-result": "1X2", "double-chance": "DC", "total-goals": "O/U", "both-teams-to-score": "BTTS" } as const;
const leagues: Readonly<Record<string, string>> = {
  "Premier League": "EPL", "Serie A": "Serie A", "Primeira Liga": "Liga PT",
  "International Club Championship — Qualification": "ICC Q",
};
const teams: Readonly<Record<string, string>> = {
  "Inter Milan": "Inter", "Sporting CP": "Sporting", "Wolverhampton Wanderers": "Wolves",
  "Brighton & Hove Albion": "Brighton", "Borussia Mönchengladbach": "M'gladbach",
  "1. FC Heidenheim 1846": "Heidenheim", "Club Athletico Paranaense": "Athletico PR", "Red Bull Bragantino": "Bragantino",
};

/** A single row supplies all candidates with the same snapshot, reading order and compact labels. */
export function MobileSlipRow({ selection, locale, result }: {
  selection: SlipSelection; locale: string; result?: SavedSlipView["results"][number];
}) {
  const m = createMessages(locale), id = useId();
  const { fixture, snapshotPick } = slipSelectionCard(selection, result);
  const prediction = snapshotCardPrediction(snapshotPick), kickoff = fixture.kickoffAt!;
  const day = m.reportingDayParts(getReportingDate(kickoff));
  const parts = clock.formatToParts(kickoff);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  const time = `${part("hour")}:${part("minute")}`, frame = part("dayPeriod").toUpperCase();
  const home = selection.homeTeam.name?.trim() || m.text("match.homeUnknown");
  const away = selection.awayTeam.name?.trim() || m.text("match.awayUnknown");
  const league = selection.competition.name || m.text("match.competitionUnknown");
  const country = countryDisplayName(selection.competition.country), flag = countryFlagAsset(selection.competition.country);
  const family = m.text(`market.family.${selection.family}`), description = predictionDescription(m, selection.selection);
  const outcome = prediction.status === "correct" ? m.text("match.result.won")
    : prediction.status === "incorrect" ? m.text("match.result.lost") : m.text(`outcome.${prediction.status}`);

  return <li data-slip-selection={selection.fixtureId}>
    <div data-mobile-row data-fixture-id={selection.fixtureId} data-market={selection.family} data-outcome={prediction.status}
      data-match-state="snapshot" role="group" aria-labelledby={`${id}-teams`}
      aria-describedby={`${id}-meta ${id}-facts${result ? ` ${id}-result` : ""}`}>
      <div data-mobile-meta id={`${id}-meta`}>
        <time data-mobile-kickoff dateTime={toUtcIsoString(kickoff)} title={m.reportingInstant(kickoff)}>
          <span data-mobile-date>{day.day}-{day.month}</span>
          <span data-mobile-clock>{time} <span data-mobile-frame>{frame}</span></span>
        </time>
        <span data-mobile-competition>
          <span data-mobile-league title={league} aria-label={league}>
            <TeamLogo name={league} url={selection.competition.logoUrl ?? undefined} eager={false} size={12} />
            <span data-short-name>{leagues[league] ?? league}</span>
          </span>
          {country && <span data-mobile-country title={country} aria-label={country}>
            {flag && <Image data-country-flag src={flag} alt="" width={15} height={10} loading="lazy" unoptimized />}
            <span data-short-name>{countryCode(selection.competition.country)}</span>
          </span>}
        </span>
      </div>
      <h4 data-mobile-teams id={`${id}-teams`}>
        <span data-home title={home} aria-label={home}><span data-short-name>{teams[home] ?? home}</span>
          <TeamLogo name={home} url={selection.homeTeam.logoUrl ?? undefined} eager={false} size={14} /></span>
        <span data-mobile-versus>VS</span>
        <span data-away title={away} aria-label={away}>
          <TeamLogo name={away} url={selection.awayTeam.logoUrl ?? undefined} eager={false} size={14} />
          <span data-short-name>{teams[away] ?? away}</span></span>
      </h4>
      <div data-mobile-facts id={`${id}-facts`}>
        <span data-mobile-field="market" title={family}><span data-field-label aria-hidden="true">Mkt</span>
          <span data-field-value aria-hidden="true">{markets[selection.family]}</span><VisuallyHidden>{family}</VisuallyHidden></span>
        <span data-mobile-field="prediction" title={`${family}: ${description}`}><span data-field-label aria-hidden="true">Pick</span>
          <strong data-field-value data-pick-label aria-hidden="true">{predictionLabel(m, selection.selection)}</strong><VisuallyHidden>{description}</VisuallyHidden></span>
        <span data-mobile-field="odds"><span data-field-label>{m.text("slips.odds")}</span><strong data-field-value>{selection.odds}</strong></span>
        <span data-mobile-field="probability"><span data-field-label aria-hidden="true">Prob.</span><VisuallyHidden>{m.text("slips.probability")}: </VisuallyHidden>
          <strong data-field-value>{formatSlipProbability(selection.probability, m)}</strong></span>
      </div>
      {result && <span data-mobile-result id={`${id}-result`}><span>{outcome}</span>
        {fixture.score && <span title={m.text("match.regulationScoreNote")}><VisuallyHidden>{m.text("match.regulationScoreNote")}: </VisuallyHidden>
          {m.number(fixture.score.home)}–{m.number(fixture.score.away)}</span>}</span>}
    </div>
  </li>;
}
