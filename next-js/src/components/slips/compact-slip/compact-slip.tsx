"use client";

import { useId, type ReactNode } from "react";
import Link from "@/components/navigation/navigation-link";
import { TeamLogo } from "@/components/match/team-logo";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { toUtcIsoString, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { snapshotCardPrediction } from "@/domain/match-card";
import { canonicalMatchSlug } from "@/domain/match-slug";
import { matchHref } from "@/domain/navigation";
import { predictionDescription, predictionLabel } from "@/domain/prediction-label";
import type { SavedSlipView } from "@/domain/saved-slips";
import type { SlipMatchState } from "@/domain/slip-match-state";
import type { SlipStatus } from "@/domain/slip-status";
import type { BuiltSlip, SlipSelection } from "@/domain/slip-builder";
import { slipSelectionCard } from "@/domain/slip-card";
import { createMessages } from "@/i18n/messages";
import { formatSlipProbability } from "../slip-format";
import type { CompactSlipVariant } from "./designs";
import { CompactCard, MatchRow } from "./compact-slip-styles";
import { CleanLedgerSelection } from "./clean-ledger-selection";
import { MobileSlipHeader } from "./mobile-slip-header";
import { SlipHeaderDate, SlipStatusBadge, type SlipHeaderPublication } from "../slip-header-meta";
import { useRefreshedSlipMatchStates } from "../slip-match-refresh";
import { slipHeaderState } from "../slip-header-outcome";

function SelectionRow({ selection, position, locale, result, analysisLinks, showLogos }: {
  selection: SlipSelection; position: number; locale: string; result: SavedSlipView["results"][number] | undefined; analysisLinks: boolean; showLogos: boolean;
}) {
  const messages = createMessages(locale), id = useId();
  const { fixture, snapshotPick } = slipSelectionCard(selection, result);
  const prediction = snapshotCardPrediction(snapshotPick);
  const home = selection.homeTeam.name?.trim() || messages.text("match.homeUnknown");
  const away = selection.awayTeam.name?.trim() || messages.text("match.awayUnknown");
  const family = messages.text(`market.family.${selection.family}`);
  const description = predictionDescription(messages, selection.selection);
  const outcomeLabel = prediction.status === "correct" ? messages.text("match.result.won")
    : prediction.status === "incorrect" ? messages.text("match.result.lost") : messages.text(`outcome.${prediction.status}`);
  const kickoff = fixture.kickoffAt!;
  const rowProps = { "aria-labelledby": `${id}-${analysisLinks ? "analysis" : "teams"}`,
    "aria-describedby": `${id}-meta ${id}-kickoff ${id}-pick ${id}-odds ${id}-probability${result ? ` ${id}-result` : ""}`,
    "data-fixture-id": selection.fixtureId, "data-market": selection.family, "data-outcome": prediction.status,
    "data-status": fixture.status, "data-match-state": "snapshot" };
  const content = <>
      <span data-leg-number aria-hidden="true">{messages.number(position)}</span>
      <h4 data-teams id={`${id}-teams`}>
        <span data-home data-team-side="home">{showLogos && <TeamLogo name={home} url={selection.homeTeam.logoUrl ?? undefined} eager={false} size={14} />}{home}</span>
        <span data-versus>vs</span>
        <span data-away data-team-side="away">{showLogos && <TeamLogo name={away} url={selection.awayTeam.logoUrl ?? undefined} eager={false} size={14} />}{away}</span>
      </h4>
      <span data-meta id={`${id}-meta`}>
        <span data-competition>{showLogos && <TeamLogo name={selection.competition.name} url={selection.competition.logoUrl ?? undefined} eager={false} size={14} />}{selection.competition.name || messages.text("match.competitionUnknown")}</span>
        {selection.competition.country && <span data-country>{selection.competition.country}</span>}
      </span>
      <time data-kickoff id={`${id}-kickoff`} dateTime={toUtcIsoString(kickoff)} title={messages.reportingInstant(kickoff)}>
        <span data-date>{messages.reportingDay(kickoff)}</span><span data-clock>{messages.reportingTime(kickoff)} EAT</span>
      </time>
      <span data-pick id={`${id}-pick`} title={`${family}: ${description}${selection.forecast ? ` · ${messages.text("match.published")}: ${messages.reportingInstant(utcInstantFromEpochMilliseconds(selection.forecast.publishedAt))}` : ""}`}>
        <span data-market-label>{family}</span><strong data-pick-label title={`${family}: ${description}`} aria-hidden="true">{predictionLabel(messages, selection.selection)}</strong>
        <VisuallyHidden>{description}</VisuallyHidden>
      </span>
      <span data-leg-odds id={`${id}-odds`}><span data-number-label>{messages.text("slips.odds")}</span><strong>{selection.odds}</strong></span>
      <span data-leg-probability id={`${id}-probability`}><span data-number-label>{messages.text("slips.probability")}</span><strong>{formatSlipProbability(selection.probability, messages)}</strong></span>
      {result && <span data-result id={`${id}-result`}>
        <span data-outcome-label>{outcomeLabel}</span>
        {fixture.score && <span data-saved-score title={messages.text("match.regulationScoreNote")}><VisuallyHidden>{messages.text("match.regulationScoreNote")}: </VisuallyHidden>{messages.number(fixture.score.home)}–{messages.number(fixture.score.away)}</span>}
      </span>}
      {analysisLinks && <VisuallyHidden id={`${id}-analysis`}>{messages.text("match.analysisLabel", { home, away })}</VisuallyHidden>}
  </>;
  return <li data-compact-selection={selection.fixtureId} data-slip-selection={selection.fixtureId}>
    {analysisLinks ? <MatchRow as={Link} href={matchHref(selection.fixtureId, canonicalMatchSlug(selection.homeTeam.name, selection.awayTeam.name), locale)} prefetch={false} {...rowProps}>{content}</MatchRow>
      : <MatchRow {...rowProps}>{content}</MatchRow>}
  </li>;
}

/** Aggregate-only previews and complete slips share exactly the same compact header and disclosure. */
export function CompactSlipDisclosure({ totalOdds, averageProbability, selectionCount, index, locale, variant = "clean-ledger",
  initiallyOpen = false, collapsible = true, showRank = true, slipId, headingId, outcome = "pending", status = outcome, publicationDay, publishedAt,
  fullProbabilityLabel = false, hasHeaderAction = false, children }: {
  totalOdds: string; averageProbability: number; selectionCount: number; index: number; locale: string;
  variant?: CompactSlipVariant; initiallyOpen?: boolean; collapsible?: boolean; showRank?: boolean; slipId?: string; headingId?: string;
  outcome?: SavedSlipView["outcome"]; status?: SlipStatus; fullProbabilityLabel?: boolean; hasHeaderAction?: boolean; children: ReactNode;
} & SlipHeaderPublication) {
  const messages = createMessages(locale), id = useId();
  const summary = <>
        <h3 data-summary-identity id={headingId ?? `${id}-heading`}><span>{messages.text("slips.slipTitle", { number: messages.number(index + 1) })}</span>
          <SlipHeaderDate locale={locale} {...(publicationDay ? { publicationDay } : {})} {...(publishedAt !== undefined ? { publishedAt } : {})} />
          {index === 0 && showRank && <span data-rank>{messages.text("slips.topRanked")}</span>}</h3>
        <span data-summary-odds data-summary-fact title={`${messages.text("slips.totalOdds")}: ${totalOdds}`}><span data-fact-label>{messages.text("slips.totalOdds")}</span><strong>{totalOdds}</strong></span>
        <span data-summary-average data-summary-fact title={messages.text("slips.averageHint")}>
          <span data-fact-label aria-hidden="true">{messages.text(fullProbabilityLabel ? "slips.average" : "slips.averageShort")}</span><VisuallyHidden>{messages.text("slips.average")}: </VisuallyHidden>
          <strong>{formatSlipProbability(averageProbability, messages)}</strong></span>
        <span data-summary-count><span aria-hidden="true">{messages.plural("slips.selections", selectionCount)}</span>
          <VisuallyHidden>{messages.text("slips.selectionCount")}: {messages.number(selectionCount)}</VisuallyHidden></span>
        {hasHeaderAction && <span data-summary-action-space aria-hidden="true" />}
        <span data-summary-status><SlipStatusBadge outcome={outcome} status={status} locale={locale} /></span>
        {collapsible && <span data-toggle-chevron aria-hidden="true" />}
  </>;
  const header = variant === "clean-ledger"
    ? <MobileSlipHeader totalOdds={totalOdds} averageProbability={averageProbability} selectionCount={selectionCount}
      index={index} locale={locale} outcome={outcome} status={status} headingId={headingId ?? `${id}-heading`} headerOnly={!collapsible} showRank={showRank}
      {...(publicationDay ? { publicationDay } : {})} {...(publishedAt !== undefined ? { publishedAt } : {})} />
    : collapsible ? <summary data-slip-toggle data-slip-summary aria-describedby={`${id}-average-note`}>{summary}</summary>
      : <header data-slip-summary aria-describedby={`${id}-average-note`}>{summary}</header>;
  return <CompactCard data-compact-slip={variant} data-slip-id={slipId}>
    {variant !== "clean-ledger" && <VisuallyHidden id={`${id}-average-note`}>{messages.text("slips.averageHint")}</VisuallyHidden>}
    {collapsible ? <details data-slip-disclosure open={initiallyOpen}>
      {header}
      <div data-slip-content>{children}</div>
    </details> : <>
      {header}
      <div data-slip-content>{children}</div>
    </>}
  </CompactCard>;
}

/** Original selection snapshots are reused by Best slips, generated slips and completed history. */
export function CompactSlip({ slip, index, locale, variant = "clean-ledger", initiallyOpen = false, results, matchStates, analysisLinks = true, collapsible = true, showLogos = false, showRank = true,
  publicationDay, publishedAt, outcome: suppliedOutcome, status: suppliedStatus }: {
  slip: BuiltSlip; index: number; locale: string; variant?: CompactSlipVariant; initiallyOpen?: boolean; results?: SavedSlipView["results"];
  matchStates?: readonly SlipMatchState[]; analysisLinks?: boolean; collapsible?: boolean; showLogos?: boolean; showRank?: boolean;
  outcome?: SavedSlipView["outcome"]; status?: SlipStatus;
} & SlipHeaderPublication) {
  const headingId = useId();
  const currentStates = useRefreshedSlipMatchStates() ?? matchStates;
  const { outcome, status } = slipHeaderState(slip, results, currentStates, suppliedOutcome, suppliedStatus);
  return <CompactSlipDisclosure totalOdds={slip.totalOdds} averageProbability={slip.averageProbability} selectionCount={slip.selections.length}
    index={index} locale={locale} variant={variant} initiallyOpen={initiallyOpen} collapsible={collapsible} showRank={showRank} slipId={slip.id} headingId={headingId} outcome={outcome} status={status}
    {...(publicationDay ? { publicationDay } : {})} {...(publishedAt !== undefined ? { publishedAt } : {})}>
      <ul aria-labelledby={headingId}>
        {slip.selections.map((selection, selectionIndex) => {
          const result = results?.find((item) => item.fixtureId === selection.fixtureId);
          return variant === "clean-ledger" ? <CleanLedgerSelection key={selection.fixtureId} selection={selection} locale={locale} analysisLinks={analysisLinks} {...(result ? { result } : {})} />
            : <SelectionRow key={selection.fixtureId} selection={selection} position={selectionIndex + 1} locale={locale} analysisLinks={analysisLinks} showLogos={showLogos} result={result} />;
        })}
      </ul>
  </CompactSlipDisclosure>;
}
