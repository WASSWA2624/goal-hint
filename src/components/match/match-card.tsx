"use client";

import Link from "next/link";
import { useId, useState } from "react";
import styled, { css, keyframes } from "styled-components";
import { toUtcIsoString } from "@/domain/calendar";
import { bestCardFamily } from "@/domain/feed-presentation";
import type { FixtureSnapshot } from "@/domain/fixture-snapshot";
import { hasFinalScoreStatus, selectedCardPrediction } from "@/domain/match-card";
import type { MarketFamily } from "@/domain/markets";
import { matchHref } from "@/domain/navigation";
import { isSafeRemoteImageUrl } from "@/domain/remote-image";
import { createMessages } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/locales";
import type { OutcomeTone } from "@/styles/theme";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { CheckIcon, ChevronIcon, CrossIcon, LockIcon, NoticeIcon, TrophyIcon, VoidIcon } from "./match-icons";
import { matchTableColumns, matchTableGap } from "./match-columns";
import { TeamLogo } from "./team-row";

export type MatchCardProps = {
  fixture: FixtureSnapshot;
  analysisSlug: string;
  /** Families eligible for the shown pick; the most likely available pick among them is displayed. */
  markets?: readonly MarketFamily[];
  /** Single-family shorthand kept for existing callers. */
  selectedFamily?: MarketFamily;
  locale?: string;
  headingLevel?: 2 | 3 | 4;
  eagerLogos?: boolean;
  /** List position, continuous across pages; shown in the desktop # column. */
  position?: number;
};

type Messages = ReturnType<typeof createMessages>;
/** Placement for the dense phone/tablet tile; the table query restyles the same DOM as one row. */
const tile = css`@media (max-width: 63.99rem)`;
const table = css`@media (min-width: ${({ theme }) => theme.breakpoint.lg})`;
const wideTable = css`@media (min-width: ${({ theme }) => theme.breakpoint.xl})`;
const pulse = keyframes`0%, 100% { opacity: 1; } 50% { opacity: 0.35; }`;
const ellipsis = css`min-inline-size: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;`;

/**
 * Phone tile: a meta line (league, status, kickoff) over home and away lines with their scores,
 * and the pick box spanning both. Square corners and a market-coloured edge.
 */
const Card = styled.article<{ $family: MarketFamily }>`
  position: relative;
  display: grid;
  min-inline-size: 0;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  font-size: 0.75rem;
  line-height: 1.3;
  overflow-wrap: anywhere;
  transition: background-color 160ms ease;
  &:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: calc(-1 * ${({ theme }) => theme.border.focusWidth});
  }
  @media (prefers-reduced-motion: reduce) { transition: none; }
  ${tile} {
    grid-template-columns: minmax(0, 1fr) auto minmax(6.25rem, 7.5rem);
    grid-template-areas: "league state when" "home home pick" "away away pick" "notes notes notes";
    gap: 1px 8px;
    padding: 5px 8px 5px 10px;
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    border-radius: 0;
    box-shadow: inset 3px 0 0 ${({ theme, $family }) => theme.color.market[$family].solid};
    &:hover { background: ${({ theme }) => theme.color.rowHover}; }
  }
  ${table} {
    grid-template-columns: ${matchTableColumns.compact};
    column-gap: ${matchTableGap};
    row-gap: 4px;
    align-items: center;
    padding: 6px 16px;
    background: transparent;
    font-size: 0.8125rem;
    &:hover { background: ${({ theme }) => theme.color.rowHover}; }
  }
  ${wideTable} { grid-template-columns: ${matchTableColumns.full}; }
`;

const Meta = styled.header`
  ${tile} { display: contents; }
  ${table} { display: grid; grid-column: 1 / span 3; grid-template-columns: subgrid; }
`;
const Index = styled.span`
  display: none;
  ${table} { display: block; grid-column: 1; grid-row: 1; font-variant-numeric: tabular-nums; }
`;
const League = styled.p`
  display: flex;
  align-items: center;
  gap: 6px;
  min-inline-size: 0;
  > svg { flex: none; color: ${({ theme }) => theme.color.mutedText}; }
  > span { ${ellipsis} }
  ${tile} {
    grid-area: league;
    align-self: center;
    font-size: 0.625rem;
    font-weight: ${({ theme }) => theme.typography.weight.medium};
    color: ${({ theme }) => theme.color.mutedText};
    > svg { font-size: 0.75rem; }
  }
  ${table} { grid-column: 3; grid-row: 1; gap: 8px; > svg { font-size: 1rem; } > span { white-space: normal; } }
`;
const LeagueLogo = styled.img`
  flex: none;
  inline-size: 12px;
  block-size: 12px;
  object-fit: contain;
  ${table} { inline-size: 18px; block-size: 18px; }
`;
const When = styled.time`
  display: flex;
  align-items: center;
  gap: 4px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  ${tile} { grid-area: when; justify-self: end; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.625rem; }
  ${table} { grid-column: 2; grid-row: 1; flex-wrap: wrap; gap: 0 6px; white-space: normal; }
`;
const Dot = styled.span`
  color: ${({ theme }) => theme.color.border};
  ${table} { display: none; }
`;

const Teams = styled.div`
  --gh-logo-size: 16px;
  --gh-logo-radius: 0;
  --gh-logo-font: 0.4375rem;
  ${tile} { display: contents; }
  ${table} { --gh-logo-size: 22px; --gh-logo-font: 0.625rem; display: grid; grid-column: 4 / span 3; grid-template-columns: subgrid; align-items: center; }
`;
const Team = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-inline-size: 0;
  ${tile} {
    &[data-team-side="home"] { grid-area: home; }
    &[data-team-side="away"] { grid-area: away; }
  }
  ${table} { gap: 8px; }
`;
const TeamName = styled.span`
  flex: 1;
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  ${ellipsis}
  ${table} { white-space: normal; font-weight: ${({ theme }) => theme.typography.weight.body}; }
`;
/** Per-team score for the tile; the table shows the combined score column instead. */
const TeamScore = styled.span<{ $live: boolean }>`
  flex: none;
  min-inline-size: 1.125rem;
  color: ${({ theme, $live }) => $live ? theme.color.live.text : theme.color.text};
  font-size: 0.8125rem;
  font-weight: 800;
  text-align: end;
  font-variant-numeric: tabular-nums;
  ${table} { display: none; }
`;
const Center = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  ${tile} { grid-area: state; align-self: center; }
`;
const Versus = styled.span`
  color: ${({ theme }) => theme.color.mutedText};
  ${tile} { display: none; }
`;
const Score = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.9375rem;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  > span:nth-child(2) { color: ${({ theme }) => theme.color.mutedText}; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
  ${tile} { display: none; }
`;
const StateChip = styled.span<{ $tone: "live" | "final" | "halted" }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 4px;
  font-size: 0.5625rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  line-height: 1.6;
  white-space: nowrap;
  ${({ $tone, theme }) => $tone === "live"
    ? css`color: ${theme.color.live.text}; background: ${theme.color.live.soft};`
    : $tone === "final" ? css`color: ${theme.color.mutedText}; background: ${theme.color.surfaceMuted};`
    : css`color: ${theme.color.accent.amber.text}; background: ${theme.color.accent.amber.soft};`}
`;
const LiveDot = styled.span`
  inline-size: 6px;
  block-size: 6px;
  border-radius: 50%;
  background: ${({ theme }) => theme.color.live.solid};
  animation: ${pulse} 1.6s ease-in-out infinite;
  @media (prefers-reduced-motion: reduce) { animation: none; }
`;

/** Tile: a square box in the market's soft colour. Table: market, prediction and probability columns. */
const Pick = styled.div<{ $family: MarketFamily }>`
  ${tile} {
    grid-area: pick;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1px;
    min-inline-size: 0;
    padding: 2px 6px;
    color: ${({ theme, $family }) => theme.color.market[$family].text};
    background: ${({ theme, $family }) => theme.color.market[$family].soft};
  }
  ${table} { display: grid; grid-column: 7 / span 3; grid-template-columns: subgrid; align-items: center; }
`;
const MarketName = styled.span<{ $family: MarketFamily }>`
  font-size: 0.5625rem;
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  ${ellipsis}
  ${table} {
    justify-self: start;
    padding: 2px 8px;
    color: ${({ theme, $family }) => theme.color.market[$family].text};
    background: ${({ theme, $family }) => theme.color.market[$family].soft};
    font-size: 0.75rem;
    white-space: normal;
  }
`;
const Prediction = styled.span<{ $available: boolean }>`
  display: flex;
  align-items: center;
  gap: 5px;
  min-inline-size: 0;
  color: ${({ theme, $available }) => $available ? "inherit" : theme.color.mutedText};
  > svg { flex: none; font-size: 0.6875rem; }
  ${table} { display: contents; > svg { display: none; } }
`;
const PickLabel = styled.span`
  flex: 1;
  font-size: 0.6875rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  ${ellipsis}
  ${table} { display: none; }
`;
const PickShort = styled.span<{ $family: MarketFamily }>`
  display: none;
  ${table} {
    display: inline-flex;
    grid-column: 2;
    justify-self: start;
    justify-content: center;
    min-inline-size: 3.25rem;
    padding: 2px 8px;
    color: ${({ theme }) => theme.color.onBrand};
    background: ${({ theme, $family }) => theme.color.market[$family].solid};
    font-size: 0.75rem;
    font-weight: ${({ theme }) => theme.typography.weight.bold};
  }
`;
const Probability = styled.span`
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
  ${table} { grid-column: 3; gap: 8px; }
`;
const Percent = styled.span`
  font-size: 0.8125rem;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  ${table} { min-inline-size: 2.5rem; font-size: 0.8125rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
`;
const Bar = styled.span<{ $family: MarketFamily }>`
  display: none;
  ${wideTable} {
    display: block;
    flex: 1;
    block-size: 6px;
    background: ${({ theme }) => theme.color.surfaceMuted};
    overflow: hidden;
    > span { display: block; block-size: 100%; background: ${({ theme, $family }) => theme.color.market[$family].gradient}; }
  }
`;
const NoPick = styled.span`
  font-size: 0.6875rem;
  ${table} { grid-column: 2 / span 2; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
`;
const Mark = styled.span<{ $tone: OutcomeTone }>`
  display: inline-grid;
  flex: none;
  place-items: center;
  inline-size: 0.9375rem;
  block-size: 0.9375rem;
  color: ${({ theme, $tone }) => theme.color.outcome[$tone].text};
  background: ${({ theme, $tone }) => theme.color.outcome[$tone].background};
  border: 1px solid ${({ theme, $tone }) => theme.color.outcome[$tone].border};
  border-radius: 50%;
  font-size: 0.5625rem;
  ${table} { inline-size: 1.125rem; block-size: 1.125rem; font-size: 0.6875rem; }
`;

const Notes = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0;
  padding: 0;
  font-size: 0.625rem;
  line-height: 1.35;
  list-style: none;
  ${tile} { grid-area: notes; padding-block-start: 2px; }
  ${table} { grid-column: 4 / span 6; }
`;
const Note = styled.li`
  display: inline-flex;
  align-items: flex-start;
  gap: 3px;
  min-inline-size: 0;
  padding: 0 6px;
  color: ${({ theme }) => theme.color.accent.amber.text};
  background: ${({ theme }) => theme.color.accent.amber.soft};
  > svg { flex: none; margin-block-start: 0.2em; }
`;

/** The whole tile or row is the target; the chevron belongs to the desktop row only. */
const Open = styled(Link)`
  position: absolute;
  inset: 0;
  z-index: 1;
  color: ${({ theme }) => theme.color.mutedText};
  > svg { display: none; }
  &:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: calc(-1 * ${({ theme }) => theme.border.focusWidth});
  }
  ${table} {
    position: static;
    display: grid;
    grid-column: 10;
    grid-row: 1;
    place-items: center;
    > svg { display: block; font-size: 1rem; }
    &::after { content: ""; position: absolute; inset: 0; z-index: 1; }
    &:hover { color: ${({ theme }) => theme.color.brand}; }
    &:focus-visible { outline: none; }
    &:focus-visible::after {
      outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
      outline-offset: calc(-1 * ${({ theme }) => theme.border.focusWidth});
    }
  }
`;

const outcomeIcons = { correct: CheckIcon, incorrect: CrossIcon, void: VoidIcon } as const;

function MatchState({ fixture, home, away, messages }: { fixture: FixtureSnapshot; home: string; away: string; messages: Messages }) {
  const { status, score, liveClock } = fixture;
  const final = hasFinalScoreStatus(status);
  const scoreline = score && (status === "live" || final) ? <>
    <Score aria-hidden="true"><span>{messages.number(score.home)}</span><span>–</span><span>{messages.number(score.away)}</span></Score>
    <VisuallyHidden>{messages.text("match.scoreline", { label: messages.text(final ? "match.finalScore" : "match.liveScore"),
      home, away, homeScore: messages.number(score.home), awayScore: messages.number(score.away) })}</VisuallyHidden>
  </> : <>
    <Versus aria-hidden="true">{messages.text("match.versus")}</Versus>
    {(status === "live" || final) && <VisuallyHidden>{messages.text(final ? "match.finalScoreUnknown" : "match.scoreUnknown")}</VisuallyHidden>}
  </>;
  if (status === "live") {
    const minute = liveClock?.minute ?? null, phase = liveClock?.phase ?? "in-play";
    const visible = minute !== null ? messages.text("match.clock.minute", { minute: messages.number(minute) })
      : phase === "in-play" ? messages.text("match.liveBadge") : messages.text(`match.clock.${phase}`);
    const spoken = [messages.text("match.status.live"), phase === "half-time" ? messages.text("match.clock.halfTimeLabel")
      : phase === "in-play" ? null : messages.text(`match.clock.${phase}`),
      minute === null ? null : messages.text("match.clock.minuteLabel", { minute: messages.number(minute) })].filter(Boolean).join(", ");
    return <Center data-match-state="live">{scoreline}
      <StateChip $tone="live" data-live-minute={minute ?? ""}><LiveDot aria-hidden="true" /><span aria-hidden="true">{visible}</span>
        <VisuallyHidden>{spoken}</VisuallyHidden></StateChip>
    </Center>;
  }
  if (final && (status === "finished-regulation" || status === "finished-extra-time" || status === "finished-penalties")) {
    const regulationOnly = fixture.scorePeriod === "regulation" && status !== "finished-regulation";
    return <Center data-match-state="final">{scoreline}
      <StateChip $tone="final" title={regulationOnly ? messages.text("match.regulationScoreNote") : undefined}>
        <span aria-hidden="true">{messages.text(`match.final.${status}`)}{regulationOnly && "*"}</span>
        <VisuallyHidden>{messages.text(`match.status.${status}`)}{regulationOnly && `. ${messages.text("match.regulationScoreNote")}`}</VisuallyHidden>
      </StateChip>
    </Center>;
  }
  if (status === "scheduled") return <Center data-match-state="scheduled">{scoreline}</Center>;
  return <Center data-match-state={status}>{scoreline}
    {status === "unknown" ? <VisuallyHidden>{messages.text("match.status.unknown")}</VisuallyHidden>
      : <StateChip $tone="halted">{messages.text(`match.status.${status}`)}</StateChip>}
  </Center>;
}

function CardTeam({ team, side, name, eager, score, live }: {
  team: FixtureSnapshot["homeTeam"]; side: "home" | "away"; name: string; eager: boolean; score: string | null; live: boolean;
}) {
  const url = isSafeRemoteImageUrl(team.logoUrl) ? team.logoUrl : undefined;
  return <Team data-team-side={side}>
    <TeamLogo key={`${team.id}:${url ?? "missing"}`} name={team.name} url={url} eager={eager} />
    <TeamName>{name}</TeamName>
    {score !== null && <TeamScore aria-hidden="true" $live={live}>{score}</TeamScore>}
  </Team>;
}

function CompetitionLogo({ url }: { url: string | null | undefined }) {
  const [failed, setFailed] = useState(false);
  return url && !failed && isSafeRemoteImageUrl(url)
    ? <LeagueLogo src={url} alt="" width={14} height={14} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <TrophyIcon />;
}

export function MatchCard({ fixture, analysisSlug, markets, selectedFamily, locale: requestedLocale,
  headingLevel = 2, eagerLogos = false, position }: MatchCardProps) {
  const locale = resolveLocale(requestedLocale);
  const messages = createMessages(locale);
  const titleId = `gh-match-${useId()}`;
  const eligible = markets && markets.length > 0 ? markets : [selectedFamily ?? "match-result"];
  const shownFamily = bestCardFamily(fixture, eligible) ?? eligible[0]!;
  const home = fixture.homeTeam.name?.trim() || messages.text("match.homeUnknown");
  const away = fixture.awayTeam.name?.trim() || messages.text("match.awayUnknown");
  const competition = fixture.competition.name?.trim() || messages.text("match.competitionUnknown");
  const country = fixture.competition.country?.trim();
  const prediction = selectedCardPrediction(fixture, shownFamily);
  const family = messages.text(`market.family.${shownFamily}`);
  const locked = fixture.cycle?.state === "closed";
  const outcome = prediction?.status ?? "unavailable";
  const OutcomeIcon = outcome === "correct" || outcome === "incorrect" || outcome === "void" ? outcomeIcons[outcome] : null;
  const percent = prediction && (prediction.probability.labelKey === "probability.percent"
    ? messages.text("probability.percent", { percent: messages.number(prediction.probability.roundedPercent) })
    : messages.text(prediction.probability.labelKey === "probability.less-than-one" ? "probability.compact.less-than-one" : "probability.compact.more-than-ninety-nine"));
  const details = prediction && [messages.text(`market.source.${prediction.item.market.source}`),
    prediction.provisional ? messages.text("match.provisional") : null,
    `${messages.text("match.published")}: ${messages.reportingInstant(prediction.publishedAt)}`].filter(Boolean).join(" · ");
  const notes = [
    fixture.update?.prediction === "updating" && messages.text("match.predictionUpdating"),
    fixture.forecast?.updateDelayed && messages.text("match.updateDelayed"),
    fixture.update?.result === "delayed" && messages.text("match.resultDelayed"),
    prediction?.item.limitedNews && messages.text("match.limitedNews"),
    fixture.partialCoverage && messages.text("match.partialCoverage"),
    locked && !prediction && messages.text("match.noLockedPrediction"),
    prediction?.explanation && outcome === "void" && prediction.explanation,
    fixture.cycle?.state === "void" && !prediction && fixture.cycle.voidReason?.explanation,
    fixture.availabilityMessage,
  ].filter((note): note is string => typeof note === "string" && note.length > 0);
  const selection = prediction?.item.market.selection;
  const live = fixture.status === "live";
  const showScore = fixture.score !== null && (live || hasFinalScoreStatus(fixture.status));
  return <Card tabIndex={-1} aria-labelledby={titleId} data-fixture-id={fixture.fixtureId} data-market={shownFamily} $family={shownFamily}
    data-status={fixture.status}>
    <VisuallyHidden as={`h${headingLevel}`} id={titleId}>{messages.text("match.title", { home, away })}</VisuallyHidden>
    <Meta>
      {position !== undefined && <Index aria-hidden="true">{messages.number(position)}</Index>}
      <League title={country ?? undefined}><CompetitionLogo url={fixture.competition.logoUrl} /><span>{competition}</span>
        {country && <VisuallyHidden>, {country}</VisuallyHidden>}</League>
      {fixture.kickoffAt === null ? <When as="p">{messages.text("match.kickoffUnknown")}</When>
        : <When dateTime={toUtcIsoString(fixture.kickoffAt)} title={messages.reportingInstant(fixture.kickoffAt)}>
          <VisuallyHidden>{messages.text("match.kickoff")}: </VisuallyHidden>
          <span>{messages.reportingDay(fixture.kickoffAt)}</span><Dot aria-hidden="true">·</Dot>
          <span>{messages.reportingTime(fixture.kickoffAt)}<VisuallyHidden> EAT</VisuallyHidden></span>
        </When>}
    </Meta>
    <Teams>
      <CardTeam team={fixture.homeTeam} side="home" name={home} eager={eagerLogos} live={live}
        score={showScore ? messages.number(fixture.score!.home) : null} />
      <MatchState fixture={fixture} home={home} away={away} messages={messages} />
      <CardTeam team={fixture.awayTeam} side="away" name={away} eager={eagerLogos} live={live}
        score={showScore ? messages.number(fixture.score!.away) : null} />
    </Teams>
    <Pick $family={shownFamily}>
      <MarketName $family={shownFamily} aria-hidden="true">{family}</MarketName>
      <Prediction $available={prediction !== null} data-prediction={selection ?? "none"} data-outcome={outcome} title={details ?? undefined}>
        {prediction && selection ? <>
          {locked && <LockIcon />}
          <PickLabel aria-hidden="true">{messages.text(`market.selection.${selection}`)}</PickLabel>
          <PickShort $family={shownFamily} aria-hidden="true">{messages.text(`market.pick.${selection}`)}</PickShort>
          <Probability aria-hidden="true">
            <Percent>{percent}</Percent>
            <Bar $family={shownFamily}><span style={{ inlineSize: `${Math.max(2, prediction.probability.roundedPercent)}%` }} /></Bar>
            {OutcomeIcon && <Mark $tone={outcome} title={messages.text(`outcome.${outcome}`)}><OutcomeIcon /></Mark>}
          </Probability>
          <VisuallyHidden>{messages.text("match.pickLabel", { market: family, selection: messages.text(`market.selection.${selection}`),
            probability: messages.text(prediction.probability.labelKey, { percent: messages.number(prediction.probability.roundedPercent) }) })}
            {locked && `. ${messages.text("match.lockedPrediction")}`}. {messages.text("match.outcome")}: {messages.text(`outcome.${outcome}`)}
          </VisuallyHidden>
        </> : <>
          <NoPick aria-hidden="true">{messages.text("match.noPick")}</NoPick>
          <VisuallyHidden>{messages.text("match.noPickLabel", { market: family })}</VisuallyHidden>
        </>}
      </Prediction>
    </Pick>
    {notes.length > 0 && <Notes>{notes.map((note, index) => <Note key={index}><NoticeIcon />{note}</Note>)}</Notes>}
    <Open href={matchHref(fixture.fixtureId, analysisSlug, locale)} prefetch={false}>
      <VisuallyHidden>{messages.text("match.analysisLabel", { home, away })}</VisuallyHidden><ChevronIcon />
    </Open>
  </Card>;
}
