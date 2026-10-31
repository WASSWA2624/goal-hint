"use client";

import { SubscriberIcon } from "@/components/ui/icons";
import { SubscriberNotice } from "@/components/members/subscriber-notice";

import Link from "@/components/navigation/navigation-link";
import { memo, useContext, useId, useState, type ComponentProps, type ReactNode } from "react";
import styled, { css } from "styled-components";
import { toUtcIsoString } from "@/domain/calendar";
import { countryCode, countryDisplayName, countryShortName } from "@/domain/country-code";
import { countryFlagAsset } from "@/domain/country-flag";
import { compactLeagueName, compactMarketName } from "@/domain/compact-fixture-label";
import { bestCardFamily, noPickReason } from "@/domain/feed-presentation";
import { defaultMarkets } from "@/domain/feed-query";
import type { FixtureSnapshot } from "@/domain/fixture-snapshot";
import { cardResultStatus, hasFinalScoreStatus, sameCardFixture, selectedCardPrediction, selectedCardPrice, snapshotCardPrediction, type CardSnapshotPick } from "@/domain/match-card";
import { liveClockLabel } from "@/domain/match-clock";
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
import { ChevronIcon, FlagIcon, GlobeIcon, TrophyIcon } from "./match-icons";
import { teamStackStyles } from "./team-stack-styles";
import { matchTableColumns, matchTableGap } from "./match-columns";
import { TeamLogo } from "./team-logo";
import { providerImageSource } from "@/components/ui/provider-image";
import { ProbabilityBar } from "./prediction-presentation";
import { DesktopMatchRow } from "./desktop-match-row";
import { MatchCardLayoutContext } from "./match-card-layout";
import { MatchStatus } from "./match-status";
import { MatchNumber } from "./match-number";
import { MatchClockText, ScoreFigures, Scoreline } from "./score-presentation";

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
type StateTone = "final" | "halted" | "live";
const countryFlagUrl = (fixture: FixtureSnapshot) => fixture.competition.countryFlagUrl ?? null;
const tile = media.belowDesktop, table = media.desktop, wideTable = media.wide;
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
  transition: background-color ${({ theme }) => theme.motion.surface} ${({ theme }) => theme.motion.easing}, box-shadow ${({ theme }) => theme.motion.surface} ${({ theme }) => theme.motion.easing};
  &:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: calc(-1 * ${({ theme }) => theme.border.focusWidth});
  }
  @media (prefers-reduced-motion: reduce) { transition: none; }
  [data-mobile-only] { display: none; }
  /* The selected phone layout is also used by the slip's original selections. */
  ${tile} {
    ${teamStackStyles}
    container: match-card / inline-size;
    font-family: ${({ theme }) => theme.typography.family};
    /* Match and slip tiles share the active theme's shared, shadow-free phone frame. */
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.phoneCardFrame.border};
    border-radius: ${({ theme }) => theme.radius.none};
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
  border-radius: ${({ theme }) => theme.radius.small};
  box-shadow: 0 0 0 0.5px ${({ theme }) => theme.color.border};
  ${tile} { inline-size: 0.9375rem; block-size: 0.625rem; margin-inline-end: 3px; border-radius: ${({ theme }) => theme.radius.none}; box-shadow: none; }
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
  ${table} { --gh-logo-size: 22px; --gh-logo-font: 0.625rem; display: contents; }
`;
const Team = styled.div`
  display: flex; align-items: center; gap: 6px; min-inline-size: 0;
  ${tile} { &[data-result="loss"] { color: ${({ theme }) => theme.color.mutedText}; } }
  ${table} {
    grid-column: 6; grid-row: 2; gap: 8px;
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
  display: flex; flex-direction: column; align-items: center; gap: 2px;
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
  gap: 4px;
  padding: 0 4px;
  font-size: 0.5625rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  line-height: 1.6;
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
    font-size: 0.625rem;
    font-weight: ${({ theme }) => theme.typography.weight.heavy};
    letter-spacing: 0.02em;
    line-height: 1.1;
    color: ${({ theme, $tone }) => $tone === "live" ? theme.color.live.text : $tone === "final" ? theme.color.mutedText : theme.color.outcome.void.text};
    ${({ $tone }) => $tone !== "halted" && css`transform: translateY(-2px);`}
  }
`;

/** Mobile forecast geometry is shared; the original desktop fallback retains its subgrid. */
const Pick = styled.div<{ $family: MarketFamily }>`
  [data-match-metrics] { display: contents; }
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
  ${table} {
    justify-self: start; padding: 2px 8px;
    color: ${({ theme, $family }) => theme.color.market[$family].text};
    background: ${({ theme, $family }) => theme.color.market[$family].soft};
    border-inline-start: ${({ theme }) => theme.border.accentWidth} solid ${({ theme, $family }) => theme.color.market[$family].solid};
    font-size: 0.75rem; font-weight: ${({ theme }) => theme.typography.weight.bold};
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
  > [data-pick-value] { max-inline-size: 100%; font-size: 0.8125rem; font-weight: ${({ theme }) => theme.typography.weight.heavy}; line-height: 1.25; }
  ${tile} {
    [data-pick-state="none"] & {
      > b { font-size: 0.6875rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
      > b + [data-pick-value]::before { content: "· "; }
    }
  }
  ${table} {
    display: flex; align-items: flex-start; min-inline-size: 0;
    > [data-pick-value] {
      max-inline-size: 100%; padding: 4px 7px;
      background: ${({ theme }) => theme.color.surface};
      border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
      border-inline-start: ${({ theme }) => theme.border.accentWidth} solid ${({ theme, $family, $available }) => $available ? theme.color.market[$family].solid : theme.color.border};
    }
  }
`;
/** One price cell serves both the desktop track and the mobile facts row. */
const Odds = styled(PickCell)`
  grid-column: 3;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  font-variant-numeric: tabular-nums; white-space: nowrap;
`;
const Probability = styled(PickCell)`
  grid-column: 4; display: inline-flex; align-items: center; gap: 6px;
  ${tile} { [data-probability-meter] { display: none; } }
`;
const Percent = styled.span`
  font-size: 0.8125rem; font-weight: ${({ theme }) => theme.typography.weight.bold};
  font-variant-numeric: tabular-nums; white-space: nowrap;
`;
/** The shared phone layout places progress/outcome below the teams. */
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
    border-radius: ${({ theme }) => theme.radius.none};
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

type LiveClock = ReturnType<typeof liveClockLabel>;

/** `lead` names the winner of a decided final score; live phase and minute stay beside the score. */
function MatchState({ fixture, home, away, lead, clock, messages, snapshot = false }: {
  fixture: FixtureSnapshot; home: string; away: string; lead: number; clock: LiveClock | null; messages: Messages; snapshot?: boolean;
}) {
  const { status, score } = fixture;
  const final = hasFinalScoreStatus(status);
  const scoreline = score && (snapshot || status === "live" || final) ? <>
    <Score data-score aria-hidden="true"><ScoreFigures home={messages.number(score.home)} away={messages.number(score.away)} lead={lead} /></Score>
    <VisuallyHidden>{messages.text("match.scoreline", { label: messages.text(snapshot ? "match.regulationScoreNote" : final ? "match.finalScore" : "match.liveScore"),
      home, away, homeScore: messages.number(score.home), awayScore: messages.number(score.away) })}</VisuallyHidden>
  </> : <>
    <Versus data-ledger-versus aria-hidden="true">{status === "live" || final ? "–" : <>
      <span data-mobile-only>VS</span><span data-desktop-only>{messages.text("match.versus")}</span>
    </>}</Versus>
    {(status === "live" || final) && <VisuallyHidden>{messages.text(final ? "match.finalScoreUnknown" : "match.scoreUnknown")}</VisuallyHidden>}
  </>;
  if (snapshot) return <Center data-match-state="snapshot">{scoreline}</Center>;
  if (clock) return <Center data-match-state="live">{scoreline}<StateChip data-score-clock $tone="live" aria-hidden="true">
    <span data-mobile-only>{clock.phaseLabel}</span><span data-desktop-only><MatchClockText text={clock.visible} /></span></StateChip>
    <VisuallyHidden>{clock.spoken}</VisuallyHidden></Center>;
  if (final && (status === "finished-regulation" || status === "finished-extra-time" || status === "finished-penalties")) {
    const regulationOnly = fixture.scorePeriod === "regulation" && status !== "finished-regulation";
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
  const unlockLabel = startingPriceUgx ? messages.text("paywall.unlockPredictionPrice", { price: messages.number(startingPriceUgx) }) : messages.text("paywall.unlockPrediction");
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
  const result = snapshotPick ? outcome : cardResultStatus(fixture.status, outcome);
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
  const clock = !offline && fixture.status === "live" ? liveClockLabel(fixture.liveClock, messages) : null;
  const showProgress = !offline && (showScore || final || clock !== null || snapshotPick !== undefined && fixture.score !== null
    || fixture.status !== "scheduled" && fixture.status !== "unknown" && fixture.status !== result);
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
      {...(snapshotPick ? { matchState: "snapshot", savedScore: true } : {})}
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
      details={offline ? <VisuallyHidden>Predictions are unavailable in the saved view.</VisuallyHidden>
        : gated ? <SubscriberNotice locale={locale} kind="card" /> : !prediction && reason ? <span data-no-pick-reason>{reason}</span> : null}
    />;
  }
  return <Card tabIndex={-1} aria-labelledby={titleId} data-fixture-id={fixture.fixtureId} data-market={gated ? undefined : shownFamily}
    data-status={fixture.status} data-mobile-design="team-stack" data-numbered={position !== undefined ? "" : undefined}>
    <VisuallyHidden as={`h${headingLevel}`} id={titleId}>{titleNote ? `${title}, ${titleNote}` : title}</VisuallyHidden>
    <Meta data-ledger-meta>
      {position !== undefined && <Index position={position} $wrap={position > 9_999} aria-hidden="true" data-row-number>{messages.number(position)}</Index>}
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
      <CardTeam team={fixture.awayTeam} side="away" name={away} eager={eagerLogos} result={lead < 0 ? "win" : lead > 0 ? "loss" : null}
        standing={liveLead < 0 ? "ahead" : liveLead > 0 ? "behind" : null} />
      {showProgress && <MatchState fixture={fixture} home={home} away={away} lead={lead} clock={clock} messages={messages} snapshot={snapshotPick !== undefined} />}
    </Teams>
    <Pick $family={shownFamily} data-ledger-facts data-pick-state={pickState} data-result={result}>
      <MarketName $family={shownFamily} data-ledger-field="market" aria-hidden={gated ? undefined : true} title={family}>
        <span data-pick-value="" data-mobile-only="">{gated ? messages.text("paywall.locked") : compactMarketName(shownFamily)}</span>
        <span data-pick-value="" data-desktop-only="">{gated ? messages.text("paywall.lockedMarket") : family}</span>
      </MarketName>
      {offline ? <PredictionCell prediction={null} price={null} reason="Predictions are unavailable in the saved view." locale={locale}>
        <PickShort $family={shownFamily} $available={false} data-ledger-field="prediction"><span data-pick-value="">Unavailable offline</span></PickShort>
        <span data-match-metrics><Odds data-ledger-field="odds" data-stack-label={messages.text("details.odds")} aria-hidden="true">—</Odds><Probability data-ledger-field="probability" data-stack-label={messages.text("match.columns.probabilityShort")} aria-hidden="true"><Percent>—</Percent></Probability></span>
      </PredictionCell> : gated ? <><GatedPick data-ledger-field="prediction"><SubscriberIcon />
        <span data-subscriber-notice data-mobile-only="" title={unlockLabel}>{messages.text("paywall.getAccess")}<VisuallyHidden>. {unlockLabel}</VisuallyHidden></span>
        <span data-desktop-only=""><SubscriberNotice locale={locale} kind="card" /></span>
      </GatedPick>
        <span data-match-metrics><Odds data-ledger-field="odds" aria-hidden="true">—</Odds>
        <Probability data-ledger-field="probability" data-stack-label={messages.text("match.columns.probabilityShort")} aria-label={messages.text("details.probability")}><Percent data-public-probability>{publicChanceLabel}</Percent></Probability></span>
      </> : <PredictionCell prediction={prediction} price={price} reason={reason} locale={locale}>
        <PickShort $family={shownFamily} $available={prediction !== null} data-ledger-field="prediction" aria-hidden="true" data-no-pick={missing ?? undefined}>
          {selection ? <span data-pick-value=""><span data-pick-selection="" title={predictionDescription(messages, selection)}>{predictionLabel(messages, selection)}</span></span> : <>
            <b data-mobile-only="">{messages.text("match.noPick")}</b>
            <span data-pick-value="" data-mobile-only="">{messages.text(`match.noPickReason.short.${missing!}`)}</span>
            <span data-pick-value="" data-desktop-only="">{messages.text("match.noPick")}</span>
          </>}
        </PickShort>
        <span data-match-metrics><Odds data-ledger-field="odds" data-stack-label={messages.text("details.odds")} aria-hidden="true" data-card-odds data-pick-price={prediction ? "" : undefined}>{price?.price ?? "—"}</Odds>
        <Probability data-ledger-field="probability" data-stack-label={messages.text("match.columns.probabilityShort")} aria-hidden="true">
          {prediction && <ProbabilityBar $family={shownFamily} data-probability-meter=""><span style={{ inlineSize: `${Math.max(2, prediction.probability.roundedPercent)}%` }} /></ProbabilityBar>}
          <Percent data-pick-value="">{prediction ? percent : "—"}</Percent>
        </Probability></span>
        {prediction && selection ? <VisuallyHidden>{messages.text("match.pickLabel", { market: family, selection: predictionDescription(messages, selection),
          probability: messages.text(prediction.probability.labelKey, { percent: messages.number(prediction.probability.roundedPercent) }) })}
          {locked && `. ${messages.text("match.lockedPrediction")}`}
        </VisuallyHidden> : <VisuallyHidden>{messages.text("match.noPickLabel", { market: family })}: {reason}</VisuallyHidden>}
      </PredictionCell>}
      {prediction && <VisuallyHidden>{messages.text("details.odds")}: {price?.price ?? messages.text("outcome.unavailable")}</VisuallyHidden>}
    </Pick>
    <Result data-result-badge={offline ? "saved" : result} data-stack-result
      data-live-minute={clock ? clock.minute ?? "" : undefined}>
      <MatchStatus status={fixture.status} outcome={outcome} messages={messages} snapshot={snapshotPick !== undefined} offline={offline} liveClock={fixture.liveClock ?? null} />
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
