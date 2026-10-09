"use client";

import { useId } from "react";
import styled from "styled-components";
import { toUtcIsoString } from "@/domain/calendar";
import type { FixtureSnapshot } from "@/domain/fixture-snapshot";
import { hasFinalScoreStatus, selectedCardPrediction } from "@/domain/match-card";
import type { MarketFamily } from "@/domain/markets";
import { matchHref } from "@/domain/navigation";
import { createMessages } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/locales";
import { ButtonLink } from "@/components/ui/controls";
import { BodyText, Inline, MutedText, Stack, Surface } from "@/components/ui/layout";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { TeamRow } from "./team-row";
import { ProbabilityLabel } from "./probability-label";
import { OutcomeBadge } from "./outcome-badge";

export type MatchCardProps = {
  fixture: FixtureSnapshot;
  analysisSlug: string;
  selectedFamily?: MarketFamily;
  locale?: string;
  headingLevel?: 2 | 3 | 4;
  eagerLogos?: boolean;
};

const Card = styled(Surface)`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.md};
  max-inline-size: 100%;
  overflow-wrap: anywhere;
`;
const Competition = styled(BodyText)`
  font-weight: ${({ theme }) => theme.typography.weight.bold};
`;
const Prediction = styled(Stack)`
  border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  padding-block-start: ${({ theme }) => theme.space.md};
`;
const AnalysisLink = styled(ButtonLink)`
  align-self: flex-start;
  margin-block-start: auto;
`;

export function MatchCard({ fixture, analysisSlug, selectedFamily = "match-result", locale: requestedLocale,
  headingLevel = 2, eagerLogos = false }: MatchCardProps) {
  const locale = resolveLocale(requestedLocale);
  const messages = createMessages(locale);
  const titleId = `gh-match-${useId()}`;
  const home = fixture.homeTeam.name?.trim() || messages.text("match.homeUnknown");
  const away = fixture.awayTeam.name?.trim() || messages.text("match.awayUnknown");
  const prediction = selectedCardPrediction(fixture, selectedFamily);
  const final = hasFinalScoreStatus(fixture.status);
  const scoreLabel = final ? fixture.score ? "match.finalScore" : "match.finalScoreUnknown"
    : fixture.status === "live" ? "match.liveScore" : "match.score";
  return <Card as="article" aria-labelledby={titleId} data-fixture-id={fixture.fixtureId} data-market={selectedFamily}>
    <header>
      <Competition>{fixture.competition.name?.trim() || messages.text("match.competitionUnknown")}</Competition>
      <MutedText>{fixture.kickoffAt === null ? messages.text("match.kickoffUnknown") : <>
        {messages.text("match.kickoff")}: <time dateTime={toUtcIsoString(fixture.kickoffAt)}>{messages.reportingInstant(fixture.kickoffAt)}</time>
      </>}</MutedText>
      <MutedText>{messages.text(`match.status.${fixture.status}`)} · {messages.text(scoreLabel)}</MutedText>
    </header>
    <VisuallyHidden as={`h${headingLevel}`} id={titleId}>{messages.text("match.title", { home, away })}</VisuallyHidden>
    <Stack $gap="sm">
      <TeamRow team={fixture.homeTeam} side="home" score={fixture.score?.home ?? null} locale={locale} eagerLogo={eagerLogos} />
      <TeamRow team={fixture.awayTeam} side="away" score={fixture.score?.away ?? null} locale={locale} eagerLogo={eagerLogos} />
    </Stack>
    <Prediction $gap="sm">
      <MutedText>{messages.text(`market.family.${selectedFamily}`)}</MutedText>
      <BodyText>{messages.text("match.prediction")}: <strong>{prediction
        ? messages.text(`market.selection.${prediction.item.market.selection}`) : messages.text("match.predictionUnavailable")}</strong></BodyText>
      {prediction && <ProbabilityLabel market={prediction.item.market} locale={locale} />}
      <div><BodyText>{messages.text("match.outcome")}</BodyText><OutcomeBadge status={prediction?.status ?? "unavailable"} locale={locale} /></div>
      {prediction?.explanation && <MutedText>{prediction.explanation}</MutedText>}
      {prediction && <MutedText>
        {messages.text(`market.source.${prediction.item.market.source}`)} · {messages.text("match.published")}: {" "}
        <time dateTime={toUtcIsoString(prediction.publishedAt)}>{messages.reportingInstant(prediction.publishedAt)}</time>
      </MutedText>}
      {fixture.cycle?.state === "closed" && <MutedText>{messages.text(prediction ? "match.lockedPrediction" : "match.noLockedPrediction")}</MutedText>}
      {fixture.cycle?.state === "void" && !prediction && <MutedText>{fixture.cycle.voidReason?.explanation}</MutedText>}
      {fixture.cycle?.state === "open" && prediction && <MutedText>{messages.text("match.currentPrediction")}</MutedText>}
      {fixture.update?.prediction === "updating" && <MutedText>{messages.text("match.predictionUpdating")}</MutedText>}
      {fixture.availabilityMessage && <MutedText>{fixture.availabilityMessage}</MutedText>}
      <MutedText>{fixture.syncedAt === null ? messages.text("match.syncUnknown") : <>
        {messages.text("match.synced")}: <time dateTime={toUtcIsoString(fixture.syncedAt)}>{messages.reportingInstant(fixture.syncedAt)}</time>
      </>}</MutedText>
      {fixture.update?.result === "delayed" && <MutedText>{messages.text("match.resultDelayed")}</MutedText>}
      <Inline>
        {prediction?.provisional && <MutedText>{messages.text("match.provisional")}</MutedText>}
        {fixture.forecast?.updateDelayed && <MutedText>{messages.text("match.updateDelayed")}</MutedText>}
        {prediction?.item.limitedNews && <MutedText>{messages.text("match.limitedNews")}</MutedText>}
        {fixture.partialCoverage && <MutedText>{messages.text("match.partialCoverage")}</MutedText>}
      </Inline>
    </Prediction>
    <AnalysisLink href={matchHref(fixture.fixtureId, analysisSlug, locale)} prefetch={false} variant="secondary"
      aria-label={messages.text("match.analysisLabel", { home, away })}>{messages.text("match.analysis")}</AnalysisLink>
  </Card>;
}
