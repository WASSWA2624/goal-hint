"use client";

import { SubscriberIcon } from "@/components/ui/icons";
import { SubscriberNotice } from "@/components/members/subscriber-notice";

import Link from "@/components/navigation/navigation-link";
import { memo, useId, useState, type ReactNode } from "react";
import styled, { css, keyframes } from "styled-components";
import { toUtcIsoString } from "@/domain/calendar";
import { countryCode, countryDisplayName, countryShortName } from "@/domain/country-code";
import { countryFlagAsset } from "@/domain/country-flag";
import { bestCardFamily, noPickReason } from "@/domain/feed-presentation";
import { defaultMarkets } from "@/domain/feed-query";
import type { FixtureSnapshot } from "@/domain/fixture-snapshot";
import { subscriberHref } from "@/domain/subscriber-navigation";
import { cardResultStatus, hasFinalScoreStatus, sameCardFixture, selectedCardPrediction, selectedCardPrice } from "@/domain/match-card";
import type { MarketFamily } from "@/domain/markets";
import { matchHref } from "@/domain/navigation";
import { predictionLabel } from "@/domain/prediction-label";
import { isSafeRemoteImageUrl } from "@/domain/remote-image";
import { createMessages, type Messages } from "@/i18n/messages";
import { useMessages } from "@/i18n/use-messages";
import { resolveLocale } from "@/i18n/locales";
import { lightTheme, media, phoneCardFrame, type OutcomeTone } from "@/styles/theme";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { CheckIcon, ChevronIcon, CrossIcon, FlagIcon, GlobeIcon, TrophyIcon, VoidIcon } from "./match-icons";
import { MarketGlyph } from "./market-glyph";
import { matchTableColumns, matchTableGap } from "./match-columns";
import { TeamLogo } from "./team-logo";
import { providerImageSource } from "@/components/ui/provider-image";
import { OutcomeBadge, PredictionOdds, ProbabilityBar } from "./prediction-presentation";

export type MatchCardProps = {
  fixture: FixtureSnapshot;
  /** Also gates unpublished fixtures, whose forecast has no wire variant to carry this state. */
  gated?: boolean;
  signedIn?: boolean;
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
const tileRadius = phoneCardFrame.radius;
/** Owner decision (2026-10-25): phone tiles always use design 09's light palette, so white cards stand out on a dark
 * page too; the desktop table follows the theme. Tile rules take their colours from here, never from the theme. */
const light = lightTheme.color;
/** A locked panel's dashed edge, and the rule between the odds and the chance: the control border or the market's colour
 * softened towards the card surface. */
const dashedBorder = `color-mix(in srgb, ${light.controlBorder} 55%, ${light.surface})`;
const rule = ({ $family, $locked }: { $family: MarketFamily; $locked: boolean }) =>
  `color-mix(in srgb, ${$locked ? light.controlBorder : light.market[$family].solid} 30%, ${light.surface})`;
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
  /* Tile ("Pick Panel"): league and kickoff with a fixed-width result tag beside them, the teams mirrored around the
   * score, then the pick panel: market icon, market and pick, and the odds and chance in a box. */
  ${tile} {
    container: match-card / inline-size;
    font-family: ${({ theme }) => theme.typography.family};
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas: "meta result" "teams teams" "pick pick";
    gap: 8px;
    padding: 10px 12px;
    color: ${light.text};
    background: ${light.surface};
    /* The lifted shadow is drawn by the list item: its content-visibility would clip a shadow drawn here. */
    border: ${({ theme }) => theme.border.width} solid ${phoneCardFrame.border};
    border-radius: ${tileRadius};
    &:focus-visible { outline-color: ${light.focus}; }
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
  ${tile} { ${media.hover} { &:hover { background: ${light.rowHover}; } } }
`;

/** Tile: one quiet line, flag and bold league then the kickoff date and time; the result tag sits beside it. A long
 * league shortens first. When enlarged text leaves the tile narrow, the kickoff wraps under the league instead and the
 * dot between them is dropped (the threshold is in rem, so it follows the root text size). */
const narrowTile = "@container match-card (max-width: 18rem)";
const Meta = styled.header`
  ${tile} {
    grid-area: meta;
    display: flex;
    align-items: center;
    gap: 2px 6px;
    min-inline-size: 0;
    min-block-size: 1.25rem;
    color: ${light.mutedText};
    font-size: ${({ theme }) => theme.typography.scale.secondary};
    font-weight: ${({ theme }) => theme.typography.weight.body};
    line-height: 1rem;
    white-space: nowrap;
    ${narrowTile} { flex-wrap: wrap; }
  }
  ${table} { display: contents; }
`;
const MetaDot = styled.span`
  display: none;
  ${tile} {
    display: inline;
    flex: none;
    ${narrowTile} { display: none; }
  }
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
  ${tile} { flex: 0 1 auto; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
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
  /* Tile: the flag leads the muted league name; the crest is left to the details page. */
  ${tile} {
    flex: 0 1 auto;
    gap: 6px;
    color: inherit;
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
  /* Tile: an upcoming kickoff is the card's state, so only its clock stands out. */
  ${tile} {
    [data-status="scheduled"] & { color: ${light.text}; font-weight: ${({ theme }) => theme.typography.weight.heavy}; }
  }
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
  ${tile} { color: ${light.mutedText}; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
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
  /* One line: a long recognized country uses its short form; anything still too wide ends in an ellipsis. */
  > [data-country-name] { flex: 1; ${ellipsis} }
  ${tile} { color: ${light.mutedText}; }
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
  /* Tile: home and away mirrored around the score (or a boxed vs) with its state beneath. Initials sit in a soft ringed
   * disc, loaded crests keep their own shape. */
  ${tile} {
    --gh-logo-size: 1.75rem;
    --gh-logo-font: ${({ theme }) => theme.typography.scale.caption};
    --gh-logo-radius: 50%;
    --gh-logo-ring: inset 0 0 0 1.5px ${light.border};
    --gh-logo-fill: ${light.surfaceMuted};
    --gh-logo-ink: ${light.mutedText};
    grid-area: teams;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    column-gap: 6px;
    min-inline-size: 0;
    min-block-size: 2rem;
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
    gap: 6px;
    &[data-team-side="home"] { grid-column: 1; flex-direction: row-reverse; }
    &[data-result="loss"] { color: ${light.mutedText}; }
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
    font-size: 0.875rem;
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
  ${tile} { grid-column: 2; justify-content: center; gap: 2px; min-inline-size: 2.75rem; }
  ${table} { display: contents; }
`;
const Versus = styled.span`
  color: ${({ theme }) => theme.color.mutedText};
  ${tile} {
    display: grid;
    place-items: center;
    box-sizing: border-box;
    min-inline-size: 2.125rem;
    block-size: 1.5rem;
    padding-inline: 4px;
    color: ${light.mutedText};
    background: ${light.page};
    border: ${({ theme }) => theme.border.width} solid ${light.border};
    border-radius: ${({ theme }) => theme.border.radius};
    font-size: ${({ theme }) => theme.typography.scale.secondary};
    font-weight: ${({ theme }) => theme.typography.weight.heavy};
    line-height: 1;
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
  /* Tile: one large line between the teams, the live minute beneath it in red; the losing side's goals are muted. */
  ${tile} {
    gap: 5px;
    font-size: 1.375rem;
    line-height: 1.625rem;
    color: ${light.text};
    > span:nth-child(2) { color: ${light.mutedText}; font-size: 1rem; }
    > [data-loss] { color: ${light.mutedText}; }
    [data-status="live"] &, [data-status="live"] & > span:nth-child(2) { color: ${light.live.solid}; }
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
    font-size: ${({ theme }) => theme.typography.scale.secondary};
    font-weight: ${({ theme }) => theme.typography.weight.heavy};
    letter-spacing: 0.02em;
    line-height: 0.875rem;
    color: ${({ $tone }) => $tone === "final" ? light.mutedText : light.outcome.void.text};
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
  ${tile} { --gh-live-glow: color-mix(in srgb, ${light.live.solid} 65%, transparent); background: ${light.live.solid}; }
`;

/** Tile: the pick panel under the teams, tinted in the market's colour: the market icon, the market over the pick, then
 * the odds and chance in a box. A locked pick gets a neutral dashed panel with its public chance and a subscribe line;
 * no prediction shows "No prediction · Too early" beside a clock. The market and pick shorten first, so the numbers stay whole. */
const Pick = styled.div<{ $family: MarketFamily }>`
  ${tile} {
    grid-area: pick;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas: "glyph market numbers" "glyph pick numbers";
    align-items: center;
    column-gap: 10px;
    min-inline-size: 0;
    padding: 6px 7px 6px 9px;
    background: ${({ $family }) => light.market[$family].soft};
    border: ${({ theme }) => theme.border.width} solid transparent;
    border-radius: ${({ theme }) => theme.border.radius};
    line-height: 1.25;
    white-space: nowrap;
    &[data-pick-state="subscriber"] {
      grid-template-areas: "glyph market numbers" "glyph pick numbers" "hint hint hint";
      background: ${light.surfaceMuted};
      border: ${({ theme }) => theme.border.width} dashed ${dashedBorder};
    }
    &[data-pick-state="none"] {
      background: ${light.page};
      border: ${({ theme }) => theme.border.width} dashed ${light.border};
    }
    /* Enlarged text: the numbers box takes its own row, so the pick keeps its width and nothing is clipped. */
    ${narrowTile} {
      grid-template-columns: auto minmax(0, 1fr);
      grid-template-areas: "glyph market" "glyph pick" "numbers numbers";
      &[data-pick-state="subscriber"] { grid-template-areas: "glyph market" "glyph pick" "numbers numbers" "hint hint"; }
    }
  }
  ${table} { display: grid; grid-column: 7 / span 3; grid-row: 2; grid-template-columns: subgrid; align-items: center; }
`;
const CardGlyph = styled(MarketGlyph)`
  display: none;
  ${tile} { display: block; grid-area: glyph; }
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
    > [data-pick-value] {
      ${ellipsis}
      color: ${({ $family }) => light.market[$family].text};
      font-size: ${({ theme }) => theme.typography.scale.secondary};
      font-weight: ${({ theme }) => theme.typography.weight.bold};
      line-height: 0.9375rem;
    }
    [data-pick-state="subscriber"] > & > [data-pick-value] { color: ${light.mutedText}; }
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
  ${tile} {
    grid-area: pick;
    color: ${light.text};
    font-size: 1rem;
    font-weight: ${({ theme }) => theme.typography.weight.heavy};
    line-height: 1.25rem;
    > svg { display: none; }
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
    gap: 6px;
    color: ${({ $available }) => $available ? light.text : light.mutedText};
    > [data-pick-value] {
      ${ellipsis}
      color: ${({ $family, $available }) => $available ? light.market[$family].text : light.mutedText};
      font-size: 1rem;
      letter-spacing: -0.01em;
      line-height: 1.25rem;
    }
    [data-pick-odds] { display: none; }
    /* No prediction: "No prediction · Too early" on one line, centred beside the clock. */
    [data-pick-state="none"] & {
      grid-row: 1 / -1;
      > b { flex: none; font-size: 0.9375rem; font-weight: ${({ theme }) => theme.typography.weight.heavy}; }
      > [data-pick-value] {
        font-size: ${({ theme }) => theme.typography.scale.body};
        font-weight: ${({ theme }) => theme.typography.weight.medium};
        letter-spacing: 0;
        &::before { content: "· "; }
      }
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
  /* Tile: the numbers box shows the probability instead. */
  ${tile} { display: none; }
`;
const Percent = styled.span`
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
`;
/** Tile only: the shown pick's odds and chance side by side, each over its caption, in a white box split by a thin
 * rule in the market's colour; a locked pick shows only its public chance. */
const PickNumbers = styled.span<{ $family: MarketFamily; $locked: boolean }>`
  display: none;
  ${tile} {
    grid-area: numbers;
    display: flex;
    background: ${light.surface};
    border-radius: ${({ theme }) => theme.border.radius};
    ${narrowTile} { justify-self: start; margin-block-start: 6px; }
    > span {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-inline-size: 3.5rem;
      padding: 3px 6px;
    }
    > span + span {
      background: linear-gradient(${rule}, ${rule}) left center / 1px calc(100% - 12px) no-repeat;
    }
    [data-number] {
      color: ${light.text};
      font-size: 1rem;
      font-weight: ${({ theme }) => theme.typography.weight.heavy};
      line-height: 1.25rem;
      font-variant-numeric: tabular-nums;
    }
    [data-caption] {
      color: ${({ $family, $locked }) => $locked ? light.mutedText : light.market[$family].text};
      font-size: ${({ theme }) => theme.typography.scale.caption};
      font-weight: ${({ theme }) => theme.typography.weight.heavy};
      letter-spacing: 0.06em;
      line-height: 0.8125rem;
      text-transform: uppercase;
    }
  }
`;
/** Tile only: the whole locked card already opens subscribing, so this line names where the tap goes. */
const SubscribeHint = styled.span`
  display: none;
  ${tile} {
    grid-area: hint;
    display: flex;
    align-items: center;
    gap: 4px;
    margin-block-start: 6px;
    padding-block-start: 6px;
    border-block-start: ${({ theme }) => theme.border.width} solid ${light.border};
    color: ${light.link};
    font-size: ${({ theme }) => theme.typography.scale.body};
    font-weight: ${({ theme }) => theme.typography.weight.heavy};
    > svg { flex: none; font-size: 0.875rem; }
  }
`;
/** Tile: the verdict sits beside the meta line as a solid tag (an outlined one while the match is upcoming); every
 * state shares one width, so the tags line up down the feed. The table keeps it in the Result column. While the match
 * is live the tag shows the glowing dot and minute instead. */
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
    grid-area: result;
    justify-self: end;
    align-self: start;
    box-sizing: border-box;
    inline-size: 5.25rem;
    block-size: 1.25rem;
    padding: 0 4px;
    gap: 3px;
    font-size: ${({ theme }) => theme.typography.scale.caption};
    letter-spacing: 0.02em;
    line-height: 1;
    white-space: nowrap;
    > svg { font-size: 0.75rem; }
    &[data-result-badge="unavailable"] { display: none; }
    &[data-result-badge="live"] {
      gap: 5px;
      color: ${light.live.text};
      background: ${light.live.soft};
      border-color: color-mix(in srgb, ${light.live.solid} 35%, ${light.live.soft});
    }
  }
  /* Table: every result badge fills the Result column, so Upcoming, Win, Loss, Pending and Void share one width. */
  ${table} {
    grid-column: 10;
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
    border-radius: ${tileRadius};
    -webkit-tap-highlight-color: transparent;
    &:active { background: color-mix(in srgb, ${light.text} 8%, transparent); }
    &:focus-visible { outline-color: ${light.focus}; }
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
type LiveClock = ReturnType<typeof liveClockLabel>;

/** `lead` names the winner of a decided final score (1 home, -1 away), so the losing side's goals can be muted. A live
 * clock is shown in the result tag; here it is only spoken, right after the score. */
function MatchState({ fixture, home, away, lead, clock, messages }: {
  fixture: FixtureSnapshot; home: string; away: string; lead: number; clock: LiveClock | null; messages: Messages;
}) {
  const { status, score } = fixture;
  const final = hasFinalScoreStatus(status);
  const scoreline = score && (status === "live" || final) ? <>
    <Score aria-hidden="true"><span data-loss={lead < 0 || undefined}>{messages.number(score.home)}</span>
      <span>–</span><span data-loss={lead > 0 || undefined}>{messages.number(score.away)}</span></Score>
    <VisuallyHidden>{messages.text("match.scoreline", { label: messages.text(final ? "match.finalScore" : "match.liveScore"),
      home, away, homeScore: messages.number(score.home), awayScore: messages.number(score.away) })}</VisuallyHidden>
  </> : <>
    <Versus aria-hidden="true">{status === "live" || final ? "–" : messages.text("match.versus")}</Versus>
    {(status === "live" || final) && <VisuallyHidden>{messages.text(final ? "match.finalScoreUnknown" : "match.scoreUnknown")}</VisuallyHidden>}
  </>;
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
  return <Team data-team-side={side} data-result={result ?? undefined} data-standing={standing ?? undefined}>
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

function MatchCardView({ fixture, gated: requiresAccess = false, signedIn = false, analysisSlug, markets, selectedFamily, locale: requestedLocale,
  headingLevel = 2, eagerLogos = false, position, titleNote }: MatchCardProps) {
  const locale = resolveLocale(requestedLocale);
  const messages = createMessages(locale);
  const titleId = `gh-match-${useId()}`;
  const eligible = markets && markets.length > 0 ? markets : selectedFamily ? [selectedFamily] : defaultMarkets;
  const gatedForecast = fixture.forecast !== null && "gated" in fixture.forecast ? fixture.forecast : null;
  const gated = !hasFinalScoreStatus(fixture.status) && (requiresAccess || gatedForecast !== null);
  const shownFamily = bestCardFamily(fixture, eligible) ?? eligible[0]!;
  const publicChance = gatedForecast?.probabilities.find((entry) => entry.family === shownFamily)?.probability;
  const publicChanceLabel = publicChance === undefined ? "—" : messages.number(publicChance, { style: "percent", maximumFractionDigits: 0 });
  const home = fixture.homeTeam.name?.trim() || messages.text("match.homeUnknown");
  const away = fixture.awayTeam.name?.trim() || messages.text("match.awayUnknown");
  const title = messages.text("match.title", { home, away });
  const competition = fixture.competition.name?.trim() || messages.text("match.competitionUnknown");
  const country = fixture.competition.country?.trim();
  const countryName = countryDisplayName(country);
  const flagUrl = countryFlagUrl(fixture);
  const prediction = gated ? null : selectedCardPrediction(fixture, shownFamily);
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
  // A live score bolds the side currently ahead.
  const liveLead = showScore && fixture.status === "live" ? Math.sign(fixture.score!.home - fixture.score!.away) : 0;
  const clock = fixture.status === "live" ? liveClockLabel(fixture, messages) : null;
  const missing = gated || prediction ? null : noPickReason(fixture);
  const reason = missing ? messages.text(`match.noPickReason.${missing}`) : null;
  const pickState = gated ? "subscriber" : !prediction ? "none" : settledOutcome(outcome) ? "settled" : "open";
  return <Card tabIndex={-1} aria-labelledby={titleId} data-fixture-id={fixture.fixtureId} data-market={gated ? undefined : shownFamily}
    data-status={fixture.status}>
    <VisuallyHidden as={`h${headingLevel}`} id={titleId}>{titleNote ? `${title}, ${titleNote}` : title}</VisuallyHidden>
    <Meta>
      {position !== undefined && <Index $wrap={position > 9_999} aria-hidden="true" data-row-number>{messages.number(position)}</Index>}
      <League title={country ?? undefined}>
        <CountryDetails data-country aria-hidden="true">
          <CountryFlag key={`${country}:${flagUrl}`} url={flagUrl} country={country} />
          <CountryName data-country-name title={countryName || undefined}>{countryShortName(country) || "–"}</CountryName>
        </CountryDetails>
        <CompetitionLogo key={fixture.competition.logoUrl} url={fixture.competition.logoUrl} /><LeagueName title={competition}>{competition}</LeagueName>
        {country && <VisuallyHidden>, {country}</VisuallyHidden>}</League>
      <MetaDot aria-hidden="true">·</MetaDot>
      <CardKickoff kickoff={fixture.kickoffAt} locale={locale} />
    </Meta>
    <Teams>
      <CardTeam team={fixture.homeTeam} side="home" name={home} eager={eagerLogos} result={lead > 0 ? "win" : lead < 0 ? "loss" : null}
        standing={liveLead > 0 ? "ahead" : liveLead < 0 ? "behind" : null} />
      <MatchState fixture={fixture} home={home} away={away} lead={lead} clock={clock} messages={messages} />
      <CardTeam team={fixture.awayTeam} side="away" name={away} eager={eagerLogos} result={lead < 0 ? "win" : lead > 0 ? "loss" : null}
        standing={liveLead < 0 ? "ahead" : liveLead > 0 ? "behind" : null} />
    </Teams>
    <Pick $family={shownFamily} data-pick-state={pickState} data-result={result}>
      <CardGlyph kind={gated ? "locked" : prediction ? shownFamily : "none"} />
      <MarketName $family={shownFamily} aria-hidden={gated ? undefined : true}>
        <span data-pick-value="" data-mobile-only="">{gated ? messages.text("paywall.lockedMarket") : family}</span>
        <span data-pick-value="" data-desktop-only="">{gated ? messages.text("paywall.lockedMarket") : family}</span>
      </MarketName>
      {gated ? <><GatedPick><SubscriberIcon /><SubscriberNotice locale={locale} kind="card" /></GatedPick>
        <Probability aria-label={messages.text("details.probability")}><Percent data-public-probability>{publicChanceLabel}</Percent></Probability>
        {/* On phones this box is the only copy of the public chance, so it stays readable; the desktop hides it. */}
        {publicChance !== undefined && <PickNumbers $family={shownFamily} $locked>
          <span><VisuallyHidden>{messages.text("details.probability")}: </VisuallyHidden><span data-number="">{publicChanceLabel}</span>
            <span data-caption="" aria-hidden="true">{messages.text("match.chance")}</span></span>
        </PickNumbers>}
        <SubscribeHint aria-hidden="true">{messages.text("match.subscribeToSee")}<ChevronIcon /></SubscribeHint>
      </> : <PredictionCell prediction={prediction} price={price} reason={reason} locale={locale}>
        <PickShort $family={shownFamily} $available={prediction !== null} aria-hidden="true" data-no-pick={missing ?? undefined}>
          {selection ? <span data-pick-value=""><span data-pick-selection="">{predictionLabel(messages, selection)}</span>
            <PredictionOdds odds={price?.price} />
          </span> : <>
            <b data-mobile-only="">{messages.text("match.noPick")}</b>
            <span data-pick-value="" data-mobile-only="">{messages.text(`match.noPickReason.short.${missing!}`)}</span>
            <span data-pick-value="" data-desktop-only="">{messages.text("match.noPick")}</span>
          </>}
        </PickShort>
        {prediction && <PickNumbers $family={shownFamily} $locked={false} aria-hidden="true">
          {price && <span><span data-number="" data-pick-price="">@&#8239;{price.price}</span><span data-caption="">{messages.text("details.odds")}</span></span>}
          <span><span data-number="">{percent}</span><span data-caption="" data-mobile-only="">{messages.text("match.likely")}</span></span>
        </PickNumbers>}
        <Probability aria-hidden="true">
          {prediction && <ProbabilityBar $family={shownFamily} data-probability-meter=""><span style={{ inlineSize: `${Math.max(2, prediction.probability.roundedPercent)}%` }} /></ProbabilityBar>}
          <Percent data-pick-value="">{prediction ? percent : "—"}</Percent>
        </Probability>
        {prediction && selection ? <VisuallyHidden>{messages.text("match.pickLabel", { market: family, selection: predictionLabel(messages, selection),
          probability: messages.text(prediction.probability.labelKey, { percent: messages.number(prediction.probability.roundedPercent) }) })}
          {locked && `. ${messages.text("match.lockedPrediction")}`}. {messages.text("match.outcome")}: {resultLabel}
        </VisuallyHidden> : <VisuallyHidden>{messages.text("match.noPickLabel", { market: family })}: {reason}
          {result === "upcoming" && `. ${messages.text("match.outcome")}: ${resultLabel}`}</VisuallyHidden>}
      </PredictionCell>}
      {prediction && <VisuallyHidden>{messages.text("details.odds")}: {price?.price ?? messages.text("outcome.unavailable")}</VisuallyHidden>}
    </Pick>
    <Result aria-hidden="true" $outcome={result === "upcoming" ? "pending" : result} data-result-badge={clock ? "live" : result}
      data-live-minute={clock ? clock.minute ?? "" : undefined}>
      {clock ? <><LiveDot /><span data-pick-value="">{clock.visible}</span></> : <>
        {result !== "upcoming" && settledOutcome(result) && resultIcon[result as keyof typeof resultIcon]}
        <span data-pick-value="">{resultLabel}</span>
      </>}
    </Result>
    <Open href={gated ? subscriberHref(signedIn, matchHref(fixture.fixtureId, analysisSlug, locale)) : matchHref(fixture.fixtureId, analysisSlug, locale)} prefetch={false}>
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
