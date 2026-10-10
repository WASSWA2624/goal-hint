"use client";

import { memo } from "react";
import styled from "styled-components";
import { CalendarIcon, ClockIcon } from "@/components/match/match-icons";
import { featuredFamily, formLetters, marketRow } from "@/domain/match-details";
import { noPickReason } from "@/domain/feed-presentation";
import type { MarketFamily } from "@/domain/markets";
import { publicPolicy } from "@/domain/public-policy";
import { toUtcIsoString } from "@/domain/calendar";
import { media, type AccentName } from "@/styles/theme";
import { BothTeamsIcon, GoalsIcon, ResultIcon, ShieldIcon, StarIcon } from "./details-icons";
import { Crest, FormLetters, desktop, focusRing, IconBadge, scrollClearance, size, useStableDetails } from "./details-ui";
import { marketName, percent, pickLabel } from "./labels";

export const familyIcon: Record<MarketFamily, typeof ResultIcon> = {
  "match-result": ResultIcon, "double-chance": ShieldIcon, "total-goals": GoalsIcon, "both-teams-to-score": BothTeamsIcon,
};
export const familyAccent: Record<MarketFamily, AccentName> = {
  "match-result": "orange", "double-chance": "violet", "total-goals": "blue", "both-teams-to-score": "teal",
};

const Box = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  grid-template-areas: "comp comp when" "home vs away" "pick pick pick";
  align-items: center;
  gap: 8px 8px;
  padding: 10px;
  background: ${({ theme }) => theme.gradient.edge} top / 100% 3px no-repeat, ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.border.cardRadius};
  box-shadow: ${({ theme }) => theme.shadow.card};
  ${scrollClearance}
  ${desktop} {
    grid-template-columns: minmax(9rem, 0.75fr) minmax(0, 1fr) auto minmax(0, 1fr) minmax(15rem, 1fr);
    grid-template-areas: "comp home when away pick" "comp home vs away pick";
    gap: 4px 18px;
    padding: 14px 16px;
  }
`;
const Competition = styled.div`
  grid-area: comp;
  display: flex;
  align-items: center;
  gap: 8px;
  min-inline-size: 0;
  > img { flex: none; inline-size: 28px; block-size: 28px; object-fit: contain; ${desktop} { inline-size: 44px; block-size: 44px; } }
  > div { min-inline-size: 0; }
  strong { display: block; font-size: ${size("body")}; line-height: 1.25; overflow-wrap: anywhere; ${desktop} { font-size: 1rem; } }
  span { display: block; color: ${({ theme }) => theme.color.mutedText}; font-size: ${size("caption")}; ${desktop} { font-size: ${size("body")}; } }
`;
const CompetitionLogo = styled.img``;
const When = styled.p`
  grid-area: when;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 2px 10px;
  margin: 0;
  font-size: ${size("secondary")};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  > span { display: inline-flex; align-items: center; gap: 4px; }
  svg { color: ${({ theme }) => theme.color.accent.blue.solid}; font-size: ${size("body")}; }
  ${desktop} { justify-content: center; align-self: end; font-size: ${size("emphasis")}; svg { font-size: 0.9375rem; } }
`;
/** Phones: 40px crests and 13px names keep long names such as "Manchester United" on one line. */
const Team = styled.div<{ $side: "home" | "away" }>`
  grid-area: ${({ $side }) => $side};
  display: grid;
  justify-items: center;
  gap: 4px;
  min-inline-size: 0;
  text-align: center;
  > :first-child { --gh-logo-size: 40px; --gh-logo-font: 15px; }
  /* Desktop: both crests sit beside the score, with the name centred on the crest and the home name aligned towards it. */
  ${desktop} {
    display: flex;
    flex-direction: ${({ $side }) => $side === "home" ? "row-reverse" : "row"};
    align-items: center;
    gap: 12px;
    text-align: ${({ $side }) => $side === "home" ? "end" : "start"};
    > :first-child { --gh-logo-size: 48px; --gh-logo-font: 18px; flex: none; }
  }
`;
/** Name over recent form; phones keep both as direct items of the centred team stack. */
const TeamText = styled.div<{ $side: "home" | "away" }>`
  display: contents;
  > strong { font-size: ${size("body")}; line-height: 1.2; overflow-wrap: anywhere; }
  ${desktop} {
    display: grid;
    flex: 1;
    justify-items: ${({ $side }) => $side === "home" ? "end" : "start"};
    gap: 4px;
    min-inline-size: 0;
    > strong { font-size: 1.25rem; }
  }
`;
const Versus = styled.div`
  grid-area: vs;
  display: grid;
  justify-items: center;
  gap: 2px;
  > b {
    display: grid;
    place-items: center;
    min-inline-size: 2.25rem;
    block-size: 2.25rem;
    padding-inline: 6px;
    color: ${({ theme }) => theme.color.mutedText};
    background: ${({ theme }) => theme.color.surfaceMuted};
    border-radius: 999px;
    font-size: ${size("body")};
    font-variant-numeric: tabular-nums;
  }
  > b[data-score] { color: ${({ theme }) => theme.color.text}; background: none; font-size: ${size("hero")}; }
  > span { color: ${({ theme }) => theme.color.mutedText}; font-size: ${size("caption")}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  > span[data-live] { color: ${({ theme }) => theme.color.live.text}; }
  ${desktop} {
    align-self: start;
    > b { min-inline-size: 3rem; block-size: 3rem; font-size: 0.9375rem; }
    > b[data-score] { font-size: 1.375rem; }
  }
`;
const Featured = styled.button<{ $empty: boolean }>`
  grid-area: pick;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 4px 10px;
  min-inline-size: 0;
  padding: 8px 10px;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme, $empty }) => $empty ? theme.color.cardHeader : `linear-gradient(135deg, ${theme.color.accent.orange.soft} 0%, ${theme.color.accent.amber.soft} 100%)`};
  border: ${({ theme }) => theme.border.width} solid ${({ theme, $empty }) => $empty ? theme.color.border : "#FDBA74"};
  border-radius: ${({ theme }) => theme.border.cardRadius};
  font: inherit;
  text-align: start;
  cursor: ${({ $empty }) => $empty ? "default" : "pointer"};
  ${focusRing}
  ${media.hover} { &:hover:not(:disabled) { border-color: ${({ theme }) => theme.color.accent.orange.solid}; } }
  > div { display: grid; gap: 1px; min-inline-size: 0; }
  > div > span[data-label] { display: inline-flex; align-items: center; gap: 4px; color: ${({ theme }) => theme.color.accent.orange.text}; font-size: ${size("caption")}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  > div > strong { font-size: ${size("emphasis")}; line-height: 1.2; overflow-wrap: anywhere; ${desktop} { font-size: 1.0625rem; } }
  > div > small { color: ${({ theme }) => theme.color.mutedText}; font-size: ${size("caption")}; }
  /* Phones wrap the probability label so the pick keeps the width. */
  > span[data-probability] {
    display: grid;
    justify-items: center;
    min-inline-size: 5.5rem;
    padding: 4px 10px;
    color: ${({ theme }) => theme.color.onBrand};
    background: ${({ theme }) => theme.color.accent.orange.gradient};
    border-radius: 4px;
    > b { font-size: ${size("title")}; line-height: 1.1; font-variant-numeric: tabular-nums; }
    > small { max-inline-size: 4.5rem; font-size: ${size("micro")}; line-height: 1.15; text-align: center; opacity: 0.92; }
    ${desktop} {
      > b { font-size: 1.375rem; }
      > small { max-inline-size: none; line-height: inherit; white-space: nowrap; }
    }
  }
`;

/**
 * Fixture banner: competition, teams with recent form, kickoff in EAT, score when played, and the
 * featured pick. It reads no view state, so section and filter changes skip it.
 */
export const MatchBanner = memo(function MatchBanner() {
  const { data, preview, messages, home, away, update } = useStableDetails();
  const fixture = data.fixture, context = preview?.sections.context;
  const featured = featuredFamily(data), row = featured ? marketRow(data, featured) : null;
  const played = fixture.score && (fixture.status === "live" || fixture.status.startsWith("finished") || fixture.status === "awarded");
  const form = (side: "home" | "away") => {
    const team = side === "home" ? fixture.homeTeam : fixture.awayTeam, records = preview?.sections.form[side] ?? [];
    return records.length ? <FormLetters letters={formLetters(records, team.id, 5)} label={messages.text("details.lastFive", { team: side === "home" ? home : away })} /> : null;
  };
  const status = fixture.status === "live" && fixture.liveClock
    ? fixture.liveClock.minute !== null ? messages.text("match.clock.minute", { minute: messages.number(fixture.liveClock.minute) }) : messages.text(`match.clock.${fixture.liveClock.phase}`)
    : messages.text(`match.status.${fixture.status}`);
  return <Box id="current-match-summary" aria-labelledby="match-banner-title">
    <Competition>
      {fixture.competition.logoUrl && <CompetitionLogo src={fixture.competition.logoUrl} alt="" width={44} height={44} referrerPolicy="no-referrer" />}
      <div>
        <strong>{fixture.competition.name || messages.text("match.competitionUnknown")}</strong>
        <span>{[context?.competition.round, fixture.competition.country].filter(Boolean).join(" · ") || " "}</span>
      </div>
    </Competition>
    <When>
      {fixture.kickoffAt !== null ? <>
        <span><CalendarIcon /><time dateTime={toUtcIsoString(fixture.kickoffAt)}>{messages.reportingDay(fixture.kickoffAt)}</time></span>
        <span><ClockIcon />{messages.reportingTime(fixture.kickoffAt)} EAT</span>
      </> : <span>{messages.text("details.kickoffUnknown")}</span>}
    </When>
    <h1 id="match-banner-title" style={{ position: "absolute", inlineSize: 1, blockSize: 1, overflow: "hidden", clipPath: "inset(50%)" }}>
      {messages.text("match.title", { home, away })}
    </h1>
    <Team $side="home"><Crest name={fixture.homeTeam.name} url={fixture.homeTeam.logoUrl} size={48} eager />
      <TeamText $side="home"><strong>{home}</strong>{form("home")}</TeamText></Team>
    <Versus>
      {played ? <b data-score>{messages.number(fixture.score!.home)} – {messages.number(fixture.score!.away)}</b> : <b>{messages.text("details.versus")}</b>}
      {(played || fixture.status !== "scheduled") && <span data-live={fixture.status === "live" || undefined}>{status}</span>}
    </Versus>
    <Team $side="away"><Crest name={fixture.awayTeam.name} url={fixture.awayTeam.logoUrl} size={48} eager />
      <TeamText $side="away"><strong>{away}</strong>{form("away")}</TeamText></Team>
    {row?.item ? <Featured type="button" $empty={false} data-featured-pick={featured!}
      onClick={() => update((current) => ({ ...current, marketsOpen: true, market: featured }))} aria-label={messages.text("details.featuredOpen", {
        market: marketName(messages, featured!), pick: pickLabel(messages, row.item.market.selection, home, away), probability: percent(messages, row.item.market.selectedProbability) })}>
      <div>
        <span data-label><StarIcon />{messages.text("details.topPick")}</span>
        <strong>{messages.text(`market.code.${featured!}`)} – {pickLabel(messages, row.item.market.selection, home, away)}</strong>
        <small>{messages.text("details.odds")}: — · {messages.text(`market.source.${row.item.source.kind}`)}</small>
      </div>
      <span data-probability><b>{percent(messages, row.item.market.selectedProbability)}</b><small>{messages.text("details.estimatedProbability")}</small></span>
    </Featured> : <Featured type="button" $empty disabled data-featured-pick="none">
      <div>
        <span data-label><StarIcon />{messages.text("details.topPick")}</span>
        <strong>{messages.text("details.noPick")}</strong>
        <small>{messages.text(`match.noPickReason.${noPickReason(fixture)}`)}</small>
      </div>
    </Featured>}
  </Box>;
});

const Tiles = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  ${media.tablet} { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  ${desktop} { gap: 10px; }
`;
const Tile = styled.button<{ $featured: boolean }>`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-areas: "icon name chevron" "icon pick chevron" "icon value chevron";
  align-items: center;
  column-gap: 8px;
  min-inline-size: 0;
  padding: 7px 8px;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme, $featured }) => $featured ? theme.color.accent.orange.soft : theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme, $featured }) => $featured ? "#FDBA74" : theme.color.border};
  border-radius: ${({ theme }) => theme.border.cardRadius};
  box-shadow: ${({ theme }) => theme.shadow.card};
  font: inherit;
  text-align: start;
  cursor: pointer;
  ${focusRing}
  ${media.hover} { &:hover { border-color: ${({ theme }) => theme.color.accent.blue.solid}; } }
  > span:first-child { grid-area: icon; }
  > b { grid-area: name; font-size: ${size("secondary")}; line-height: 1.2; }
  > span[data-pick] { grid-area: pick; overflow: hidden; color: ${({ theme }) => theme.color.mutedText}; font-size: ${size("caption")}; line-height: 1.3; white-space: nowrap; text-overflow: ellipsis; }
  > span[data-value] { grid-area: value; display: flex; align-items: baseline; gap: 6px; line-height: 1.2; }
  > span[data-value] > strong { color: ${({ theme, $featured }) => $featured ? theme.color.accent.orange.text : theme.color.text}; font-size: ${size("section")}; font-variant-numeric: tabular-nums; }
  > span[data-value] > small { padding: 0 6px; color: ${({ theme }) => theme.color.mutedText}; background: ${({ theme }) => theme.color.surfaceMuted}; border-radius: 4px; font-size: ${size("caption")}; }
  > svg:last-child { grid-area: chevron; color: ${({ theme }) => theme.color.mutedText}; }
  ${desktop} {
    padding: 9px 12px;
    > b { font-size: ${size("body")}; }
    > span[data-pick] { line-height: inherit; }
    > span[data-value] { line-height: inherit; }
    > span[data-value] > strong { font-size: 1.125rem; }
  }
`;

/** One compact tile per published market family; each opens that market's details. */
export const MarketTiles = memo(function MarketTiles() {
  const { data, messages, home, away, update } = useStableDetails();
  const featured = featuredFamily(data);
  return <Tiles role="list" aria-label={messages.text("details.marketSummary")}>
    {publicPolicy.markets.map((family) => {
      const { item } = marketRow(data, family), Icon = familyIcon[family];
      const pick = item ? pickLabel(messages, item.market.selection, home, away) : messages.text("details.notAvailable");
      return <div role="listitem" key={family} style={{ display: "grid", minInlineSize: 0 }}>
        <Tile type="button" $featured={family === featured} data-market-tile={family} onClick={() => update((current) => ({ ...current, marketsOpen: true, market: family }))}
          aria-label={messages.text("details.tileOpen", { market: marketName(messages, family), pick, probability: percent(messages, item?.market.selectedProbability ?? null) })}>
          <IconBadge $accent={familyAccent[family]}><Icon /></IconBadge>
          <b>{messages.text(`market.code.${family}`)}</b>
          <span data-pick>{pick}</span>
          <span data-value><strong>{percent(messages, item?.market.selectedProbability ?? null)}</strong><small title={messages.text("details.oddsMissing")}>—</small></span>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={2}><path d="m9 6 6 6-6 6" /></svg>
        </Tile>
      </div>;
    })}
  </Tiles>;
});
