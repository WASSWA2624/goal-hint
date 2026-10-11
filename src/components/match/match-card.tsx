"use client";

import Link from "next/link";
import { memo, useId, useRef, useState, type MouseEvent } from "react";
import styled, { css, keyframes } from "styled-components";
import { toUtcIsoString } from "@/domain/calendar";
import { countryCode } from "@/domain/country-code";
import { bestCardFamily, noPickReason } from "@/domain/feed-presentation";
import type { FixtureSnapshot } from "@/domain/fixture-snapshot";
import { hasFinalScoreStatus, sameCardFixture, selectedCardPrediction, selectedCardPrice, type LiveClock } from "@/domain/match-card";
import type { MarketFamily } from "@/domain/markets";
import { matchHref } from "@/domain/navigation";
import { isSafeRemoteImageUrl } from "@/domain/remote-image";
import { abbreviationSlotEm, abbreviationWidthEm, cardTeamAbbreviations, tightAbbreviationScale } from "@/domain/team-name";
import { createMessages, type TextKey } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/locales";
import { media, type OutcomeTone } from "@/styles/theme";
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
/**
 * Placement for the phone/tablet card; the table query restyles the same DOM as one row. Static strings, so the media
 * blocks need no theme lookup per card render. Widths are viewport rem, so enlarged text reaches the narrower variants:
 * 360–389px phones hide the market code's line ("O/U" for "O/U 2.5"); 320–359px phones also hide the league name and
 * stack the league crest over the country and time; below 20rem (only with enlarged text, or under 320px) the teams
 * and chips move under the league, and below 16.25rem each gets its own line; from 430px and from 512px the type and
 * crests grow.
 */
const tile = media.belowDesktop, table = media.desktop, wideTable = media.wide;
const shortCodeTile = "@media (max-width: 24.37rem)";
const smallTile = "@media (max-width: 22.49rem)";
const narrowTile = "@media (min-width: 20rem) and (max-width: 22.49rem)";
const stackedTile = "@media (max-width: 19.99rem)";
const columnTile = "@media (max-width: 16.24rem)";
const regularTile = "@media (min-width: 26.875rem) and (max-width: 63.99rem)";
const wideTile = "@media (min-width: 32rem) and (max-width: 63.99rem)";
const hoverTile = "@media (hover: hover) and (max-width: 63.99rem)";
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
const tileShadow = {
  rest: "0 1px 2px rgb(11 31 51 / 5%), 0 2px 8px rgb(11 31 51 / 5%)",
  hover: "0 2px 4px rgb(11 31 51 / 7%), 0 6px 18px rgb(11 31 51 / 9%)",
} as const;
/** Rounded corners on phone and tablet cards only, at the owner's request; brand components are otherwise square. */
const tileRadius = { card: "10px", chip: "5px" } as const;
type TeamResult = "win" | "loss" | null;
type StateTone = "live" | "final" | "halted";
type LineTone = "time" | StateTone;

/**
 * Phone card, one row in the shape of the owner's reference: the league crest beside the league name over the country
 * code and kickoff time ("ENG · 13:30"; the live minute, FT or a halted state replace the time), a hairline rule, the
 * teams as HOME [crest] vs-or-score [crest] AWAY with the crests against the centre, then the market code, pick and
 * probability chips (and a price chip when the fixture carries a public price) and a chevron.
 * Height: 1 + 8 + 36 (2.25rem row) + 8 + 1 = 54px (56px from 430px, 60px from 512px); notes add a row when present.
 * Tracks: league minmax(0, 1fr), teams fixed (two label slots of 2.375em of the label type, two crests, the centre and
 * gaps), chips 1fr with a fixed minimum that holds the widest cluster ("O/U 2.5" + "Under" + the probability chip),
 * so cards align down the list and, on tablets, the teams sit centred. docs/match-card.md has the arithmetic.
 */
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
    /* 390–429px sizes; the variants below adjust them. Type-sized lengths are rem, spacing px. */
    --gh-pad-start: 6px;
    --gh-pad-end: 14px;
    --gh-pad-block: 8px;
    --gh-gap: 3px;
    --gh-row: 2.25rem;
    --gh-league-logo: 1rem;
    --gh-league-gap: 4px;
    --gh-team-logo: 1rem;
    --gh-code-font: 0.6875rem;
    --gh-pair-gap: 2px;
    --gh-centre-gap: 2px;
    --gh-centre: 1.3125rem;
    --gh-score-font: 0.6875rem;
    --gh-chip-height: 1.375rem;
    --gh-chip-gap: 2px;
    --gh-chip-pad: 3px;
    --gh-market-font: 0.625rem;
    --gh-pick-font: 0.625rem;
    --gh-pick-min: 1.25rem;
    --gh-prob: 2.375rem;
    --gh-prob-font: 0.6875rem;
    --gh-prob-pad: 2px;
    --gh-icon: 0.5rem;
    --gh-icon-gap: 2px;
    --gh-chips: 7.5rem;
    --gh-chevron: 0.875rem;
    --gh-teams: calc(2 * ${abbreviationSlotEm} * var(--gh-code-font) + 2 * var(--gh-team-logo) + 2 * var(--gh-pair-gap)
      + 2 * var(--gh-centre-gap) + var(--gh-centre));
    --gh-chevron-top: calc(var(--gh-pad-block) + var(--gh-row) / 2);
    /* The chips track's floor is the cluster's max-content width, which the Pick's min-inline-size (--gh-chips)
     * raises to the widest cluster, so cards align; a wider cluster (a price chip) widens it instead of overlapping. */
    grid-template-columns: minmax(0, 1fr) var(--gh-teams) minmax(max-content, 1fr);
    grid-template-rows: minmax(var(--gh-row), auto);
    grid-template-areas: "meta teams pick";
    column-gap: var(--gh-gap);
    align-items: center;
    padding: var(--gh-pad-block) var(--gh-pad-end) var(--gh-pad-block) var(--gh-pad-start);
    overflow: hidden;
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    border-radius: ${tileRadius.card};
    box-shadow: ${tileShadow.rest};
    ${media.hover} { &:hover { box-shadow: ${tileShadow.hover}; } }
  }
  /* 360–389px: the market code drops its line, so the chips need 6.5rem. */
  ${shortCodeTile} { --gh-chips: 6.5rem; }
  ${smallTile} {
    --gh-pad-end: 12px;
    --gh-league-logo: 0.875rem;
    --gh-team-logo: 0.875rem;
    --gh-code-font: 0.65625rem;
    --gh-centre: 1.25rem;
    --gh-score-font: 0.65625rem;
    --gh-chip-pad: 2px;
    --gh-pick-min: 1.125rem;
    --gh-prob: 2.0625rem;
    --gh-prob-font: 0.625rem;
    --gh-prob-pad: 1px;
    --gh-icon-gap: 1px;
    --gh-chips: 5.875rem;
  }
  ${stackedTile} {
    --gh-chevron-top: calc(var(--gh-pad-block) + 1.6875rem + 7px + var(--gh-row) / 2);
    grid-template-columns: var(--gh-teams) minmax(0, 1fr);
    grid-template-rows: auto minmax(var(--gh-row), auto);
    grid-template-areas: "meta meta" "teams pick";
    row-gap: 6px;
  }
  ${columnTile} {
    --gh-chevron-top: calc(var(--gh-pad-block) + 0.84375rem);
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(var(--gh-row), auto) auto;
    grid-template-areas: "meta" "teams" "pick";
  }
  ${regularTile} {
    --gh-pad-start: 8px;
    --gh-pad-end: 16px;
    --gh-pad-block: 9px;
    --gh-gap: 4px;
    --gh-league-logo: 1.125rem;
    --gh-league-gap: 6px;
    --gh-team-logo: 1.125rem;
    --gh-code-font: 0.75rem;
    --gh-pair-gap: 3px;
    --gh-centre-gap: 3px;
    --gh-centre: 1.5625rem;
    --gh-score-font: 0.8125rem;
    --gh-chip-height: 1.5rem;
    --gh-chevron: 1rem;
  }
  ${wideTile} {
    --gh-pad-start: 10px;
    --gh-pad-end: 18px;
    --gh-gap: 6px;
    --gh-row: 2.5rem;
    --gh-league-logo: 1.375rem;
    --gh-league-gap: 8px;
    --gh-team-logo: 1.375rem;
    --gh-code-font: 0.8125rem;
    --gh-pair-gap: 4px;
    --gh-centre-gap: 4px;
    --gh-centre: 1.75rem;
    --gh-score-font: 0.875rem;
    --gh-chip-height: 1.625rem;
    --gh-chip-gap: 4px;
    --gh-chip-pad: 6px;
    --gh-market-font: 0.6875rem;
    --gh-pick-font: 0.75rem;
    --gh-pick-min: 1.75rem;
    --gh-prob: 3rem;
    --gh-prob-font: 0.75rem;
    --gh-prob-pad: 4px;
    --gh-icon: 0.625rem;
    --gh-icon-gap: 3px;
    --gh-chips: 9.75rem;
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

/** Tile: the league crest spans the league name and the country/time line, with a hairline rule after them; on narrow
 * phones the name is hidden text and the crest sits over the line. */
const Meta = styled.header`
  ${tile} {
    grid-area: meta;
    display: grid;
    grid-template-columns: var(--gh-league-logo) minmax(0, 1fr);
    grid-template-areas: "logo name" "logo when";
    align-items: center;
    gap: 1px var(--gh-league-gap);
    min-inline-size: 0;
    padding-inline-end: var(--gh-gap);
    border-inline-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  }
  ${narrowTile} { grid-template-columns: minmax(0, 1fr); grid-template-areas: "logo" "when"; row-gap: 2px; }
  ${stackedTile} { padding-inline-end: 0; border-inline-end: 0; }
  ${table} { display: grid; grid-column: 1 / span 3; grid-template-columns: subgrid; }
`;
const Index = styled.span`
  display: none;
  ${table} { display: block; grid-column: 1; grid-row: 1; font-variant-numeric: tabular-nums; }
`;
/** Tile: one line, clipped with an ellipsis; the full name stays in the hidden heading's context and the table. */
const LeagueName = styled.span`
  ${tile} { grid-area: name; }
  ${narrowTile} { && { ${visuallyHidden} } }
  ${wideTile} { font-size: ${({ theme }) => theme.typography.scale.secondary}; line-height: 1rem; }
`;
const League = styled.p`
  display: flex;
  align-items: center;
  gap: 6px;
  min-inline-size: 0;
  > svg { flex: none; color: ${({ theme }) => theme.color.mutedText}; }
  > span { ${ellipsis} }
  /* Tile: its parts join the meta grid; a missing crest becomes a soft disc around the trophy. */
  ${tile} {
    display: contents;
    color: ${({ theme }) => theme.color.text};
    font-size: ${({ theme }) => theme.typography.scale.caption};
    font-weight: ${({ theme }) => theme.typography.weight.medium};
    line-height: 0.875rem;
    > svg {
      grid-area: logo;
      box-sizing: border-box;
      inline-size: var(--gh-league-logo);
      block-size: var(--gh-league-logo);
      padding: 2px;
      border-radius: 50%;
      background: ${({ theme }) => theme.color.surfaceMuted};
    }
  }
  ${narrowTile} { > svg { justify-self: start; } }
  ${table} { grid-column: 3; grid-row: 1; gap: 8px; > svg { font-size: 1rem; } > span { white-space: normal; } }
`;
const LeagueLogo = styled.img`
  flex: none;
  inline-size: 12px;
  block-size: 12px;
  object-fit: contain;
  ${tile} { grid-area: logo; inline-size: var(--gh-league-logo); block-size: var(--gh-league-logo); }
  ${narrowTile} { justify-self: start; }
  ${table} { inline-size: 18px; block-size: 18px; }
`;
/** The table's date and time cell; on tiles it stays as hidden text (full day, time and EAT) beside the visible line. */
const When = styled.time`
  display: flex;
  align-items: center;
  gap: 4px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  ${tile} { ${visuallyHidden} }
  ${table} { grid-column: 2; grid-row: 1; flex-wrap: wrap; gap: 0 6px; white-space: normal; }
`;
const Dot = styled.span`
  color: ${({ theme }) => theme.color.border};
  ${tile} { display: none; }
  ${table} { display: none; }
`;
const KickoffTime = styled.span`
  ${tile} { font-weight: ${({ theme }) => theme.typography.weight.bold}; }
`;
/**
 * Tile only, decorative: the competition's country code then the kickoff time (bold navy), the live minute or phase
 * (bold live red, after a dot that pulses while play runs), FT/AET/Pens (bold muted) or a short halted state (bold
 * amber). The time element and the score-line block keep the spoken versions. An over-long line clips its state.
 */
const TileLine = styled.span<{ $tone: LineTone }>`
  display: none;
  ${tile} {
    grid-area: when;
    display: flex;
    align-items: center;
    min-inline-size: 0;
    overflow: hidden;
    color: ${({ theme }) => theme.color.mutedText};
    font-size: ${({ theme }) => theme.typography.scale.micro};
    font-weight: ${({ theme }) => theme.typography.weight.medium};
    line-height: 0.8125rem;
    white-space: nowrap;
    > i { flex: none; margin-inline: 0.2em; font-style: normal; }
    > b {
      ${ellipsis}
      color: ${({ theme, $tone }) => ({ time: theme.color.text, live: theme.color.live.text, final: theme.color.mutedText,
        halted: theme.color.accent.amber.text })[$tone]};
      font-weight: ${({ theme }) => theme.typography.weight.bold};
      font-variant-numeric: tabular-nums;
    }
  }
  ${wideTile} { font-size: ${({ theme }) => theme.typography.scale.caption}; line-height: 0.875rem; }
`;
const TileLiveDot = styled.span`
  flex: none;
  inline-size: 5px;
  block-size: 5px;
  margin-inline-end: 3px;
  border-radius: 50%;
  background: ${({ theme }) => theme.color.live.solid};
  animation: ${pulse} 1.6s ease-in-out infinite;
  @media (prefers-reduced-motion: reduce) { animation: none; }
`;

const Teams = styled.div`
  --gh-logo-size: 16px;
  --gh-logo-radius: 0;
  --gh-logo-font: 0.5rem;
  /* Tile: HOME [crest] centre [crest] AWAY, crests against the centre; initials sit in a soft ringed disc, loaded
   * crests keep their own shape. */
  ${tile} {
    --gh-logo-size: var(--gh-team-logo);
    --gh-logo-font: ${({ theme }) => theme.typography.scale.micro};
    --gh-logo-radius: 50%;
    --gh-logo-ring: inset 0 0 0 1px ${({ theme }) => theme.color.border};
    grid-area: teams;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto auto minmax(0, 1fr);
    align-items: center;
    min-inline-size: 0;
    [data-team-side="home"] > [data-team-logo] { grid-column: 2; grid-row: 1; }
    [data-team-side="away"] > [data-team-logo] { grid-column: 4; grid-row: 1; }
  }
  ${columnTile} { justify-self: start; inline-size: var(--gh-teams); }
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
/** The full name: shown in the table, hidden text on tiles (the abbreviation shows instead). */
const TeamName = styled.span`
  flex: 1;
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  ${ellipsis}
  ${tile} { ${visuallyHidden} }
  ${table} { white-space: normal; font-weight: ${({ theme }) => theme.typography.weight.body}; }
`;
/**
 * Tile only: the team's code or derived abbreviation in a slot of 2.375em of its type, the home one right-aligned
 * against its crest and the away one left-aligned after its crest. Wider labels set at 90% (`data-fit="tight"`).
 * After a decided final the loser's label is muted. Where the pointer can hover, the label rises above the card link
 * so its tooltip (the full name) shows; the card forwards a click on it to the link.
 */
const TeamCode = styled.span<{ $result: TeamResult }>`
  display: none;
  ${tile} {
    display: block;
    grid-column: 1;
    grid-row: 1;
    padding-inline-end: var(--gh-pair-gap);
    color: ${({ theme, $result }) => $result === "loss" ? theme.color.mutedText : theme.color.text};
    font-size: var(--gh-code-font);
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    line-height: 1.3;
    text-align: end;
    ${ellipsis}
    &[data-fit="tight"] { font-size: max(${({ theme }) => theme.typography.scale.micro}, calc(var(--gh-code-font) * ${tightAbbreviationScale})); }
    [data-team-side="away"] > & { grid-column: 5; padding-inline: var(--gh-pair-gap) 0; text-align: start; }
  }
  ${hoverTile} { position: relative; z-index: 2; cursor: pointer; }
`;
/** Tile: "vs", or the score once live or final; the state chip stays as hidden text (the league line shows it). */
const Center = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  ${tile} {
    grid-column: 3;
    grid-row: 1;
    flex-direction: row;
    justify-content: center;
    min-inline-size: var(--gh-centre);
    margin-inline: var(--gh-centre-gap);
  }
`;
const Versus = styled.span`
  color: ${({ theme }) => theme.color.mutedText};
  ${tile} { font-size: ${({ theme }) => theme.typography.scale.micro}; font-weight: ${({ theme }) => theme.typography.weight.medium}; line-height: 1; }
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
  /* Proportional digits keep "0–0" within the centre track (22.7px at 12px would not fit 21px). */
  ${tile} {
    gap: 1px;
    color: ${({ theme, $live }) => $live ? theme.color.live.text : theme.color.text};
    font-size: var(--gh-score-font);
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
  ${tile} { ${visuallyHidden} }
`;
const LiveDot = styled.span`
  inline-size: 6px;
  block-size: 6px;
  border-radius: 50%;
  background: ${({ theme }) => theme.color.live.solid};
  animation: ${pulse} 1.6s ease-in-out infinite;
  @media (prefers-reduced-motion: reduce) { animation: none; }
  ${tile} { animation: none; }
`;

/**
 * Tile: the market code chip (grey), the pick chip (the family's clean tint), the fixed-width probability chip (bold,
 * the tint with a family ring; once settled the outcome's tint with its ✓/✗/⊘) and, only when the fixture carries a
 * public price for the shown pick, a grey price chip; right-aligned in a track that holds the widest cluster.
 * Table: market, prediction and probability columns.
 */
const Pick = styled.div`
  ${tile} {
    grid-area: pick;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--gh-chip-gap);
    min-inline-size: var(--gh-chips);
  }
  ${stackedTile} { min-inline-size: 0; }
  ${columnTile} { justify-content: flex-start; }
  ${table} { display: grid; grid-column: 7 / span 3; grid-template-columns: subgrid; align-items: center; }
`;
/** Shared tile chip box. */
const chip = css`
  flex: none;
  block-size: var(--gh-chip-height);
  padding: 0 var(--gh-chip-pad);
  border-radius: ${tileRadius.chip};
  line-height: var(--gh-chip-height);
  text-align: center;
  white-space: nowrap;
`;
/** Tile only: the short market code (1X2, DC, O/U 2.5, BTTS); below 390px the part after its last space (the goal
 * line, the only one the product offers) is hidden. */
const TileCode = styled.span`
  display: none;
  ${tile} {
    ${chip}
    display: block;
    color: ${({ theme }) => theme.color.mutedText};
    background: ${({ theme }) => theme.color.surfaceMuted};
    font-size: var(--gh-market-font);
    font-weight: ${({ theme }) => theme.typography.weight.bold};
  }
  ${shortCodeTile} { > span { display: none; } }
`;
/** Table: a tag washed from the family tint into white, with a hairline family ring and a solid 3px family edge; the
 * full colour fill is kept for the gradient prediction pill beside it. Inset shadows draw the ring and edge inside the
 * unchanged padding, so the tag keeps its size and the row its height. Tiles show the market code instead. */
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
/** Tile: the short pick ("1", "X2", "Over", "Yes") in the family's clean tint (family text keeps 4.5:1 on it).
 * Table: the pick in a family-gradient pill. MarketColors keeps white text at 4.5:1 on both gradient stops
 * (tests/market-colors.test.mjs); AccentColors gradients are only rated for large text and must not be used here. */
const PickShort = styled.span<{ $family: MarketFamily }>`
  display: none;
  ${tile} {
    ${chip}
    display: block;
    min-inline-size: var(--gh-pick-min);
    color: ${({ theme, $family }) => theme.color.market[$family].text};
    background: ${({ theme, $family }) => theme.color.market[$family].soft};
    font-size: var(--gh-pick-font);
    font-weight: ${({ theme }) => theme.typography.weight.bold};
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
  }
`;
const settledTones: ReadonlySet<OutcomeTone> = new Set(["correct", "incorrect", "void"]);
/** Tile: the bold probability chip at a fixed width (the padlock or ✓/✗/⊘ mark fits beside a two-digit percent).
 * Pending keeps the family tint and a family ring; Correct, Incorrect and Void take the outcome's green, red or grey
 * tint (each text colour keeps 4.5:1 on its tint) and lead with their mark, as a locked pending pick leads with the
 * padlock. */
const Probability = styled.span<{ $family: MarketFamily; $outcome: OutcomeTone }>`
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
  > svg { display: none; }
  ${tile} {
    ${chip}
    justify-content: center;
    gap: var(--gh-icon-gap);
    inline-size: var(--gh-prob);
    padding: 0 var(--gh-prob-pad);
    overflow: hidden;
    ${({ theme, $family, $outcome }) => {
      const colours = settledTones.has($outcome) ? theme.color.outcome[$outcome] : null;
      const market = theme.color.market[$family];
      return css`
        color: ${colours ? colours.text : market.text};
        background: ${colours ? colours.background : market.soft};
        box-shadow: inset 0 0 0 1px color-mix(in srgb, ${colours ? colours.border : market.solid} 40%, transparent);
      `;
    }}
    > svg { display: block; flex: none; order: -1; font-size: var(--gh-icon); }
  }
  ${table} { grid-column: 3; gap: 8px; }
`;
const Percent = styled.span`
  font-size: 0.8125rem;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  ${tile} { font-size: var(--gh-prob-font); line-height: var(--gh-chip-height); }
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
/** Tile: a muted "—" after the market code and no probability chip; the reason stays in the hidden label. */
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
      display: block;
      padding: 0 2px;
      color: ${({ theme }) => theme.color.mutedText};
      font-size: var(--gh-pick-font);
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
  ${tile} { order: -1; inline-size: auto; block-size: auto; color: inherit; background: none; border: 0; font-size: var(--gh-icon); }
  ${table} { inline-size: 1.125rem; block-size: 1.125rem; font-size: 0.6875rem; }
`;
/** Tile only: the public market price for exactly the shown pick (prompt 052), information only. */
const TilePrice = styled.span`
  display: none;
  ${tile} { display: contents; }
`;
const PriceChip = styled.span`
  ${chip}
  color: ${({ theme }) => theme.color.mutedText};
  background: ${({ theme }) => theme.color.surfaceMuted};
  font-size: var(--gh-pick-font);
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  font-variant-numeric: tabular-nums;
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
  ${tile} { grid-column: 1 / -1; padding-block-start: 6px; }
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
  ${tile} { border-radius: 4px; }
`;

/** The whole tile or row is the target. */
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
   * browser's tap overlay, inside the card's rounded border. The chevron sits in the card's end padding, centred on
   * the main row. */
  ${tile} {
    border-radius: calc(${tileRadius.card} - 1px);
    -webkit-tap-highlight-color: transparent;
    &:active { background: color-mix(in srgb, ${({ theme }) => theme.color.text} 8%, transparent); }
    > svg {
      position: absolute;
      inset-block-start: var(--gh-chevron-top);
      inset-inline-end: 0;
      display: block;
      font-size: var(--gh-chevron);
      translate: 0 -50%;
    }
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
/** Paused live phases keep the tile line's dot still. */
const pausedPhases: ReadonlySet<string> = new Set(["half-time", "break", "interrupted", "suspended"]);
/** Tile labels for a live fixture without a running minute; each fits the league line beside a country code. */
const tileClockKeys = {
  "first-half": "match.clockShort.first-half", "half-time": "match.clock.half-time", "second-half": "match.clockShort.second-half",
  "extra-time": "match.clockShort.extra-time", break: "match.clock.break", penalties: "match.clockShort.penalties",
  interrupted: "match.clockShort.interrupted", suspended: "match.clockShort.suspended", "in-play": "match.liveBadge",
} as const satisfies Record<LiveClock["phase"], TextKey>;
const tileHaltedKeys: Readonly<Partial<Record<FixtureSnapshot["status"], TextKey>>> = {
  postponed: "match.statusShort.postponed", canceled: "match.statusShort.canceled",
  abandoned: "match.statusShort.abandoned", awarded: "match.statusShort.awarded",
};

function liveClockLabel(fixture: FixtureSnapshot, messages: Messages) {
  const minute = fixture.liveClock?.minute ?? null, phase = fixture.liveClock?.phase ?? "in-play";
  const visible = minute !== null ? messages.text("match.clock.minute", { minute: messages.number(minute) })
    : phase === "in-play" ? messages.text("match.liveBadge") : messages.text(`match.clock.${phase}`);
  return { minute, phase, visible };
}

/** The tile line's state part: kickoff time, live minute or phase, final state or halted state. */
function tileState(fixture: FixtureSnapshot, messages: Messages): { text: string; tone: LineTone; dot: boolean } {
  const { status } = fixture;
  if (status === "live") {
    const minute = fixture.liveClock?.minute ?? null, phase = fixture.liveClock?.phase ?? "in-play";
    return { text: minute !== null ? messages.text("match.clock.minute", { minute: messages.number(minute) }) : messages.text(tileClockKeys[phase]),
      tone: "live", dot: !pausedPhases.has(phase) };
  }
  if (status === "finished-regulation" || status === "finished-extra-time" || status === "finished-penalties") {
    const regulationOnly = fixture.scorePeriod === "regulation" && status !== "finished-regulation";
    return { text: `${messages.text(`match.final.${status}`)}${regulationOnly ? "*" : ""}`, tone: "final", dot: false };
  }
  const halted = tileHaltedKeys[status];
  if (halted) return { text: messages.text(halted), tone: "halted", dot: false };
  return { text: fixture.kickoffAt === null ? messages.text("match.kickoffShort") : messages.reportingTime(fixture.kickoffAt), tone: "time", dot: false };
}

function MatchState({ fixture, home, away, messages }: { fixture: FixtureSnapshot; home: string; away: string; messages: Messages }) {
  const { status, score } = fixture;
  const final = hasFinalScoreStatus(status);
  const scoreline = score && (status === "live" || final) ? <>
    <Score aria-hidden="true" $live={status === "live"}><span>{messages.number(score.home)}</span><span>–</span><span>{messages.number(score.away)}</span></Score>
    <VisuallyHidden>{messages.text("match.scoreline", { label: messages.text(final ? "match.finalScore" : "match.liveScore"),
      home, away, homeScore: messages.number(score.home), awayScore: messages.number(score.away) })}</VisuallyHidden>
  </> : <>
    <Versus aria-hidden="true">{messages.text("match.versus")}</Versus>
    {(status === "live" || final) && <VisuallyHidden>{messages.text(final ? "match.finalScoreUnknown" : "match.scoreUnknown")}</VisuallyHidden>}
  </>;
  if (status === "live") {
    const { minute, phase, visible } = liveClockLabel(fixture, messages);
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

/** Whether a label needs the tighter type to fit its slot (see `abbreviationSlotEm`). */
function labelFit(label: string): "tight" | undefined {
  return abbreviationWidthEm(label) > abbreviationSlotEm ? "tight" : undefined;
}

function CardTeam({ team, side, name, label, eager, result }: {
  team: FixtureSnapshot["homeTeam"]; side: "home" | "away"; name: string; label: string; eager: boolean; result: TeamResult;
}) {
  const url = isSafeRemoteImageUrl(team.logoUrl) ? team.logoUrl : undefined;
  const shown = label || "—";
  return <Team data-team-side={side} data-result={result ?? undefined}>
    <TeamLogo key={`${team.id}:${url ?? "missing"}`} name={team.name} url={url} eager={eager} />
    <TeamName>{name}</TeamName>
    <TeamCode aria-hidden="true" data-team-code="" data-fit={labelFit(shown)} title={name} $result={result}>{shown}</TeamCode>
  </Team>;
}

function CompetitionLogo({ url }: { url: string | null | undefined }) {
  const [failed, setFailed] = useState(false);
  return url && !failed && isSafeRemoteImageUrl(url)
    ? <LeagueLogo src={url} alt="" width={14} height={14} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <TrophyIcon />;
}

/** The market code with the part after its last space (the goal line) wrapped, so narrow phones can hide it. */
function TileMarketCode({ code }: { code: string }) {
  const split = code.lastIndexOf(" ");
  return <TileCode aria-hidden="true">{split > 0 ? <>{code.slice(0, split)}<span>{code.slice(split)}</span></> : code}</TileCode>;
}

function MatchCardView({ fixture, analysisSlug, markets, selectedFamily, locale: requestedLocale,
  headingLevel = 2, eagerLogos = false, position }: MatchCardProps) {
  const locale = resolveLocale(requestedLocale);
  const messages = createMessages(locale);
  const titleId = `gh-match-${useId()}`;
  const linkRef = useRef<HTMLAnchorElement>(null);
  const eligible = markets && markets.length > 0 ? markets : [selectedFamily ?? "match-result"];
  const shownFamily = bestCardFamily(fixture, eligible) ?? eligible[0]!;
  const home = fixture.homeTeam.name?.trim() || messages.text("match.homeUnknown");
  const away = fixture.awayTeam.name?.trim() || messages.text("match.awayUnknown");
  const labels = cardTeamAbbreviations({ name: fixture.homeTeam.name, code: fixture.homeTeam.code },
    { name: fixture.awayTeam.name, code: fixture.awayTeam.code });
  const competition = fixture.competition.name?.trim() || messages.text("match.competitionUnknown");
  const country = fixture.competition.country?.trim();
  const countryLabel = countryCode(country);
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
  const final = hasFinalScoreStatus(fixture.status);
  const showScore = fixture.score !== null && (fixture.status === "live" || final);
  // Only a decided final score names a winner; a 90-minute score shown for an extra-time or penalties finish does not.
  const decided = showScore && final && !(fixture.scorePeriod === "regulation" && fixture.status !== "finished-regulation");
  const lead = decided ? Math.sign(fixture.score!.home - fixture.score!.away) : 0;
  const state = tileState(fixture, messages);
  const reason = prediction ? null : messages.text(`match.noPickReason.${noPickReason(fixture)}`);
  // A raised team label (hover devices) sits above the card link; its click still opens the analysis.
  const openFromLabel = (event: MouseEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.closest("[data-team-code]")) linkRef.current?.click();
  };
  return <Card tabIndex={-1} aria-labelledby={titleId} data-fixture-id={fixture.fixtureId} data-market={shownFamily}
    data-status={fixture.status} onClick={openFromLabel}>
    <VisuallyHidden as={`h${headingLevel}`} id={titleId}>{messages.text("match.title", { home, away })}</VisuallyHidden>
    <Meta>
      {position !== undefined && <Index aria-hidden="true">{messages.number(position)}</Index>}
      <League title={country ?? undefined}><CompetitionLogo url={fixture.competition.logoUrl} /><LeagueName>{competition}</LeagueName>
        {country && <VisuallyHidden>, {country}</VisuallyHidden>}</League>
      {fixture.kickoffAt === null ? <When as="p">{messages.text("match.kickoffUnknown")}</When>
        : <When dateTime={toUtcIsoString(fixture.kickoffAt)} title={messages.reportingInstant(fixture.kickoffAt)}>
          <VisuallyHidden>{messages.text("match.kickoff")}: </VisuallyHidden>
          <span>{messages.reportingDay(fixture.kickoffAt)}</span><Dot aria-hidden="true">·</Dot>
          <KickoffTime>{messages.reportingTime(fixture.kickoffAt)}<VisuallyHidden> EAT</VisuallyHidden></KickoffTime>
        </When>}
      <TileLine aria-hidden="true" $tone={state.tone}>
        {countryLabel && <>{countryLabel}<i>·</i></>}{state.dot && <TileLiveDot />}<b>{state.text}</b>
      </TileLine>
    </Meta>
    <Teams>
      <CardTeam team={fixture.homeTeam} side="home" name={home} label={labels.home} eager={eagerLogos}
        result={lead > 0 ? "win" : lead < 0 ? "loss" : null} />
      <MatchState fixture={fixture} home={home} away={away} messages={messages} />
      <CardTeam team={fixture.awayTeam} side="away" name={away} label={labels.away} eager={eagerLogos}
        result={lead < 0 ? "win" : lead > 0 ? "loss" : null} />
    </Teams>
    <Pick>
      <TileMarketCode code={messages.text(`market.code.${shownFamily}`)} />
      <MarketName $family={shownFamily} aria-hidden="true">{family}</MarketName>
      <Prediction $available={prediction !== null} data-prediction={selection ?? "none"} data-outcome={outcome} title={details ?? undefined}>
        {prediction && selection ? <>
          <PickShort $family={shownFamily} aria-hidden="true">{messages.text(`market.pick.${selection}`)}</PickShort>
          <Probability aria-hidden="true" $family={shownFamily} $outcome={outcome}>
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
          <NoPick aria-hidden="true" data-no-pick={noPickReason(fixture)}><b>—</b><span>{reason}</span></NoPick>
          <VisuallyHidden>{messages.text("match.noPickLabel", { market: family })}: {reason}</VisuallyHidden>
        </>}
      </Prediction>
      {price && <TilePrice><PriceChip aria-hidden="true">{price.price}</PriceChip>
        <VisuallyHidden>{messages.text("details.odds")}: {price.price}</VisuallyHidden></TilePrice>}
    </Pick>
    {notes.length > 0 && <Notes>{notes.map((note, index) => <Note key={index}><NoticeIcon />{note}</Note>)}</Notes>}
    <Open ref={linkRef} href={matchHref(fixture.fixtureId, analysisSlug, locale)} prefetch={false}>
      <VisuallyHidden>{messages.text("match.analysisLabel", { home, away })}</VisuallyHidden><ChevronIcon />
    </Open>
  </Card>;
}

/** Polls hand every card a fresh record; equal-version observations that look the same skip rendering.
 * A server refresh of the same query also brings an equal but new `markets` array. */
function sameCardProps(previous: MatchCardProps, next: MatchCardProps): boolean {
  if (!sameCardFixture(previous.fixture, next.fixture)) return false;
  for (const key of new Set([...Object.keys(previous), ...Object.keys(next)]) as Set<keyof MatchCardProps>) {
    if (key === "fixture" || Object.is(previous[key], next[key])) continue;
    if (key !== "markets" || previous.markets?.length !== next.markets?.length ||
        previous.markets?.some((family, index) => family !== next.markets?.[index])) return false;
  }
  return true;
}

export const MatchCard = memo(MatchCardView, sameCardProps);
