"use client";

import Link from "@/components/navigation/navigation-link";
import { memo, useId, useState, type PointerEvent, type ReactNode } from "react";
import styled, { css, keyframes } from "styled-components";
import { toUtcIsoString } from "@/domain/calendar";
import { countryCode, countryDisplayName } from "@/domain/country-code";
import { countryFlagAsset } from "@/domain/country-flag";
import { bestCardFamily, noPickReason } from "@/domain/feed-presentation";
import { defaultMarkets } from "@/domain/feed-query";
import type { FixtureSnapshot } from "@/domain/fixture-snapshot";
import { cardResultStatus, hasFinalScoreStatus, sameCardFixture, selectedCardPrediction, selectedCardPrice } from "@/domain/match-card";
import type { MarketFamily } from "@/domain/markets";
import { matchHref } from "@/domain/navigation";
import { predictionLabel } from "@/domain/prediction-label";
import { isSafeRemoteImageUrl } from "@/domain/remote-image";
import { createMessages, type Messages } from "@/i18n/messages";
import { useMessages } from "@/i18n/use-messages";
import { resolveLocale } from "@/i18n/locales";
import { media, type OutcomeTone } from "@/styles/theme";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { CheckIcon, ChevronIcon, CrossIcon, FlagIcon, GlobeIcon, TrophyIcon, VoidIcon } from "./match-icons";
import { matchTableColumns, matchTableGap } from "./match-columns";
import { TeamLogo } from "./team-logo";
import { providerImageSource } from "@/components/ui/provider-image";
import { OutcomeBadge, PredictionOdds, ProbabilityBar } from "./prediction-presentation";

export type MatchCardProps = {
  fixture: FixtureSnapshot;
  analysisSlug: string;
  /** Show the most likely available pick among these eligible families. */
  markets?: readonly MarketFamily[];
  selectedFamily?: MarketFamily;
  locale?: string;
  headingLevel?: 2 | 3 | 4;
  eagerLogos?: boolean;
  position?: number;
};

type TeamResult = "win" | "loss" | null;
type StateTone = "live" | "final" | "halted";
const countryFlagUrl = (fixture: FixtureSnapshot) => fixture.competition.countryFlagUrl ?? null;
const tile = media.belowDesktop, table = media.desktop, wideTable = media.wide;
const pulse = keyframes`0%, 100% { opacity: 1; } 50% { opacity: 0.35; }`;
const ellipsis = css`min-inline-size: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;`;
const tileRadius = "0px";
/** Phone ticket: league and kickoff across the top, the match on the left, the pick on a stub on the right. */
const stubWidth = "9.25rem";
const settledOutcome = (outcome: OutcomeTone) => outcome === "correct" || outcome === "incorrect" || outcome === "void";
const Card = styled.article`
  position: relative;
  display: grid;
  min-inline-size: 0;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  font-size: 0.75rem;
  line-height: 1.3;
  overflow-wrap: anywhere;
  transition: background-color 160ms ease, box-shadow 160ms ease;
  &:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: calc(-1 * ${({ theme }) => theme.border.focusWidth});
  }
  @media (prefers-reduced-motion: reduce) { transition: none; }
  ${tile} {
    font-family: ${({ theme }) => theme.typography.family};
    grid-template-columns: minmax(0, 1fr) ${stubWidth};
    grid-template-areas: "meta meta" "teams pick";
    overflow: hidden;
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    box-shadow: none;
    border-radius: ${tileRadius};
  }
  ${table} {
    grid-template-columns: ${matchTableColumns.compact};
    grid-template-rows: auto auto;
    column-gap: ${matchTableGap};
    row-gap: 2px;
    align-items: center;
    padding: 6px 16px;
    background: transparent;
    font-size: 0.8125rem;
  }
  ${wideTable} { grid-template-columns: ${matchTableColumns.full}; }
  /* Touch taps would otherwise leave a stuck tint after returning to the list. */
  ${media.hover} { &:hover { background: ${({ theme }) => theme.color.rowHover}; } }
`;

/** Tile: one line with the league on the left and the kickoff date and time on the right. */
const Meta = styled.header`
  ${tile} {
    grid-area: meta;
    display: flex;
    align-items: center;
    gap: 6px;
    min-inline-size: 0;
    min-block-size: 1.375rem;
    padding-inline: 8px;
    color: ${({ theme }) => theme.color.mutedText};
    background: ${({ theme }) => theme.color.cardHeader};
    border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    font-size: ${({ theme }) => theme.typography.scale.caption};
    line-height: 1.2;
    white-space: nowrap;
  }
  ${table} { display: contents; }
`;
const Index = styled.span<{ $wrap: boolean }>`
  display: none;
  ${table} {
    display: block;
    grid-column: 1;
    grid-row: 1;
    white-space: ${({ $wrap }) => $wrap ? "normal" : "nowrap"};
    overflow-wrap: ${({ $wrap }) => $wrap ? "anywhere" : "normal"};
    font-variant-numeric: tabular-nums;
  }
`;
const LeagueName = styled.span`
  ${tile} { flex: 1 1 auto; }
  ${table} { grid-column: 2; grid-row: 2; }
`;
const League = styled.p`
  display: flex;
  color: ${({ theme }) => theme.color.link};
  align-items: center;
  gap: 6px;
  min-inline-size: 0;
  > svg { flex: none; color: ${({ theme }) => theme.color.mutedText}; }
  > span { ${ellipsis} }
  /* Tile: the flag leads the league name; the crest is left to the details page. */
  ${tile} {
    flex: 1 1 auto;
    gap: 5px;
    font-weight: ${({ theme }) => theme.typography.weight.medium};
    > img, > svg { display: none; }
  }
  /* Table: the crest leads the league name the way the flag leads the country, in a column as wide as the flag. */
  ${table} {
    display: grid;
    grid-column: 3;
    grid-row: 1 / span 2;
    grid-template-columns: 16px minmax(0, 1fr);
    grid-template-rows: subgrid;
    align-self: stretch;
    gap: 2px 4px;
    > [data-country] { grid-column: 1 / -1; grid-row: 1; }
    > img, > svg { grid-column: 1; grid-row: 2; }
    > svg { font-size: 1rem; }
    > span { white-space: nowrap; }
  }
`;
const LeagueLogo = styled.img`
  flex: none;
  inline-size: 12px;
  block-size: 12px;
  object-fit: contain;
  ${table} { inline-size: 16px; block-size: 16px; }
`;
const When = styled.time`
  display: flex;
  align-items: center;
  gap: 4px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  ${tile} { flex: none; }
  ${table} { display: contents; white-space: normal; }
`;
const KickoffDate = styled.span`
  ${table} { grid-column: 2; grid-row: 1; }
`;
const Dot = styled.span`
  ${table} { display: none; }
`;
const KickoffTime = styled.span`
  ${tile} { color: ${({ theme }) => theme.color.text}; font-weight: ${({ theme }) => theme.typography.weight.heavy}; }
  ${table} {
    grid-column: 2;
    grid-row: 2;
    min-inline-size: 0;
    max-inline-size: 100%;
    white-space: normal;
  }
`;
const KickoffZone = styled.span`
  color: ${({ theme }) => theme.color.mutedText};
  font-weight: 400;
  ${table} { overflow-wrap: anywhere; }
`;
const KickoffDetails = styled.span`
  display: contents;
  ${tile} { display: flex; align-items: center; gap: 4px; min-inline-size: 0; }
`;
const CountryDetails = styled.span`
  display: flex;
  flex: none;
  align-items: center;
  min-inline-size: 0;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 0.875rem;
  white-space: nowrap;
  > span { flex: none; }
  > [data-country-name] { flex: 1; min-inline-size: 0; white-space: normal; }
`;
const CountryName = styled.span`
  ${tile} { display: none; }
`;
const FlagImage = styled.img`
  flex: none;
  inline-size: 16px;
  block-size: 11px;
  margin-inline-end: 4px;
  object-fit: cover;
  border-radius: 1px;
  box-shadow: 0 0 0 0.5px rgb(11 31 51 / 22%);
  ${tile} { margin-inline-end: 0; }
`;
const FlagFallback = styled.span`
  display: grid;
  flex: none;
  place-items: center;
  inline-size: 16px;
  block-size: 11px;
  margin-inline-end: 4px;
  font-size: 11px;
  ${tile} { margin-inline-end: 0; }
`;

const Teams = styled.div`
  --gh-logo-size: 16px;
  --gh-logo-radius: 0;
  --gh-logo-font: 0.5rem;
  /* Tile: each team on its own line, then the status pill and the boxed score beside both lines. Initials sit in a
   * soft ringed disc, loaded crests keep their own shape. */
  ${tile} {
    --gh-logo-size: 1.125rem;
    --gh-logo-font: ${({ theme }) => theme.typography.scale.micro};
    --gh-logo-radius: 50%;
    --gh-logo-ring: inset 0 0 0 1px ${({ theme }) => theme.color.border};
    grid-area: teams;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: repeat(2, 1.25rem);
    align-items: center;
    column-gap: 8px;
    min-inline-size: 0;
    padding: 6px 10px 6px 8px;
  }
  /* Desktop cells share the league row; elapsed/final status shares the country row above it. */
  ${table} { --gh-logo-size: 22px; --gh-logo-font: 0.625rem; display: contents; }
`;
const Team = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-inline-size: 0;
  ${tile} {
    grid-column: 1;
    grid-row: 1;
    gap: 7px;
    &[data-team-side="away"] { grid-row: 2; }
    &[data-result="loss"] { color: ${({ theme }) => theme.color.mutedText}; }
  }
  /* Both crests sit beside the score; the home name aligns towards it. */
  ${table} {
    grid-column: 6;
    grid-row: 2;
    gap: 8px;
    &[data-team-side="home"] { grid-column: 4; flex-direction: row-reverse; text-align: end; }
  }
`;
const TeamName = styled.span`
  flex: 1;
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  ${ellipsis}
  ${tile} {
    font-size: ${({ theme }) => theme.typography.scale.body};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    line-height: 1.25;
    white-space: nowrap;
    [data-result="loss"] > & { font-weight: ${({ theme }) => theme.typography.weight.medium}; }
  }
  ${table} { white-space: nowrap; font-weight: ${({ theme }) => theme.typography.weight.body}; }
`;
const Center = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  ${tile} { grid-column: 2; grid-row: 1 / span 2; flex-direction: row; gap: 7px; }
  ${table} { display: contents; }
`;
const Versus = styled.span`
  color: ${({ theme }) => theme.color.mutedText};
  ${tile} { display: none; }
  ${table} { grid-column: 5; grid-row: 2; justify-self: center; }
`;
const Score = styled.span<{ $live: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.9375rem;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  > span:nth-child(2) { color: ${({ theme }) => theme.color.mutedText}; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
  ${table} { grid-column: 5; grid-row: 2; justify-self: center; }
  /* Tile: the two goals stacked in one box, level with their teams; the losing side's goals are muted. */
  ${tile} {
    display: grid;
    grid-template-rows: repeat(2, 1.25rem);
    gap: 0;
    min-inline-size: 1.625rem;
    color: ${({ theme, $live }) => $live ? theme.color.live.text : theme.color.text};
    background: ${({ theme, $live }) => $live ? theme.color.live.soft : theme.color.surfaceMuted};
    > span { display: grid; place-items: center; }
    > span:nth-child(2) { display: none; }
    > [data-loss] { color: ${({ theme }) => theme.color.mutedText}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  }
`;
const StateChip = styled.span<{ $tone: StateTone }>`
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
  ${table} { grid-column: 5; grid-row: 1; justify-self: center; }
  /* Tile: a pill before the score; live is solid red, a final whistle grey, a halted match amber. */
  ${tile} {
    order: -1;
    min-block-size: 1.25rem;
    padding: 0 6px;
    font-size: ${({ theme }) => theme.typography.scale.caption};
    font-weight: ${({ theme }) => theme.typography.weight.heavy};
    line-height: 1;
    ${({ $tone, theme }) => $tone === "live" ? css`color: ${theme.color.surface}; background: ${theme.color.live.solid};`
      : $tone === "final" ? css`color: ${theme.color.text};` : ""}
  }
`;
const LiveDot = styled.span`
  inline-size: 6px;
  block-size: 6px;
  border-radius: 50%;
  background: ${({ theme }) => theme.color.live.solid};
  animation: ${pulse} 1.6s ease-in-out infinite;
  @media (prefers-reduced-motion: reduce) { animation: none; }
  /* Keep the compact mobile clock still. */
  ${tile} { background: currentColor; animation: none; }
`;

/** Quiet prediction stub: market name, bold pick and its own odds, then the probability meter. */
const Pick = styled.div<{ $family: MarketFamily; $available: boolean }>`
  ${tile} {
    grid-area: pick;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 3.75rem;
    grid-template-areas: "tag result" "pick result" "value value";
    align-content: center;
    align-items: center;
    gap: 3px 6px;
    min-inline-size: 0;
    margin-block: 5px;
    padding-inline: 7px 8px;
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.surface};
    border-inline-start: 3px solid ${({ theme, $family, $available }) => $available ? theme.color.market[$family].solid : theme.color.border};
    &[data-pick-state="none"] { grid-template-areas: "pick pick"; }
    &[data-pick-state="none"][data-result="upcoming"] { grid-template-areas: "pick result"; }
  }
  ${table} { display: grid; grid-column: 7 / span 4; grid-row: 2; grid-template-columns: subgrid; align-items: center; }
`;
/** A shared value cell keeps every selected-pick fact in the same column on both layouts. */
const PickCell = styled.span`
  min-inline-size: 0;
  > [data-mobile-only] { display: none; }
  ${tile} {
    display: flex;
    align-items: center;
    min-inline-size: 0;
    line-height: 1.2;
    > [data-mobile-only] { display: block; }
    > [data-desktop-only] { display: none; }
  }
`;
const MarketName = styled(PickCell)<{ $family: MarketFamily }>`
  grid-column: 1;
  ${tile} {
    grid-area: tag;
    justify-self: start;
    [data-pick-state="none"] > & { display: none; }
    > [data-pick-value] {
      color: ${({ theme, $family }) => theme.color.market[$family].text};
      font-size: ${({ theme }) => theme.typography.scale.micro};
      font-weight: ${({ theme }) => theme.typography.weight.medium};
      line-height: 1.1;
      white-space: normal;
    }
  }
  ${table} {
    justify-self: start;
    padding: 2px 8px;
    color: ${({ theme, $family }) => theme.color.market[$family].text};
    background: ${({ theme, $family }) => theme.color.market[$family].soft};
    border-inline-start: 3px solid ${({ theme, $family }) => theme.color.market[$family].solid};
    font-size: 0.75rem;
    font-weight: ${({ theme }) => theme.typography.weight.bold};
  }
`;
const Prediction = styled.span<{ $available: boolean }>`
  display: contents;
  color: ${({ theme, $available }) => $available ? "inherit" : theme.color.mutedText};
`;
const PickShort = styled(PickCell)<{ $family: MarketFamily; $available: boolean }>`
  grid-column: 2;
  color: ${({ theme, $available }) => $available ? theme.color.text : theme.color.mutedText};
  > [data-pick-value] {
    max-inline-size: 100%;
    font-size: 0.8125rem;
    font-weight: ${({ theme }) => theme.typography.weight.heavy};
    line-height: 1.25;
  }
  ${tile} {
    grid-area: pick;
    display: grid;
    gap: 2px;
    > b { font-size: 0.8125rem; font-weight: ${({ theme }) => theme.typography.weight.heavy}; }
    /* No pick: "No pick" and a short reason fill the stub. */
    [data-pick-state="none"] & {
      color: ${({ theme }) => theme.color.mutedText};
      > [data-pick-value] { font-size: ${({ theme }) => theme.typography.scale.micro}; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
    }
  }
  ${table} {
    display: flex;
    align-items: flex-start;
    min-inline-size: 0;
    > [data-pick-value] {
      max-inline-size: 100%;
      padding: 4px 7px;
      background: ${({ theme }) => theme.color.surface};
      border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
      border-inline-start: 3px solid ${({ theme, $family, $available }) => $available ? theme.color.market[$family].solid : theme.color.border};
    }
  }
`;
const Probability = styled(PickCell)`
  grid-column: 3;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  ${tile} {
    grid-area: value;
    [data-pick-state="none"] & { display: none; }
  }
`;
const Percent = styled.span`
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  ${tile} {
    font-size: ${({ theme }) => theme.typography.scale.micro};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    line-height: 1;
  }
`;
const Result = styled(OutcomeBadge)`
  grid-column: 4;
  /* The mobile result sits beside market/pick and above their shared probability row. */
  ${tile} {
    grid-area: result;
    justify-self: end;
    align-self: start;
    justify-content: flex-end;
    min-block-size: 0;
    min-inline-size: 0;
    padding: 2px 0 2px 4px;
    background: transparent;
    border: 0;
    text-align: end;
    white-space: nowrap;
    &[data-result-badge="unavailable"] { display: none; }
  }
  ${table} {
    justify-self: start;
    padding: 3px 6px;
    white-space: nowrap;
  }
`;

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
  /* The link covers the tile, so its press tint lands at once over everything, chips included, in place of the
   * browser's tap overlay, inside the card's border. */
  ${tile} {
    border-radius: ${tileRadius};
    -webkit-tap-highlight-color: transparent;
    &:active { background: color-mix(in srgb, ${({ theme }) => theme.color.text} 8%, transparent); }
  }
  ${table} {
    position: static;
    display: grid;
    grid-column: 11;
    grid-row: 2;
    place-items: center;
    > svg { display: block; font-size: 1rem; }
    &::after { content: ""; position: absolute; inset: 0; z-index: 1; }
    ${media.hover} { &:hover { color: ${({ theme }) => theme.color.brand}; } }
    &:focus-visible { outline: none; }
    &:focus-visible::after {
      outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
      outline-offset: calc(-1 * ${({ theme }) => theme.border.focusWidth});
    }
  }
`;

function liveClockLabel(fixture: FixtureSnapshot, messages: Messages) {
  const minute = fixture.liveClock?.minute ?? null, phase = fixture.liveClock?.phase ?? "in-play";
  const stoppage = fixture.liveClock?.stoppageMinutes;
  const clock = minute === null ? "" : messages.number(minute) + (stoppage ? `+${messages.number(stoppage)}` : "");
  const visible = minute !== null ? messages.text("match.clock.minute", { minute: clock })
    : phase === "in-play" ? messages.text("match.status.live") : messages.text(`match.clock.${phase}`);
  const spoken = [messages.text("match.status.live"), phase === "half-time" ? messages.text("match.clock.halfTimeLabel")
    : phase === "in-play" ? null : messages.text(`match.clock.${phase}`),
    minute === null ? null : messages.text("match.clock.minuteLabel", { minute: messages.number(minute) }),
    stoppage ? messages.text("match.clock.stoppageLabel", { minute: messages.number(stoppage) }) : null].filter(Boolean).join(", ");
  return { minute, visible, spoken };
}

/** `lead` names the winner of a decided final score (1 home, -1 away), so the losing side's goals can be muted. */
function MatchState({ fixture, home, away, lead, messages }: {
  fixture: FixtureSnapshot; home: string; away: string; lead: number; messages: Messages;
}) {
  const { status, score } = fixture;
  const final = hasFinalScoreStatus(status);
  const scoreline = score && (status === "live" || final) ? <>
    <Score aria-hidden="true" $live={status === "live"}><span data-loss={lead < 0 || undefined}>{messages.number(score.home)}</span>
      <span>–</span><span data-loss={lead > 0 || undefined}>{messages.number(score.away)}</span></Score>
    <VisuallyHidden>{messages.text("match.scoreline", { label: messages.text(final ? "match.finalScore" : "match.liveScore"),
      home, away, homeScore: messages.number(score.home), awayScore: messages.number(score.away) })}</VisuallyHidden>
  </> : <>
    <Versus aria-hidden="true">{status === "live" || final ? "–" : messages.text("match.versus")}</Versus>
    {(status === "live" || final) && <VisuallyHidden>{messages.text(final ? "match.finalScoreUnknown" : "match.scoreUnknown")}</VisuallyHidden>}
  </>;
  if (status === "live") {
    const { minute, visible, spoken } = liveClockLabel(fixture, messages);
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

function CardTeam({ team, side, name, eager, result }: {
  team: FixtureSnapshot["homeTeam"]; side: "home" | "away"; name: string; eager: boolean; result: TeamResult;
}) {
  const url = isSafeRemoteImageUrl(team.logoUrl) ? team.logoUrl : undefined;
  return <Team data-team-side={side} data-result={result ?? undefined}>
    <TeamLogo key={`${team.id}:${url ?? "missing"}`} name={team.name} url={url} eager={eager} />
    <TeamName data-team-name="" title={name}>{name}</TeamName>
  </Team>;
}

function CompetitionLogo({ url }: { url: string | null | undefined }) {
  const [failed, setFailed] = useState(false);
  return url && !failed && isSafeRemoteImageUrl(url)
    ? <LeagueLogo src={providerImageSource(url, 14)} alt="" width={14} height={14} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <TrophyIcon />;
}

/** Decorative country flag for the tile line; a missing, unsafe or failed image shows a neutral flag glyph (a globe
 * for API-Football's international "World"). Keyed by URL where used, so a replacement URL gets a fresh attempt. */
function CountryFlag({ url, country }: { url: string | null | undefined; country: string | undefined }) {
  const [failedUrls, setFailedUrls] = useState<readonly string[]>([]);
  const local = countryFlagAsset(country);
  const source = [local, isSafeRemoteImageUrl(url) ? url : null].find((candidate) => candidate && !failedUrls.includes(candidate));
  if (source) {
    return <FlagImage src={source} alt="" width={16} height={12} loading="lazy" decoding="async" referrerPolicy="no-referrer"
      onError={() => setFailedUrls((previous) => [...previous, source])} />;
  }
  return <FlagFallback>{countryCode(country) === "INT" ? <GlobeIcon /> : <FlagIcon />}</FlagFallback>;
}

/** Keep full names available on hover when a mobile name is ellipsized. */
function showFullNames(event: PointerEvent<HTMLElement>, title: string) {
  const card = event.currentTarget;
  const truncated = [...card.querySelectorAll<HTMLElement>("[data-team-name]")]
    .some((name) => name.scrollHeight - name.clientHeight > 1 || name.scrollWidth - name.clientWidth > 1);
  if (truncated) card.title = title;
  else card.removeAttribute("title");
}

const resultIcon = { correct: <CheckIcon />, incorrect: <CrossIcon />, void: <VoidIcon /> } as const;

/** Only timestamps subscribe to the device clock; the rest of a card stays unchanged. */
function CardKickoff({ kickoff, locale }: { kickoff: FixtureSnapshot["kickoffAt"]; locale: string }) {
  const messages = useMessages(locale);
  return kickoff === null ? <When as="p" data-kickoff data-kickoff-unknown><KickoffDetails>
    <KickoffDate data-kickoff-date>{messages.text("match.kickoffUnknown")}</KickoffDate>
  </KickoffDetails></When>
    : <When dateTime={toUtcIsoString(kickoff)} title={messages.reportingInstant(kickoff)} data-kickoff>
      <KickoffDetails>
        <VisuallyHidden>{messages.text("match.kickoff")}: </VisuallyHidden>
        <KickoffDate data-kickoff-date>{messages.reportingDay(kickoff)}</KickoffDate><Dot aria-hidden="true">·</Dot>
        <KickoffTime data-kickoff-time>{messages.reportingTime(kickoff)}<KickoffZone data-kickoff-zone> {messages.timeZone(kickoff)}</KickoffZone></KickoffTime>
      </KickoffDetails>
    </When>;
}

function PredictionCell({ prediction, price, reason, locale, children }: {
  prediction: ReturnType<typeof selectedCardPrediction>; price: ReturnType<typeof selectedCardPrice>;
  reason: string | null; locale: string; children: ReactNode;
}) {
  const messages = useMessages(locale);
  const details = prediction && [messages.text(`market.source.${prediction.item.market.source}`),
    prediction.provisional ? messages.text("match.provisional") : null,
    `${messages.text("match.published")}: ${messages.reportingInstant(prediction.publishedAt)}`,
    price ? `${messages.text("details.odds")}: ${price.price}` : null].filter(Boolean).join(" · ");
  return <Prediction $available={prediction !== null} data-prediction={prediction?.item.market.selection ?? "none"}
    data-outcome={prediction?.status ?? "unavailable"} title={details ?? reason ?? undefined}>{children}</Prediction>;
}

function MatchCardView({ fixture, analysisSlug, markets, selectedFamily, locale: requestedLocale,
  headingLevel = 2, eagerLogos = false, position }: MatchCardProps) {
  const locale = resolveLocale(requestedLocale);
  const messages = createMessages(locale);
  const titleId = `gh-match-${useId()}`;
  const eligible = markets && markets.length > 0 ? markets : selectedFamily ? [selectedFamily] : defaultMarkets;
  const shownFamily = bestCardFamily(fixture, eligible) ?? eligible[0]!;
  const home = fixture.homeTeam.name?.trim() || messages.text("match.homeUnknown");
  const away = fixture.awayTeam.name?.trim() || messages.text("match.awayUnknown");
  const title = messages.text("match.title", { home, away });
  const competition = fixture.competition.name?.trim() || messages.text("match.competitionUnknown");
  const country = fixture.competition.country?.trim();
  const countryName = countryDisplayName(country);
  const flagUrl = countryFlagUrl(fixture);
  const prediction = selectedCardPrediction(fixture, shownFamily);
  const price = prediction ? selectedCardPrice(fixture, shownFamily) : null;
  const family = messages.text(`market.family.${shownFamily}`);
  const locked = fixture.cycle?.state === "closed";
  const outcome = prediction?.status ?? "unavailable";
  const result = cardResultStatus(fixture.status, outcome);
  const resultLabel = result === "upcoming" ? messages.text("match.result.upcoming") : result === "unavailable" ? "—"
    : messages.text(result === "correct" ? "match.result.won" : result === "incorrect" ? "match.result.lost" : `outcome.${result}`);
  const percent = prediction && (prediction.probability.labelKey === "probability.percent"
    ? messages.text("probability.percent", { percent: messages.number(prediction.probability.roundedPercent) })
    : messages.text(prediction.probability.labelKey === "probability.less-than-one" ? "probability.compact.less-than-one" : "probability.compact.more-than-ninety-nine"));
  const selection = prediction?.item.market.selection;
  const final = hasFinalScoreStatus(fixture.status);
  const showScore = fixture.score !== null && (fixture.status === "live" || final);
  // Only a decided final score names a winner; a 90-minute score shown for an extra-time or penalties finish does not.
  const decided = showScore && final && !(fixture.scorePeriod === "regulation" && fixture.status !== "finished-regulation");
  const lead = decided ? Math.sign(fixture.score!.home - fixture.score!.away) : 0;
  const missing = prediction ? null : noPickReason(fixture);
  const reason = missing ? messages.text(`match.noPickReason.${missing}`) : null;
  const pickState = !prediction ? "none" : settledOutcome(outcome) ? "settled" : "open";
  return <Card tabIndex={-1} aria-labelledby={titleId} data-fixture-id={fixture.fixtureId} data-market={shownFamily}
    data-status={fixture.status} onPointerEnter={(event) => showFullNames(event, title)}>
    <VisuallyHidden as={`h${headingLevel}`} id={titleId}>{title}</VisuallyHidden>
    <Meta>
      {position !== undefined && <Index $wrap={position > 9_999} aria-hidden="true" data-row-number>{messages.number(position)}</Index>}
      <League title={country ?? undefined}>
        <CountryDetails data-country aria-hidden="true">
          <CountryFlag key={`${country}:${flagUrl}`} url={flagUrl} country={country} />
          <CountryName data-country-name title={countryName || undefined}>{countryName || "–"}</CountryName>
        </CountryDetails>
        <CompetitionLogo key={fixture.competition.logoUrl} url={fixture.competition.logoUrl} /><LeagueName title={competition}>{competition}</LeagueName>
        {country && <VisuallyHidden>, {country}</VisuallyHidden>}</League>
      <CardKickoff kickoff={fixture.kickoffAt} locale={locale} />
    </Meta>
    <Teams>
      <CardTeam team={fixture.homeTeam} side="home" name={home} eager={eagerLogos} result={lead > 0 ? "win" : lead < 0 ? "loss" : null} />
      <MatchState fixture={fixture} home={home} away={away} lead={lead} messages={messages} />
      <CardTeam team={fixture.awayTeam} side="away" name={away} eager={eagerLogos} result={lead < 0 ? "win" : lead > 0 ? "loss" : null} />
    </Teams>
    <Pick $family={shownFamily} $available={prediction !== null} data-pick-state={pickState} data-result={result}>
      <MarketName $family={shownFamily} aria-hidden="true">
        <span data-pick-value="" data-mobile-only="">{family}</span>
        <span data-pick-value="" data-desktop-only="">{family}</span>
      </MarketName>
      <PredictionCell prediction={prediction} price={price} reason={reason} locale={locale}>
        <PickShort $family={shownFamily} $available={prediction !== null} aria-hidden="true" data-no-pick={missing ?? undefined}>
          {selection ? <>
            <span data-pick-value=""><span data-pick-selection="">{predictionLabel(messages, selection)}</span>
              <PredictionOdds odds={price?.price} />
            </span>
          </> : <>
            <b data-mobile-only="">{messages.text("match.noPick")}</b>
            <span data-pick-value="" data-mobile-only="">{messages.text(`match.noPickReason.short.${missing!}`)}</span>
            <span data-pick-value="" data-desktop-only="">{messages.text("match.noPick")}</span>
          </>}
        </PickShort>
        <Probability aria-hidden="true">
          {prediction && <ProbabilityBar $family={shownFamily} data-probability-meter=""><span style={{ inlineSize: `${Math.max(2, prediction.probability.roundedPercent)}%` }} /></ProbabilityBar>}
          <Percent data-pick-value="">{prediction ? percent : "—"}</Percent>
        </Probability>
        {prediction && selection ? <VisuallyHidden>{messages.text("match.pickLabel", { market: family, selection: predictionLabel(messages, selection),
          probability: messages.text(prediction.probability.labelKey, { percent: messages.number(prediction.probability.roundedPercent) }) })}
          {locked && `. ${messages.text("match.lockedPrediction")}`}. {messages.text("match.outcome")}: {resultLabel}
        </VisuallyHidden> : <VisuallyHidden>{messages.text("match.noPickLabel", { market: family })}: {reason}
          {result === "upcoming" && `. ${messages.text("match.outcome")}: ${resultLabel}`}</VisuallyHidden>}
      </PredictionCell>
      <Result aria-hidden="true" $outcome={result === "upcoming" ? "pending" : result} data-result-badge={result}>
        {result !== "upcoming" && settledOutcome(result) && resultIcon[result as keyof typeof resultIcon]}
        <span data-pick-value="">{resultLabel}</span>
      </Result>
      {prediction && <VisuallyHidden>{messages.text("details.odds")}: {price?.price ?? messages.text("outcome.unavailable")}</VisuallyHidden>}
    </Pick>
    <Open href={matchHref(fixture.fixtureId, analysisSlug, locale)} prefetch={false}>
      <VisuallyHidden>{messages.text("match.analysisLabel", { home, away })}</VisuallyHidden><ChevronIcon />
    </Open>
  </Card>;
}

/** Polls hand every card a fresh record; equal-version observations that look the same skip rendering.
 * A server refresh of the same query also brings an equal but new `markets` array. The country flag is decoration
 * that can change without a version bump, so it is compared by value too. */
function sameCardProps(previous: MatchCardProps, next: MatchCardProps): boolean {
  if (!sameCardFixture(previous.fixture, next.fixture) || countryFlagUrl(previous.fixture) !== countryFlagUrl(next.fixture)) return false;
  for (const key of new Set([...Object.keys(previous), ...Object.keys(next)]) as Set<keyof MatchCardProps>) {
    if (key === "fixture" || Object.is(previous[key], next[key])) continue;
    if (key !== "markets" || previous.markets?.length !== next.markets?.length ||
        previous.markets?.some((family, index) => family !== next.markets?.[index])) return false;
  }
  return true;
}

export const MatchCard = memo(MatchCardView, sameCardProps);
