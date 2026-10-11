"use client";

import Link from "next/link";
import { memo, useId, useState, type PointerEvent } from "react";
import styled, { css, keyframes } from "styled-components";
import { toUtcIsoString } from "@/domain/calendar";
import { countryCode } from "@/domain/country-code";
import { bestCardFamily, noPickReason } from "@/domain/feed-presentation";
import type { FixtureSnapshot } from "@/domain/fixture-snapshot";
import { hasFinalScoreStatus, sameCardFixture, selectedCardPrediction, selectedCardPrice, type LiveClock } from "@/domain/match-card";
import type { MarketFamily } from "@/domain/markets";
import { matchHref } from "@/domain/navigation";
import { isSafeRemoteImageUrl } from "@/domain/remote-image";
import { createMessages, type TextKey } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/locales";
import { media, type OutcomeTone } from "@/styles/theme";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { CheckIcon, ChevronIcon, CrossIcon, FlagIcon, GlobeIcon, LockIcon, NoticeIcon, TrophyIcon, VoidIcon } from "./match-icons";
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
/** The competition's country flag URL arrives with the catalog's country records; optional, so cards render the
 * neutral flag glyph before (and without) it. A flag change alone does not bump `dataVersion`, so `sameCardProps`
 * compares it. */
type CardCompetition = FixtureSnapshot["competition"] & { countryFlagUrl?: string | null };
const countryFlagUrl = (fixture: FixtureSnapshot) => (fixture.competition as CardCompetition).countryFlagUrl ?? null;
/**
 * Placement for the phone/tablet card; the table query restyles the same DOM as one row. Static strings, so the media
 * blocks need no theme lookup per card render. Widths are viewport rem, so enlarged text reaches the narrower variants:
 * from 390px the league crest shows; below 360px chips and gaps tighten and the market code drops its goal line
 * ("O/U" for "O/U 2.5"); below 20rem (only with enlarged text, or under 320px) the chips get a line of their own.
 */
const tile = media.belowDesktop, table = media.desktop, wideTable = media.wide;
const crestTile = "@media (min-width: 24.375rem) and (max-width: 63.99rem)";
const narrowTile = "@media (max-width: 22.49rem)";
const stackedTile = "@media (max-width: 19.99rem)";
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
/** Near-square corners on phone and tablet cards and chips (owner: 0–2px); brand components are otherwise square. */
const tileRadius = "2px";
/**
 * Chip slots in em of each chip's own type (Manrope Bold), so chips line up in columns down the list as in the
 * owner's reference: the widest market code "O/U 2.5" (3.59em at 10px), "BTTS" once narrow phones hide the goal line
 * (2.54em), the widest pick "Under" (2.96em at 11px) and a two-digit percent (2.2em at 11px heavy) plus the padlock or
 * ✓/✗/⊘ mark (8px) and its 2px gap. Wider content ("<1%", ">99%" with a mark, a price) widens its own chip.
 */
const chipSlot = {
  market: "calc(3.6em + 2 * var(--gh-chip-pad))",
  shortMarket: "calc(2.55em + 2 * var(--gh-chip-pad))",
  pick: "calc(2.97em + 2 * var(--gh-chip-pad))",
  probability: "calc(2.2em + 0.625rem + 2 * var(--gh-chip-pad))",
} as const;
type TeamResult = "win" | "loss" | null;
type StateTone = "live" | "final" | "halted";
type LineTone = "time" | StateTone;

/**
 * Phone/tablet card, layout A (owner's choice): the teams get their own line under a meta line.
 * Row 1: [flag] ARG · 13:30 · League name…  [1X2] [1] [62%]. Row 2: HOME NAME [crest] score-or-vs [crest] AWAY NAME.
 * Height: 1 + 7 + 18 (chips) + 5 + 18 (crests) + 7 + 1 = 57px at every width from 320px while both names fit one line;
 * a name that wraps makes row 2 two 15.6px lines (31.2px), so 70.2px; notes add a row when present.
 * docs/match-card.md has the width arithmetic.
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
    --gh-chip-pad: 4px;
    --gh-chip-gap: 3px;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas: "meta pick" "teams teams";
    gap: 5px 6px;
    align-items: center;
    padding: 7px 9px;
    overflow: hidden;
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    border-radius: ${tileRadius};
    box-shadow: ${tileShadow.rest};
    ${media.hover} { &:hover { box-shadow: ${tileShadow.hover}; } }
  }
  ${narrowTile} { --gh-chip-pad: 3px; --gh-chip-gap: 2px; column-gap: 4px; padding-inline: 8px; }
  ${stackedTile} { grid-template-columns: minmax(0, 1fr); grid-template-areas: "meta" "pick" "teams"; row-gap: 4px; }
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

/** Tile: one line, [flag] code · state · [crest] league name; the league name gives way first. */
const Meta = styled.header`
  ${tile} {
    grid-area: meta;
    display: flex;
    align-items: center;
    min-inline-size: 0;
  }
  ${table} { display: grid; grid-column: 1 / span 3; grid-template-columns: subgrid; }
`;
const Index = styled.span`
  display: none;
  ${table} { display: block; grid-column: 1; grid-row: 1; font-variant-numeric: tabular-nums; }
`;
/** Tile: takes the meta line's remaining width (a zero basis, so the code and state keep theirs), one line with an
 * ellipsis; the full name stays in the hidden heading's context and the table. */
const LeagueName = styled.span`
  ${tile} { flex: 1 1 0; }
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
    display: contents;
    color: ${({ theme }) => theme.color.text};
    font-size: ${({ theme }) => theme.typography.scale.caption};
    font-weight: ${({ theme }) => theme.typography.weight.medium};
    line-height: 0.875rem;
    > svg { display: none; }
  }
  ${table} { grid-column: 3; grid-row: 1; gap: 8px; > svg { font-size: 1rem; } > span { white-space: normal; } }
`;
const LeagueLogo = styled.img`
  flex: none;
  inline-size: 12px;
  block-size: 12px;
  object-fit: contain;
  ${tile} { display: none; }
  ${crestTile} { display: block; inline-size: 0.875rem; block-size: 0.875rem; margin-inline-end: 4px; }
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
 * Tile only, decorative, leading the meta line: the country flag (or a neutral glyph), the competition's country code
 * (11px semibold muted), then the kickoff time (bold navy), the live minute or phase (bold live red, after a dot that
 * pulses while play runs), FT/AET/Pens (bold muted) or a short halted state (bold amber), and the dot before the
 * league name. The time element and the score-line block keep the spoken versions. When even the league name has
 * no room left, the state clips with an ellipsis.
 */
const TileLine = styled.span<{ $tone: LineTone }>`
  display: none;
  ${tile} {
    order: -1;
    display: flex;
    flex: 0 1 auto;
    align-items: center;
    min-inline-size: 0;
    overflow: hidden;
    color: ${({ theme }) => theme.color.mutedText};
    font-size: ${({ theme }) => theme.typography.scale.caption};
    font-weight: ${({ theme }) => theme.typography.weight.medium};
    line-height: 0.875rem;
    white-space: nowrap;
    > span, > i { flex: none; }
    > i { margin-inline: 0.25em; font-style: normal; }
    > b {
      ${ellipsis}
      color: ${({ theme, $tone }) => ({ time: theme.color.text, live: theme.color.live.text, final: theme.color.mutedText,
        halted: theme.color.accent.amber.text })[$tone]};
      font-weight: ${({ theme }) => theme.typography.weight.bold};
    }
  }
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
/** 16×11 flag with a hairline ring so white flag fields keep an edge on the white card. */
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
    --gh-logo-size: 1.125rem;
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
/**
 * The full team name everywhere: no abbreviations or provider codes (owner decision). Tile: 13px semibold, the home
 * name right-aligned against its crest and the away name left-aligned after its crest, on every line; after a decided
 * final the loser's name is muted. A long name wraps rather than being cut (owner: "long team names, should wrap"):
 * at word boundaries only (`break-word` replaces the inherited `anywhere`, so only a single word wider than the box
 * breaks), balanced where `text-wrap: balance` is supported, and clamped with an ellipsis only beyond two lines.
 * Line height 1.2: one line (15.6px) stays inside the 18px crest row; two lines (31.2px) grow the card by 13.2px,
 * with the crests and score centred against the name. A clamped name puts both full names in the card's tooltip (see
 * `showFullNames`); the hidden heading and the link name always carry them.
 */
const TeamName = styled.span<{ $result: TeamResult }>`
  flex: 1;
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  ${ellipsis}
  ${tile} {
    grid-column: 1;
    grid-row: 1;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    padding-inline-end: 4px;
    color: ${({ theme, $result }) => $result === "loss" ? theme.color.mutedText : theme.color.text};
    font-size: ${({ theme }) => theme.typography.scale.body};
    line-height: 1.2;
    text-align: end;
    white-space: normal;
    overflow-wrap: break-word;
    text-wrap: balance;
    [data-team-side="away"] > & { grid-column: 5; padding-inline: 4px 0; text-align: start; }
  }
  ${table} { white-space: normal; font-weight: ${({ theme }) => theme.typography.weight.body}; }
`;
/** Tile: "vs" (11px muted) before kickoff, or the score once live or final, in a 34px centre column that widens
 * for three-character scores; the state chip stays as hidden text (the meta line shows the state). */
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
    min-inline-size: 2.125rem;
    margin-inline: 2px;
  }
`;
const Versus = styled.span`
  color: ${({ theme }) => theme.color.mutedText};
  ${tile} { font-size: ${({ theme }) => theme.typography.scale.caption}; font-weight: ${({ theme }) => theme.typography.weight.medium}; line-height: 1; }
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
  /* Tile: "1 – 1" bold 13px, live red while live; proportional digits keep two-digit scores compact. */
  ${tile} {
    gap: 3px;
    color: ${({ theme, $live }) => $live ? theme.color.live.text : theme.color.text};
    font-size: ${({ theme }) => theme.typography.scale.body};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
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
  /* Hidden on tiles, where TileLiveDot pulses instead. */
  ${tile} { animation: none; }
`;

/**
 * Tile: right-aligned on the meta line, chips in the reference photo's style: the market code (grey), the pick (the
 * family's clean tint and text colour) and the bold probability (the tint with a family ring; once settled the
 * outcome's tint with its ✓/✗/⊘), each in a fixed slot so they align down the list; a grey price chip follows only
 * when the fixture carries a public price for the shown pick. Table: market, prediction and probability columns.
 */
const Pick = styled.div`
  ${tile} {
    grid-area: pick;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--gh-chip-gap);
  }
  ${stackedTile} { justify-content: flex-start; }
  ${table} { display: grid; grid-column: 7 / span 3; grid-template-columns: subgrid; align-items: center; }
`;
/** Shared tile chip box: 18px tall, near-square corners. */
const chip = css`
  flex: none;
  block-size: 1.125rem;
  padding: 0 var(--gh-chip-pad);
  border-radius: ${tileRadius};
  line-height: 1.125rem;
  text-align: center;
  white-space: nowrap;
`;
/** Tile only: the short market code (1X2, DC, O/U 2.5, BTTS), 10px bold grey; below 360px the part after its last
 * space (the goal line, the only one the product offers) is hidden and the slot narrows to "BTTS". */
const TileCode = styled.span`
  display: none;
  ${tile} {
    ${chip}
    display: block;
    min-inline-size: ${chipSlot.market};
    color: ${({ theme }) => theme.color.mutedText};
    background: ${({ theme }) => theme.color.surfaceMuted};
    font-size: ${({ theme }) => theme.typography.scale.micro};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
  }
  ${narrowTile} { min-inline-size: ${chipSlot.shortMarket}; > span { display: none; } }
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
/** Tile: the short pick ("1", "X2", "Over", "Yes"), 11px bold in the family's clean tint (family text keeps 4.5:1 on
 * it). Table: the pick in a family-gradient pill. MarketColors keeps white text at 4.5:1 on both gradient stops
 * (tests/market-colors.test.mjs); AccentColors gradients are only rated for large text and must not be used here. */
const PickShort = styled.span<{ $family: MarketFamily }>`
  display: none;
  ${tile} {
    ${chip}
    display: block;
    min-inline-size: ${chipSlot.pick};
    color: ${({ theme, $family }) => theme.color.market[$family].text};
    background: ${({ theme, $family }) => theme.color.market[$family].soft};
    font-size: ${({ theme }) => theme.typography.scale.caption};
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
/** Tile: the bold (11px heavy) probability chip. Pending keeps the family tint and a family ring; Correct, Incorrect
 * and Void take the outcome's green, red or grey tint (each text colour keeps 4.5:1 on its tint) and lead with their
 * mark, as a locked pending pick leads with the padlock. */
const Probability = styled.span<{ $family: MarketFamily; $outcome: OutcomeTone }>`
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
  > svg { display: none; }
  ${tile} {
    ${chip}
    justify-content: center;
    gap: 2px;
    min-inline-size: ${chipSlot.probability};
    font-size: ${({ theme }) => theme.typography.scale.caption};
    ${({ theme, $family, $outcome }) => {
      const colours = settledTones.has($outcome) ? theme.color.outcome[$outcome] : null;
      const market = theme.color.market[$family];
      return css`
        color: ${colours ? colours.text : market.text};
        background: ${colours ? colours.background : market.soft};
        box-shadow: inset 0 0 0 1px color-mix(in srgb, ${colours ? colours.border : market.solid} 40%, transparent);
      `;
    }}
    > svg { display: block; flex: none; order: -1; font-size: 0.5rem; }
  }
  ${table} { grid-column: 3; gap: 8px; }
`;
const Percent = styled.span`
  font-size: 0.8125rem;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  ${tile} { font-size: ${({ theme }) => theme.typography.scale.caption}; line-height: 1.125rem; font-variant-numeric: normal; }
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
/** Tile: a muted "—" centred in the pick slot and no probability chip (its slot stays empty, so the market chip
 * aligns with the cards above and below); the reason stays in the hidden label. */
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
      min-inline-size: ${chipSlot.pick};
      margin-inline-end: calc(var(--gh-chip-gap) + ${chipSlot.probability});
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
  ${tile} { order: -1; inline-size: auto; block-size: auto; color: inherit; background: none; border: 0; font-size: 0.5rem; }
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
  font-size: ${({ theme }) => theme.typography.scale.micro};
  font-weight: ${({ theme }) => theme.typography.weight.bold};
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
  ${tile} { grid-column: 1 / -1; padding-block-start: 1px; }
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

/** The whole tile or row is the target. Tiles show no chevron (owner decision); the table keeps its open column. */
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
/** Paused live phases keep the tile line's dot still. */
const pausedPhases: ReadonlySet<string> = new Set(["half-time", "break", "interrupted", "suspended"]);
/** Tile labels for a live fixture without a running minute; each fits the meta line beside a country code. */
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
function CountryFlag({ url, international }: { url: string | null | undefined; international: boolean }) {
  const [failed, setFailed] = useState(false);
  if (url && !failed && isSafeRemoteImageUrl(url)) {
    return <FlagImage src={url} alt="" width={16} height={11} loading="lazy" decoding="async" referrerPolicy="no-referrer"
      onError={() => setFailed(true)} />;
  }
  return <FlagFallback>{international ? <GlobeIcon /> : <FlagIcon />}</FlagFallback>;
}

/** The market code with the part after its last space (the goal line) wrapped, so narrow phones can hide it. */
function TileMarketCode({ code }: { code: string }) {
  const split = code.lastIndexOf(" ");
  return <TileCode aria-hidden="true">{split > 0 ? <>{code.slice(0, split)}<span>{code.slice(split)}</span></> : code}</TileCode>;
}

/** Where the pointer can hover, a clamped team name (more than two lines on a tile) puts both full names in the card's
 * tooltip. The title goes on the article, the nearest titled ancestor of the covering link, so the link's accessible
 * name and description stay as they are; cards whose names fit (and every table row, where names wrap unclamped)
 * carry no title. The 1px allowance absorbs rounding of fractional line boxes. */
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
  return <Card tabIndex={-1} aria-labelledby={titleId} data-fixture-id={fixture.fixtureId} data-market={shownFamily}
    data-status={fixture.status} onPointerEnter={(event) => showFullNames(event, title)}>
    <VisuallyHidden as={`h${headingLevel}`} id={titleId}>{title}</VisuallyHidden>
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
        {(countryLabel || flagUrl) && <CountryFlag key={flagUrl ?? "none"} url={flagUrl} international={countryLabel === "INT"} />}
        {countryLabel && <><span>{countryLabel}</span><i>·</i></>}{state.dot && <TileLiveDot />}<b>{state.text}</b><i>·</i>
      </TileLine>
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
          <NoPick aria-hidden="true" data-no-pick={noPickReason(fixture)} title={reason ?? undefined}><b>—</b><span>{reason}</span></NoPick>
          <VisuallyHidden>{messages.text("match.noPickLabel", { market: family })}: {reason}</VisuallyHidden>
        </>}
      </Prediction>
      {price && <TilePrice><PriceChip aria-hidden="true">{price.price}</PriceChip>
        <VisuallyHidden>{messages.text("details.odds")}: {price.price}</VisuallyHidden></TilePrice>}
    </Pick>
    {notes.length > 0 && <Notes>{notes.map((note, index) => <Note key={index}><NoticeIcon />{note}</Note>)}</Notes>}
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
