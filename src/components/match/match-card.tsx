"use client";

import Link from "next/link";
import { memo, useId, useState, type PointerEvent } from "react";
import styled, { css, keyframes } from "styled-components";
import { toUtcIsoString } from "@/domain/calendar";
import { countryCode } from "@/domain/country-code";
import { countryFlagAsset } from "@/domain/country-flag";
import { bestCardFamily, noPickReason } from "@/domain/feed-presentation";
import type { FixtureSnapshot } from "@/domain/fixture-snapshot";
import { hasFinalScoreStatus, sameCardFixture, selectedCardPrediction, selectedCardPrice } from "@/domain/match-card";
import type { MarketFamily } from "@/domain/markets";
import { matchHref } from "@/domain/navigation";
import { isSafeRemoteImageUrl } from "@/domain/remote-image";
import { createMessages } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/locales";
import { media, type AccentName, type OutcomeTone } from "@/styles/theme";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { CheckIcon, ChevronIcon, CrossIcon, FlagIcon, GlobeIcon, LockIcon, NoticeIcon, TrophyIcon, VoidIcon } from "./match-icons";
import { matchTableColumns, matchTableGap } from "./match-columns";
import { TeamLogo } from "./team-row";

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

type Messages = ReturnType<typeof createMessages>;
type TeamResult = "win" | "loss" | null;
type StateTone = "live" | "final" | "halted";
const countryFlagUrl = (fixture: FixtureSnapshot) => fixture.competition.countryFlagUrl ?? null;
const tile = media.belowDesktop, table = media.desktop, wideTable = media.wide;
const pulse = keyframes`0%, 100% { opacity: 1; } 50% { opacity: 0.35; }`;
const ellipsis = css`min-inline-size: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;`;
const visuallyHidden = css`
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
`;
const tileRadius = "6px";
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
    --gh-chip-pad: 4px;
    font-family: ${({ theme }) => theme.typography.family};
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: "when" "league" "teams" "pick";
    gap: 2px;
    align-items: center;
    padding: 4px 8px;
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    border-color: color-mix(in srgb, ${({ theme }) => theme.color.border} 80%, ${({ theme }) => theme.color.mutedText});
    border-radius: ${tileRadius};
  }
  ${table} {
    grid-template-columns: ${matchTableColumns.compact};
    column-gap: ${matchTableGap};
    row-gap: 4px;
    align-items: center;
    padding: 6px 16px;
    background: transparent;
    font-size: 0.8125rem;
  }
  ${wideTable} { grid-template-columns: ${matchTableColumns.full}; }
  /* Touch taps would otherwise leave a stuck tint after returning to the list. */
  ${media.hover} { &:hover { background: ${({ theme }) => theme.color.rowHover}; } }
`;

const Meta = styled.header`
  ${tile} { display: contents; }
  ${table} { display: grid; grid-column: 1 / span 3; grid-template-columns: subgrid; }
`;
const Index = styled.span`
  display: none;
  ${table} { display: block; grid-column: 1; grid-row: 1; font-variant-numeric: tabular-nums; }
`;
const LeagueName = styled.span`
  ${tile} { flex: 1 1 0; order: 1; text-align: end; }
  ${table} { grid-column: 1; grid-row: 2; }
`;
const League = styled.p`
  display: flex;
  align-items: center;
  gap: 6px;
  min-inline-size: 0;
  > svg { flex: none; color: ${({ theme }) => theme.color.mutedText}; }
  > span { ${ellipsis} }
  /* Tile: its parts join the meta line; a missing crest shows nothing (the flag already leads the line). */
  ${tile} {
    grid-area: league;
    color: ${({ theme }) => theme.color.text};
    font-size: 0.75rem;
    font-weight: 400;
    line-height: 1.25;
    min-block-size: 1rem;
    gap: 5px;
    > svg { inline-size: 1rem; block-size: 1rem; }
    > img, > svg { order: 2; }
  }
  ${table} {
    display: grid;
    grid-column: 3;
    grid-row: 1;
    grid-template-columns: minmax(0, 1fr) 18px;
    gap: 2px 6px;
    > [data-country] { grid-column: 1 / -1; grid-row: 1; }
    > img, > svg { grid-column: 2; grid-row: 2; }
    > svg { font-size: 1rem; }
    > span { white-space: normal; }
  }
`;
const LeagueLogo = styled.img`
  flex: none;
  inline-size: 12px;
  block-size: 12px;
  object-fit: contain;
  ${tile} { inline-size: 1rem; block-size: 1rem; }
  ${table} { inline-size: 18px; block-size: 18px; }
`;
const When = styled.time`
  display: flex;
  align-items: center;
  gap: 4px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  ${tile} {
    grid-area: when;
    justify-content: space-between;
    min-inline-size: 0;
    gap: 4px;
    color: ${({ theme }) => theme.color.mutedText};
    font-size: 0.75rem;
    font-weight: 400;
    line-height: 1.25;
    white-space: normal;
  }
  ${table} { grid-column: 2; grid-row: 1; flex-wrap: wrap; gap: 0 6px; white-space: normal; }
`;
const Dot = styled.span`
  color: ${({ theme }) => theme.color.border};
  ${tile} { display: none; }
  ${table} { display: none; }
`;
const KickoffTime = styled.span`
  ${tile} { flex: none; color: ${({ theme }) => theme.color.text}; font-weight: 500; }
`;
const KickoffZone = styled.span`
  color: ${({ theme }) => theme.color.mutedText};
  font-weight: 400;
`;
const KickoffDetails = styled.span`
  display: contents;
  ${tile} { display: flex; flex-wrap: wrap; align-items: center; min-inline-size: 0; gap: 2px 6px; }
`;
const StatusBadge = styled.span<{ $tone: AccentName | "neutral" }>`
  display: none;
  ${tile} {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 4px;
    min-block-size: 1.125rem;
    padding-inline: 5px;
    border-radius: 3px;
    font-size: 0.75rem;
    font-weight: 500;
    line-height: 1.25;
    white-space: nowrap;
    color: ${({ theme, $tone }) => $tone === "neutral" ? theme.color.mutedText : theme.color.accent[$tone].text};
    background: ${({ theme, $tone }) => $tone === "neutral" ? theme.color.surfaceMuted : theme.color.accent[$tone].soft};
    &[data-match-status="live"]::before { content: ""; inline-size: 4px; block-size: 4px; border-radius: 50%; background: currentColor; }
  }
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
`;
const FlagImage = styled.img`
  flex: none;
  inline-size: 16px;
  block-size: 11px;
  margin-inline-end: 4px;
  object-fit: cover;
  border-radius: 1px;
  box-shadow: 0 0 0 0.5px rgb(11 31 51 / 22%);
`;
const FlagFallback = styled.span`
  display: grid;
  flex: none;
  place-items: center;
  inline-size: 16px;
  block-size: 11px;
  margin-inline-end: 4px;
  font-size: 11px;
`;

const Teams = styled.div`
  --gh-logo-size: 16px;
  --gh-logo-radius: 0;
  --gh-logo-font: 0.5rem;
  /* Tile: HOME NAME [crest] centre [crest] AWAY NAME on the full card width, crests against the centre, so the centre
   * sits in the middle of every card; initials sit in a soft ringed disc, loaded crests keep their own shape. */
  ${tile} {
    --gh-logo-size: 1.25rem;
    --gh-logo-font: ${({ theme }) => theme.typography.scale.micro};
    --gh-logo-radius: 50%;
    --gh-logo-ring: inset 0 0 0 1px ${({ theme }) => theme.color.border};
    grid-area: teams;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto auto minmax(0, 1fr);
    align-items: center;
    min-block-size: 1.75rem;
    min-inline-size: 0;
    [data-team-side="home"] > [data-team-logo] { grid-column: 2; grid-row: 1; }
    [data-team-side="away"] > [data-team-logo] { grid-column: 4; grid-row: 1; }
  }
  ${table} { --gh-logo-size: 22px; --gh-logo-font: 0.625rem; display: grid; grid-column: 4 / span 3; grid-template-columns: subgrid; align-items: center; }
`;
const Team = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-inline-size: 0;
  ${tile} { display: contents; }
  /* Both crests sit beside the score; the home name aligns towards it. */
  ${table} { gap: 8px; &[data-team-side="home"] { flex-direction: row-reverse; text-align: end; } }
`;
const TeamName = styled.span<{ $result: TeamResult }>`
  flex: 1;
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  ${ellipsis}
  ${tile} {
    grid-column: 1;
    grid-row: 1;
    display: block;
    padding-inline-end: 4px;
    color: ${({ theme, $result }) => $result === "loss" ? theme.color.mutedText : theme.color.text};
    font-size: 0.75rem;
    font-weight: 350;
    line-height: 1.25;
    text-align: end;
    white-space: nowrap;
    [data-team-side="away"] > & { grid-column: 5; padding-inline: 4px 0; text-align: start; }
  }
  ${table} { white-space: normal; font-weight: ${({ theme }) => theme.typography.weight.body}; }
`;
const Center = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  ${tile} {
    grid-column: 3;
    grid-row: 1;
    flex-direction: column;
    justify-content: center;
    gap: 1px;
    min-inline-size: 2.25rem;
    margin-inline: 3px;
  }
`;
const Versus = styled.span`
  color: ${({ theme }) => theme.color.mutedText};
  ${tile} { font-size: 0.75rem; font-weight: 400; line-height: 1; text-transform: uppercase; }
`;
const ScoredVersus = styled(Versus)`
  display: none;
  ${tile} { display: block; }
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
  /* Proportional digits keep the mobile score compact. */
  ${tile} {
    gap: 3px;
    color: ${({ theme, $live }) => $live ? theme.color.live.text : theme.color.text};
    font-size: 0.875rem;
    font-weight: 500;
    font-variant-numeric: normal;
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
  ${tile} {
    font-size: 0.75rem;
    font-weight: 400;
    line-height: 1;
    padding: 0;
    background: none;
    ${({ $tone }) => $tone !== "live" && visuallyHidden}
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
  ${tile} { animation: none; }
`;

const Pick = styled.div`
  ${tile} {
    grid-area: pick;
    display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.45fr) minmax(0, 0.8fr) minmax(0, 1.15fr);
    align-items: center;
    gap: 4px;
  }
  ${table} { display: grid; grid-column: 7 / span 3; grid-template-columns: subgrid; align-items: center; }
`;
const chip = css`
  display: flex;
  align-items: center;
  justify-content: center;
  min-inline-size: 0;
  min-block-size: 1.5rem;
  padding: 0 var(--gh-chip-pad);
  border-radius: 4px;
  line-height: 1.3;
  text-align: center;
  white-space: normal;
`;
const TileCode = styled.span`
  display: none;
  ${tile} {
    ${chip}
    grid-column: 1;
    color: ${({ theme }) => theme.color.mutedText};
    background: ${({ theme }) => theme.color.surfaceMuted};
    font-size: 0.75rem;
    font-style: italic;
    font-weight: 400;
  }
`;
const MarketName = styled.span<{ $family: MarketFamily }>`
  font-size: 0.625rem;
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  ${ellipsis}
  ${tile} { display: none; }
  ${table} {
    justify-self: start;
    padding: 2px 8px;
    color: ${({ theme, $family }) => theme.color.market[$family].text};
    background: linear-gradient(135deg, ${({ theme, $family }) => theme.color.market[$family].soft} 0%, ${({ theme }) => theme.color.surface} 100%);
    box-shadow: inset 3px 0 0 ${({ theme, $family }) => theme.color.market[$family].solid},
      inset 0 0 0 1px color-mix(in srgb, ${({ theme, $family }) => theme.color.market[$family].solid} 38%, transparent);
    font-size: 0.75rem;
    font-weight: ${({ theme }) => theme.typography.weight.bold};
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
  /* Its chips join the pick row. */
  ${tile} { display: contents; }
  ${table} { display: contents; > svg { display: none; } }
`;
const PickShort = styled.span<{ $family: MarketFamily }>`
  display: none;
  ${tile} {
    ${chip}
    grid-column: 2;
    color: ${({ theme }) => theme.color.accent.blue.text};
    background: ${({ theme }) => theme.color.accent.blue.soft};
    font-size: 0.75rem;
    font-weight: 400;
    > [data-short-pick] { display: none; }
  }
  ${table} {
    display: inline-flex;
    grid-column: 2;
    justify-self: start;
    justify-content: center;
    min-inline-size: 3.25rem;
    padding: 2px 8px;
    color: ${({ theme }) => theme.color.onBrand};
    background: ${({ theme, $family }) => theme.color.market[$family].gradient};
    font-size: 0.75rem;
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    > [data-mobile-pick] { display: none; }
  }
`;
const Probability = styled.span`
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
  > svg { display: none; }
  ${tile} {
    ${chip}
    justify-content: center;
    grid-column: 3;
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.surfaceMuted};
    font-size: 0.8125rem;
    > svg { display: none; }
  }
  ${table} { grid-column: 3; gap: 8px; }
`;
const Percent = styled.span`
  font-size: 0.8125rem;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  ${tile} { font-size: 0.8125rem; font-weight: 500; line-height: 1.3; font-variant-numeric: normal; }
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
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  min-inline-size: 0;
  font-size: 0.6875rem;
  > b { font-weight: 800; }
  > span { ${ellipsis} }
  ${tile} {
    display: contents;
    > b {
      ${chip}
      grid-column: 2;
      color: ${({ theme }) => theme.color.mutedText};
      font-size: ${({ theme }) => theme.typography.scale.caption};
    }
    > span { display: none; }
  }
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
  /* Tile: a bare ✓/✗/⊘ leading the percent; the chip carries the outcome tint. */
  ${tile} { display: none; }
  ${table} { inline-size: 1.125rem; block-size: 1.125rem; font-size: 0.6875rem; }
`;
const TileResult = styled.span<{ $outcome: OutcomeTone }>`
  display: none;
  ${tile} {
    ${chip}
    grid-column: 4;
    gap: 4px;
    color: ${({ theme, $outcome }) => theme.color.outcome[$outcome].text};
    background: ${({ theme, $outcome }) => theme.color.outcome[$outcome].background};
    font-size: 0.75rem;
    font-weight: 500;
    > svg {
      flex: none;
      inline-size: 1rem;
      block-size: 1rem;
      ${({ $outcome, theme }) => ($outcome === "correct" || $outcome === "incorrect") && css`
        padding: 2px;
        border-radius: 50%;
        color: ${theme.color.surface};
        background: ${theme.color.outcome[$outcome].text};
      `}
    }
  }
`;
const MissingProbability = styled.span`
  display: none;
  ${tile} { ${chip} grid-column: 3; color: ${({ theme }) => theme.color.mutedText}; background: ${({ theme }) => theme.color.surfaceMuted}; }
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
  /* An implicit row under the card, so cards without notes carry no empty track. */
  ${tile} { ${visuallyHidden} }
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
  ${tile} { border-radius: ${tileRadius}; }
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
    border-radius: calc(${tileRadius} - 1px);
    -webkit-tap-highlight-color: transparent;
    &:active { background: color-mix(in srgb, ${({ theme }) => theme.color.text} 8%, transparent); }
  }
  ${table} {
    position: static;
    display: grid;
    grid-column: 10;
    grid-row: 1;
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

const outcomeIcons = { correct: CheckIcon, incorrect: CrossIcon, void: VoidIcon } as const;
function liveClockLabel(fixture: FixtureSnapshot, messages: Messages) {
  const minute = fixture.liveClock?.minute ?? null, phase = fixture.liveClock?.phase ?? "in-play";
  const stoppage = fixture.liveClock?.stoppageMinutes;
  const clock = minute === null ? "" : messages.number(minute) + (stoppage ? `+${messages.number(stoppage)}` : "");
  const visible = minute !== null ? messages.text("match.clock.minute", { minute: clock })
    : phase === "in-play" ? messages.text("match.liveBadge") : messages.text(`match.clock.${phase}`);
  return { minute, phase, visible, stoppage };
}

function MatchStatus({ fixture, messages }: { fixture: FixtureSnapshot; messages: Messages }) {
  const { status } = fixture;
  const phase = fixture.liveClock?.phase;
  const paused = status === "live" && (phase === "interrupted" || phase === "suspended");
  const final = hasFinalScoreStatus(status);
  const tone = paused || status === "postponed" ? "amber"
    : status === "live" || status === "canceled" || status === "abandoned" ? "red"
    : status === "scheduled" ? "blue" : final ? "teal" : "neutral";
  const label = paused ? messages.text(`match.clock.${phase}`)
    : status === "scheduled" ? messages.text("match.status.upcoming")
    : final ? messages.text("match.status.ended")
    : status === "unknown" ? "–" : messages.text(`match.status.${status}`);
  return <StatusBadge $tone={tone} data-match-status={status} title={messages.text(`match.status.${status}`)}
    aria-label={status === "unknown" ? messages.text("match.status.unknown") : undefined}>{label}</StatusBadge>;
}

function MatchState({ fixture, home, away, messages }: { fixture: FixtureSnapshot; home: string; away: string; messages: Messages }) {
  const { status, score } = fixture;
  const final = hasFinalScoreStatus(status);
  const scoreline = score && (status === "live" || final) ? <>
    <Score aria-hidden="true" $live={status === "live"}><span>{messages.number(score.home)}</span><span>–</span><span>{messages.number(score.away)}</span></Score>
    <ScoredVersus aria-hidden="true">{messages.text("match.versus")}</ScoredVersus>
    <VisuallyHidden>{messages.text("match.scoreline", { label: messages.text(final ? "match.finalScore" : "match.liveScore"),
      home, away, homeScore: messages.number(score.home), awayScore: messages.number(score.away) })}</VisuallyHidden>
  </> : <>
    <Versus aria-hidden="true">{messages.text("match.versus")}</Versus>
    {(status === "live" || final) && <VisuallyHidden>{messages.text(final ? "match.finalScoreUnknown" : "match.scoreUnknown")}</VisuallyHidden>}
  </>;
  if (status === "live") {
    const { minute, phase, visible, stoppage } = liveClockLabel(fixture, messages);
    const spoken = [messages.text("match.status.live"), phase === "half-time" ? messages.text("match.clock.halfTimeLabel")
      : phase === "in-play" ? null : messages.text(`match.clock.${phase}`),
      minute === null ? null : messages.text("match.clock.minuteLabel", { minute: messages.number(minute) }),
      stoppage ? messages.text("match.clock.stoppageLabel", { minute: messages.number(stoppage) }) : null].filter(Boolean).join(", ");
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
    <TeamName data-team-name="" $result={result}>{name}</TeamName>
  </Team>;
}

function CompetitionLogo({ url }: { url: string | null | undefined }) {
  const [failed, setFailed] = useState(false);
  return url && !failed && isSafeRemoteImageUrl(url)
    ? <LeagueLogo src={url} alt="" width={14} height={14} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
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

/** Keep the market's goal line visible at every phone width. */
function TileMarketCode({ code }: { code: string }) {
  return <TileCode aria-hidden="true">{code}</TileCode>;
}

/** Keep full names available on hover when a mobile name is ellipsized. */
function showFullNames(event: PointerEvent<HTMLElement>, title: string) {
  const card = event.currentTarget;
  const truncated = [...card.querySelectorAll<HTMLElement>("[data-team-name]")]
    .some((name) => name.scrollHeight - name.clientHeight > 1 || name.scrollWidth - name.clientWidth > 1);
  if (truncated) card.title = title;
  else card.removeAttribute("title");
}

function MatchCardView({ fixture, analysisSlug, markets, selectedFamily, locale: requestedLocale,
  headingLevel = 2, eagerLogos = false, position }: MatchCardProps) {
  const locale = resolveLocale(requestedLocale);
  const messages = createMessages(locale);
  const titleId = `gh-match-${useId()}`;
  const eligible = markets && markets.length > 0 ? markets : [selectedFamily ?? "match-result"];
  const shownFamily = bestCardFamily(fixture, eligible) ?? eligible[0]!;
  const home = fixture.homeTeam.name?.trim() || messages.text("match.homeUnknown");
  const away = fixture.awayTeam.name?.trim() || messages.text("match.awayUnknown");
  const title = messages.text("match.title", { home, away });
  const competition = fixture.competition.name?.trim() || messages.text("match.competitionUnknown");
  const country = fixture.competition.country?.trim();
  const countryLabel = countryCode(country);
  const flagUrl = countryFlagUrl(fixture);
  const prediction = selectedCardPrediction(fixture, shownFamily);
  const price = prediction ? selectedCardPrice(fixture, shownFamily) : null;
  const family = messages.text(`market.family.${shownFamily}`);
  const locked = fixture.cycle?.state === "closed";
  const outcome = prediction?.status ?? "unavailable";
  const OutcomeIcon = outcome === "correct" || outcome === "incorrect" || outcome === "void" ? outcomeIcons[outcome] : null;
  const percent = prediction && (prediction.probability.labelKey === "probability.percent"
    ? messages.text("probability.percent", { percent: messages.number(prediction.probability.roundedPercent) })
    : messages.text(prediction.probability.labelKey === "probability.less-than-one" ? "probability.compact.less-than-one" : "probability.compact.more-than-ninety-nine"));
  const details = prediction && [messages.text(`market.source.${prediction.item.market.source}`),
    prediction.provisional ? messages.text("match.provisional") : null,
    `${messages.text("match.published")}: ${messages.reportingInstant(prediction.publishedAt)}`,
    price ? `${messages.text("details.odds")}: ${price.price}` : null].filter(Boolean).join(" · ");
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
  const final = hasFinalScoreStatus(fixture.status);
  const showScore = fixture.score !== null && (fixture.status === "live" || final);
  // Only a decided final score names a winner; a 90-minute score shown for an extra-time or penalties finish does not.
  const decided = showScore && final && !(fixture.scorePeriod === "regulation" && fixture.status !== "finished-regulation");
  const lead = decided ? Math.sign(fixture.score!.home - fixture.score!.away) : 0;
  const reason = prediction ? null : messages.text(`match.noPickReason.${noPickReason(fixture)}`);
  return <Card tabIndex={-1} aria-labelledby={titleId} data-fixture-id={fixture.fixtureId} data-market={shownFamily}
    data-status={fixture.status} aria-describedby={notes.length ? `${titleId}-notes` : undefined} onPointerEnter={(event) => showFullNames(event, title)}>
    <VisuallyHidden as={`h${headingLevel}`} id={titleId}>{title}</VisuallyHidden>
    <Meta>
      {position !== undefined && <Index aria-hidden="true">{messages.number(position)}</Index>}
      <League title={country ?? undefined}>
        <CountryDetails data-country aria-hidden="true">
          <CountryFlag key={`${country}:${flagUrl}`} url={flagUrl} country={country} />
          <span>{countryLabel || "–"}</span>
        </CountryDetails>
        <CompetitionLogo key={fixture.competition.logoUrl} url={fixture.competition.logoUrl} /><LeagueName title={competition}>{competition}</LeagueName>
        {country && <VisuallyHidden>, {country}</VisuallyHidden>}</League>
      {fixture.kickoffAt === null ? <When as="p"><KickoffDetails>{messages.text("match.kickoffUnknown")}</KickoffDetails><MatchStatus fixture={fixture} messages={messages} /></When>
        : <When dateTime={toUtcIsoString(fixture.kickoffAt)} title={messages.reportingInstant(fixture.kickoffAt)}>
          <KickoffDetails>
          <VisuallyHidden>{messages.text("match.kickoff")}: </VisuallyHidden>
          <span>{messages.reportingDay(fixture.kickoffAt)}</span><Dot aria-hidden="true">·</Dot>
          <KickoffTime>{messages.reportingTime(fixture.kickoffAt)}<KickoffZone> EAT</KickoffZone></KickoffTime>
          </KickoffDetails>
          <MatchStatus fixture={fixture} messages={messages} />
        </When>}
    </Meta>
    <Teams>
      <CardTeam team={fixture.homeTeam} side="home" name={home} eager={eagerLogos} result={lead > 0 ? "win" : lead < 0 ? "loss" : null} />
      <MatchState fixture={fixture} home={home} away={away} messages={messages} />
      <CardTeam team={fixture.awayTeam} side="away" name={away} eager={eagerLogos} result={lead < 0 ? "win" : lead > 0 ? "loss" : null} />
    </Teams>
    <Pick>
      <TileMarketCode code={messages.text(`market.code.${shownFamily}`)} />
      <MarketName $family={shownFamily} aria-hidden="true">{family}</MarketName>
      <Prediction $available={prediction !== null} data-prediction={selection ?? "none"} data-outcome={outcome} title={details ?? undefined}>
        {prediction && selection ? <>
          <PickShort $family={shownFamily} aria-hidden="true">
            <span data-short-pick>{messages.text(`market.pick.${selection}`)}</span>
            <span data-mobile-pick>{messages.text(`market.selection.${selection}`)}</span>
          </PickShort>
          <Probability aria-hidden="true">
            {/* Once settled the ✓/✗/⊘ mark takes the padlock's place; the hidden text still reports the lock. */}
            {locked && !OutcomeIcon && <LockIcon />}
            <Percent>{percent}</Percent>
            <Bar $family={shownFamily}><span style={{ inlineSize: `${Math.max(2, prediction.probability.roundedPercent)}%` }} /></Bar>
            {OutcomeIcon && <Mark $tone={outcome} title={messages.text(`outcome.${outcome}`)}><OutcomeIcon /></Mark>}
          </Probability>
          <VisuallyHidden>{messages.text("match.pickLabel", { market: family, selection: messages.text(`market.selection.${selection}`),
            probability: messages.text(prediction.probability.labelKey, { percent: messages.number(prediction.probability.roundedPercent) }) })}
            {locked && `. ${messages.text("match.lockedPrediction")}`}. {messages.text("match.outcome")}: {messages.text(`outcome.${outcome}`)}
          </VisuallyHidden>
        </> : <>
          <NoPick aria-hidden="true" data-no-pick={noPickReason(fixture)} title={reason ?? undefined}><b>—</b><span>{reason}</span></NoPick>
          <MissingProbability aria-hidden="true">–</MissingProbability>
          <VisuallyHidden>{messages.text("match.noPickLabel", { market: family })}: {reason}</VisuallyHidden>
        </>}
      </Prediction>
      <TileResult aria-hidden="true" $outcome={outcome} data-result-badge={outcome}>
        {outcome === "unavailable" ? <span>–</span> : <>
          {OutcomeIcon ? <OutcomeIcon /> : <span>–</span>}
          <span>{messages.text(outcome === "correct" ? "match.result.won" : outcome === "incorrect" ? "match.result.lost" : `outcome.${outcome}`)}</span>
        </>}
      </TileResult>
      {price && <VisuallyHidden>{messages.text("details.odds")}: {price.price}</VisuallyHidden>}
    </Pick>
    {notes.length > 0 && <Notes id={`${titleId}-notes`}>{notes.map((note, index) => <Note key={index}><NoticeIcon />{note}</Note>)}</Notes>}
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
