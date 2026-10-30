"use client";

import { useId } from "react";
import Image from "next/image";
import Link from "@/components/navigation/navigation-link";
import { TeamLogo } from "@/components/match/team-logo";
import { MatchStatus } from "@/components/match/match-status";
import { MatchClockText, ScoreFigures, Scoreline } from "@/components/match/score-presentation";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { toUtcIsoString, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { compactLeagueName } from "@/domain/compact-fixture-label";
import { countryCode, countryDisplayName } from "@/domain/country-code";
import { countryFlagAsset } from "@/domain/country-flag";
import { snapshotCardPrediction } from "@/domain/match-card";
import { canonicalMatchSlug } from "@/domain/match-slug";
import { matchHref } from "@/domain/navigation";
import { predictionDescription, predictionText } from "@/domain/prediction-label";
import { isPlayedFinalStatus } from "@/domain/market-settlement";
import { isSafeRemoteImageUrl } from "@/domain/remote-image";
import type { SavedSlipView } from "@/domain/saved-slips";
import type { SlipSelection } from "@/domain/slip-builder";
import { slipSelectionCard } from "@/domain/slip-card";
import { slipMatchStateForSelection, type SlipMatchState } from "@/domain/slip-match-state";
import { useMessages } from "@/i18n/use-messages";
import { formatSlipProbability } from "../slip-format";
import { CleanLedgerRow } from "./clean-ledger-styles";
import { SlipMatchNumber } from "../slip-match-number";

function logoSource(url: string | null | undefined): string | undefined {
  if (url?.startsWith("/") && !url.startsWith("//") && !/[\\\u0000-\u0020]/u.test(url)) return url;
  return isSafeRemoteImageUrl(url) ? url : undefined;
}

/** The approved Team stack presents the original pick with separately bound match progress. */
export function CleanLedgerSelection({ selection, locale, result, matchStates, analysisLinks = false, position }: {
  selection: SlipSelection; locale: string; result?: SavedSlipView["results"][number]; matchStates?: readonly SlipMatchState[]; analysisLinks?: boolean; position?: number;
}) {
  const m = useMessages(locale), id = useId();
  const savedResult = result?.fixtureId === selection.fixtureId ? result : undefined;
  const { fixture, snapshotPick } = slipSelectionCard(selection, savedResult);
  const prediction = snapshotCardPrediction(snapshotPick), kickoff = fixture.kickoffAt!;
  const state = slipMatchStateForSelection(selection, matchStates), status = state?.status ?? "unknown";
  const outcome = state?.outcome ?? prediction.status;
  const score = state ? state.score : fixture.score;
  const clock = status === "live" ? state?.liveClock : null;
  const elapsed = clock?.minute === null || clock?.minute === undefined ? null
    : m.number(clock.minute) + (clock.stoppageMinutes ? `+${m.number(clock.stoppageMinutes)}` : "");
  const clockText = status === "live" ? elapsed !== null ? m.text("match.clock.minute", { minute: elapsed }) : m.text(`match.clock.${clock?.phase ?? "in-play"}`)
    : isPlayedFinalStatus(status) ? m.text(`match.final.${status as "finished-regulation" | "finished-extra-time" | "finished-penalties"}`) : "";
  const home = selection.homeTeam.name?.trim() || m.text("match.homeUnknown");
  const away = selection.awayTeam.name?.trim() || m.text("match.awayUnknown");
  const league = selection.competition.name || m.text("match.competitionUnknown");
  const country = countryDisplayName(selection.competition.country), flag = countryFlagAsset(selection.competition.country);
  const family = m.text(`market.family.${selection.family}`), description = predictionDescription(m, selection.selection);
  const publication = selection.forecast ? ` · ${m.text("match.published")}: ${m.reportingInstant(utcInstantFromEpochMilliseconds(selection.forecast.publishedAt))}` : "";
  const props = {
    "data-ledger-row": "", "data-mobile-row": "", "data-fixture-id": selection.fixtureId,
    "data-market": selection.family, "data-outcome": outcome, "data-status": status,
    "data-match-state": state ? status : "snapshot", "data-mobile-design": "team-stack", "aria-labelledby": `${id}-${analysisLinks ? "analysis" : "teams"}`,
    "aria-describedby": `${id}-meta ${id}-facts ${id}-result`,
  };
  const content = <>
    <div data-ledger-meta data-mobile-meta id={`${id}-meta`}>
      <span data-ledger-kickoff data-mobile-kickoff>
        {position !== undefined && <SlipMatchNumber position={position} locale={locale} />}
        <time data-kickoff dateTime={toUtcIsoString(kickoff)} title={m.reportingInstant(kickoff)}>
          <span data-date data-mobile-date>{m.shortKickoffDate(kickoff)}</span><span data-clock data-mobile-clock>{m.shortKickoffTime(kickoff)}</span>
          <VisuallyHidden> {m.timeZone(kickoff)}</VisuallyHidden>
        </time>
      </span>
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
    <h4 data-ledger-teams data-mobile-teams data-teams id={`${id}-teams`} aria-label={m.text("match.title", { home, away })}>
      <span data-ledger-home data-home data-team-side="home" title={home} aria-label={home}>
        <TeamLogo name={home} url={logoSource(selection.homeTeam.logoUrl)} eager={false} size={18} /><span data-ledger-name>{home}</span>
      </span>
      <span data-ledger-versus data-mobile-versus data-versus>VS</span>
      <span data-ledger-away data-away data-team-side="away" title={away} aria-label={away}>
        <TeamLogo name={away} url={logoSource(selection.awayTeam.logoUrl)} eager={false} size={18} /><span data-ledger-name>{away}</span>
      </span>
    </h4>
    <div data-ledger-facts data-mobile-facts id={`${id}-facts`}>
      <span data-ledger-field="market" data-mobile-field="market" title={family}><span data-field-label aria-hidden="true">Mkt</span>
        <span data-field-value data-market-label aria-hidden="true">{family}</span><VisuallyHidden>{family}</VisuallyHidden></span>
      <span data-ledger-field="prediction" data-mobile-field="prediction" data-pick title={`${family}: ${description}${publication}`}>
        <span data-field-label aria-hidden="true">Pick</span><strong data-field-value data-pick-label title={`${family}: ${description}`} aria-hidden="true">{predictionText(m, selection.selection)}</strong>
        <VisuallyHidden>{description}</VisuallyHidden></span>
      <span data-ledger-field="odds" data-mobile-field="odds" data-leg-odds><span data-field-label data-number-label>{m.text("slips.odds")}</span><strong data-field-value>{selection.odds}</strong></span>
      <span data-ledger-field="probability" data-mobile-field="probability" data-leg-probability><span data-field-label data-number-label aria-hidden="true">{m.text("match.estimatedChance")}</span><VisuallyHidden>{m.text("slips.probability")}: </VisuallyHidden>
        <strong data-field-value>{formatSlipProbability(selection.probability, m)}</strong></span>
    </div>
    <span data-result data-stack-result data-mobile-result id={`${id}-result`}>
      <span data-match-state={state ? status : "snapshot"} data-stack-progress>
        {score && <Scoreline data-score data-saved-score={savedResult ? "" : undefined} title={m.text(status === "live" ? "match.liveScore" : "match.regulationScoreNote")}>
          <VisuallyHidden>{m.text(status === "live" ? "match.liveScore" : "match.regulationScoreNote")}: </VisuallyHidden>
          <ScoreFigures home={m.number(score.home)} away={m.number(score.away)} /></Scoreline>}
        {clockText && <span data-score-clock><MatchClockText text={clockText} /></span>}
      </span>
      <MatchStatus status={status} outcome={outcome} messages={m} snapshot={!state && !!savedResult} />
    </span>
    {analysisLinks && <VisuallyHidden id={`${id}-analysis`}>{m.text("match.analysisLabel", { home, away })}</VisuallyHidden>}
  </>;
  return <li data-compact-selection={selection.fixtureId} data-slip-selection={selection.fixtureId}>
    {analysisLinks ? <CleanLedgerRow as={Link} href={matchHref(selection.fixtureId, canonicalMatchSlug(selection.homeTeam.name, selection.awayTeam.name), locale)} prefetch={false} {...props}>{content}</CleanLedgerRow>
      : <CleanLedgerRow role="group" {...props}>{content}</CleanLedgerRow>}
  </li>;
}
