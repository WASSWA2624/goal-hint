"use client";

import Link from "next/link";
import { useId } from "react";
import styled, { css, keyframes } from "styled-components";
import { toUtcIsoString } from "@/domain/calendar";
import type { FixtureSnapshot } from "@/domain/fixture-snapshot";
import { hasFinalScoreStatus, selectedCardPrediction } from "@/domain/match-card";
import type { MarketFamily } from "@/domain/markets";
import { matchHref } from "@/domain/navigation";
import { createMessages } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/locales";
import type { OutcomeTone } from "@/styles/theme";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { BallIcon, BarsIcon, CalendarIcon, CheckIcon, ChevronIcon, ClockIcon, CrossIcon, LockIcon, NoticeIcon, TrophyIcon, VoidIcon } from "./match-icons";
import { matchTableColumns, matchTableGap } from "./match-columns";
import { TeamLogo } from "./team-row";
import { isSafeRemoteImageUrl } from "@/domain/remote-image";

export type MatchCardProps = {
  fixture: FixtureSnapshot;
  analysisSlug: string;
  selectedFamily?: MarketFamily;
  locale?: string;
  headingLevel?: 2 | 3 | 4;
  eagerLogos?: boolean;
  /** One-based list position shown in the desktop table's # column. */
  position?: number;
};

type Messages = ReturnType<typeof createMessages>;
const table = css`@media (min-width: ${({ theme }) => theme.breakpoint.lg})`;
/** Card layouts follow the card's own width, so two-column grids stay legible. */
const roomy = "@container match-card (min-width: 30rem)";
const pulse = keyframes`0%, 100% { opacity: 1; } 50% { opacity: 0.35; }`;

const Card = styled.article`
  position: relative;
  container: match-card / inline-size;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto 1fr;
  align-content: start;
  min-inline-size: 0;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.border.cardRadius};
  box-shadow: ${({ theme }) => theme.shadow.card};
  overflow-wrap: anywhere;
  transition: box-shadow 160ms ease, background-color 160ms ease;
  &:hover { box-shadow: ${({ theme }) => theme.shadow.cardHover}; }
  &:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: ${({ theme }) => theme.border.focusOffset};
  }
  @media (prefers-reduced-motion: reduce) { transition: none; }
  ${table} {
    grid-template-columns: ${matchTableColumns};
    grid-template-rows: none;
    column-gap: ${matchTableGap};
    align-items: center;
    padding: 10px 16px;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    &:hover { box-shadow: none; background: ${({ theme }) => theme.color.rowHover}; }
    &:focus-visible { outline-offset: calc(-1 * ${({ theme }) => theme.border.focusWidth}); }
  }
`;

const Meta = styled.header`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 12px;
  padding: 12px 16px;
  background: ${({ theme }) => theme.color.cardHeader};
  border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-start-start-radius: ${({ theme }) => theme.border.cardRadius};
  border-start-end-radius: ${({ theme }) => theme.border.cardRadius};
  font-size: ${({ theme }) => theme.typography.size.small};
  line-height: ${({ theme }) => theme.typography.lineHeight.heading};
  ${table} {
    display: grid;
    grid-column: 1 / span 3;
    grid-template-columns: subgrid;
    gap: normal;
    padding: 0;
    background: none;
    border: 0;
    border-radius: 0;
  }
`;
const Index = styled.span`
  display: none;
  ${table} {
    display: block;
    grid-column: 1;
    color: ${({ theme }) => theme.color.mutedText};
    font-variant-numeric: tabular-nums;
  }
`;
const League = styled.p`
  display: flex;
  align-items: center;
  gap: 8px;
  min-inline-size: 0;
  font-size: 0.9375rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  > svg { flex-shrink: 0; font-size: 1.25rem; }
  ${table} {
    grid-column: 3;
    grid-row: 1;
    font-size: ${({ theme }) => theme.typography.size.small};
    font-weight: ${({ theme }) => theme.typography.weight.medium};
    > svg { font-size: 1rem; color: ${({ theme }) => theme.color.mutedText}; }
  }
`;
const LeagueText = styled.span`
  display: flex;
  flex-direction: column;
  min-inline-size: 0;
`;
const Country = styled.span`
  color: ${({ theme }) => theme.color.mutedText};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.typography.weight.body};
`;
const When = styled.time`
  display: flex;
  align-items: center;
  gap: 10px;
  color: ${({ theme }) => theme.color.text};
  font-variant-numeric: tabular-nums;
  ${table} {
    grid-column: 2;
    grid-row: 1;
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
  }
`;
const WhenPart = styled.span<{ $primary?: boolean }>`
  display: inline-flex;
  white-space: nowrap;
  align-items: center;
  gap: 6px;
  > svg { font-size: 1.125rem; color: ${({ theme }) => theme.color.text}; }
  ${table} {
    > svg { display: none; }
    ${({ $primary, theme }) => $primary
    ? css`order: -1; font-weight: ${theme.typography.weight.bold}; font-size: 0.9375rem;`
    : css`color: ${theme.color.mutedText}; font-size: 0.75rem;`}
  }
`;
const Divider = styled.span`
  inline-size: 1px;
  block-size: 1.125rem;
  background: ${({ theme }) => theme.color.border};
  ${table} { display: none; }
`;

const Teams = styled.div`
  --gh-logo-size: 44px;
  --gh-logo-radius: 12px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 20px 16px 16px;
  ${table} {
    --gh-logo-size: 28px;
    --gh-logo-radius: 8px;
    grid-column: 4 / span 3;
    grid-template-columns: subgrid;
    gap: normal;
    padding: 0;
  }
`;
const Team = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-inline-size: 0;
  text-align: center;
  ${roomy} {
    flex-direction: row;
    gap: 12px;
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
  font-size: 1.0625rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  line-height: ${({ theme }) => theme.typography.lineHeight.heading};
  ${table} { font-size: 0.9375rem; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
`;
const Center = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-inline-size: 3.5rem;
  ${table} { gap: 4px; min-inline-size: 0; }
`;
const Versus = styled.span`
  display: grid;
  place-items: center;
  inline-size: 2.75rem;
  block-size: 2.75rem;
  color: ${({ theme }) => theme.color.mutedText};
  background: ${({ theme }) => theme.color.surfaceMuted};
  border-radius: ${({ theme }) => theme.border.pillRadius};
  font-size: ${({ theme }) => theme.typography.size.small};
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  text-transform: uppercase;
  ${table} {
    inline-size: auto;
    block-size: auto;
    background: none;
    font-weight: ${({ theme }) => theme.typography.weight.body};
    text-transform: none;
  }
`;
const Score = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 1.75rem;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  > span:nth-child(2) { color: ${({ theme }) => theme.color.mutedText}; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
  ${table} { gap: 6px; font-size: 1.125rem; }
`;
const StateChip = styled.span<{ $tone: "live" | "final" | "halted" }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border-radius: ${({ theme }) => theme.border.pillRadius};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  line-height: 1.4;
  white-space: nowrap;
  ${({ $tone, theme }) => $tone === "live"
    ? css`color: ${theme.color.live.text}; background: ${theme.color.live.soft};`
    : $tone === "final" ? css`color: ${theme.color.mutedText}; background: ${theme.color.surfaceMuted};`
    : css`color: ${theme.color.outcome.pending.text}; background: ${theme.color.outcome.pending.background};
        border: ${theme.border.width} solid ${theme.color.border};`}
`;
const LiveDot = styled.span`
  inline-size: 8px;
  block-size: 8px;
  border-radius: 50%;
  background: ${({ theme }) => theme.color.live.solid};
  animation: ${pulse} 1.6s ease-in-out infinite;
  @media (prefers-reduced-motion: reduce) { animation: none; }
`;

const Pick = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr);
  gap: 10px;
  padding: 0 16px 16px;
  ${table} {
    grid-column: 7 / span 2;
    grid-template-columns: subgrid;
    gap: normal;
    padding: 0;
  }
`;
/** Narrow cards stack code over name; roomy cards use one divided row. */
const MarketChip = styled.span<{ $family: MarketFamily }>`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  grid-template-areas: "icon code" "icon name";
  align-items: center;
  gap: 0 10px;
  min-inline-size: 0;
  padding: 10px 14px;
  color: ${({ theme, $family }) => theme.color.market[$family].text};
  background: ${({ theme, $family }) => theme.color.market[$family].soft};
  border-radius: 14px;
  font-size: ${({ theme }) => theme.typography.size.small};
  line-height: ${({ theme }) => theme.typography.lineHeight.heading};
  > svg { grid-area: icon; font-size: 1.375rem; color: ${({ theme, $family }) => theme.color.market[$family].solid}; }
  ${roomy} { display: flex; gap: 10px; }
  ${table} {
    display: flex;
    justify-self: start;
    padding: 4px 10px;
    border-radius: 8px;
    font-size: 0.8125rem;
    font-weight: ${({ theme }) => theme.typography.weight.medium};
    > svg { display: none; }
  }
`;
const ChipRule = styled.span`
  display: none;
  flex-shrink: 0;
  inline-size: 1px;
  block-size: 1.25rem;
  background: currentColor;
  opacity: 0.25;
  ${roomy} { display: block; }
  ${table} { display: none; }
`;
const ChipCode = styled.strong`
  grid-area: code;
  flex-shrink: 0;
  font-size: 0.9375rem;
  white-space: nowrap;
  ${table} { display: none; }
`;
const ChipName = styled.span`
  grid-area: name;
  min-inline-size: 0;
  overflow-wrap: break-word;
  color: ${({ theme }) => theme.color.text};
  ${table} { color: inherit; }
`;
/** Narrow cards stack the percent over the pick; the table uses one inline row. */
const Prediction = styled.span<{ $family: MarketFamily; $available: boolean }>`
  display: grid;
  grid-template-columns: auto auto auto;
  grid-template-areas: "icon percent mark" "icon pick mark";
  align-items: center;
  justify-content: center;
  gap: 2px 10px;
  min-inline-size: 0;
  padding: 10px 12px;
  color: ${({ theme, $available }) => $available ? theme.color.onBrand : theme.color.mutedText};
  background: ${({ theme, $family, $available }) => $available ? theme.color.market[$family].solid : theme.color.surfaceMuted};
  border-radius: 14px;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  line-height: 1.2;
  > svg { grid-area: icon; font-size: 1.25rem; }
  ${table} {
    display: flex;
    justify-content: flex-start;
    gap: 8px;
    padding: 0;
    color: ${({ theme, $available }) => $available ? theme.color.text : theme.color.mutedText};
    background: none;
    > svg { display: none; }
  }
`;
const PickFull = styled.span`
  grid-area: pick;
  min-inline-size: 0;
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  overflow-wrap: break-word;
  ${table} { display: none; }
`;
const PickShort = styled.span<{ $family: MarketFamily }>`
  display: none;
  ${table} {
    display: inline-flex;
    justify-content: center;
    min-inline-size: 2.5rem;
    padding: 3px 10px;
    color: ${({ theme }) => theme.color.onBrand};
    background: ${({ theme, $family }) => theme.color.market[$family].solid};
    border-radius: 8px;
    font-size: 0.8125rem;
  }
`;
const Percent = styled.span`
  grid-area: percent;
  font-size: 1.375rem;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  ${table} { font-size: 0.9375rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
`;
const NoPick = styled.span`
  grid-column: 1 / -1;
  grid-row: 1 / -1;
  font-size: ${({ theme }) => theme.typography.size.small};
  ${table} { font-size: 0.8125rem; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
`;
const Mark = styled.span<{ $tone: OutcomeTone }>`
  grid-area: mark;
  display: inline-grid;
  flex-shrink: 0;
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
  margin: -4px 0 0;
  padding: 0 16px 14px;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: 0.8125rem;
  line-height: 1.35;
  list-style: none;
  ${table} { grid-column: 4 / span 5; margin: 0; padding: 6px 0 0; }
`;
const Note = styled.li`
  display: inline-flex;
  align-items: flex-start;
  gap: 4px;
  min-inline-size: 0;
  padding: 2px 8px;
  background: ${({ theme }) => theme.color.cardHeader};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: 10px;
  > svg { flex-shrink: 0; margin-block-start: 0.15em; }
`;

/** The whole card is the target; the visible chevron belongs to the desktop row only. */
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
    grid-column: 9;
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

export function MatchCard({ fixture, analysisSlug, selectedFamily = "match-result", locale: requestedLocale,
  headingLevel = 2, eagerLogos = false, position }: MatchCardProps) {
  const locale = resolveLocale(requestedLocale);
  const messages = createMessages(locale);
  const titleId = `gh-match-${useId()}`;
  const home = fixture.homeTeam.name?.trim() || messages.text("match.homeUnknown");
  const away = fixture.awayTeam.name?.trim() || messages.text("match.awayUnknown");
  const competition = fixture.competition.name?.trim() || messages.text("match.competitionUnknown");
  const country = fixture.competition.country?.trim();
  const prediction = selectedCardPrediction(fixture, selectedFamily);
  const family = messages.text(`market.family.${selectedFamily}`);
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
  return <Card tabIndex={-1} aria-labelledby={titleId} data-fixture-id={fixture.fixtureId} data-market={selectedFamily}
    data-status={fixture.status}>
    <VisuallyHidden as={`h${headingLevel}`} id={titleId}>{messages.text("match.title", { home, away })}</VisuallyHidden>
    <Meta>
      {position !== undefined && <Index aria-hidden="true">{messages.number(position)}</Index>}
      <League><TrophyIcon /><LeagueText><span>{competition}</span>{country && <Country>{country}</Country>}</LeagueText></League>
      {fixture.kickoffAt === null ? <When as="p">{messages.text("match.kickoffUnknown")}</When>
        : <When dateTime={toUtcIsoString(fixture.kickoffAt)} title={messages.reportingInstant(fixture.kickoffAt)}>
          <VisuallyHidden>{messages.text("match.kickoff")}: </VisuallyHidden>
          <WhenPart><CalendarIcon />{messages.reportingDay(fixture.kickoffAt)}</WhenPart>
          <Divider aria-hidden="true" />
          <WhenPart $primary><ClockIcon />{messages.reportingTime(fixture.kickoffAt)}<VisuallyHidden> EAT</VisuallyHidden></WhenPart>
        </When>}
    </Meta>
    <Teams>
      <CardTeam team={fixture.homeTeam} side="home" name={home} eager={eagerLogos} />
      <MatchState fixture={fixture} home={home} away={away} messages={messages} />
      <CardTeam team={fixture.awayTeam} side="away" name={away} eager={eagerLogos} />
    </Teams>
    <Pick>
      <MarketChip $family={selectedFamily} aria-hidden="true">
        <BallIcon /><ChipCode>{messages.text(`market.code.${selectedFamily}`)}</ChipCode><ChipRule /><ChipName>{family}</ChipName>
      </MarketChip>
      <Prediction $family={selectedFamily} $available={prediction !== null} data-prediction={prediction?.item.market.selection ?? "none"}
        data-outcome={outcome} title={details ?? undefined}>
        {prediction ? <>
          {locked ? <LockIcon /> : <BarsIcon />}
          <PickFull aria-hidden="true">{messages.text(`market.selection.${prediction.item.market.selection}`)}</PickFull>
          <PickShort $family={selectedFamily} aria-hidden="true">{messages.text(`market.pick.${prediction.item.market.selection}`)}</PickShort>
          <Percent aria-hidden="true">{percent}</Percent>
          <VisuallyHidden>{messages.text("match.pickLabel", { market: family,
            selection: messages.text(`market.selection.${prediction.item.market.selection}`),
            probability: messages.text(prediction.probability.labelKey, { percent: messages.number(prediction.probability.roundedPercent) }) })}
            {locked && `. ${messages.text("match.lockedPrediction")}`}
          </VisuallyHidden>
        </> : <>
          <NoPick aria-hidden="true">{messages.text("match.noPick")}</NoPick>
          <VisuallyHidden>{messages.text("match.noPickLabel", { market: family })}</VisuallyHidden>
        </>}
        {OutcomeIcon ? <Mark $tone={outcome} title={messages.text(`outcome.${outcome}`)}><OutcomeIcon />
          <VisuallyHidden>{messages.text("match.outcome")}: {messages.text(`outcome.${outcome}`)}</VisuallyHidden></Mark>
          : prediction && <VisuallyHidden>{messages.text("match.outcome")}: {messages.text(`outcome.${outcome}`)}</VisuallyHidden>}
      </Prediction>
    </Pick>
    {notes.length > 0 && <Notes>{notes.map((note, index) => <Note key={index}><NoticeIcon />{note}</Note>)}</Notes>}
    <Open href={matchHref(fixture.fixtureId, analysisSlug, locale)} prefetch={false}>
      <VisuallyHidden>{messages.text("match.analysisLabel", { home, away })}</VisuallyHidden><ChevronIcon />
    </Open>
  </Card>;
}
