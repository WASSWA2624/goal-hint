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
import { BallIcon, BarsIcon, CalendarIcon, CheckIcon, ChevronIcon, ClockIcon, CrossIcon, LockIcon, NoticeIcon, TrophyIcon, VoidIcon } from "./match-icons";
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
const table = css`@media (min-width: ${({ theme }) => theme.breakpoint.lg})`;
const wideTable = css`@media (min-width: ${({ theme }) => theme.breakpoint.xl})`;
const pulse = keyframes`0%, 100% { opacity: 1; } 50% { opacity: 0.35; }`;

/** Phone cards carry a stripe in the shown market's colour; table rows drop it. */
const Card = styled.article<{ $family: MarketFamily }>`
  position: relative;
  container: match-card / inline-size;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 6px;
  min-inline-size: 0;
  padding: 9px 10px 10px 13px;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.border.cardRadius};
  box-shadow: inset 4px 0 0 ${({ theme, $family }) => theme.color.market[$family].solid}, ${({ theme }) => theme.shadow.card};
  overflow-wrap: anywhere;
  transition: box-shadow 160ms ease, background-color 160ms ease;
  &:hover { box-shadow: inset 4px 0 0 ${({ theme, $family }) => theme.color.market[$family].solid}, ${({ theme }) => theme.shadow.cardHover}; }
  &:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: ${({ theme }) => theme.border.focusOffset};
  }
  @media (prefers-reduced-motion: reduce) { transition: none; }
  ${table} {
    grid-template-columns: ${matchTableColumns.compact};
    column-gap: ${matchTableGap};
    row-gap: 4px;
    align-items: center;
    padding: 6px 16px;
    background: transparent;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    font-size: 0.875rem;
    &:hover { box-shadow: none; background: ${({ theme }) => theme.color.rowHover}; }
    &:focus-visible { outline-offset: calc(-1 * ${({ theme }) => theme.border.focusWidth}); }
  }
  ${wideTable} { grid-template-columns: ${matchTableColumns.full}; }
`;

const Meta = styled.header`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 2px 12px;
  font-size: 0.8125rem;
  line-height: ${({ theme }) => theme.typography.lineHeight.heading};
  ${table} { display: grid; grid-column: 1 / span 3; grid-template-columns: subgrid; gap: normal; padding: 0; }
`;
const Index = styled.span`
  display: none;
  ${table} { display: block; grid-column: 1; grid-row: 1; color: ${({ theme }) => theme.color.text}; font-variant-numeric: tabular-nums; }
`;
const League = styled.p`
  display: flex;
  align-items: center;
  gap: 10px;
  min-inline-size: 0;
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  > svg { flex: none; font-size: 1.125rem; color: ${({ theme }) => theme.color.mutedText}; }
  ${table} { grid-column: 3; grid-row: 1; font-weight: ${({ theme }) => theme.typography.weight.body}; }
`;
const LeagueLogo = styled.img`
  flex: none;
  inline-size: 22px;
  block-size: 22px;
  object-fit: contain;
  ${table} { inline-size: 20px; block-size: 20px; }
`;
const When = styled.time`
  display: flex;
  align-items: center;
  gap: 10px;
  font-variant-numeric: tabular-nums;
  ${table} { grid-column: 2; grid-row: 1; flex-wrap: wrap; gap: 0 6px; }
`;
const WhenPart = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
  > svg { font-size: 1rem; color: ${({ theme }) => theme.color.accent.blue.solid}; }
  &:last-child > svg { color: ${({ theme }) => theme.color.accent.violet.solid}; }
  ${table} { > svg { display: none; } }
`;
const Divider = styled.span`
  inline-size: 1px;
  block-size: 1.125rem;
  background: ${({ theme }) => theme.color.border};
  ${table} { display: none; }
`;

const Teams = styled.div`
  --gh-logo-size: 34px;
  --gh-logo-radius: 9px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  ${table} { --gh-logo-size: 24px; --gh-logo-radius: 6px; grid-column: 4 / span 3; grid-template-columns: subgrid; gap: normal; padding: 0; }
`;
const Team = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-inline-size: 0;
  text-align: center;
  @container match-card (min-width: 20rem) {
    flex-direction: row;
    gap: 10px;
    text-align: start;
    &[data-team-side="away"] { flex-direction: row-reverse; text-align: end; }
  }
  ${table} {
    gap: 10px;
    &[data-team-side="away"] { flex-direction: row; text-align: start; }
  }
`;
const TeamName = styled.span`
  min-inline-size: 0;
  max-inline-size: 100%;
  font-size: 0.9375rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  line-height: ${({ theme }) => theme.typography.lineHeight.heading};
  @container match-card (min-width: 20rem) { flex: 1; }
  ${table} { font-size: 0.875rem; font-weight: ${({ theme }) => theme.typography.weight.body}; }
`;
const Center = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-inline-size: 3rem;
  ${table} { min-inline-size: 0; gap: 2px; }
`;
const Versus = styled.span`
  display: grid;
  place-items: center;
  inline-size: 2.25rem;
  block-size: 2.25rem;
  color: ${({ theme }) => theme.color.accent.violet.text};
  background: linear-gradient(135deg, ${({ theme }) => theme.color.accent.blue.soft} 0%, ${({ theme }) => theme.color.accent.violet.soft} 100%);
  border-radius: ${({ theme }) => theme.border.pillRadius};
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  text-transform: uppercase;
  ${table} { inline-size: auto; block-size: auto; color: ${({ theme }) => theme.color.mutedText}; background: none; font-size: 0.875rem; text-transform: none; }
`;
const Score = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 1.375rem;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  > span:nth-child(2) { color: ${({ theme }) => theme.color.mutedText}; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
  ${table} { font-size: 1rem; }
`;
const StateChip = styled.span<{ $tone: "live" | "final" | "halted" }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 1px 7px;
  border-radius: ${({ theme }) => theme.border.pillRadius};
  font-size: 0.6875rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  line-height: 1.5;
  white-space: nowrap;
  ${({ $tone, theme }) => $tone === "live"
    ? css`color: ${theme.color.live.text}; background: ${theme.color.live.soft};`
    : $tone === "final" ? css`color: ${theme.color.mutedText}; background: ${theme.color.surfaceMuted};`
    : css`color: ${theme.color.outcome.pending.text}; background: ${theme.color.outcome.pending.background};
        border: ${theme.border.width} solid ${theme.color.border};`}
`;
const LiveDot = styled.span`
  inline-size: 7px;
  block-size: 7px;
  border-radius: 50%;
  background: ${({ theme }) => theme.color.live.solid};
  animation: ${pulse} 1.6s ease-in-out infinite;
  @media (prefers-reduced-motion: reduce) { animation: none; }
`;

const Pick = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(7rem, 1fr);
  gap: 6px;
  ${table} { grid-column: 7 / span 3; grid-template-columns: subgrid; gap: normal; }
`;
/** Phone: icon | code | pick. Table: the market family name only. */
const MarketChip = styled.span<{ $family: MarketFamily }>`
  display: flex;
  align-items: center;
  gap: 8px;
  min-inline-size: 0;
  min-block-size: 2.375rem;
  padding: 4px 10px;
  color: ${({ theme, $family }) => theme.color.market[$family].text};
  background: ${({ theme, $family }) => theme.color.market[$family].soft};
  border-radius: 11px;
  font-size: 0.8125rem;
  line-height: ${({ theme }) => theme.typography.lineHeight.heading};
  > svg { flex: none; font-size: 1.25rem; color: ${({ theme, $family }) => theme.color.market[$family].solid}; }
  ${table} {
    justify-self: start;
    min-block-size: 0;
    padding: 3px 10px;
    border-radius: 6px;
    font-size: 0.8125rem;
    > svg { display: none; }
  }
`;
const ChipRule = styled.span`
  flex: none;
  inline-size: 1px;
  block-size: 1.25rem;
  background: currentColor;
  opacity: 0.25;
  ${table} { display: none; }
`;
const ChipCode = styled.strong`
  flex: none;
  color: ${({ theme }) => theme.color.text};
  font-size: 0.875rem;
  white-space: nowrap;
  ${table} { display: none; }
`;
const ChipPick = styled.span`
  min-inline-size: 0;
  color: ${({ theme }) => theme.color.text};
  overflow-wrap: break-word;
  ${table} { display: none; }
`;
const ChipFamily = styled.span`
  display: none;
  ${table} { display: inline; }
`;
const Prediction = styled.span<{ $family: MarketFamily; $available: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-inline-size: 0;
  min-block-size: 2.375rem;
  padding: 4px 10px;
  color: ${({ theme, $available }) => $available ? theme.color.onBrand : theme.color.mutedText};
  background: ${({ theme, $family, $available }) => $available ? theme.color.market[$family].gradient : theme.color.surfaceMuted};
  border-radius: 11px;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  > svg { flex: none; font-size: 1.125rem; }
  ${table} {
    display: contents;
    > svg { display: none; }
  }
`;
const PickShort = styled.span<{ $family: MarketFamily }>`
  display: none;
  ${table} {
    display: inline-flex;
    grid-column: 2;
    justify-self: start;
    justify-content: center;
    min-inline-size: 3.5rem;
    padding: 3px 10px;
    color: ${({ theme }) => theme.color.onBrand};
    background: ${({ theme, $family }) => theme.color.market[$family].solid};
    border-radius: 6px;
    font-size: 0.8125rem;
  }
`;
const Probability = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  ${table} { grid-column: 3; gap: 10px; }
`;
/** 1.3rem bold is large text, so gradient pills keep 3:1 white contrast. */
const Percent = styled.span`
  font-size: 1.3rem;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  ${table} { min-inline-size: 2.75rem; font-size: 0.875rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
`;
const Bar = styled.span<{ $family: MarketFamily }>`
  display: none;
  ${wideTable} {
    display: block;
    flex: 1;
    block-size: 8px;
    background: ${({ theme }) => theme.color.surfaceMuted};
    border-radius: 4px;
    overflow: hidden;
    > span { display: block; block-size: 100%; background: ${({ theme, $family }) => theme.color.market[$family].gradient}; border-radius: 4px; }
  }
`;
const NoPick = styled.span`
  font-size: 0.875rem;
  ${table} { grid-column: 2 / span 2; color: ${({ theme }) => theme.color.mutedText}; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
`;
const Mark = styled.span<{ $tone: OutcomeTone }>`
  display: inline-grid;
  flex: none;
  place-items: center;
  inline-size: 1.375rem;
  block-size: 1.375rem;
  color: ${({ theme, $tone }) => theme.color.outcome[$tone].text};
  background: ${({ theme, $tone }) => theme.color.outcome[$tone].background};
  border: 1.5px solid ${({ theme, $tone }) => theme.color.outcome[$tone].border};
  border-radius: 50%;
  font-size: 0.8125rem;
`;

const Notes = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: 0.75rem;
  line-height: 1.35;
  list-style: none;
  ${table} { grid-column: 4 / span 6; padding: 0; font-size: 0.75rem; }
`;
const Note = styled.li`
  display: inline-flex;
  align-items: flex-start;
  gap: 4px;
  min-inline-size: 0;
  padding: 1px 8px;
  color: ${({ theme }) => theme.color.accent.amber.text};
  background: ${({ theme }) => theme.color.accent.amber.soft};
  border-radius: 10px;
  > svg { flex: none; margin-block-start: 0.15em; }
`;

/** The whole card or row is the target; the chevron belongs to the desktop row only. */
const Open = styled(Link)`
  position: absolute;
  inset: 0;
  z-index: 1;
  border-radius: inherit;
  color: ${({ theme }) => theme.color.mutedText};
  > svg { display: none; }
  &:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: ${({ theme }) => theme.border.focusOffset};
  }
  ${table} {
    position: static;
    display: grid;
    grid-column: 10;
    grid-row: 1;
    place-items: center;
    > svg { display: block; font-size: 1.125rem; }
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

function CardTeam({ team, side, name, eager }: { team: FixtureSnapshot["homeTeam"]; side: "home" | "away"; name: string; eager: boolean }) {
  const url = isSafeRemoteImageUrl(team.logoUrl) ? team.logoUrl : undefined;
  return <Team data-team-side={side}>
    <TeamLogo key={`${team.id}:${url ?? "missing"}`} name={team.name} url={url} eager={eager} />
    <TeamName>{name}</TeamName>
  </Team>;
}

function CompetitionLogo({ url }: { url: string | null | undefined }) {
  const [failed, setFailed] = useState(false);
  return url && !failed && isSafeRemoteImageUrl(url)
    ? <LeagueLogo src={url} alt="" width={22} height={22} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
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
          <WhenPart><CalendarIcon />{messages.reportingDay(fixture.kickoffAt)}</WhenPart>
          <Divider aria-hidden="true" />
          <WhenPart><ClockIcon />{messages.reportingTime(fixture.kickoffAt)}<VisuallyHidden> EAT</VisuallyHidden></WhenPart>
        </When>}
    </Meta>
    <Teams>
      <CardTeam team={fixture.homeTeam} side="home" name={home} eager={eagerLogos} />
      <MatchState fixture={fixture} home={home} away={away} messages={messages} />
      <CardTeam team={fixture.awayTeam} side="away" name={away} eager={eagerLogos} />
    </Teams>
    <Pick>
      <MarketChip $family={shownFamily} aria-hidden="true">
        <BallIcon /><ChipCode>{messages.text(`market.code.${shownFamily}`)}</ChipCode><ChipRule />
        <ChipPick>{selection ? messages.text(`market.selection.${selection}`) : family}</ChipPick><ChipFamily>{family}</ChipFamily>
      </MarketChip>
      <Prediction $family={shownFamily} $available={prediction !== null} data-prediction={selection ?? "none"}
        data-outcome={outcome} title={details ?? undefined}>
        {prediction && selection ? <>
          {locked ? <LockIcon /> : <BarsIcon />}
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
