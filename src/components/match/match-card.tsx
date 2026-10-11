"use client";

import Link from "next/link";
import { memo, useId, useState } from "react";
import styled, { css, keyframes } from "styled-components";
import { toUtcIsoString } from "@/domain/calendar";
import { bestCardFamily, noPickReason } from "@/domain/feed-presentation";
import type { FixtureSnapshot } from "@/domain/fixture-snapshot";
import { hasFinalScoreStatus, sameCardFixture, selectedCardPrediction } from "@/domain/match-card";
import type { MarketFamily } from "@/domain/markets";
import { matchHref } from "@/domain/navigation";
import { publicPolicy } from "@/domain/public-policy";
import { isSafeRemoteImageUrl } from "@/domain/remote-image";
import { createMessages } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/locales";
import { media, type OutcomeTone } from "@/styles/theme";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { CheckIcon, ChevronIcon, CrossIcon, LockIcon, NoticeIcon, TrophyIcon, VoidIcon } from "./match-icons";
import { matchTableColumns, matchTableGap } from "./match-columns";
import { ShortTeamName } from "./short-team-name";
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
/** Placement for the phone/tablet card; the table query restyles the same DOM as one row. Static strings, so the
 * media blocks need no theme lookup per card render. Below 22.5rem (320px phones, or enlarged text on any phone) the
 * league and kickoff move onto their own line; from 22.5rem to 24.37rem (360–389px phones) the meta column narrows
 * and the kickoff line runs under the league crest; below 20rem (only reached with enlarged text, such as 125% or
 * more on a 360px phone) the chips drop under the teams; from 30rem the pick chips share one line. */
const tile = media.belowDesktop, table = media.desktop, wideTable = media.wide;
const narrowTile = "@media (max-width: 22.49rem)";
const compactTile = "@media (min-width: 22.5rem) and (max-width: 24.37rem)";
const stackedTile = "@media (max-width: 19.99rem)";
const wideTile = "@media (min-width: 30rem) and (max-width: 63.99rem)";
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
/** Card line boxes in rem, so 200% text keeps its spacing. Text clipped by an ellipsis or a line clamp gets about
 * 1.27em or more, which keeps Manrope's descenders inside the clip. Team rows and chip rows share one 20px track. */
const tileLine = { meta: "0.875rem", row: "1.25rem", chip: "1.125rem", note: "0.8125rem" } as const;
const tileShadow = {
  rest: "0 1px 2px rgb(11 31 51 / 5%), 0 2px 8px rgb(11 31 51 / 5%)",
  hover: "0 2px 4px rgb(11 31 51 / 7%), 0 6px 18px rgb(11 31 51 / 9%)",
} as const;
/** Rounded corners on phone and tablet cards only, at the owner's request; brand components are otherwise square. */
const tileRadius = { card: "10px", chip: "5px", state: "4px" } as const;
type TeamResult = "win" | "loss" | null;
type StateTone = "live" | "final" | "halted";

/**
 * Phone card: a white rounded row with a soft shadow. Left, the league crest beside the league name (up to two
 * lines) and the kickoff weekday and time, or the live, final or halted chip in their place; middle, home over away,
 * each with crest, fitted name and score; right, the market code, pick and probability chips (two rows below 30rem,
 * one row from 30rem) and a chevron.
 * Every match state: 1 + 8 + 44 (20 + 4 + 20 team rows) + 8 + 1 = 62px; notes add a row only when present.
 * Columns at 390px (358px card, 330px content): 88 meta + 6 + 140 teams + 6 + 90 chips. Compact (360px, 300px
 * content): 72 meta + 6 + 126 teams + 6 + 90 chips. The teams track stops at 24rem, so on tablets the spare width
 * opens before the chips instead of stretching names away from their scores.
 * Narrow (320px): a 14px meta line + 4 on top, 80px in all, which keeps a 122px name box beside a score where three
 * columns would leave 46px; stacked (enlarged text): meta, teams, then chips.
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
    /* The chevron centres on the 2.75rem teams track below the top padding. */
    --gh-chevron-top: calc(8px + 1.375rem);
    grid-template-columns: 5.5rem 0.375rem minmax(0, 24rem) minmax(0.375rem, 1fr) auto;
    grid-template-rows: minmax(2.75rem, auto);
    grid-template-areas: "meta . teams . pick";
    align-items: center;
    padding: 8px 18px 8px 8px;
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    border-radius: ${tileRadius.card};
    box-shadow: ${tileShadow.rest};
    ${media.hover} { &:hover { box-shadow: ${tileShadow.hover}; } }
  }
  ${compactTile} { grid-template-columns: 4.5rem 0.375rem minmax(0, 24rem) minmax(0.375rem, 1fr) auto; }
  ${narrowTile} {
    --gh-chevron-top: calc(8px + ${tileLine.meta} + 4px + 1.375rem);
    grid-template-columns: minmax(0, 1fr) 0.375rem auto;
    grid-template-rows: auto minmax(2.75rem, auto);
    grid-template-areas: "meta meta meta" "teams . pick";
    row-gap: 4px;
  }
  ${stackedTile} { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto auto; grid-template-areas: "meta" "teams" "pick"; }
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

/** Tile: the league crest spans the league name and kickoff lines; on compact phones the name spans the column and
 * the crest sits beside the kickoff line (`Wed 21:00` needs 58px), and on narrow phones all three share one line. */
const Meta = styled.header`
  ${tile} {
    grid-area: meta;
    display: grid;
    grid-template-columns: 1.125rem minmax(0, 1fr);
    grid-template-areas: "logo name" "logo when";
    align-items: center;
    gap: 1px 4px;
    min-inline-size: 0;
  }
  /* Compact phones: the name takes the column's full width (whole words only), crest and kickoff share the line below. */
  ${compactTile} { grid-template-areas: "name name" "logo when"; }
  ${narrowTile} { grid-template-columns: 0.875rem minmax(0, 1fr) auto; grid-template-areas: "logo name when"; column-gap: 6px; }
  ${table} { display: grid; grid-column: 1 / span 3; grid-template-columns: subgrid; }
`;
const Index = styled.span`
  display: none;
  ${table} { display: block; grid-column: 1; grid-row: 1; font-variant-numeric: tabular-nums; }
`;
/** Tile: up to two lines (one on narrow phones), hyphenating a long word before the clamp clips it. `&&` outranks
 * the league's shared single-line rule for its spans. */
const LeagueName = styled.span`
  ${tile} {
    && {
      grid-area: name;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      white-space: normal;
      overflow-wrap: break-word;
      -webkit-hyphens: auto;
      hyphens: auto;
    }
  }
  ${narrowTile} { && { -webkit-line-clamp: 1; } }
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
    line-height: ${tileLine.meta};
    > svg {
      grid-area: logo;
      box-sizing: border-box;
      inline-size: 1.125rem;
      block-size: 1.125rem;
      padding: 3px;
      border-radius: 50%;
      background: ${({ theme }) => theme.color.surfaceMuted};
    }
  }
  /* A 14px crest keeps the kickoff line at 14px, so two name lines plus it fit the 44px teams track. */
  ${compactTile} { > svg { inline-size: 0.875rem; block-size: 0.875rem; padding: 2px; } }
  ${narrowTile} { > svg { inline-size: 0.875rem; block-size: 0.875rem; padding: 2px; } }
  ${table} { grid-column: 3; grid-row: 1; gap: 8px; > svg { font-size: 1rem; } > span { white-space: normal; } }
`;
const LeagueLogo = styled.img`
  flex: none;
  inline-size: 12px;
  block-size: 12px;
  object-fit: contain;
  ${tile} { grid-area: logo; inline-size: 1.125rem; block-size: 1.125rem; }
  ${compactTile} { inline-size: 0.875rem; block-size: 0.875rem; }
  ${narrowTile} { inline-size: 0.875rem; block-size: 0.875rem; }
  ${table} { inline-size: 18px; block-size: 18px; }
`;
/** Tile: the short weekday and the time ("Sun 21:00"). A live, final or halted chip takes the line instead; the
 * kickoff then stays in hidden text. */
const When = styled.time<{ $replaced: boolean }>`
  display: flex;
  align-items: center;
  gap: 4px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  ${tile} {
    grid-area: when;
    justify-self: start;
    gap: 3px;
    min-inline-size: 0;
    max-inline-size: 100%;
    color: ${({ theme }) => theme.color.mutedText};
    font-size: ${({ theme }) => theme.typography.scale.caption};
    line-height: ${tileLine.meta};
    white-space: normal;
    ${({ $replaced }) => $replaced && visuallyHidden}
  }
  ${narrowTile} { justify-self: end; }
  ${table} { grid-column: 2; grid-row: 1; flex-wrap: wrap; gap: 0 6px; white-space: normal; }
`;
/** The full day ("Sun, Oct 11") shows in the table; tiles keep it as hidden text beside the visible weekday. */
const KickoffDay = styled.span`
  ${tile} { ${visuallyHidden} }
`;
const Dot = styled.span`
  color: ${({ theme }) => theme.color.border};
  ${tile} { display: none; }
  ${table} { display: none; }
`;
const TileWeekday = styled.span`
  display: none;
  ${tile} { display: inline; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
`;
const KickoffTime = styled.span`
  ${tile} { font-weight: ${({ theme }) => theme.typography.weight.bold}; }
`;
/** Tile copy of the match state in the kickoff line's place: a live chip (its dot pulses only while play runs), an
 * outlined final chip or an amber halted chip. Decorative; the hidden score-line block keeps the spoken state. */
const TileState = styled.span<{ $tone: StateTone }>`
  display: none;
  ${tile} {
    grid-area: when;
    justify-self: start;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    max-inline-size: 100%;
    padding: 0 4px;
    border-radius: ${tileRadius.state};
    font-size: ${({ theme }) => theme.typography.scale.micro};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    line-height: ${tileLine.meta};
    white-space: nowrap;
    > span { ${ellipsis} }
    ${({ $tone, theme }) => $tone === "live"
      ? css`color: ${theme.color.live.text}; background: ${theme.color.live.soft};`
      : $tone === "final" ? css`color: ${theme.color.mutedText}; box-shadow: inset 0 0 0 1px ${theme.color.border};`
      : css`color: ${theme.color.accent.amber.text}; background: ${theme.color.accent.amber.soft};`}
  }
  ${narrowTile} { justify-self: end; }
`;
const TileLiveDot = styled.span`
  flex: none;
  inline-size: 5px;
  block-size: 5px;
  border-radius: 50%;
  background: ${({ theme }) => theme.color.live.solid};
  animation: ${pulse} 1.6s ease-in-out infinite;
  @media (prefers-reduced-motion: reduce) { animation: none; }
`;

const Teams = styled.div`
  --gh-logo-size: 16px;
  --gh-logo-radius: 0;
  --gh-logo-font: 0.5rem;
  /* Tile: home over away; initials sit in a soft ringed disc, loaded crests keep their own shape. */
  ${tile} {
    --gh-logo-size: 1.125rem;
    --gh-logo-font: ${({ theme }) => theme.typography.scale.micro};
    --gh-logo-radius: 50%;
    --gh-logo-ring: inset 0 0 0 1px ${({ theme }) => theme.color.border};
    grid-area: teams;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    min-inline-size: 0;
  }
  ${table} { --gh-logo-size: 22px; --gh-logo-font: 0.625rem; display: grid; grid-column: 4 / span 3; grid-template-columns: subgrid; align-items: center; }
`;
const Team = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-inline-size: 0;
  /* Both crests sit beside the score; the home name aligns towards it. */
  ${table} { gap: 8px; &[data-team-side="home"] { flex-direction: row-reverse; text-align: end; } }
`;
/** On tiles the name fits its one line: the full name, else the team code or a shortened name, else an ellipsis. */
const TeamName = styled(ShortTeamName)<{ $result: TeamResult }>`
  flex: 1;
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  ${ellipsis}
  /* Team names lead the tile; after a decided final the loser steps back and the winner firms up. */
  ${tile} {
    color: ${({ theme, $result }) => $result === "loss" ? theme.color.mutedText : theme.color.text};
    font-size: ${({ theme }) => theme.typography.scale.body};
    line-height: ${tileLine.row};
    ${({ theme, $result }) => $result === "win" && css`font-weight: ${theme.typography.weight.bold};`}
  }
  ${table} { white-space: normal; font-weight: ${({ theme }) => theme.typography.weight.body}; }
`;
/** Per-team score for the tile, as narrow as one tabular digit (8.7px) allows; the table shows the combined score
 * column instead. */
const TeamScore = styled.span<{ $live: boolean; $result: TeamResult }>`
  flex: none;
  min-inline-size: 0.75rem;
  color: ${({ theme, $live, $result }) => $live ? theme.color.live.text : $result === "loss" ? theme.color.mutedText : theme.color.text};
  font-size: ${({ theme }) => theme.typography.scale.emphasis};
  font-weight: ${({ theme, $result }) => $result === "loss" ? theme.typography.weight.medium : theme.typography.weight.heavy};
  line-height: ${tileLine.row};
  text-align: end;
  font-variant-numeric: tabular-nums;
  ${table} { display: none; }
`;
/** Tile: the team rows and the meta chip show the state, so only the hidden score line and status text remain. */
const Center = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  ${tile} { ${visuallyHidden} }
`;
const Versus = styled.span`
  color: ${({ theme }) => theme.color.mutedText};
  ${tile} { display: none; }
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
  ${tile} { display: none; }
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
 * Tile: the market code chip (grey), the pick chip (the family's clean tint) and the probability chip (bold, the tint
 * with a family ring; once settled the outcome's tint with its ✓/✗/⊘), in a fixed 5.625rem block of two 20px rows
 * aligned with the team rows, or on one line in a 9.5rem block from 30rem. The widest pair, "O/U 2.5" + "Under",
 * needs 87.5px. Table: market, prediction and probability columns.
 */
const Pick = styled.div`
  ${tile} {
    grid-area: pick;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-rows: ${tileLine.row} minmax(${tileLine.row}, auto);
    grid-template-areas: "code pick" "prob prob";
    align-items: center;
    gap: 4px 3px;
    inline-size: 5.625rem;
  }
  ${wideTile} {
    grid-template-columns: auto auto minmax(3.75rem, auto);
    grid-template-rows: minmax(${tileLine.row}, auto);
    grid-template-areas: "code pick prob";
    justify-content: end;
    inline-size: 9.5rem;
  }
  ${stackedTile} {
    grid-template-columns: auto auto minmax(3.75rem, auto);
    grid-template-rows: minmax(${tileLine.row}, auto);
    grid-template-areas: "code pick prob";
    justify-content: start;
    inline-size: auto;
  }
  ${table} { display: grid; grid-column: 7 / span 3; grid-template-columns: subgrid; align-items: center; }
`;
/** Shared tile chip box; rules after it may raise the minimum width. */
const chip = css`
  ${ellipsis}
  border-radius: ${tileRadius.chip};
  line-height: ${tileLine.chip};
  text-align: center;
`;
/** Tile only: the short market code (1X2, DC, O/U 2.5, BTTS). */
const TileCode = styled.span`
  display: none;
  ${tile} {
    ${chip}
    grid-area: code;
    display: block;
    padding: 0 4px;
    color: ${({ theme }) => theme.color.mutedText};
    background: ${({ theme }) => theme.color.surfaceMuted};
    font-size: ${({ theme }) => theme.typography.scale.micro};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
  }
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
  /* Its chips join the pick grid. */
  ${tile} { display: contents; }
  ${table} { display: contents; > svg { display: none; } }
`;
const PickLabel = styled.span`
  flex: 1;
  font-size: 0.6875rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  ${ellipsis}
  ${tile} { display: none; }
  ${table} { display: none; }
`;
/** Tile: the short pick ("1", "X2", "Over", "Yes") in the family's clean tint (family text keeps 4.5:1 on it).
 * Table: the pick in a family-gradient pill. MarketColors keeps white text at 4.5:1 on both gradient stops
 * (tests/market-colors.test.mjs); AccentColors gradients are only rated for large text and must not be used here. */
const PickShort = styled.span<{ $family: MarketFamily }>`
  display: none;
  ${tile} {
    ${chip}
    grid-area: pick;
    display: block;
    min-inline-size: 1.5rem;
    padding: 0 4px;
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
/** Tile: the bold probability chip. Pending keeps the family tint and a family ring; Correct, Incorrect and Void take
 * the outcome's green, red or grey tint (each text colour keeps 4.5:1 on its tint) and lead with their mark, as a
 * locked pending pick leads with the padlock. */
const Probability = styled.span<{ $family: MarketFamily; $outcome: OutcomeTone }>`
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
  > svg { display: none; }
  ${tile} {
    grid-area: prob;
    justify-content: center;
    gap: 3px;
    min-inline-size: 0;
    padding: 0 6px;
    border-radius: ${tileRadius.chip};
    line-height: ${tileLine.chip};
    ${({ theme, $family, $outcome }) => {
      const colours = settledTones.has($outcome) ? theme.color.outcome[$outcome] : null;
      const market = theme.color.market[$family];
      return css`
        color: ${colours ? colours.text : market.text};
        background: ${colours ? colours.background : market.soft};
        box-shadow: inset 0 0 0 1px color-mix(in srgb, ${colours ? colours.border : market.solid} 40%, transparent);
      `;
    }}
    > svg { display: block; flex: none; order: -1; font-size: 0.6875rem; }
  }
  ${table} { grid-column: 3; gap: 8px; }
`;
const Percent = styled.span`
  font-size: 0.8125rem;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  ${tile} { font-size: ${({ theme }) => theme.typography.scale.secondary}; line-height: ${tileLine.chip}; }
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
/** Tile: a muted outlined "—" in the pick chip's place and the reason, up to two lines, in the probability's. Every
 * reason fits two lines in the 5.625rem block (the widest line, "Predictions start", needs 80.4px). In the two-row
 * block a negative block margin lets two 13px lines (26px) sit in the 20px row, spilling 3px into the row gap and the
 * card padding, so the card stays 62px; their cap tops still clear the chips by 5px. */
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
      grid-area: pick;
      display: block;
      min-inline-size: 1.5rem;
      padding: 0 4px;
      color: ${({ theme }) => theme.color.mutedText};
      background: none;
      box-shadow: none;
      text-align: start;
      font-size: ${({ theme }) => theme.typography.scale.caption};
    }
    > span {
      grid-area: prob;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      margin-block: calc((${tileLine.row} - 2 * ${tileLine.note}) / 2);
      color: ${({ theme }) => theme.color.mutedText};
      font-size: ${({ theme }) => theme.typography.scale.micro};
      font-weight: ${({ theme }) => theme.typography.weight.medium};
      line-height: ${tileLine.note};
      text-align: center;
      white-space: normal;
    }
  }
  /* One-row blocks have the height for two lines. */
  ${wideTile} { > span { margin-block: 0; text-align: start; } }
  ${stackedTile} { > span { margin-block: 0; text-align: start; } }
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
  ${tile} { order: -1; inline-size: auto; block-size: auto; color: inherit; background: none; border: 0; font-size: 0.6875rem; }
  ${table} { inline-size: 1.125rem; block-size: 1.125rem; font-size: 0.6875rem; }
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
  ${tile} { border-radius: ${tileRadius.state}; }
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
   * browser's tap overlay, inside the card's rounded border. The chevron sits in the card's right padding, centred on
   * the team rows. */
  ${tile} {
    border-radius: calc(${tileRadius.card} - 1px);
    -webkit-tap-highlight-color: transparent;
    &:active { background: color-mix(in srgb, ${({ theme }) => theme.color.text} 8%, transparent); }
    > svg {
      position: absolute;
      inset-block-start: var(--gh-chevron-top);
      inset-inline-end: 2px;
      display: block;
      font-size: 0.875rem;
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
/** Paused live phases keep the tile chip's dot still. */
const pausedPhases: ReadonlySet<string> = new Set(["half-time", "break", "interrupted", "suspended"]);

/** Short EAT weekday for the tile's kickoff line; the time element's hidden text keeps the full day. One immutable
 * formatter per (supported, so bounded) locale. */
const weekdayFormats = new Map<string, Intl.DateTimeFormat>();
function kickoffWeekday(locale: string, kickoff: number): string {
  let format = weekdayFormats.get(locale);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, { timeZone: publicPolicy.reportingTimeZone, calendar: "gregory", weekday: "short" });
    weekdayFormats.set(locale, format);
  }
  return format.format(kickoff);
}

function liveClockLabel(fixture: FixtureSnapshot, messages: Messages) {
  const minute = fixture.liveClock?.minute ?? null, phase = fixture.liveClock?.phase ?? "in-play";
  const visible = minute !== null ? messages.text("match.clock.minute", { minute: messages.number(minute) })
    : phase === "in-play" ? messages.text("match.liveBadge") : messages.text(`match.clock.${phase}`);
  return { minute, phase, visible };
}

/** Whether the match state shows a chip (live, final or halted); on tiles it then replaces the kickoff line. */
function hasStateChip(status: FixtureSnapshot["status"]): boolean {
  return status !== "scheduled" && status !== "unknown";
}

function MatchState({ fixture, home, away, messages }: { fixture: FixtureSnapshot; home: string; away: string; messages: Messages }) {
  const { status, score } = fixture;
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

/** The tile's decorative copy of the state chip, shown in the kickoff line's place. */
function TileStatus({ fixture, messages }: { fixture: FixtureSnapshot; messages: Messages }) {
  const { status } = fixture;
  if (!hasStateChip(status)) return null;
  if (status === "live") {
    const { phase, visible } = liveClockLabel(fixture, messages);
    return <TileState aria-hidden="true" $tone="live">{!pausedPhases.has(phase) && <TileLiveDot />}<span>{visible}</span></TileState>;
  }
  if (status === "finished-regulation" || status === "finished-extra-time" || status === "finished-penalties") {
    const regulationOnly = fixture.scorePeriod === "regulation" && status !== "finished-regulation";
    return <TileState aria-hidden="true" $tone="final"><span>{messages.text(`match.final.${status}`)}{regulationOnly && "*"}</span></TileState>;
  }
  return <TileState aria-hidden="true" $tone="halted"><span>{messages.text(`match.status.${status}`)}</span></TileState>;
}

function CardTeam({ team, side, name, eager, score, live, result }: {
  team: FixtureSnapshot["homeTeam"]; side: "home" | "away"; name: string; eager: boolean; score: string | null; live: boolean;
  result: TeamResult;
}) {
  const url = isSafeRemoteImageUrl(team.logoUrl) ? team.logoUrl : undefined;
  return <Team data-team-side={side} data-result={result ?? undefined}>
    <TeamLogo key={`${team.id}:${url ?? "missing"}`} name={team.name} url={url} eager={eager} />
    {/* A tight tile swaps in the provider code; a team without one falls back to the shortened name, then an ellipsis. */}
    <TeamName name={name} code={team.code ?? null} $result={result} />
    {score !== null && <TeamScore aria-hidden="true" $live={live} $result={result}>{score}</TeamScore>}
  </Team>;
}

function CompetitionLogo({ url }: { url: string | null | undefined }) {
  const [failed, setFailed] = useState(false);
  return url && !failed && isSafeRemoteImageUrl(url)
    ? <LeagueLogo src={url} alt="" width={14} height={14} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <TrophyIcon />;
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
  const live = fixture.status === "live";
  const final = hasFinalScoreStatus(fixture.status);
  const showScore = fixture.score !== null && (live || final);
  // Only a decided final score names a winner; a 90-minute score shown for an extra-time or penalties finish does not.
  const decided = showScore && final && !(fixture.scorePeriod === "regulation" && fixture.status !== "finished-regulation");
  const lead = decided ? Math.sign(fixture.score!.home - fixture.score!.away) : 0;
  const stateChip = hasStateChip(fixture.status);
  return <Card tabIndex={-1} aria-labelledby={titleId} data-fixture-id={fixture.fixtureId} data-market={shownFamily}
    data-status={fixture.status}>
    <VisuallyHidden as={`h${headingLevel}`} id={titleId}>{messages.text("match.title", { home, away })}</VisuallyHidden>
    <Meta>
      {position !== undefined && <Index aria-hidden="true">{messages.number(position)}</Index>}
      <League title={country ?? undefined}><CompetitionLogo url={fixture.competition.logoUrl} /><LeagueName>{competition}</LeagueName>
        {country && <VisuallyHidden>, {country}</VisuallyHidden>}</League>
      {fixture.kickoffAt === null ? <When as="p" $replaced={stateChip}>{messages.text("match.kickoffUnknown")}</When>
        : <When dateTime={toUtcIsoString(fixture.kickoffAt)} title={messages.reportingInstant(fixture.kickoffAt)} $replaced={stateChip}>
          <VisuallyHidden>{messages.text("match.kickoff")}: </VisuallyHidden>
          <KickoffDay>{messages.reportingDay(fixture.kickoffAt)}</KickoffDay><Dot aria-hidden="true">·</Dot>
          <TileWeekday aria-hidden="true">{kickoffWeekday(locale, fixture.kickoffAt)}</TileWeekday>
          <KickoffTime>{messages.reportingTime(fixture.kickoffAt)}<VisuallyHidden> EAT</VisuallyHidden></KickoffTime>
        </When>}
      <TileStatus fixture={fixture} messages={messages} />
    </Meta>
    <Teams>
      <CardTeam team={fixture.homeTeam} side="home" name={home} eager={eagerLogos} live={live}
        score={showScore ? messages.number(fixture.score!.home) : null} result={lead > 0 ? "win" : lead < 0 ? "loss" : null} />
      <MatchState fixture={fixture} home={home} away={away} messages={messages} />
      <CardTeam team={fixture.awayTeam} side="away" name={away} eager={eagerLogos} live={live}
        score={showScore ? messages.number(fixture.score!.away) : null} result={lead < 0 ? "win" : lead > 0 ? "loss" : null} />
    </Teams>
    <Pick>
      <TileCode aria-hidden="true">{messages.text(`market.code.${shownFamily}`)}</TileCode>
      <MarketName $family={shownFamily} aria-hidden="true">{family}</MarketName>
      <Prediction $available={prediction !== null} data-prediction={selection ?? "none"} data-outcome={outcome} title={details ?? undefined}>
        {prediction && selection ? <>
          <PickLabel aria-hidden="true">{messages.text(`market.selection.${selection}`)}</PickLabel>
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
          <NoPick aria-hidden="true" data-no-pick={noPickReason(fixture)}><b>—</b><span>{messages.text(`match.noPickReason.${noPickReason(fixture)}`)}</span></NoPick>
          <VisuallyHidden>{messages.text("match.noPickLabel", { market: family })}: {messages.text(`match.noPickReason.${noPickReason(fixture)}`)}</VisuallyHidden>
        </>}
      </Prediction>
    </Pick>
    {notes.length > 0 && <Notes>{notes.map((note, index) => <Note key={index}><NoticeIcon />{note}</Note>)}</Notes>}
    <Open href={matchHref(fixture.fixtureId, analysisSlug, locale)} prefetch={false}>
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
