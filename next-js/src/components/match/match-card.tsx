"use client";

import { CircleMinusIcon, SubscriberIcon } from "@/components/ui/icons";
import { UnlockButton } from "@/components/members/prediction-unlock";
import { subscriberHref } from "@/domain/subscriber-navigation";

import Link from "@/components/navigation/navigation-link";
import { memo, useContext, useId, type ComponentProps, type ReactNode } from "react";
import styled, { css } from "styled-components";
import { toUtcIsoString } from "@/domain/calendar";
import { formatMarketShortLabel } from "@/domain/betting-short-forms";
import { countryCode, countryDisplayName, countryShortName } from "@/domain/country-code";
import { compactLeagueName, compactMarketName } from "@/domain/compact-fixture-label";
import { bestCardFamily, noPickReason } from "@/domain/feed-presentation";
import { defaultMarkets } from "@/domain/feed-query";
import { bookmakerOddsSource } from "@/domain/detail-presentation";
import { featuredSettlementTone } from "@/domain/extended-markets";
import { isFeaturedPickSuppressed, type FixtureSnapshot } from "@/domain/fixture-snapshot";
import { displayMarketOddsPrice, marketOddsPrice } from "@/domain/in-play-odds";
import { cardResultStatus, featuredCardPrediction, hasFinalScoreStatus, matchCardScore, sameCardFixture, selectedCardPrediction, selectedCardPrice, snapshotCardPrediction, type CardSnapshotPick } from "@/domain/match-card";
import { liveClockLabel } from "@/domain/match-clock";
import type { MarketFamily } from "@/domain/markets";
import { isCompletedFixtureStatus } from "@/domain/market-settlement";
import { matchHref } from "@/domain/navigation";
import type { PredictionResult } from "@/domain/performance-summary";
import { predictionDescription, predictionLabel, predictionText } from "@/domain/prediction-label";
import { isSafeRemoteImageUrl } from "@/domain/remote-image";
import { createMessages, type Messages } from "@/i18n/messages";
import { useMessages } from "@/i18n/use-messages";
import { resolveLocale } from "@/i18n/locales";
import { performanceResultColors } from "@/styles/performance-result-colors";
import { media, type OutcomeTone } from "@/styles/theme";
import type { GoalHintTheme } from "@/styles/theme-foundation";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { ChevronIcon } from "./match-icons";
import { CompetitionCountryFlag, CompetitionLogo } from "./competition-media";
import { FeaturedPriceValue, featuredPickStatusText, featuredPriceValueText, ForecastSourceLabel } from "./forecast-labels";
import { feedFactsStyles, phoneFeedRowStyles, teamStackStyles } from "./team-stack-styles";
import { matchTableColumns, matchTableGap } from "./match-columns";
import { TeamLogo } from "./team-logo";
import { ProbabilityBar } from "./prediction-presentation";
import { DesktopMatchRow } from "./desktop-match-row";
import { MatchCardLayoutContext } from "./match-card-layout";
import { MatchStatus } from "./match-status";
import { MatchNumber } from "./match-number";
import { matchScoreDescription, ScoreFigures, Scoreline } from "./score-presentation";
import { FittedCardText } from "./fitted-card-text";

export type MatchCardProps = {
  fixture: FixtureSnapshot;
  /** The viewer lacks subscriber access: an unfinished fixture's published forecast in an eligible family renders locked even
   * when delivered whole. A fixture without one shows the no-prediction reason every viewer gets. */
  gated?: boolean;
  /** Disable row-wide navigation inside a containing preview; explicit access actions remain available. */
  interactive?: boolean;
  /** Preserve a containing slip as the destination after access is granted. */
  accessReturnTo?: string;
  /** A published slip selection whose private fields were removed by the server. */
  lockedPrediction?: boolean;
  signedIn?: boolean;
  analysisSlug: string;
  /** Show the most likely available pick among these eligible families. */
  markets?: readonly MarketFamily[];
  /** Public browsing shows the best published market rather than the separate recommendation. */
  publishedMarket?: boolean;
  selectedFamily?: MarketFamily;
  locale?: string;
  headingLevel?: 2 | 3 | 4;
  eagerLogos?: boolean;
  position?: number;
  /** The Matches feed uses compact prediction facts and its own kickoff and score layout on phones. */
  phoneFeed?: boolean;
  /** The scheduled kickoff has passed as of the feed observation. */
  kickoffPassed?: boolean;
  /** Appended to the card's accessible title, such as "similar result" for an approximate search match. */
  titleNote?: string | undefined;
  /** Anonymous saved fixtures: no live claim, predictions, media requests, or detail action. */
  offline?: boolean;
  /** A server-authorized slip's original pick and price; never substitute the current top prediction. */
  snapshotPick?: CardSnapshotPick;
};

type TeamResult = "win" | "loss" | null;
/** Which side is ahead on a live score; null for a level or unknown score. */
type TeamStanding = "ahead" | "behind" | null;
type StateTone = "final" | "halted" | "live";
const countryFlagUrl = (fixture: FixtureSnapshot) => fixture.competition.countryFlagUrl ?? null;
const tile = media.belowDesktop, table = media.desktop, wideTable = media.wide;
const ellipsis = css`min-inline-size: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;`;
const settledOutcome = (outcome: OutcomeTone) => outcome === "correct" || outcome === "incorrect" || outcome === "void";
type CardResult = ReturnType<typeof cardResultStatus> | OutcomeTone;
type HeaderResult = CardResult | PredictionResult | "half-time";
const headerResults: Partial<Record<CardResult, PredictionResult>> = {
  correct: "won", incorrect: "lost", pending: "pending", void: "void", canceled: "cancelled",
};

function matchHeaderStatusColor(theme: GoalHintTheme, result: HeaderResult) {
  switch (result) {
    case "live": return theme.color.live.text;
    case "upcoming": return performanceResultColors(theme, "all").text;
    case "half-time":
    case "postponed":
    case "abandoned": return performanceResultColors(theme, "cancelled").text;
    case "delayed": return performanceResultColors(theme, "pending").text;
    case "won":
    case "lost":
    case "pending":
    case "void":
    case "cancelled": return performanceResultColors(theme, result).text;
    default: return theme.color.outcome.unavailable.text;
  }
}

const Card = styled.article<{ $headerResult?: HeaderResult | undefined }>`
  position: relative;
  display: grid;
  min-inline-size: 0;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  font-size: var(--gh-font-secondary);
  line-height: var(--gh-leading-label);
  overflow-wrap: anywhere;
  transition: background-color ${({ theme }) => theme.motion.surface} ${({ theme }) => theme.motion.easing}, box-shadow ${({ theme }) => theme.motion.surface} ${({ theme }) => theme.motion.easing};
  &:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: calc(-1 * ${({ theme }) => theme.border.focusWidth});
  }
  @media (prefers-reduced-motion: reduce) { transition: none; }
  [data-mobile-only], [data-phone-kickoff] { display: none; }
  /* The selected phone layout is also used by the slip's original selections. */
  ${tile} {
    ${teamStackStyles}
    container: match-card / inline-size;
    &[data-mobile-locked]:not([data-phone-feed-card]) {
      [data-ledger-facts], [data-ledger-teams] > [data-match-state], > [data-match-open] { display: none; }
      [data-ledger-teams] { grid-template-columns: minmax(0, 1fr); }
    }
    &[data-phone-feed-card] {
      ${feedFactsStyles}
      ${({ theme, $headerResult }) => $headerResult && css`
        > [data-stack-result] [data-match-status] { color: ${matchHeaderStatusColor(theme, $headerResult)}; }
      `}
    }
    font-family: ${({ theme }) => theme.typography.family};
    /* Match and slip tiles share the active theme's shared, shadow-free phone frame. */
    border: 0;
    border-radius: ${({ theme }) => theme.phoneCardFrame.radius};
    [data-mobile-only] { display: inline; }
    [data-desktop-only] { display: none; }
  }
  ${media.phone} {
    &[data-phone-feed-card] { ${phoneFeedRowStyles} }
  }
  ${table} {
    grid-template-columns: ${matchTableColumns.compact};
    grid-template-rows: auto auto;
    column-gap: ${matchTableGap};
    row-gap: var(--gh-spacing-0_5);
    align-items: center;
    padding: var(--gh-spacing-1_5) var(--gh-spacing-4);
    background: transparent;
    font-size: var(--gh-font-body);
  }
  ${wideTable} { grid-template-columns: ${matchTableColumns.full}; }
  /* Touch taps would otherwise leave a stuck tint after returning to the list. */
  ${media.hover} { &:hover { background: var(--match-card-hover, ${({ theme }) => theme.color.rowHover}); } }
`;

const MobileUnlockArea = styled.div`
  display: none;
  ${tile} {
    grid-area: facts; display: flex; min-inline-size: 0; align-self: stretch;
    > a { inline-size: 100%; block-size: 100%; padding: var(--gh-spacing-1_5); gap: var(--gh-spacing-1); font-size: var(--gh-font-caption); }
    > [data-unlock-card] { padding-inline: var(--gh-spacing-1); }
  }
  ${table} {
    &:has(> [data-unlock-card]) {
      display: grid; grid-column: 7 / span 4; grid-row: 2;
      padding-inline-end: var(--gh-spacing-1_5);
    }
  }
`;

const Meta = styled.header`
  ${table} { display: contents; }
`;
const Index = styled(MatchNumber)<{ $wrap: boolean }>`
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
  ${tile} { order: 2; flex: 0 1 auto; font-weight: ${({ theme }) => theme.typography.weight.body}; }
  ${table} { grid-column: 2; grid-row: 2; }
`;
const League = styled.p`
  display: flex;
  color: ${({ theme }) => theme.color.link};
  align-items: center;
  gap: var(--gh-spacing-1_5);
  min-inline-size: 0;
  > span { ${ellipsis} }
  /* Tile: league crest and short name, then country flag and code, at the extreme right. */
  ${tile} {
    justify-content: flex-end;
    gap: var(--gh-spacing-1);
    color: inherit;
    > [data-competition-logo] { order: 1; --gh-league-mark-size: var(--gh-size-2_5); }
    > [data-country] { order: 3; margin-inline-start: var(--gh-spacing-0_75); }
  }
  /* Table: the crest leads the league name the way the flag leads the country, in a column as wide as the flag. */
  ${table} {
    display: grid;
    grid-column: 3;
    grid-row: 1 / span 2;
    grid-template-columns: var(--gh-size-4) minmax(0, 1fr);
    grid-template-rows: subgrid;
    align-self: stretch;
    gap: var(--gh-spacing-0_5) var(--gh-spacing-1);
    > [data-country] { grid-column: 1 / -1; grid-row: 1; }
    > [data-competition-logo] { grid-column: 1; grid-row: 2; }
    > span { white-space: nowrap; }
  }
`;
const When = styled.time`
  display: flex;
  align-items: center;
  gap: var(--gh-spacing-1_5);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  ${tile} { flex: none; }
  ${table} { display: contents; white-space: normal; }
`;
const KickoffDate = styled.span`
  ${table} { grid-column: 2; grid-row: 1; }
`;
const Dot = styled.span`
  display: none;
`;
const KickoffTime = styled.span`
  ${table} {
    grid-column: 2;
    grid-row: 2;
    min-inline-size: 0;
    max-inline-size: 100%;
    white-space: normal;
  }
`;
const KickoffDetails = styled.span`
  display: contents;
  ${tile} { display: flex; align-items: center; gap: var(--gh-spacing-1_5); min-inline-size: 0; }
`;
const CountryDetails = styled.span`
  display: flex;
  flex: none;
  align-items: center;
  min-inline-size: 0;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: var(--gh-font-secondary);
  font-weight: var(--gh-weight-body);
  line-height: var(--gh-size-3_5);
  white-space: nowrap;
  > span { flex: none; }
  /* One line: a long recognized country uses its short form; anything still too wide ends in an ellipsis. */
  > [data-country-name] { flex: 1; ${ellipsis} }
  > [data-country-flag] { margin-inline-end: var(--gh-spacing-1); }
  ${tile} { && { gap: 0; font-size: inherit; line-height: inherit; } }
  ${tile} {
    > [data-country-flag] { --gh-flag-width: var(--gh-size-3_75); --gh-flag-height: var(--gh-size-2_5); margin-inline-end: var(--gh-spacing-0_75); }
  }
`;
const CountryName = styled.span``;

const Teams = styled.div`
  --gh-logo-size: var(--gh-size-4);
  --gh-logo-radius: 0;
  --gh-logo-font: var(--gh-size-2);
  ${table} { --gh-logo-size: var(--gh-size-5_5); --gh-logo-font: var(--gh-size-2_5); display: contents; }
`;
const Team = styled.div`
  display: flex; align-items: center; gap: var(--gh-spacing-1_5); min-inline-size: 0;
  ${tile} { &[data-result="loss"] { color: ${({ theme }) => theme.color.mutedText}; } }
  ${table} {
    grid-column: 6; grid-row: 2; gap: var(--gh-spacing-2);
    &[data-team-side="home"] { grid-column: 4; flex-direction: row-reverse; text-align: end; }
  }
`;
const TeamName = styled.span`
  flex: 1;
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  ${ellipsis}
  ${table} {
    white-space: nowrap;
    font-weight: ${({ theme }) => theme.typography.weight.body};
    [data-standing="ahead"] > & { font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  }
`;
const Center = styled.div`
  display: flex; flex-direction: column; align-items: center; gap: var(--gh-spacing-0_5);
  ${table} { display: contents; }
`;
const Versus = styled.span`
  color: ${({ theme }) => theme.color.mutedText};
  ${tile} {
    display: inline;
    padding: 0;
    color: ${({ theme }) => theme.color.mutedText};
    background: none;
    border: 0;
    font-size: var(--gh-font-micro);
    font-weight: var(--gh-weight-semibold);
    line-height: var(--gh-leading-label);
  }
  ${table} { grid-column: 5; grid-row: 2; justify-self: center; }
`;
const Score = styled(Scoreline)`
  ${table} { grid-column: 5; grid-row: 2; justify-self: center; }
  /* A score takes the same compact central slot as VS. */
  ${tile} {
    color: ${({ theme }) => theme.color.text};
    > [data-loss] { color: ${({ theme }) => theme.color.mutedText}; }
    [data-status="live"] & { color: ${({ theme }) => theme.color.live.text}; }
  }
`;
const StateChip = styled.span<{ $tone: StateTone }>`
  display: inline-flex;
  align-items: center;
  gap: var(--gh-spacing-1);
  padding: 0 var(--gh-spacing-1);
  font-size: var(--gh-font-micro);
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  line-height: var(--gh-leading-body);
  white-space: nowrap;
  ${({ $tone, theme }) => $tone === "final"
    ? css`color: ${theme.color.mutedText}; background: ${theme.color.surfaceMuted};`
    : $tone === "live" ? css`color: ${theme.color.live.text}; background: ${theme.color.live.soft};`
      : css`color: ${theme.color.accent.amber.text}; background: ${theme.color.accent.amber.soft};`}
  ${table} { grid-column: 5; grid-row: 1; justify-self: center; }
  /* Plain phase text under the score keeps the status badge focused on progress or outcome. */
  ${tile} {
    padding: 0;
    background: none;
    font-size: var(--gh-font-micro);
    font-weight: ${({ theme }) => theme.typography.weight.heavy};
    letter-spacing: var(--gh-tracking-relaxed);
    line-height: var(--gh-leading-tight);
    color: ${({ theme, $tone }) => $tone === "live" ? theme.color.live.text : $tone === "final" ? theme.color.mutedText : theme.color.outcome.void.text};
    ${({ $tone }) => $tone !== "halted" && css`transform: translateY(calc(-1 * var(--gh-size-0_5)));`}
  }
`;

/** Mobile forecast geometry is shared; the original desktop fallback retains its subgrid. */
const Pick = styled.div<{ $family: MarketFamily }>`
  [data-match-metrics] { display: contents; }
  ${table} { display: grid; grid-column: 7 / span 4; grid-row: 2; grid-template-columns: subgrid; align-items: center; }
`;
const FeedFacts = styled.div`
  min-inline-size: 0;
  ${table} {
    grid-column: 7 / span 4; grid-row: 2;
    display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
    align-items: center; gap: var(--gh-spacing-2);
    > [data-ledger-field="market"] { color: ${({ theme }) => theme.color.mutedText}; }
    > [data-ledger-field="prediction"] { grid-column: 2; }
  }
`;
/** A shared value cell keeps every selected-pick fact in the same column on both layouts. */
const PickCell = styled.span`
  min-inline-size: 0;
  > [data-mobile-only] { display: none; }
  ${tile} {
    display: flex;
    align-items: center;
    min-inline-size: 0;
    line-height: var(--gh-size-4);
    > [data-mobile-only] { display: block; }
    > [data-desktop-only] { display: none; }
  }
`;
const MarketName = styled(PickCell)<{ $family: MarketFamily }>`
  grid-column: 1;
  ${table} {
    justify-self: start; padding: var(--gh-spacing-0_5) var(--gh-spacing-2);
    color: ${({ theme, $family }) => theme.color.market[$family].text};
    background: ${({ theme, $family }) => theme.color.market[$family].soft};
    border-inline-start: 0;
    font-size: var(--gh-font-secondary); font-weight: ${({ theme }) => theme.typography.weight.bold};
  }
`;
const GatedPick = styled.span`
  display: inline-flex;
  align-items: center;
  gap: var(--gh-spacing-1);
  grid-column: 2;
  min-inline-size: 0;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  line-height: var(--gh-size-4);
  > svg { flex: none; }
  > [data-mobile-only] { display: none; }
  ${tile} {
    grid-area: pick;
    color: ${({ theme }) => theme.color.text};
    font-size: var(--gh-font-caption);
    font-weight: ${({ theme }) => theme.typography.weight.medium};
    line-height: var(--gh-leading-heading);
    > svg { display: none; }
    > [data-mobile-only] { display: block; white-space: normal; }
    > [data-desktop-only] { display: none; }
  }
`;
const Prediction = styled.span<{ $available: boolean }>`
  display: contents;
  color: ${({ theme, $available }) => $available ? "inherit" : theme.color.mutedText};
`;
const PickShort = styled(PickCell)<{ $family: MarketFamily; $available: boolean }>`
  grid-column: 2;
  color: ${({ theme, $available }) => $available ? theme.color.text : theme.color.mutedText};
  > [data-pick-value] { max-inline-size: 100%; font-size: var(--gh-font-body); font-weight: ${({ theme }) => theme.typography.weight.heavy}; line-height: var(--gh-leading-heading); }
  ${tile} {
    [data-pick-state="none"] & {
      > b { font-size: var(--gh-font-caption); font-weight: ${({ theme }) => theme.typography.weight.bold}; }
      > b + [data-pick-value]::before { content: "· "; }
    }
  }
  ${table} {
    display: flex; align-items: flex-start; min-inline-size: 0;
    > [data-pick-value] {
      max-inline-size: 100%; padding: var(--gh-spacing-1) var(--gh-spacing-1_75);
      background: ${({ theme }) => theme.color.surface};
      border: 0;
      border-inline-start: 0;
    }
  }
`;
const PickLine = styled.span`
  display: inline-flex; align-items: baseline; gap: var(--gh-spacing-0_75);
  min-inline-size: 0; max-inline-size: 100%; white-space: nowrap;
  > [data-pick-selection] { ${ellipsis} }
  > [data-forecast-source] {
    flex: none; font-size: calc(var(--gh-font-micro) - var(--gh-stroke-thin)); line-height: var(--gh-leading-solid);
  }
`;
const FeedPickLine = styled(PickLine)`
  align-items: center;
`;
const NoRecommendedPick = styled.span`
  display: inline-flex; align-items: center; flex: none;
  color: ${({ theme }) => theme.color.mutedText};
  > svg { inline-size: var(--gh-size-4); block-size: var(--gh-size-4); }
`;
/** One price cell serves both the desktop track and the mobile facts row. */
const Odds = styled(PickCell)`
  grid-column: 3;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  font-variant-numeric: tabular-nums; white-space: nowrap;
`;
const Probability = styled(PickCell)`
  grid-column: 4; display: inline-flex; align-items: center; gap: var(--gh-spacing-1_5);
  ${tile} { [data-probability-meter] { display: none; } }
`;
const Percent = styled.span`
  font-size: var(--gh-font-body); font-weight: ${({ theme }) => theme.typography.weight.bold};
  font-variant-numeric: tabular-nums; white-space: nowrap;
`;
/** The shared phone layout places progress/outcome in the top-right slot. */
const Result = styled.span`
  display: inline-flex; align-items: center;
  /* Before hydration, keep the original desktop score and status grid slots. */
  ${table} {
    display: contents;
    > [data-match-status] { grid-column: 11; grid-row: 2; justify-self: center; min-inline-size: 0; }
  }
`;

const Open = styled(Link)`
  position: absolute;
  inset: 0;
  z-index: var(--gh-layer-content);
  color: ${({ theme }) => theme.color.mutedText};
  > svg { display: none; }
  &:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: calc(-1 * ${({ theme }) => theme.border.focusWidth});
  }
  /* The link covers the tile, so its press tint lands at once over everything, chips included, in place of the
   * browser's tap overlay, inside the card's border. */
  ${tile} {
    border-radius: ${({ theme }) => `max(0px, calc(${theme.phoneCardFrame.radius} - ${theme.border.width}))`};
    -webkit-tap-highlight-color: transparent;
    &:active { background: color-mix(in srgb, ${({ theme }) => theme.color.text} 8%, transparent); }
  }
  ${table} {
    position: static;
    display: grid;
    grid-column: 12;
    grid-row: 2;
    place-items: center;
    > svg { display: block; font-size: var(--gh-font-section); }
    &::after { content: ""; position: absolute; inset: 0; z-index: var(--gh-layer-content); }
    ${media.hover} { &:hover { color: ${({ theme }) => theme.color.brand}; } }
    &:focus-visible { outline: none; }
    &:focus-visible::after {
      outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
      outline-offset: calc(-1 * ${({ theme }) => theme.border.focusWidth});
    }
  }
`;

type LiveClock = ReturnType<typeof liveClockLabel>;

/** `lead` names the winner of a decided final score; live phase and minute stay beside the score. */
function MatchState({ fixture, display, description, lead, clock, messages, snapshot = false, phoneFeed }: {
  fixture: FixtureSnapshot; display: ReturnType<typeof matchCardScore>; description: string | undefined;
  lead: number; clock: LiveClock | null; messages: Messages; snapshot?: boolean; phoneFeed: boolean;
}) {
  const { status } = fixture, { score, shootout, regulationOnly } = display;
  const final = hasFinalScoreStatus(status);
  const showFigures = (score || shootout) && (snapshot || status === "live" || final) || phoneFeed && (status === "live" || final);
  const scoreline = showFigures ? <>
    <Score data-score aria-hidden="true"><ScoreFigures home={score ? messages.number(score.home) : "—"}
      away={score ? messages.number(score.away) : "—"} lead={lead}
      shootout={shootout && { home: messages.number(shootout.home), away: messages.number(shootout.away) }} /></Score>
    {description && <VisuallyHidden>{description}</VisuallyHidden>}
  </> : <>
    <Versus data-ledger-versus aria-hidden="true">{status === "live" || final ? "–" : <>
      <span data-mobile-only>VS</span><span data-desktop-only>{messages.text("match.versus")}</span>
    </>}</Versus>
    {description && <VisuallyHidden>{description}</VisuallyHidden>}
  </>;
  if (snapshot) return <Center data-match-state="snapshot">{scoreline}</Center>;
  if (clock) return <Center data-match-state="live">{scoreline}<StateChip data-score-clock $tone="live" aria-hidden="true"
    data-desktop-only={fixture.liveClock?.phase === "in-play" ? "" : undefined}>
    <span data-mobile-only>{fixture.liveClock?.phase === "in-play" ? null : clock.phaseLabel}</span></StateChip>
    <VisuallyHidden>{clock.spoken}</VisuallyHidden></Center>;
  if (status === "live") return <Center data-match-state="live">{scoreline}</Center>;
  if (final && (status === "finished-regulation" || status === "finished-extra-time" || status === "finished-penalties")) {
    return <Center data-match-state="final">{scoreline}
      <StateChip data-score-clock $tone="final" title={regulationOnly ? messages.text("match.regulationScoreNote") : undefined}>
        <span aria-hidden="true">{messages.text(`match.final.${status}`)}{regulationOnly && "*"}</span>
        <VisuallyHidden>{messages.text(`match.status.${status}`)}{regulationOnly && `. ${messages.text("match.regulationScoreNote")}`}</VisuallyHidden>
      </StateChip>
    </Center>;
  }
  if (status === "scheduled") return <Center data-match-state="scheduled">{scoreline}</Center>;
  return <Center data-match-state={status}>{scoreline}
    {status === "unknown" ? <VisuallyHidden>{messages.text("match.status.unknown")}</VisuallyHidden>
      : <StateChip data-match-phase $tone="halted">{messages.text(`match.status.${status}`)}</StateChip>}
  </Center>;
}

function CardTeam({ team, side, name, eager, result, standing }: {
  team: FixtureSnapshot["homeTeam"]; side: "home" | "away"; name: string; eager: boolean; result: TeamResult; standing: TeamStanding;
}) {
  const url = isSafeRemoteImageUrl(team.logoUrl) ? team.logoUrl : undefined;
  return <Team data-team-side={side} data-ledger-home={side === "home" ? "" : undefined} data-ledger-away={side === "away" ? "" : undefined}
    data-result={result ?? undefined} data-standing={standing ?? undefined} aria-label={name}>
    <TeamLogo key={`${team.id}:${url ?? "missing"}`} name={team.name} url={url} eager={eager} />
    <TeamName data-team-name="" title={name}><span data-mobile-only data-ledger-name>{name}</span><span data-desktop-only>{name}</span></TeamName>
  </Team>;
}


/** Only timestamps subscribe to the device clock; the rest of a card stays unchanged. */
function CardKickoff({ kickoff, locale, phoneFeed }: { kickoff: FixtureSnapshot["kickoffAt"]; locale: string; phoneFeed: boolean }) {
  const messages = useMessages(locale);
  return kickoff === null ? <When as="p" data-ledger-kickoff data-kickoff data-kickoff-unknown><KickoffDetails>
    <KickoffDate data-kickoff-date>{messages.text("match.kickoffUnknown")}</KickoffDate>
  </KickoffDetails></When>
    : <When dateTime={toUtcIsoString(kickoff)} title={messages.reportingInstant(kickoff)} data-ledger-kickoff data-kickoff>
      <KickoffDetails>
        <VisuallyHidden>{messages.text("match.kickoff")}: </VisuallyHidden>
        <KickoffDate data-kickoff-date>
          <span data-mobile-only>{messages.shortKickoffDate(kickoff)}</span>
          {phoneFeed && <span data-phone-kickoff>{messages.shortKickoffDate(kickoff, true, "numeric")}</span>}
          <span data-desktop-only>{messages.shortKickoffDate(kickoff, true)}</span>
        </KickoffDate><Dot aria-hidden="true">·</Dot>
        <KickoffTime data-kickoff-time>{messages.kickoffTime(kickoff)}</KickoffTime>
      </KickoffDetails>
    </When>;
}

function PredictionCell({ prediction, price, reason, locale, children }: {
  prediction: ReturnType<typeof selectedCardPrediction> | ReturnType<typeof snapshotCardPrediction> | ReturnType<typeof featuredCardPrediction>;
  price: Pick<NonNullable<ReturnType<typeof selectedCardPrice>>, "price"> | null;
  reason: string | null; locale: string; children: ReactNode;
}) {
  const messages = useMessages(locale);
  const details = prediction && [prediction.item.market.source ? messages.text(`market.source.${prediction.item.market.source}`) : null,
    prediction.provisional ? messages.text("match.provisional") : null,
    prediction.publishedAt !== null ? `${messages.text("match.published")}: ${messages.reportingInstant(prediction.publishedAt)}` : null,
    price ? `${messages.text("details.odds")}: ${price.price}` : null].filter(Boolean).join(" · ");
  return <Prediction $available={prediction !== null} data-prediction={prediction?.item.market.selection ?? "none"}
    data-outcome={prediction?.status ?? "unavailable"} title={details || reason || undefined}>{children}</Prediction>;
}

/** Only the desktop presentation subscribes to the device timezone, just as CardKickoff does on phones. */
function DesktopCard(props: ComponentProps<typeof DesktopMatchRow>) {
  const messages = useMessages(props.locale);
  return <DesktopMatchRow {...props} messages={messages} clockInBadge />;
}

function MatchCardView({ fixture, gated: requiresAccess = false, analysisSlug, markets, publishedMarket = false, selectedFamily, locale: requestedLocale,
  headingLevel = 2, eagerLogos = false, position, phoneFeed = false, titleNote, offline = false, snapshotPick, lockedPrediction = false,
  signedIn = false, interactive = true, accessReturnTo, kickoffPassed = false }: MatchCardProps) {
  const locale = resolveLocale(requestedLocale);
  const messages = createMessages(locale);
  const titleId = `gh-match-${useId()}`;
  const desktop = useContext(MatchCardLayoutContext);
  const eligible = markets && markets.length > 0 ? markets : selectedFamily ? [selectedFamily] : defaultMarkets;
  const gatedForecast = fixture.forecast !== null && "gated" in fixture.forecast ? fixture.forecast : null;
  const retrospective = publishedMarket && !snapshotPick ? fixture.retrospective : null;
  const filtered = publishedMarket && !snapshotPick ? fixture.filteredPrediction : undefined;
  const missingFilteredPick = filtered === null && gatedForecast === null;
  const missingFeaturedPick = publishedMarket && !snapshotPick && filtered === undefined && gatedForecast === null && isFeaturedPickSuppressed(fixture);
  const suppressPick = missingFilteredPick || missingFeaturedPick;
  const featured = retrospective?.pick ?? filtered ??
    (publishedMarket && !snapshotPick && !suppressPick && (fixture.status === "scheduled" || fixture.featuredDecisionFrozen) ? fixture.featuredPrediction : null);
  // Only a published eligible family is locked: forecast null means none was published, and the gated families already
  // name the published markets, so a filter outside them shows the subscriber's no-prediction reason.
  const best = snapshotPick?.family ?? featured?.family ?? (suppressPick ? null : bestCardFamily(fixture, eligible, !publishedMarket));
  const guestFeed = phoneFeed && !offline && !signedIn;
  const gated = lockedPrediction || (snapshotPick ? requiresAccess || gatedForecast !== null
    : !isCompletedFixtureStatus(fixture.status) && best !== null && (requiresAccess || gatedForecast !== null || guestFeed));
  const feedLocked = phoneFeed && !offline && gated;
  const detailHref = matchHref(fixture.fixtureId, analysisSlug, locale);
  const unlockReturnTo = accessReturnTo ?? detailHref;
  const unlockLabel = accessReturnTo ? "paywall.unlockSlip" : "paywall.unlockPredictions";
  const targetHref = gated ? subscriberHref(signedIn, unlockReturnTo) : detailHref;
  const shownFamily = best ?? eligible[0]!;
  const coreFamily = shownFamily === "team-goals" ? "total-goals" : shownFamily;
  const publicChance = gatedForecast?.probabilities.find((entry) => entry.family === shownFamily)?.probability;
  const publicChanceLabel = publicChance === undefined ? "—" : messages.number(publicChance, { style: "percent", maximumFractionDigits: 0 });
  const home = fixture.homeTeam.name?.trim() || messages.text("match.homeUnknown");
  const away = fixture.awayTeam.name?.trim() || messages.text("match.awayUnknown");
  const title = messages.text("match.title", { home, away });
  const competition = fixture.competition.name?.trim() || messages.text("match.competitionUnknown");
  const country = fixture.competition.country?.trim();
  const countryName = countryDisplayName(country);
  const flagUrl = countryFlagUrl(fixture);
  const prediction = offline || gated || suppressPick ? null : snapshotPick ? snapshotCardPrediction(snapshotPick)
    : featured ? featuredCardPrediction(featured, retrospective ? null : fixture.forecast?.publishedAt ?? null,
      retrospective ? false : fixture.forecast?.provisional ?? true)
      : selectedCardPrediction(fixture, coreFamily, !publishedMarket);
  const observation = phoneFeed || !prediction || snapshotPick || featured || fixture.marketOdds?.kind !== (fixture.status === "live" ? "in-play" : "pre-match")
    ? null : fixture.marketOdds;
  const selection = prediction?.item.market.selection;
  const livePrice = selection && observation?.kind === "in-play" ? marketOddsPrice(observation, coreFamily, selection) : null;
  const preMatchPrice = featured?.odds ?? (selection && fixture.status === "scheduled" && observation?.kind === "pre-match"
    ? marketOddsPrice(observation, coreFamily, selection) : null);
  const storedPrice = phoneFeed || retrospective || snapshotPick ? null : filtered ? fixture.prices?.find((quote) => quote.family === filtered.key && quote.selection === selection) ?? null
    : featured || fixture.status === "live" ? null : selectedCardPrice(fixture, coreFamily, !publishedMarket);
  const replayPick = retrospective?.pick;
  const historicalReplayPrice = !phoneFeed && selection && replayPick?.historicalOdds && replayPick.odds ? displayMarketOddsPrice(replayPick.odds) : null;
  const confirmedPrice = retrospective ? historicalReplayPrice : filtered ? filtered.odds : featured?.featuredQuote && preMatchPrice
    ? displayMarketOddsPrice(preMatchPrice) : fixture.status === "live" ? livePrice : preMatchPrice;
  const price = phoneFeed || !selection ? null : snapshotPick ? { price: snapshotPick.odds }
    : confirmedPrice ? { price: confirmedPrice } : storedPrice;
  const oddsKind = historicalReplayPrice ? "historical-pre-match"
    : (price === storedPrice ? storedPrice?.recovery?.kind : undefined) ?? observation?.kind ?? ((featured?.featuredQuote || filtered) && price ? "pre-match" : undefined);
  const oddsCaption = messages.text("details.odds");
  const stackOddsCaption = `${oddsCaption}:`;
  const stackProbabilityCaption = `${messages.text("match.columns.probabilityCompact")}:`;
  const oddsLabel = historicalReplayPrice ? messages.text("touchline.recoveredOdds")
    : oddsKind === "pre-match" || oddsKind === "historical-pre-match" ? messages.text("touchline.preMatchOdds") : oddsCaption;
  const quote = featured?.featuredQuote ?? (retrospective?.featuredDecisionSealed ? replayPick?.historicalOdds : undefined);
  const oddsDescription = `${oddsLabel}: ${price?.price ?? messages.text("outcome.unavailable")}${price && quote ? ` · ${bookmakerOddsSource(quote, messages)}` : ""}`;
  const valueDescription = featuredPriceValueText(featured, price?.price, messages);
  const source = prediction?.item.market.source;
  const sourceName = !phoneFeed && retrospective ? messages.text("touchline.retrospective") : source ? messages.text(`market.source.${source}`) : null;
  const sourceMarker = source ? <ForecastSourceLabel source={source} messages={messages} label={sourceName ?? undefined} /> : null;
  const tierDescription = featuredPickStatusText(featured, messages);
  const pickDescription = (phoneFeed ? sourceName : [sourceName, tierDescription, valueDescription].filter(Boolean).join(" · ")) ?? "";
  const valueLabel = <FeaturedPriceValue description={valueDescription} messages={messages} />;
  const family = featured?.label ?? messages.text(`market.family.${shownFamily}`);
  const [, totalPeriod, totalScope] = /^goal:([^:]+):totals:(total|home|away):/u.exec(featured?.key ?? "") ?? [];
  const shortFamily = totalScope ? formatMarketShortLabel({ market: "total-goals", scope: totalScope,
    ...(totalPeriod && totalPeriod !== "full-time" ? { period: totalPeriod } : {}) })
    : featured?.code ?? (shownFamily === "team-goals" ? family : compactMarketName(coreFamily));
  const selectionContext = featured?.code ? { marketKey: featured.key, label: featured.selectionLabel } : undefined;
  const mobileSelection = selection && predictionLabel(messages, selection, selectionContext);
  const selectionDescription = selection ? predictionDescription(messages, selection, selectionContext) : null;
  const forecastDescription = selectionDescription ? [`${family}: ${selectionDescription}`, pickDescription].filter(Boolean).join(" · ") : null;
  const percent = prediction && (prediction.probability.labelKey === "probability.percent"
    ? messages.text("probability.percent", { percent: messages.number(prediction.probability.roundedPercent, snapshotPick
      ? { minimumFractionDigits: 1, maximumFractionDigits: 1 } : undefined) })
    : messages.text(prediction.probability.labelKey === "probability.less-than-one" ? "probability.compact.less-than-one" : "probability.compact.more-than-ninety-nine"));
  const feedMarket = <FittedCardText full={family} short={shortFamily} />;
  const feedPick = selection && <FeedPickLine data-pick-line data-pick-label>
    {sourceMarker}
    <FittedCardText full={predictionText(messages, selection, selectionContext)}
      short={predictionLabel(messages, selection, selectionContext)} probability={percent} />
  </FeedPickLine>;
  const unlockAction = gated && !offline ? <UnlockButton locale={locale} signedIn={signedIn} returnTo={unlockReturnTo}
    label={unlockLabel} {...(feedLocked ? { guestView: "login", cardTitle: title } : {})} /> : null;
  const locked = !retrospective && fixture.cycle?.state === "closed";
  const exactSettlement = featured?.settlementStatus;
  const originalOutcome = !exactSettlement && filtered && filtered.key === filtered.family ? selectedCardPrediction(fixture, filtered.family, false) : null;
  const outcome = exactSettlement ? featuredSettlementTone(exactSettlement)
    : retrospective || filtered && originalOutcome?.item.market.selection !== filtered.selection ? "unavailable"
    : originalOutcome?.status ?? prediction?.status ?? "unavailable";
  const awaitingResult = fixture.update?.statusFreshness?.state === "awaiting-update";
  const result = snapshotPick ? outcome : cardResultStatus(fixture.status, outcome, awaitingResult, kickoffPassed);
  const headerResult = phoneFeed && !offline && !snapshotPick
    ? result === "live" && fixture.liveClock?.phase === "half-time" ? "half-time" : headerResults[result] ?? result
    : undefined;
  const final = hasFinalScoreStatus(fixture.status);
  const display = matchCardScore(fixture, phoneFeed && !snapshotPick);
  const { score, shootout, regulationOnly } = display;
  const showScore = (score !== null || shootout !== null) && (fixture.status === "live" || final);
  const finalScore = shootout ?? (!regulationOnly ? score : null);
  const lead = final && finalScore ? Math.sign(finalScore.home - finalScore.away) : 0;
  // A live score bolds the side currently ahead.
  const liveLead = score && fixture.status === "live" ? Math.sign(score.home - score.away) : 0;
  const clock = !offline && fixture.status === "live" && fixture.liveClock && (fixture.liveClock.minute !== null || fixture.liveClock.phase !== "in-play")
    ? liveClockLabel(fixture.liveClock, messages, undefined, phoneFeed) : null;
  const showProgress = !offline && (showScore || final || clock !== null || phoneFeed && fixture.status === "live" || snapshotPick !== undefined && score !== null
    || fixture.status !== "scheduled" && fixture.status !== "unknown" && fixture.status !== result);
  const scoreDescription = final || fixture.status === "live" || snapshotPick && score
    ? matchScoreDescription(display, { home, away }, messages, final, snapshotPick !== undefined) : undefined;
  const missing = gated || prediction || missingFeaturedPick ? null : noPickReason(fixture);
  const noForecast = publishedMarket && !fixture.forecast && !snapshotPick && !prediction;
  const noPickLabel = messages.text(noForecast ? "match.noForecast" : missingFeaturedPick ? "match.noQualifyingPick" : "match.noPick");
  const reason = missing ? messages.text(`match.noPickReason.${missing}`) : null;
  const absenceTitle = noForecast || missingFeaturedPick ? [noPickLabel, reason].filter(Boolean).join(" · ") : null;
  const abstention = !phoneFeed && absenceTitle ? <NoRecommendedPick data-featured-abstention={missingFeaturedPick ? "" : undefined}
    data-pick-absence={noForecast ? "no-forecast" : "no-qualifying-pick"} title={absenceTitle}>
    <CircleMinusIcon /><VisuallyHidden>{absenceTitle}</VisuallyHidden>
  </NoRecommendedPick> : null;
  const pickState = gated ? "subscriber" : !prediction ? "none" : settledOutcome(outcome) ? "settled" : "open";
  if (desktop) {
    const marketDescription = offline ? "Predictions are unavailable in the saved view."
      : gated ? messages.text("paywall.card")
      : forecastDescription ?? absenceTitle ?? reason ?? undefined;
    const publication = !phoneFeed && prediction && [retrospective ? messages.text("touchline.retrospective") : source ? messages.text(`market.source.${source}`) : null,
      prediction.provisional ? messages.text("match.provisional") : null,
      prediction.publishedAt !== null ? `${messages.text("match.published")}: ${messages.reportingInstant(prediction.publishedAt)}` : null].filter(Boolean).join(" · ");
    return <DesktopCard fixtureId={fixture.fixtureId} locale={locale} kickoffAt={fixture.kickoffAt} hideMetrics={phoneFeed}
      homeTeam={{ name: fixture.homeTeam.name, logoUrl: isSafeRemoteImageUrl(fixture.homeTeam.logoUrl) ? fixture.homeTeam.logoUrl : null }}
      awayTeam={{ name: fixture.awayTeam.name, logoUrl: isSafeRemoteImageUrl(fixture.awayTeam.logoUrl) ? fixture.awayTeam.logoUrl : null }}
      competition={{ name: fixture.competition.name, country: fixture.competition.country,
        logoUrl: fixture.competition.logoUrl, countryFlagUrl: flagUrl }}
      status={fixture.status} score={showScore || snapshotPick ? score : null} shootout={shootout} liveClock={offline ? null : fixture.liveClock ?? null}
      regulationOnly={regulationOnly} compactMatch={phoneFeed} {...(scoreDescription ? { scoreDescription } : {})}
      outcome={offline ? "unavailable" : outcome} awaitingResult={awaitingResult} kickoffPassed={kickoffPassed} headingLevel={headingLevel} pickState={pickState}
      exactSettlement={exactSettlement}
      {...(position !== undefined ? { position } : {})} {...(titleNote ? { titleNote } : {})}
      {...(!offline && interactive && !gated ? { analysisHref: detailHref } : {})}
      {...(unlockAction ? { predictionAction: unlockAction } : {})}
      {...(snapshotPick ? { matchState: "snapshot", savedScore: true } : {})}
      offline={offline} interactive={interactive && !feedLocked} eagerLogos={eagerLogos} {...(!gated && !offline ? { marketFamily: shownFamily } : {})}
      {...(marketDescription ? { marketDescription } : {})}
      market={offline ? <span>Unavailable offline</span> : gated ? null : phoneFeed ? (feedPick ? feedMarket : null)
        : <>
        {prediction && <span data-market-label aria-hidden="true">{shortFamily}:</span>}
        {selection ? <PickLine as="strong" data-pick-line="" data-pick-label title={publication || undefined}>
          <span data-pick-selection>{predictionLabel(messages, selection, selectionContext)}</span>{sourceMarker}
        </PickLine> : abstention ?? <strong data-pick-label data-no-pick={missing ?? undefined}>{noPickLabel}</strong>}
      </>}
      pick={phoneFeed && !offline && !gated ? feedPick
        ?? <strong data-pick-label data-no-pick={missing ?? undefined} title={absenceTitle ?? undefined}>{noPickLabel}</strong> : undefined}
      odds={<span data-card-odds data-pick-price={prediction ? "" : undefined} data-odds-kind={oddsKind}
        title={oddsDescription}>{price?.price ?? "—"}{historicalReplayPrice && <VisuallyHidden> {oddsLabel}</VisuallyHidden>}
        {valueLabel}</span>}
      probability={gated ? <span data-public-probability>{publicChanceLabel}</span> : <span data-pick-value>{prediction ? percent : "—"}</span>}
      details={offline ? <VisuallyHidden>Predictions are unavailable in the saved view.</VisuallyHidden>
        : !phoneFeed && !gated && !prediction && reason && !abstention ? <span data-no-pick-reason>{reason}</span> : null}
    />;
  }
  return <Card tabIndex={-1} aria-labelledby={titleId} data-fixture-id={fixture.fixtureId} data-market={gated ? undefined : shownFamily}
    $headerResult={headerResult} data-match-header-result={headerResult}
    data-status={fixture.status} data-mobile-locked={gated && !offline ? "" : undefined} data-mobile-design="team-stack"
    data-numbered={position !== undefined ? "" : undefined} data-phone-feed-card={phoneFeed || undefined}>
    <VisuallyHidden as={`h${headingLevel}`} id={titleId}>{titleNote ? `${title}, ${titleNote}` : title}</VisuallyHidden>
    <Meta data-ledger-meta>
      {position !== undefined && <Index position={position} $wrap={position > 9_999} aria-hidden="true" data-row-number>{messages.number(position)}</Index>}
      <CardKickoff kickoff={fixture.kickoffAt} locale={locale} phoneFeed={phoneFeed} />
      <League title={country ?? undefined} data-ledger-competition>
        <CountryDetails data-country data-ledger-country aria-hidden="true">
          <CompetitionCountryFlag url={flagUrl} country={country} offline={offline} />
          <CountryName data-country-name title={countryName || undefined}><span data-mobile-only>{countryCode(country) || "–"}</span><span data-desktop-only>{countryShortName(country) || "–"}</span></CountryName>
        </CountryDetails>
        <CompetitionLogo url={offline ? null : fixture.competition.logoUrl} country={country} /><LeagueName title={competition}><span data-mobile-only data-ledger-name>{compactLeagueName(competition)}</span><span data-desktop-only>{competition}</span></LeagueName>
        {country && <VisuallyHidden>, {country}</VisuallyHidden>}</League>
    </Meta>
    <Teams data-ledger-teams>
      <CardTeam team={fixture.homeTeam} side="home" name={home} eager={eagerLogos} result={lead > 0 ? "win" : lead < 0 ? "loss" : null}
        standing={liveLead > 0 ? "ahead" : liveLead < 0 ? "behind" : null} />
      <CardTeam team={fixture.awayTeam} side="away" name={away} eager={eagerLogos} result={lead < 0 ? "win" : lead > 0 ? "loss" : null}
        standing={liveLead < 0 ? "ahead" : liveLead > 0 ? "behind" : null} />
      {showProgress && <MatchState fixture={fixture} display={display} description={scoreDescription} lead={lead} clock={clock}
        messages={messages} snapshot={snapshotPick !== undefined} phoneFeed={phoneFeed} />}
    </Teams>
    {phoneFeed && !offline ? !gated && <FeedFacts data-ledger-facts data-pick-state={pickState} data-result={result}>
      {feedPick && <span data-ledger-field="market">{feedMarket}</span>}
      <span data-ledger-field="prediction" data-no-pick={missing ?? undefined} title={absenceTitle ?? undefined}>{feedPick ?? noPickLabel}</span>
    </FeedFacts> : <Pick $family={coreFamily} data-ledger-facts data-pick-state={pickState} data-result={result}>
      <MarketName $family={coreFamily} data-ledger-field="market" aria-hidden={gated ? undefined : true} title={family}>
        <span data-pick-value="" data-mobile-only="">{gated ? null : shortFamily}</span>
        <span data-pick-value="" data-desktop-only="">{gated ? null : family}</span>
      </MarketName>
      {offline ? <PredictionCell prediction={null} price={null} reason="Predictions are unavailable in the saved view." locale={locale}>
        <PickShort $family={coreFamily} $available={false} data-ledger-field="prediction"><span data-pick-value="">Unavailable offline</span></PickShort>
        <span data-match-metrics><Odds data-ledger-field="odds" data-stack-label={stackOddsCaption} aria-hidden="true">—</Odds><Probability data-ledger-field="probability" data-stack-label={stackProbabilityCaption} aria-hidden="true"><Percent>—</Percent></Probability></span>
      </PredictionCell> : gated ? <><GatedPick data-ledger-field="prediction"><SubscriberIcon />
        <span data-subscriber-notice>{messages.text(unlockLabel)}</span>
      </GatedPick>
        <span data-match-metrics><Odds data-ledger-field="odds" aria-hidden="true">—</Odds>
        <Probability data-ledger-field="probability" data-stack-label={stackProbabilityCaption} aria-label={messages.text("details.probability")}><Percent data-public-probability>{publicChanceLabel}</Percent></Probability></span>
      </> : <PredictionCell prediction={prediction} price={price} reason={reason} locale={locale}>
        <PickShort $family={coreFamily} $available={prediction !== null} data-ledger-field="prediction" aria-hidden={abstention ? undefined : true}
          data-no-pick={missing ?? undefined}>
          {selection ? <PickLine data-pick-line="" data-pick-value=""><span data-pick-selection="" title={predictionDescription(messages, selection, selectionContext)}>{mobileSelection}</span>{sourceMarker}</PickLine> : abstention ?? <>
            {missing && <b data-mobile-only="">{noPickLabel}</b>}
            <span data-pick-value="" data-mobile-only="">{missing ? messages.text(`match.noPickReason.short.${missing}`) : noPickLabel}</span>
            <span data-pick-value="" data-desktop-only="">{noPickLabel}</span>
          </>}
        </PickShort>
        <span data-match-metrics><Odds data-ledger-field="odds" data-stack-label={stackOddsCaption} aria-hidden={valueDescription === null}
          data-card-odds data-odds-kind={oddsKind} data-pick-price={prediction ? "" : undefined} title={oddsDescription}>{price?.price ?? "—"}{valueLabel}</Odds>
        <Probability data-ledger-field="probability" data-stack-label={stackProbabilityCaption} aria-hidden="true">
          {prediction && <ProbabilityBar $family={coreFamily} data-probability-meter=""><span style={{ inlineSize: `${Math.max(2, prediction.probability.roundedPercent)}%` }} /></ProbabilityBar>}
          <Percent data-pick-value="">{prediction ? percent : "—"}</Percent>
        </Probability></span>
        {prediction && selection ? <VisuallyHidden>{messages.text("match.pickLabel", { market: family, selection: predictionDescription(messages, selection, selectionContext),
          probability: messages.text(prediction.probability.labelKey, { percent: messages.number(prediction.probability.roundedPercent) }) })}
          {sourceName && `. ${sourceName}`}{tierDescription && `. ${tierDescription}`}
          {locked && `. ${messages.text("match.lockedPrediction")}`}
        </VisuallyHidden> : !abstention && <VisuallyHidden>{messages.text("match.noPickLabel", { market: family })}: {reason}</VisuallyHidden>}
      </PredictionCell>}
      {prediction && <VisuallyHidden>{oddsDescription}</VisuallyHidden>}
    </Pick>}
    {unlockAction && <MobileUnlockArea data-mobile-unlock-area>{unlockAction}</MobileUnlockArea>}
    <Result data-result-badge={offline ? "saved" : result} data-stack-result
      data-live-minute={clock ? clock.minute ?? "" : undefined}>
      <MatchStatus status={fixture.status} outcome={outcome} messages={messages} snapshot={snapshotPick !== undefined} offline={offline}
        liveClock={fixture.liveClock ?? null} awaitingResult={awaitingResult} kickoffPassed={kickoffPassed} compactMatch={phoneFeed}
        regulationOnly={regulationOnly} exactSettlement={exactSettlement} />
    </Result>
    {!offline && interactive && !feedLocked && <Open data-match-open href={targetHref} prefetch={false}
      title={gated ? undefined : absenceTitle ?? (phoneFeed ? forecastDescription ?? reason : pickDescription || null) ?? undefined}>
      <VisuallyHidden>{gated ? `${messages.text(unlockLabel)}: ${title}` : messages.text("match.analysisLabel", { home, away })}</VisuallyHidden><ChevronIcon />
    </Open>}
  </Card>;
}

/** Polls hand every card a fresh record; equal-version observations that look the same skip rendering.
 * A server refresh of the same query also brings an equal but new `markets` array. The country flag is decoration
 * that can change without a version bump, so it is compared by value too. */
function sameCardProps(previous: MatchCardProps, next: MatchCardProps): boolean {
  if (!sameCardFixture(previous.fixture, next.fixture) || countryFlagUrl(previous.fixture) !== countryFlagUrl(next.fixture) ||
      Boolean(previous.fixture.retrospective?.pick.historicalOdds) !== Boolean(next.fixture.retrospective?.pick.historicalOdds)) return false;
  for (const key of new Set([...Object.keys(previous), ...Object.keys(next)]) as Set<keyof MatchCardProps>) {
    if (key === "fixture" || Object.is(previous[key], next[key])) continue;
    if (key !== "markets" || previous.markets?.length !== next.markets?.length ||
        previous.markets?.some((family, index) => family !== next.markets?.[index])) return false;
  }
  return true;
}

export const MatchCard = memo(MatchCardView, sameCardProps);
