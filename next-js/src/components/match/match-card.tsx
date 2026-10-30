"use client";

import { SubscriberIcon } from "@/components/ui/icons";
import { SubscriberNotice } from "@/components/members/subscriber-notice";

import Link from "@/components/navigation/navigation-link";
import { memo, useContext, useId, useState, type ComponentProps, type ReactNode } from "react";
import styled, { css, keyframes } from "styled-components";
import { toUtcIsoString } from "@/domain/calendar";
import { countryCode, countryDisplayName, countryShortName } from "@/domain/country-code";
import { countryFlagAsset } from "@/domain/country-flag";
import { compactLeagueName, compactMarketName, compactTeamName } from "@/domain/compact-fixture-label";
import { bestCardFamily, noPickReason } from "@/domain/feed-presentation";
import { defaultMarkets } from "@/domain/feed-query";
import type { FixtureSnapshot } from "@/domain/fixture-snapshot";
import { cardResultStatus, hasFinalScoreStatus, sameCardFixture, selectedCardPrediction, selectedCardPrice, snapshotCardPrediction, type CardSnapshotPick } from "@/domain/match-card";
import type { MarketFamily } from "@/domain/markets";
import { isCompletedFixtureStatus } from "@/domain/market-settlement";
import { matchHref } from "@/domain/navigation";
import { predictionDescription, predictionLabel } from "@/domain/prediction-label";
import { isSafeRemoteImageUrl } from "@/domain/remote-image";
import { createMessages, type Messages } from "@/i18n/messages";
import { useMessages } from "@/i18n/use-messages";
import { resolveLocale } from "@/i18n/locales";
import { media, type OutcomeTone } from "@/styles/theme";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { CheckIcon, ChevronIcon, CrossIcon, FlagIcon, GlobeIcon, TrophyIcon, VoidIcon } from "./match-icons";
import { cleanLedgerIdentityStyles } from "./clean-ledger-styles";
import { matchTableColumns, matchTableGap } from "./match-columns";
import { TeamLogo } from "./team-logo";
import { providerImageSource } from "@/components/ui/provider-image";
import { OutcomeBadge, ProbabilityBar } from "./prediction-presentation";
import { DesktopMatchRow } from "./desktop-match-row";
import { MatchCardLayoutContext } from "./match-card-layout";

export type MatchCardProps = {
  fixture: FixtureSnapshot;
  /** The viewer lacks subscriber access: an unfinished fixture's published forecast in an eligible family renders locked even
   * when delivered whole. A fixture without one shows the no-prediction reason every viewer gets. */
  gated?: boolean;
  signedIn?: boolean;
  startingPriceUgx?: number | null | undefined;
  analysisSlug: string;
  /** Show the most likely available pick among these eligible families. */
  markets?: readonly MarketFamily[];
  selectedFamily?: MarketFamily;
  locale?: string;
  headingLevel?: 2 | 3 | 4;
  eagerLogos?: boolean;
  position?: number;
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
type StateTone = "final" | "halted";
const countryFlagUrl = (fixture: FixtureSnapshot) => fixture.competition.countryFlagUrl ?? null;
const tile = media.belowDesktop, table = media.desktop, wideTable = media.wide;
/** The live dot's halo swells and fades in its own red (`--gh-live-glow`). */
const glow = keyframes`0%, 100% { box-shadow: 0 0 1px 0 var(--gh-live-glow); } 50% { box-shadow: 0 0 6px 2px var(--gh-live-glow); }`;
const ellipsis = css`min-inline-size: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;`;
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
  [data-mobile-only] { display: none; }
  /* Clean ledger: kickoff and competition, mirrored teams, then four inline prediction facts. */
  ${tile} {
    ${cleanLedgerIdentityStyles}
    container: match-card / inline-size;
    font-family: ${({ theme }) => theme.typography.family};
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: "meta" "teams" "pick";
    gap: 4px;
    padding: 6px 8px;
    /* Match and slip tiles share the active theme's square, shadow-free phone frame. */
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.phoneCardFrame.border};
    border-radius: ${({ theme }) => theme.phoneCardFrame.radius};
    [data-mobile-only] { display: inline; }
    [data-desktop-only] { display: none; }
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

/** The league shortens first; enlarged text can wrap metadata without clipping the kickoff. */
const narrowTile = "@container match-card (max-width: 18rem)";
const enlargedTile = "@container match-card (max-width: 12rem)";
const Meta = styled.header`
  ${tile} {
    grid-area: meta;
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    align-items: center;
    gap: 5px;
    min-inline-size: 0;
    color: ${({ theme }) => theme.color.mutedText};
    font-size: 0.625rem;
    font-weight: ${({ theme }) => theme.typography.weight.body};
    line-height: 1.3;
    white-space: nowrap;
    ${narrowTile} { column-gap: 4px; }
    ${enlargedTile} { && { grid-template-columns: minmax(0, 1fr); row-gap: 3px; } }
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
  ${tile} { order: 2; flex: 0 1 auto; font-weight: ${({ theme }) => theme.typography.weight.body}; }
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
  /* Tile: league crest and short name, then country flag and code, at the extreme right. */
  ${tile} {
    justify-content: flex-end;
    gap: 4px;
    color: inherit;
    > img, > svg { order: 1; inline-size: 0.625rem; block-size: 0.625rem; }
    > [data-country] { order: 3; margin-inline-start: 3px; }
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
  gap: 6px;
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
const KickoffZone = styled.span`
  color: ${({ theme }) => theme.color.mutedText};
  font-weight: 400;
  ${tile} { font-weight: ${({ theme }) => theme.typography.weight.medium}; }
  ${table} { overflow-wrap: anywhere; }
`;
const KickoffDetails = styled.span`
  display: contents;
  ${tile} { display: flex; align-items: center; gap: 6px; min-inline-size: 0; }
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
  /* One line: a long recognized country uses its short form; anything still too wide ends in an ellipsis. */
  > [data-country-name] { flex: 1; ${ellipsis} }
  ${tile} { && { gap: 0; font-size: inherit; line-height: inherit; } }
`;
const CountryName = styled.span``;
const FlagImage = styled.img`
  flex: none;
  inline-size: 16px;
  block-size: 11px;
  margin-inline-end: 4px;
  object-fit: cover;
  border-radius: 1px;
  box-shadow: 0 0 0 0.5px ${({ theme }) => theme.color.border};
  ${tile} { inline-size: 0.9375rem; block-size: 0.625rem; margin-inline-end: 3px; border-radius: 0; box-shadow: none; }
`;
const FlagFallback = styled.span`
  display: grid;
  flex: none;
  place-items: center;
  inline-size: 16px;
  block-size: 11px;
  margin-inline-end: 4px;
  font-size: 11px;
  ${tile} { inline-size: 0.9375rem; block-size: 0.625rem; margin-inline-end: 3px; font-size: 0.625rem; }
`;

const Teams = styled.div`
  --gh-logo-size: 16px;
  --gh-logo-radius: 0;
  --gh-logo-font: 0.5rem;
  /* Text-height crests sit next to VS or the live/final score. */
  ${tile} {
    --gh-logo-size: 0.8125rem;
    --gh-logo-font: 0.5rem;
    --gh-logo-radius: 0;
    --gh-logo-ring: none;
    --gh-logo-fill: ${({ theme }) => theme.color.surfaceMuted};
    --gh-logo-ink: ${({ theme }) => theme.color.mutedText};
    grid-area: teams;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    column-gap: 6px;
    min-inline-size: 0;
  }
  /* Desktop cells share the league row; elapsed/final status shares the country row above it. */
  ${table} { --gh-logo-size: 22px; --gh-logo-font: 0.625rem; display: contents; }
`;
const Team = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-inline-size: 0;
  /* Tile: each crest sits next to the score; the home name packs towards it from the left. */
  ${tile} {
    grid-column: 3;
    gap: 4px;
    &[data-team-side="home"] { grid-column: 1; flex-direction: row-reverse; justify-content: flex-start; }
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
    flex: 0 1 auto;
    font-size: 0.8125rem;
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    line-height: 1.2;
    white-space: nowrap;
    [data-result="loss"] > & { font-weight: ${({ theme }) => theme.typography.weight.medium}; }
    /* Live: only the side ahead keeps the bold name. */
    [data-standing="behind"] > & { font-weight: ${({ theme }) => theme.typography.weight.body}; }
  }
  ${table} {
    white-space: nowrap;
    font-weight: ${({ theme }) => theme.typography.weight.body};
    [data-standing="ahead"] > & { font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  }
`;
const Center = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  ${tile} { grid-column: 2; justify-content: center; gap: 1px; }
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
    font-size: 0.625rem;
    font-weight: 600;
    line-height: 1.3;
  }
  ${table} { grid-column: 5; grid-row: 2; justify-self: center; }
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
  /* A live score is red throughout, dash included. */
  [data-status="live"] &, [data-status="live"] & > span:nth-child(2) { color: ${({ theme }) => theme.color.live.solid}; }
  ${table} { grid-column: 5; grid-row: 2; justify-self: center; }
  /* A score takes the same compact central slot as VS. */
  ${tile} {
    gap: 3px;
    font-size: 0.8125rem;
    line-height: 1.3;
    color: ${({ theme }) => theme.color.text};
    > span:nth-child(2) { color: ${({ theme }) => theme.color.mutedText}; font-size: inherit; }
    > [data-loss] { color: ${({ theme }) => theme.color.mutedText}; }
    [data-status="live"] &, [data-status="live"] & > span:nth-child(2) { color: ${({ theme }) => theme.color.live.solid}; }
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
  ${({ $tone, theme }) => $tone === "final"
    ? css`color: ${theme.color.mutedText}; background: ${theme.color.surfaceMuted};`
    : css`color: ${theme.color.accent.amber.text}; background: ${theme.color.accent.amber.soft};`}
  ${table} { grid-column: 5; grid-row: 1; justify-self: center; }
  /* Tile: plain text under the score; a final whistle muted, a halted match grey. The live minute is in the result tag. */
  ${tile} {
    padding: 0;
    background: none;
    font-size: 0.625rem;
    font-weight: ${({ theme }) => theme.typography.weight.heavy};
    letter-spacing: 0.02em;
    line-height: 1.1;
    color: ${({ theme, $tone }) => $tone === "final" ? theme.color.mutedText : theme.color.outcome.void.text};
  }
`;
const LiveDot = styled.span`
  --gh-live-glow: color-mix(in srgb, ${({ theme }) => theme.color.live.solid} 65%, transparent);
  flex: none;
  inline-size: 6px;
  block-size: 6px;
  border-radius: 50%;
  background: ${({ theme }) => theme.color.live.solid};
  animation: ${glow} 1.6s ease-in-out infinite;
  /* Reduced motion keeps a still halo. */
  @media (prefers-reduced-motion: reduce) { animation: none; box-shadow: 0 0 3px 1px var(--gh-live-glow); }
`;

/** Four inline facts share the selection order used by the Clean ledger slip row. */
const Pick = styled.div<{ $family: MarketFamily }>`
  ${tile} {
    grid-area: pick;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    grid-template-areas: "market pick odds probability";
    align-items: baseline;
    column-gap: 8px;
    min-inline-size: 0;
    padding: 0;
    background: none;
    border: 0;
    line-height: 1.25;
    white-space: nowrap;
    &[data-pick-state="subscriber"] {
      grid-template-columns: auto minmax(0, 1fr) auto;
      grid-template-areas: "market pick probability";
    }
    /* At enlarged text sizes, preserve each fact rather than clipping numeric values. */
    ${narrowTile} {
      column-gap: 5px;
    }
    ${enlargedTile} {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas: "market pick" "odds probability";
      row-gap: 3px;
      &[data-pick-state="subscriber"] { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "market probability" "pick pick"; }
    }
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
    line-height: 1rem;
    > [data-mobile-only] { display: block; }
    > [data-desktop-only] { display: none; }
  }
`;
const MarketName = styled(PickCell)<{ $family: MarketFamily }>`
  grid-column: 1;
  ${tile} {
    grid-area: market;
    overflow: hidden;
    [data-pick-state="none"] > & { display: none; }
    gap: 4px;
    &::before { content: "Mkt"; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.625rem; font-weight: 400; }
    > [data-pick-value] {
      ${ellipsis}
      color: ${({ theme }) => theme.color.text};
      font-size: 0.75rem;
      font-weight: 400;
      line-height: 1.25;
    }
    [data-pick-state="subscriber"] > & > [data-pick-value] { color: ${({ theme }) => theme.color.mutedText}; }
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
const GatedPick = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  grid-column: 2;
  min-inline-size: 0;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  line-height: 1rem;
  > svg { flex: none; }
  > [data-mobile-only] { display: none; }
  ${tile} {
    grid-area: pick;
    color: ${({ theme }) => theme.color.text};
    font-size: 0.6875rem;
    font-weight: ${({ theme }) => theme.typography.weight.medium};
    line-height: 1.25;
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
  > [data-pick-value] {
    max-inline-size: 100%;
    font-size: 0.8125rem;
    font-weight: ${({ theme }) => theme.typography.weight.heavy};
    line-height: 1.25;
  }
  ${tile} {
    grid-area: pick;
    align-items: baseline;
    gap: 4px;
    color: ${({ theme, $available }) => $available ? theme.color.text : theme.color.mutedText};
    &::before { content: "Pick"; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.625rem; font-weight: 400; }
    > [data-pick-value] {
      ${ellipsis}
      color: ${({ theme, $available }) => $available ? theme.color.link : theme.color.mutedText};
      font-size: 0.75rem;
      line-height: 1.25;
    }
    /* Missing predictions keep their reason; unavailable numbers remain explicit dashes. */
    [data-pick-state="none"] & {
      grid-column: 1 / span 2;
      &::before { content: none; }
      > b { flex: none; font-size: 0.6875rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
      > [data-pick-value] {
        font-size: 0.625rem;
        font-weight: ${({ theme }) => theme.typography.weight.medium};
        letter-spacing: 0;
      }
      > b + [data-pick-value]::before { content: "· "; }
      ${enlargedTile} { grid-column: 1 / -1; }
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
/** One price cell serves both the desktop track and the mobile facts row. */
const Odds = styled(PickCell)`
  grid-column: 3;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  ${tile} {
    grid-area: odds; display: flex; align-items: baseline; gap: 4px; font-size: 0.75rem;
    &::before { content: "Odds"; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.625rem; font-weight: 400; }
    [data-pick-state="subscriber"] > & { display: none; }
  }
`;
const Probability = styled(PickCell)`
  grid-column: 4;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  ${tile} {
    grid-area: probability; display: inline-flex; align-items: baseline; gap: 4px;
    &::before { content: "Prob."; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.625rem; font-weight: 400; }
    [data-probability-meter] { display: none; }
  }
`;
const Percent = styled.span`
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  ${tile} { font-size: 0.75rem; }
`;
/** Settled/live states add one compact row; scheduled cards keep the approved three-row shape. */
const Result = styled(OutcomeBadge)`
  /* Bright result tags on both layouts; an unavailable result uses the neutral Void colours. */
  color: ${({ theme, $outcome }) => theme.color.verdict[$outcome === "unavailable" ? "void" : $outcome].text};
  background: ${({ theme, $outcome }) => theme.color.verdict[$outcome === "unavailable" ? "void" : $outcome].fill};
  border-color: ${({ theme, $outcome }) => theme.color.verdict[$outcome === "unavailable" ? "void" : $outcome].border};
  &[data-result-badge="upcoming"] {
    color: ${({ theme }) => theme.color.verdict.upcoming.text};
    background: ${({ theme }) => theme.color.verdict.upcoming.fill};
    border-color: ${({ theme }) => theme.color.verdict.upcoming.border};
  }
  &[data-result-badge="live"] {
    color: ${({ theme }) => theme.color.live.text};
    background: ${({ theme }) => theme.color.live.soft};
    border-color: color-mix(in srgb, ${({ theme }) => theme.color.live.solid} 35%, ${({ theme }) => theme.color.live.soft});
    font-variant-numeric: tabular-nums;
  }
  ${tile} {
    grid-column: 1;
    grid-row: 4;
    justify-self: end;
    align-self: start;
    box-sizing: border-box;
    block-size: 1rem;
    padding: 0 4px;
    gap: 3px;
    font-size: 0.625rem;
    letter-spacing: 0.02em;
    line-height: 1;
    white-space: nowrap;
    > svg { font-size: 0.75rem; }
    &[data-result-badge="unavailable"], &[data-result-badge="upcoming"] { display: none; }
    &[data-result-badge="live"] {
      gap: 5px;
    }
  }
  /* Table: every result badge fills the Result column, so Upcoming, Win, Loss, Pending and Void share one width. */
  ${table} {
    grid-column: 11;
    grid-row: 2;
    justify-self: stretch;
    box-sizing: border-box;
    min-inline-size: 0;
    padding: 3px 4px;
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
    border-radius: ${({ theme }) => theme.phoneCardFrame.radius};
    -webkit-tap-highlight-color: transparent;
    &:active { background: color-mix(in srgb, ${({ theme }) => theme.color.text} 8%, transparent); }
  }
  ${table} {
    position: static;
    display: grid;
    grid-column: 12;
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
type LiveClock = ReturnType<typeof liveClockLabel>;

/** `lead` names the winner of a decided final score (1 home, -1 away), so the losing side's goals can be muted. A live
 * clock is shown in the result tag; here it is only spoken, right after the score. */
function MatchState({ fixture, home, away, lead, clock, messages, snapshot = false }: {
  fixture: FixtureSnapshot; home: string; away: string; lead: number; clock: LiveClock | null; messages: Messages; snapshot?: boolean;
}) {
  const { status, score } = fixture;
  const final = hasFinalScoreStatus(status);
  const scoreline = score && (snapshot || status === "live" || final) ? <>
    <Score aria-hidden="true"><span data-loss={lead < 0 || undefined}>{messages.number(score.home)}</span>
      <span>–</span><span data-loss={lead > 0 || undefined}>{messages.number(score.away)}</span></Score>
    <VisuallyHidden>{messages.text("match.scoreline", { label: messages.text(snapshot ? "match.regulationScoreNote" : final ? "match.finalScore" : "match.liveScore"),
      home, away, homeScore: messages.number(score.home), awayScore: messages.number(score.away) })}</VisuallyHidden>
  </> : <>
    <Versus data-ledger-versus aria-hidden="true">{status === "live" || final ? "–" : <>
      <span data-mobile-only>VS</span><span data-desktop-only>{messages.text("match.versus")}</span>
    </>}</Versus>
    {(status === "live" || final) && <VisuallyHidden>{messages.text(final ? "match.finalScoreUnknown" : "match.scoreUnknown")}</VisuallyHidden>}
  </>;
  if (snapshot) return <Center data-match-state="snapshot">{scoreline}</Center>;
  if (clock) return <Center data-match-state="live">{scoreline}<VisuallyHidden>{clock.spoken}</VisuallyHidden></Center>;
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

function CardTeam({ team, side, name, eager, result, standing }: {
  team: FixtureSnapshot["homeTeam"]; side: "home" | "away"; name: string; eager: boolean; result: TeamResult; standing: TeamStanding;
}) {
  const url = isSafeRemoteImageUrl(team.logoUrl) ? team.logoUrl : undefined;
  return <Team data-team-side={side} data-ledger-home={side === "home" ? "" : undefined} data-ledger-away={side === "away" ? "" : undefined}
    data-result={result ?? undefined} data-standing={standing ?? undefined} aria-label={name}>
    <TeamLogo key={`${team.id}:${url ?? "missing"}`} name={team.name} url={url} eager={eager} />
    <TeamName data-team-name="" title={name}><span data-mobile-only data-ledger-name>{compactTeamName(name)}</span><span data-desktop-only>{name}</span></TeamName>
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

const resultIcon = { correct: <CheckIcon />, incorrect: <CrossIcon />, void: <VoidIcon /> } as const;

/** Only timestamps subscribe to the device clock; the rest of a card stays unchanged. */
function CardKickoff({ kickoff, locale }: { kickoff: FixtureSnapshot["kickoffAt"]; locale: string }) {
  const messages = useMessages(locale);
  return kickoff === null ? <When as="p" data-ledger-kickoff data-kickoff data-kickoff-unknown><KickoffDetails>
    <KickoffDate data-kickoff-date>{messages.text("match.kickoffUnknown")}</KickoffDate>
  </KickoffDetails></When>
    : <When dateTime={toUtcIsoString(kickoff)} title={messages.reportingInstant(kickoff)} data-ledger-kickoff data-kickoff>
      <KickoffDetails>
        <VisuallyHidden>{messages.text("match.kickoff")}: </VisuallyHidden>
        <KickoffDate data-kickoff-date><span data-mobile-only>{messages.shortKickoffDate(kickoff)}</span><span data-desktop-only>{messages.reportingDay(kickoff)}</span></KickoffDate><Dot aria-hidden="true">·</Dot>
        <KickoffTime data-kickoff-time><span data-mobile-only>{messages.shortKickoffTime(kickoff)}</span><span data-desktop-only>{messages.reportingTime(kickoff)}<KickoffZone data-kickoff-zone> {messages.timeZone(kickoff)}</KickoffZone></span></KickoffTime>
      </KickoffDetails>
    </When>;
}

function PredictionCell({ prediction, price, reason, locale, children }: {
  prediction: ReturnType<typeof selectedCardPrediction> | ReturnType<typeof snapshotCardPrediction>;
  price: Pick<NonNullable<ReturnType<typeof selectedCardPrice>>, "price"> | null;
  reason: string | null; locale: string; children: ReactNode;
}) {
  const messages = useMessages(locale);
  const details = prediction && [prediction.item.market.source ? messages.text(`market.source.${prediction.item.market.source}`) : null,
    prediction.provisional ? messages.text("match.provisional") : null,
    prediction.publishedAt !== null ? `${messages.text("match.published")}: ${messages.reportingInstant(prediction.publishedAt)}` : null,
    price ? `${messages.text("details.odds")}: ${price.price}` : null].filter(Boolean).join(" · ");
  return <Prediction $available={prediction !== null} data-prediction={prediction?.item.market.selection ?? "none"}
    data-outcome={prediction?.status ?? "unavailable"} title={details ?? reason ?? undefined}>{children}</Prediction>;
}

/** Only the desktop presentation subscribes to the device timezone, just as CardKickoff does on phones. */
function DesktopCard(props: ComponentProps<typeof DesktopMatchRow>) {
  const messages = useMessages(props.locale);
  return <DesktopMatchRow {...props} messages={messages} />;
}

function MatchCardView({ fixture, gated: requiresAccess = false, analysisSlug, markets, selectedFamily, locale: requestedLocale,
  headingLevel = 2, eagerLogos = false, position, titleNote, startingPriceUgx, offline = false, snapshotPick }: MatchCardProps) {
  const locale = resolveLocale(requestedLocale);
  const messages = createMessages(locale);
  const titleId = `gh-match-${useId()}`;
  const desktop = useContext(MatchCardLayoutContext);
  const eligible = markets && markets.length > 0 ? markets : selectedFamily ? [selectedFamily] : defaultMarkets;
  const gatedForecast = fixture.forecast !== null && "gated" in fixture.forecast ? fixture.forecast : null;
  // Only a published eligible family is locked: forecast null means none was published, and the gated families already
  // name the published markets, so a filter outside them shows the subscriber's no-prediction reason.
  const best = snapshotPick?.family ?? bestCardFamily(fixture, eligible);
  const gated = snapshotPick ? requiresAccess || gatedForecast !== null
    : !isCompletedFixtureStatus(fixture.status) && best !== null && (requiresAccess || gatedForecast !== null);
  const shownFamily = best ?? eligible[0]!;
  const publicChance = gatedForecast?.probabilities.find((entry) => entry.family === shownFamily)?.probability;
  const publicChanceLabel = publicChance === undefined ? "—" : messages.number(publicChance, { style: "percent", maximumFractionDigits: 0 });
  const home = fixture.homeTeam.name?.trim() || messages.text("match.homeUnknown");
  const away = fixture.awayTeam.name?.trim() || messages.text("match.awayUnknown");
  const title = messages.text("match.title", { home, away });
  const competition = fixture.competition.name?.trim() || messages.text("match.competitionUnknown");
  const country = fixture.competition.country?.trim();
  const countryName = countryDisplayName(country);
  const flagUrl = countryFlagUrl(fixture);
  const prediction = offline || gated ? null : snapshotPick ? snapshotCardPrediction(snapshotPick) : selectedCardPrediction(fixture, shownFamily);
  const price = prediction ? snapshotPick ? { price: snapshotPick.odds } : selectedCardPrice(fixture, shownFamily) : null;
  const family = messages.text(`market.family.${shownFamily}`);
  const locked = fixture.cycle?.state === "closed";
  const outcome = prediction?.status ?? "unavailable";
  const result = cardResultStatus(fixture.status, outcome);
  const resultLabel = result === "upcoming" ? messages.text("match.result.upcoming") : result === "unavailable" ? "—"
    : messages.text(result === "correct" ? "match.result.won" : result === "incorrect" ? "match.result.lost" : `outcome.${result}`);
  const percent = prediction && (prediction.probability.labelKey === "probability.percent"
    ? messages.text("probability.percent", { percent: messages.number(prediction.probability.roundedPercent, snapshotPick
      ? { minimumFractionDigits: 1, maximumFractionDigits: 1 } : undefined) })
    : messages.text(prediction.probability.labelKey === "probability.less-than-one" ? "probability.compact.less-than-one" : "probability.compact.more-than-ninety-nine"));
  const selection = prediction?.item.market.selection;
  const final = hasFinalScoreStatus(fixture.status);
  const regulationOnly = final && fixture.status !== "finished-regulation" && fixture.scorePeriod === "regulation";
  const showScore = fixture.score !== null && (fixture.status === "live" || final);
  // Only a decided final score names a winner; a 90-minute score shown for an extra-time or penalties finish does not.
  const decided = showScore && final && !(fixture.scorePeriod === "regulation" && fixture.status !== "finished-regulation");
  const lead = decided ? Math.sign(fixture.score!.home - fixture.score!.away) : 0;
  // A live score bolds the side currently ahead.
  const liveLead = showScore && fixture.status === "live" ? Math.sign(fixture.score!.home - fixture.score!.away) : 0;
  const clock = !offline && fixture.status === "live" ? liveClockLabel(fixture, messages) : null;
  const missing = gated || prediction ? null : noPickReason(fixture);
  const reason = missing ? messages.text(`match.noPickReason.${missing}`) : null;
  const pickState = gated ? "subscriber" : !prediction ? "none" : settledOutcome(outcome) ? "settled" : "open";
  if (desktop) {
    const marketDescription = offline ? "Predictions are unavailable in the saved view."
      : gated ? messages.text("paywall.card")
      : selection ? `${family}: ${predictionDescription(messages, selection)}` : reason ?? undefined;
    const publication = prediction && [prediction.item.market.source ? messages.text(`market.source.${prediction.item.market.source}`) : null,
      prediction.provisional ? messages.text("match.provisional") : null,
      prediction.publishedAt !== null ? `${messages.text("match.published")}: ${messages.reportingInstant(prediction.publishedAt)}` : null].filter(Boolean).join(" · ");
    return <DesktopCard fixtureId={fixture.fixtureId} locale={locale} kickoffAt={fixture.kickoffAt}
      homeTeam={{ name: fixture.homeTeam.name, logoUrl: isSafeRemoteImageUrl(fixture.homeTeam.logoUrl) ? fixture.homeTeam.logoUrl : null }}
      awayTeam={{ name: fixture.awayTeam.name, logoUrl: isSafeRemoteImageUrl(fixture.awayTeam.logoUrl) ? fixture.awayTeam.logoUrl : null }}
      competition={{ name: fixture.competition.name, country: fixture.competition.country,
        logoUrl: isSafeRemoteImageUrl(fixture.competition.logoUrl) ? fixture.competition.logoUrl : null }}
      status={fixture.status} score={showScore || snapshotPick ? fixture.score : null} liveClock={offline ? null : fixture.liveClock ?? null}
      regulationOnly={regulationOnly}
      {...(fixture.score && (showScore || snapshotPick) ? { scoreDescription: messages.text("match.scoreline", {
        label: messages.text(snapshotPick || regulationOnly ? "match.regulationScoreNote" : final ? "match.finalScore" : "match.liveScore"),
        home, away, homeScore: messages.number(fixture.score.home), awayScore: messages.number(fixture.score.away),
      }) } : {})}
      outcome={offline ? "unavailable" : outcome} headingLevel={headingLevel} pickState={pickState}
      {...(position !== undefined ? { position } : {})} {...(titleNote ? { titleNote } : {})}
      {...(!offline ? { analysisHref: matchHref(fixture.fixtureId, analysisSlug, locale) } : {})}
      {...(snapshotPick && fixture.score ? { matchState: "snapshot", savedScore: true } : {})}
      offline={offline} eagerLogos={eagerLogos} {...(!gated && !offline ? { marketFamily: shownFamily } : {})}
      {...(marketDescription ? { marketDescription } : {})}
      market={offline ? <span>Unavailable offline</span> : gated ? <><SubscriberIcon /><span data-subscriber-notice>{messages.text("paywall.locked")}</span></> : <>
        <span data-market-label aria-hidden="true">{compactMarketName(shownFamily)}</span>
        <strong data-pick-label data-no-pick={missing ?? undefined} title={publication || undefined}>
          {selection ? <span data-pick-selection>{predictionLabel(messages, selection)}</span> : messages.text("match.noPick")}
        </strong>
      </>}
      odds={<span data-card-odds data-pick-price={prediction ? "" : undefined}>{price?.price ?? "—"}</span>}
      probability={gated ? <span data-public-probability>{publicChanceLabel}</span> : <span data-pick-value>{prediction ? percent : "—"}</span>}
      {...(offline ? { statusContent: <span data-match-label>Saved</span> } : !prediction && fixture.status !== "live"
        ? { statusContent: <><span data-match-label>{messages.text(`match.status.${fixture.status}`)}</span><span data-outcome-label>{resultLabel}</span></> } : {})}
      details={offline ? <VisuallyHidden>Predictions are unavailable in the saved view.</VisuallyHidden>
        : gated ? <SubscriberNotice locale={locale} kind="card" /> : !prediction && reason ? <span data-no-pick-reason>{reason}</span> : null}
    />;
  }
  return <Card tabIndex={-1} aria-labelledby={titleId} data-fixture-id={fixture.fixtureId} data-market={gated ? undefined : shownFamily}
    data-status={fixture.status} data-mobile-design="clean-ledger">
    <VisuallyHidden as={`h${headingLevel}`} id={titleId}>{titleNote ? `${title}, ${titleNote}` : title}</VisuallyHidden>
    <Meta data-ledger-meta>
      {position !== undefined && <Index $wrap={position > 9_999} aria-hidden="true" data-row-number>{messages.number(position)}</Index>}
      <CardKickoff kickoff={fixture.kickoffAt} locale={locale} />
      <League title={country ?? undefined} data-ledger-competition>
        <CountryDetails data-country data-ledger-country aria-hidden="true">
          {offline ? <FlagFallback><FlagIcon /></FlagFallback> : <CountryFlag key={`${country}:${flagUrl}`} url={flagUrl} country={country} />}
          <CountryName data-country-name title={countryName || undefined}><span data-mobile-only>{countryCode(country) || "–"}</span><span data-desktop-only>{countryShortName(country) || "–"}</span></CountryName>
        </CountryDetails>
        <CompetitionLogo key={fixture.competition.logoUrl} url={fixture.competition.logoUrl} /><LeagueName title={competition}><span data-mobile-only data-ledger-name>{compactLeagueName(competition)}</span><span data-desktop-only>{competition}</span></LeagueName>
        {country && <VisuallyHidden>, {country}</VisuallyHidden>}</League>
    </Meta>
    <Teams data-ledger-teams>
      <CardTeam team={fixture.homeTeam} side="home" name={home} eager={eagerLogos} result={lead > 0 ? "win" : lead < 0 ? "loss" : null}
        standing={liveLead > 0 ? "ahead" : liveLead < 0 ? "behind" : null} />
      <MatchState fixture={fixture} home={home} away={away} lead={lead} clock={clock} messages={messages} snapshot={snapshotPick !== undefined} />
      <CardTeam team={fixture.awayTeam} side="away" name={away} eager={eagerLogos} result={lead < 0 ? "win" : lead > 0 ? "loss" : null}
        standing={liveLead < 0 ? "ahead" : liveLead > 0 ? "behind" : null} />
    </Teams>
    <Pick $family={shownFamily} data-pick-state={pickState} data-result={result}>
      <MarketName $family={shownFamily} aria-hidden={gated ? undefined : true}>
        <span data-pick-value="" data-mobile-only="">{gated ? messages.text("paywall.locked") : compactMarketName(shownFamily)}</span>
        <span data-pick-value="" data-desktop-only="">{gated ? messages.text("paywall.lockedMarket") : family}</span>
      </MarketName>
      {offline ? <PredictionCell prediction={null} price={null} reason="Predictions are unavailable in the saved view." locale={locale}>
        <PickShort $family={shownFamily} $available={false}><span data-pick-value="">Unavailable offline</span></PickShort>
        <Odds aria-hidden="true">—</Odds><Probability aria-hidden="true"><Percent>—</Percent></Probability>
      </PredictionCell> : gated ? <><GatedPick><SubscriberIcon />
        <span data-subscriber-notice data-mobile-only="">{startingPriceUgx
          ? messages.text("paywall.unlockPredictionPrice", { price: messages.number(startingPriceUgx) })
          : messages.text("paywall.unlockPrediction")}</span>
        <span data-desktop-only=""><SubscriberNotice locale={locale} kind="card" /></span>
      </GatedPick>
        <Odds aria-hidden="true">—</Odds>
        <Probability aria-label={messages.text("details.probability")}><Percent data-public-probability>{publicChanceLabel}</Percent></Probability>
      </> : <PredictionCell prediction={prediction} price={price} reason={reason} locale={locale}>
        <PickShort $family={shownFamily} $available={prediction !== null} aria-hidden="true" data-no-pick={missing ?? undefined}>
          {selection ? <span data-pick-value=""><span data-pick-selection="" title={predictionDescription(messages, selection)}>{predictionLabel(messages, selection)}</span></span> : <>
            <b data-mobile-only="">{messages.text("match.noPick")}</b>
            <span data-pick-value="" data-mobile-only="">{messages.text(`match.noPickReason.short.${missing!}`)}</span>
            <span data-pick-value="" data-desktop-only="">{messages.text("match.noPick")}</span>
          </>}
        </PickShort>
        <Odds aria-hidden="true" data-card-odds data-pick-price={prediction ? "" : undefined}>{price?.price ?? "—"}</Odds>
        <Probability aria-hidden="true">
          {prediction && <ProbabilityBar $family={shownFamily} data-probability-meter=""><span style={{ inlineSize: `${Math.max(2, prediction.probability.roundedPercent)}%` }} /></ProbabilityBar>}
          <Percent data-pick-value="">{prediction ? percent : "—"}</Percent>
        </Probability>
        {prediction && selection ? <VisuallyHidden>{messages.text("match.pickLabel", { market: family, selection: predictionDescription(messages, selection),
          probability: messages.text(prediction.probability.labelKey, { percent: messages.number(prediction.probability.roundedPercent) }) })}
          {locked && `. ${messages.text("match.lockedPrediction")}`}. {messages.text("match.outcome")}: {resultLabel}
        </VisuallyHidden> : <VisuallyHidden>{messages.text("match.noPickLabel", { market: family })}: {reason}
          {result === "upcoming" && `. ${messages.text("match.outcome")}: ${resultLabel}`}</VisuallyHidden>}
      </PredictionCell>}
      {prediction && <VisuallyHidden>{messages.text("details.odds")}: {price?.price ?? messages.text("outcome.unavailable")}</VisuallyHidden>}
    </Pick>
    <Result aria-hidden="true" $outcome={offline ? "unavailable" : result === "upcoming" ? "pending" : result} data-result-badge={offline ? "saved" : clock ? "live" : result}
      data-live-minute={clock ? clock.minute ?? "" : undefined}>
      {offline ? <span>Saved</span> : clock ? <><LiveDot /><span data-pick-value="">{clock.visible}</span></> : <>
        {result !== "upcoming" && settledOutcome(result) && resultIcon[result as keyof typeof resultIcon]}
        <span data-pick-value="">{resultLabel}</span>
      </>}
    </Result>
    {!offline && <Open href={matchHref(fixture.fixtureId, analysisSlug, locale)} prefetch={false}>
      <VisuallyHidden>{messages.text("match.analysisLabel", { home, away })}</VisuallyHidden><ChevronIcon />
    </Open>}
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
