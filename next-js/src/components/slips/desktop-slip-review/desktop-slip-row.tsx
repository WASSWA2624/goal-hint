"use client";

import { useId } from "react";
import Image from "next/image";
import { TeamLogo } from "@/components/match/team-logo";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { getReportingDate, toUtcIsoString, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { countryDisplayName } from "@/domain/country-code";
import { countryFlagAsset } from "@/domain/country-flag";
import { predictionDescription, predictionLabel } from "@/domain/prediction-label";
import type { SlipSelection } from "@/domain/slip-builder";
import { createMessages } from "@/i18n/messages";
import type { DesktopPreviewMatchState } from "../desktop-slip-preview-data";
import { TruncatedText } from "../desktop-slip/desktop-slip-row";
import { formatSlipProbability } from "../slip-format";

const shortMarkets = { "match-result": "Result", "double-chance": "DC", "total-goals": "Goals", "both-teams-to-score": "BTTS" } as const;
const matchLabels = { upcoming: "Upcoming", live: "Live", halftime: "HT", finished: "Finished" } as const;
const outcomeLabels = { pending: "Pending", correct: "Won", incorrect: "Lost" } as const;

/** Explicit design-only states demonstrate score placement without changing production snapshots or settlement. */
export function DesktopSlipRow({ selection, locale, state }: {
  selection: SlipSelection; locale: string; state: DesktopPreviewMatchState;
}) {
  const m = createMessages(locale), id = useId();
  const kickoff = utcInstantFromEpochMilliseconds(selection.kickoffAt), iso = toUtcIsoString(kickoff), date = m.reportingDayParts(getReportingDate(kickoff));
  const home = selection.homeTeam.name?.trim() || m.text("match.homeUnknown"), away = selection.awayTeam.name?.trim() || m.text("match.awayUnknown");
  const league = selection.competition.name || m.text("match.competitionUnknown"), country = countryDisplayName(selection.competition.country) || "—";
  const flag = countryFlagAsset(selection.competition.country), family = m.text(`market.family.${selection.family}`), description = predictionDescription(m, selection.selection);
  const score = state.score ? `${m.number(state.score.home)}-${m.number(state.score.away)}` : "VS";
  return <li data-slip-selection={selection.fixtureId} data-preview-selection={selection.fixtureId}>
    <div data-desktop-row data-desktop-preview-row data-market={selection.family} data-outcome={state.outcome}
      data-match-state={state.match} role="group" aria-labelledby={`${id}-teams`}
      aria-describedby={`${id}-date ${id}-time ${id}-country ${id}-league ${id}-score ${id}-clock ${id}-market ${id}-odds ${id}-probability ${id}-status`}>
      <time data-row-date id={`${id}-date`} dateTime={iso} title={m.reportingInstant(kickoff)}>{date.day}-{date.month}</time>
      <time data-row-time id={`${id}-time`} dateTime={iso}>{m.reportingTime(kickoff)} {m.timeZone(kickoff)}</time>
      <span data-row-country id={`${id}-country`}>{flag && <Image data-country-flag src={flag} alt="" width={18} height={12} loading="lazy" unoptimized />}<TruncatedText text={country} /></span>
      <span data-row-league id={`${id}-league`}><TeamLogo name={league} url={selection.competition.logoUrl ?? undefined} eager={false} size={14} /><TruncatedText text={league} /></span>
      <h4 data-row-teams id={`${id}-teams`} aria-label={`${home} ${m.text("match.versus")} ${away}`}>
        <span data-home><TruncatedText text={home} /><TeamLogo name={home} url={selection.homeTeam.logoUrl ?? undefined} eager={false} size={14} /></span>
        <span data-centre><span data-score id={`${id}-score`} aria-label={state.score ? `${home} ${m.number(state.score.home)}, ${away} ${m.number(state.score.away)}` : undefined}>{state.score && <VisuallyHidden>Score: </VisuallyHidden>}{score}</span><span data-clock id={`${id}-clock`} aria-hidden={!state.clock || undefined}>{state.clock}</span></span>
        <span data-away><TeamLogo name={away} url={selection.awayTeam.logoUrl ?? undefined} eager={false} size={14} /><TruncatedText text={away} /></span>
      </h4>
      <span data-row-market id={`${id}-market`} title={`${family}: ${description}`}><span data-market-label data-row-market-label aria-hidden="true">{shortMarkets[selection.family]}</span><strong data-pick-label aria-hidden="true">{predictionLabel(m, selection.selection)}</strong><VisuallyHidden>{family}: {description}</VisuallyHidden></span>
      <span data-row-odds id={`${id}-odds`}><span data-number-label data-row-number-label>{m.text("slips.odds")}</span><strong>{selection.odds}</strong></span>
      <span data-row-probability id={`${id}-probability`}><span data-number-label data-row-number-label aria-hidden="true">Prob.</span><VisuallyHidden>{m.text("slips.probability")}: </VisuallyHidden><strong>{formatSlipProbability(selection.probability, m)}</strong></span>
      <span data-row-status id={`${id}-status`}><span data-match-label>{matchLabels[state.match]}</span><span data-outcome-label>{outcomeLabels[state.outcome]}</span></span>
    </div>
  </li>;
}
