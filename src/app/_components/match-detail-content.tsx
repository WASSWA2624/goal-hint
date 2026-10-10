import type { ReactNode } from "react";
import { BodyText, Inline, MutedText, PageHeading, SectionHeading, Stack, Surface } from "@/components/ui/layout";
import { TextLink } from "@/components/ui/controls";
import { toUtcIsoString, type UtcInstant } from "@/domain/calendar";
import type { DetailSnapshot, MatchDetailResponse } from "@/domain/match-detail";
import type { MarketFamily, MarketSelection } from "@/domain/markets";
import { publicPolicy } from "@/domain/public-policy";
import { createMessages, type TextKey } from "@/i18n/messages";
import { detailAnalysis, detailMarket } from "@/domain/detail-presentation";
import { DetailArticle, DetailMarket, DetailMarketGrid } from "@/components/match/detail-styles";
import { Disclosure } from "@/components/ui/disclosure";
import { TeamRow } from "@/components/match/team-row";
import { ProbabilityLabel } from "@/components/match/probability-label";
import { OutcomeBadge } from "@/components/match/outcome-badge";

export function DetailTime({ label, at, locale }: { label: TextKey; at: UtcInstant | null; locale: string }) {
  const messages = createMessages(locale);
  return <MutedText>{messages.text(label)}: {at === null ? messages.text("detail.unknownTime")
    : <time dateTime={toUtcIsoString(at)}>{messages.reportingInstant(at)}</time>}</MutedText>;
}

function MarketPrediction({ data, family, locale, sources, scope = "" }: {
  data: MatchDetailResponse; family: MarketFamily; locale: string; sources: DetailSnapshot["analysis"]["sources"];
  scope?: string;
}) {
  const messages = createMessages(locale), { item, outcome, unavailableReason } = detailMarket(data, family);
  return <DetailMarket $gap="sm" data-detail-market={family}>
    <SectionHeading id={`${scope}market-${family}`}>{messages.text(`market.family.${family}`)}</SectionHeading>
    <BodyText>{messages.text("match.prediction")}: <strong>{item
      ? messages.text(`market.selection.${item.market.selection}`) : messages.text("match.predictionUnavailable")}</strong></BodyText>
    {item && <ProbabilityLabel market={item.market} locale={locale} />}
    {data.snapshot?.applicability === "historical" ? <MutedText>{messages.text("history.noSettlement")}</MutedText>
      : <div><BodyText>{messages.text("match.outcome")}</BodyText><OutcomeBadge status={outcome?.status ?? "unavailable"} locale={locale} /></div>}
    {outcome && <>
      <MutedText>{outcome.explanation}</MutedText>
      {outcome.settledAt !== null && <DetailTime label="detail.settled" at={outcome.settledAt} locale={locale} />}
      {outcome.correctedAt !== null && <DetailTime label="detail.corrected" at={outcome.correctedAt} locale={locale} />}
      {outcome.voidedAt !== null && <DetailTime label="detail.voided" at={outcome.voidedAt} locale={locale} />}
    </>}
    {!item && <MutedText>{messages.text(`detail.unavailable.${unavailableReason}`)}</MutedText>}
    {item && <>
      <MutedText>{messages.text(`market.source.${item.source.kind}`)}</MutedText>
      {item.source.provisional && <MutedText>{messages.text("match.provisional")}</MutedText>}
      {item.source.fallbackReason && <MutedText>{messages.text(`detail.fallback.${item.source.fallbackReason}`)}</MutedText>}
      <DetailTime label="match.published" at={data.snapshot!.publishedAt} locale={locale} />
      <Disclosure $plain>
        <summary>{messages.text("detail.alternatives")}</summary>
        <Stack $gap="sm">
          {item.alternatives.map((alternative) => <div key={alternative.selection}>
            <BodyText>{messages.text(`market.selection.${alternative.selection as MarketSelection}`)}</BodyText>
            <ProbabilityLabel market={item.market} selection={alternative.selection as MarketSelection} locale={locale} />
          </div>)}
          {family === "double-chance" && <MutedText>{messages.text("detail.overlappingProbabilities")}</MutedText>}
        </Stack>
      </Disclosure>
      <Disclosure $plain>
        <summary>{messages.text("detail.sourceTiming")}</summary>
        <Stack $gap="sm">
          <DetailTime label="detail.generated" at={item.timestamps.generatedAt} locale={locale} />
          <DetailTime label="detail.retrieved" at={item.timestamps.retrievedAt} locale={locale} />
          <DetailTime label="detail.providerUpdated" at={item.timestamps.providerUpdatedAt} locale={locale} />
          {[...new Set(item.source.sourceIds)].map((id) => {
            const source = sources.find((entry) => entry.id === id);
            return !source ? null : source.url
              ? <TextLink key={id} href={source.url} prefetch={false} rel="noopener noreferrer" referrerPolicy="no-referrer">{source.publisher}</TextLink>
              : <MutedText key={id}>{source.publisher}</MutedText>;
          })}
        </Stack>
      </Disclosure>
    </>}
  </DetailMarket>;
}

function RevisionAnalysis({ snapshot, analysis, locale, scope = "detail-" }: {
  snapshot: DetailSnapshot; analysis: DetailSnapshot["analysis"]; locale: string; scope?: string;
}) {
  const messages = createMessages(locale);
  function citations(urls: readonly string[]) {
    return [...new Set(urls)].map((url) => {
      const source = analysis.sources.find((entry) => entry.url === url);
      return source ? <TextLink key={url} href={url} prefetch={false} rel="noopener noreferrer" referrerPolicy="no-referrer">{source.publisher}</TextLink> : null;
    });
  }
  return <>
    <Surface aria-labelledby={`${scope}analysis-title`}>
      <Stack>
        <SectionHeading id={`${scope}analysis-title`}>{messages.text("detail.analysis")}</SectionHeading>
        <BodyText>{messages.text("detail.analysisBasis")}</BodyText>
        {analysis.limitedNews && <MutedText>{messages.text("match.limitedNews")}</MutedText>}
        {analysis.state === "available" ? <>
          <Stack as="ol" $gap="md" data-detail-reasons>
            {analysis.reasons.map((reason, index) => <li key={index}>
              <BodyText>{reason.text}</BodyText><Inline>{citations(reason.sourceUrls)}</Inline>
            </li>)}
          </Stack>
          <SectionHeading as="h3">{messages.text("detail.uncertainty")}</SectionHeading>
          <BodyText>{analysis.uncertainty!.text}</BodyText><Inline>{citations(analysis.uncertainty!.sourceUrls)}</Inline>
        </> : <BodyText>{messages.text("detail.analysisWithheld")}</BodyText>}
        <DetailTime label="detail.evidenceCutoff" at={snapshot.evidenceCutoffAt} locale={locale} />
        <DetailTime label="detail.generationCompleted" at={snapshot.generationCompletedAt} locale={locale} />
        <DetailTime label="match.published" at={snapshot.publishedAt} locale={locale} />
        <BodyText>{messages.text("detail.probabilityDisclosure")}</BodyText>
      </Stack>
    </Surface>
    <Disclosure id={`${scope}sources`}>
      <summary>{messages.text("detail.sources")}</summary>
      <Stack $gap="lg" as="ul">
        {analysis.sources.map((source, index) => <li id={`${scope}source-${index}`} key={source.id}>
          <Stack $gap="sm">
            <BodyText>{source.publisher}</BodyText>
            <BodyText>{source.url ? <TextLink href={source.url} prefetch={false} rel="noopener noreferrer" referrerPolicy="no-referrer">{source.title}</TextLink> : source.title}</BodyText>
            {source.url === null && <MutedText>{messages.text("detail.sourceLinkUnavailable")}</MutedText>}
            <DetailTime label="detail.sourcePublished" at={source.publishedAt} locale={locale} />
            <DetailTime label="detail.retrieved" at={source.retrievedAt} locale={locale} />
            <DetailTime label="detail.providerUpdated" at={source.providerUpdatedAt} locale={locale} />
          </Stack>
        </li>)}
      </Stack>
      {analysis.sources.length === 0 && <BodyText>{messages.text("detail.noSources")}</BodyText>}
    </Disclosure>
  </>;
}

/** A full isolated publication, without another fixture card or headline score. */
export function HistorySnapshot({ data, locale }: { data: MatchDetailResponse; locale: string }) {
  const snapshot = data.snapshot;
  if (!snapshot) return null;
  const analysis = detailAnalysis(snapshot.analysis), scope = `history-${snapshot.revisionId}-`;
  return <Stack data-history-snapshot={snapshot.revisionId}>
    <DetailMarketGrid>
      {publicPolicy.markets.map((family) => <Surface key={family} aria-labelledby={`${scope}market-${family}`}>
        <MarketPrediction data={data} family={family} locale={locale} sources={analysis.sources} scope={scope} />
      </Surface>)}
    </DetailMarketGrid>
    <RevisionAnalysis snapshot={snapshot} analysis={analysis} locale={locale} scope={scope} />
  </Stack>;
}

export function MatchDetail({ data, locale = "en", history }: { data: MatchDetailResponse; locale?: string; history?: ReactNode }) {
  const messages = createMessages(locale), { fixture, snapshot, selectedCycle } = data;
  const analysis = snapshot ? detailAnalysis(snapshot.analysis) : null, sources = analysis?.sources ?? [];
  const home = fixture.homeTeam.name || messages.text("match.homeUnknown"), away = fixture.awayTeam.name || messages.text("match.awayUnknown");
  const scoreLabel = fixture.scorePeriod === "regulation" ? "detail.regulationScore" : fixture.scorePeriod === "live" ? "match.liveScore" : "detail.scoreUnavailable";
  return <DetailArticle $gap="lg" data-match-detail data-fixture-id={fixture.fixtureId} data-detail-revision={snapshot?.revisionId ?? ""}>
    <Stack $gap="sm">
      <PageHeading id="current-match-summary">{messages.text("match.title", { home, away })}</PageHeading>
      <BodyText>{fixture.competition.name || messages.text("match.competitionUnknown")}</BodyText>
      <DetailTime label="match.kickoff" at={fixture.kickoffAt} locale={locale} />
      <MutedText>{messages.text(`match.status.${fixture.status}`)} · {messages.text("feed.reportingTimeZone")}</MutedText>
    </Stack>
    <Surface>
      <Stack>
        <MutedText>{messages.text(scoreLabel)}</MutedText>
        <TeamRow team={fixture.homeTeam} side="home" score={fixture.score?.home ?? null} eagerLogo locale={locale} />
        <TeamRow team={fixture.awayTeam} side="away" score={fixture.score?.away ?? null} eagerLogo locale={locale} />
        <MarketPrediction data={data} family="match-result" locale={locale} sources={sources} />
        {selectedCycle?.state === "void" ? <BodyText>{selectedCycle.voidReason?.explanation}</BodyText>
          : selectedCycle?.state === "closed" ? <BodyText>{messages.text(snapshot ? "match.lockedPrediction" : "detail.noLockedPrediction")}</BodyText>
          : snapshot && <BodyText>{messages.text("match.currentPrediction")}</BodyText>}
        {selectedCycle?.lockedAt !== null && selectedCycle?.lockedAt !== undefined && <DetailTime label="detail.locked" at={selectedCycle.lockedAt} locale={locale} />}
        <MutedText>{messages.text(`detail.refresh.${fixture.update.prediction}`)}</MutedText>
        {fixture.forecast?.updateDelayed && fixture.update.prediction !== "delayed" && <MutedText>{messages.text("match.updateDelayed")}</MutedText>}
        {fixture.availabilityMessage && <BodyText>{fixture.availabilityMessage}</BodyText>}
        {fixture.partialCoverage && <BodyText>{messages.text("feed.partialCoverageDescription")}</BodyText>}
        <DetailTime label="match.synced" at={fixture.syncedAt} locale={locale} />
        <DetailTime label="detail.observed" at={data.asOf} locale={locale} />
      </Stack>
    </Surface>
    <DetailMarketGrid aria-label={messages.text("detail.otherMarkets")}>
      {publicPolicy.markets.slice(1).map((family) => <Surface key={family} aria-labelledby={`market-${family}`}>
        <MarketPrediction data={data} family={family} locale={locale} sources={sources} />
      </Surface>)}
    </DetailMarketGrid>
    {snapshot && analysis ? <RevisionAnalysis snapshot={snapshot} analysis={analysis} locale={locale} /> : <Surface aria-labelledby="detail-analysis-title">
      <Stack><SectionHeading id="detail-analysis-title">{messages.text("detail.analysis")}</SectionHeading>
        <BodyText>{messages.text("detail.analysisUnavailable")}</BodyText></Stack>
    </Surface>}
    <Surface aria-labelledby="detail-result-title">
      <Stack $gap="sm">
        <SectionHeading id="detail-result-title">{messages.text("detail.result")}</SectionHeading>
        <BodyText>{messages.text(scoreLabel)}{fixture.score && <>: <strong>{messages.number(fixture.score.home)}–{messages.number(fixture.score.away)}</strong></>}</BodyText>
        <BodyText>{messages.text("detail.regulationRules")}</BodyText>
        <BodyText>{messages.text("detail.scoreOutcomeDisclosure")}</BodyText>
        {fixture.update.result === "delayed" && <BodyText>{messages.text("match.resultDelayed")}</BodyText>}
        <TextLink href="/en/how-it-works#probabilities" prefetch={false}>{messages.text("detail.probabilityHelp")}</TextLink>
      </Stack>
    </Surface>
    {history}
  </DetailArticle>;
}
