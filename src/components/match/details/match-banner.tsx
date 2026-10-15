"use client";

import { memo, type ComponentPropsWithoutRef } from "react";
import styled from "styled-components";
import { CalendarIcon, ClockIcon } from "@/components/match/match-icons";
import { OutcomeBadge, PredictionOdds, ProbabilityBar } from "@/components/match/prediction-presentation";
import { featuredFamily, formLetters, marketRow, selectedDetailPrice } from "@/domain/match-details";
import { noPickReason } from "@/domain/feed-presentation";
import type { MarketFamily } from "@/domain/markets";
import { publicPolicy } from "@/domain/public-policy";
import { toUtcIsoString } from "@/domain/calendar";
import { media, type AccentName, type OutcomeTone } from "@/styles/theme";
import { BothTeamsIcon, GoalsIcon, ResultIcon, ShieldIcon, StarIcon } from "./details-icons";
import { Crest, FormLetters, desktop, focusRing, IconBadge, scrollClearance, size, useStableDetails, type Messages } from "./details-ui";
import { marketName, percent, pickLabel } from "./labels";

export const familyIcon: Record<MarketFamily, typeof ResultIcon> = {
  "match-result": ResultIcon, "double-chance": ShieldIcon, "total-goals": GoalsIcon, "both-teams-to-score": BothTeamsIcon,
};
export const familyAccent: Record<MarketFamily, AccentName> = {
  "match-result": "emerald", "double-chance": "violet", "total-goals": "blue", "both-teams-to-score": "orange",
};

const Outcome = styled(OutcomeBadge)`
  ${media.belowDesktop} {
    padding: 0;
    border: 0;
    background: none;
    font-size: 0.8125rem;
  }
`;

function outcomeLabel(messages: Messages, status: OutcomeTone) {
  const label = status === "correct" ? "match.result.won" : status === "incorrect" ? "match.result.lost" : `outcome.${status}` as const;
  return messages.text(label);
}

export function DetailOutcome({ status, ...props }: Omit<ComponentPropsWithoutRef<"span">, "children"> & { status: OutcomeTone }) {
  const { messages } = useStableDetails();
  return <Outcome {...props} data-outcome={status} $outcome={status}>{outcomeLabel(messages, status)}</Outcome>;
}

const Box = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  grid-template-areas: "comp comp when" "home vs away" "pick pick pick";
  align-items: center;
  gap: 8px 8px;
  padding: 10px;
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-block-start: 3px solid ${({ theme }) => theme.color.brand};
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
    border-radius: 0;
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
const Featured = styled.button<{ $empty: boolean; $family: MarketFamily }>`
  grid-area: pick;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 4px 10px;
  min-inline-size: 0;
  padding: 8px 10px;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme, $empty }) => $empty ? theme.color.cardHeader : theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-inline-start: 3px solid ${({ theme, $empty, $family }) => $empty ? theme.color.border : theme.color.market[$family].solid};
  border-radius: 0;
  font: inherit;
  text-align: start;
  cursor: ${({ $empty }) => $empty ? "default" : "pointer"};
  ${focusRing}
  ${media.hover} { &:hover:not(:disabled) { border-color: ${({ theme, $family }) => theme.color.market[$family].solid}; } }
  > div { display: grid; gap: 1px; min-inline-size: 0; }
  > div > span[data-label] { display: inline-flex; align-items: center; gap: 4px; color: ${({ theme, $family }) => theme.color.market[$family].text}; font-size: ${size("caption")}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  > div > strong { font-size: ${size("emphasis")}; line-height: 1.2; overflow-wrap: anywhere; ${desktop} { font-size: 1.0625rem; } }
  > div > small { color: ${({ theme }) => theme.color.mutedText}; font-size: ${size("caption")}; }
  > span[data-result] { align-self: start; }
  > span[data-probability] {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 6px;
    color: ${({ theme }) => theme.color.text};
    > b { font-size: ${size("section")}; line-height: 1.1; font-variant-numeric: tabular-nums; }
    > small { color: ${({ theme }) => theme.color.mutedText}; font-size: ${size("micro")}; line-height: 1.15; }
  }
`;

/**
 * Fixture banner: competition, teams with recent form, device-local kickoff, score when played, and the
 * featured pick. It reads no view state, so section and filter changes skip it.
 */
export const MatchBanner = memo(function MatchBanner() {
  const { data, preview, messages, home, away, update } = useStableDetails();
  const fixture = data.fixture, context = preview?.sections.context;
  const featured = featuredFamily(data), row = featured ? marketRow(data, featured) : null;
  const price = featured ? selectedDetailPrice(data, featured) : null;
  const predictionStatus = row?.item && data.snapshot?.applicability !== "historical"
    ? row.outcome?.status ?? (data.snapshot?.applicability === "void" ? "void" : "pending") : null;
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
        <span><ClockIcon />{messages.reportingTime(fixture.kickoffAt)} {messages.timeZone(fixture.kickoffAt)}</span>
      </> : <span>{messages.text("details.kickoffUnknown")}</span>}
    </When>
    <h1 id="match-banner-title" style={{ position: "absolute", inlineSize: 1, blockSize: 1, overflow: "hidden", clipPath: "inset(50%)" }}>
      {messages.text("match.title", { home, away })}
    </h1>
    <Team $side="home"><Crest name={fixture.homeTeam.name} url={fixture.homeTeam.logoUrl} size={48} eager />
      <TeamText $side="home"><strong>{home}</strong>{form("home")}</TeamText></Team>
    <Versus>
      {played ? <b data-score>{messages.number(fixture.score!.home)} – {messages.number(fixture.score!.away)}</b> : <b>{fixture.status.startsWith("finished") || fixture.status === "awarded" ? "–" : messages.text("details.versus")}</b>}
      {(played || fixture.status !== "scheduled") && <span data-live={fixture.status === "live" || undefined}>{status}</span>}
    </Versus>
    <Team $side="away"><Crest name={fixture.awayTeam.name} url={fixture.awayTeam.logoUrl} size={48} eager />
      <TeamText $side="away"><strong>{away}</strong>{form("away")}</TeamText></Team>
    {row?.item ? <Featured type="button" $empty={false} $family={featured!} data-featured-pick={featured!}
      onClick={() => update((current) => ({ ...current, marketsOpen: true, market: featured }))} aria-label={[messages.text("details.featuredOpen", {
        market: marketName(messages, featured!), pick: pickLabel(messages, row.item.market.selection, home, away), probability: percent(messages, row.item.market.selectedProbability) }),
        price ? `${messages.text("details.odds")}: ${price}` : null, predictionStatus ? outcomeLabel(messages, predictionStatus) : null].filter(Boolean).join(". ")}>
      <div>
        <span data-label><StarIcon />{messages.text("details.topPick")}</span>
        <strong>{messages.text(`market.code.${featured!}`)} – {pickLabel(messages, row.item.market.selection, home, away)}<PredictionOdds odds={price} /></strong>
        <small>{messages.text(`market.source.${row.item.source.kind}`)}</small>
      </div>
      {predictionStatus && <DetailOutcome data-result status={predictionStatus} />}
      <span data-probability><b>{percent(messages, row.item.market.selectedProbability)}</b>
        <ProbabilityBar $family={featured!} aria-hidden="true"><span style={{ inlineSize: `${row.item.market.selectedProbability * 100}%` }} /></ProbabilityBar>
        <small>{messages.text("details.estimatedProbability")}</small></span>
    </Featured> : <Featured type="button" $empty $family="match-result" disabled data-featured-pick="none">
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
const Tile = styled.button<{ $featured: boolean; $family: MarketFamily }>`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-areas: "icon name chevron" "icon pick chevron" "icon value chevron";
  align-items: center;
  column-gap: 8px;
  min-inline-size: 0;
  padding: 7px 8px;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-inline-start: 3px solid ${({ theme, $featured, $family }) => $featured ? theme.color.market[$family].solid : theme.color.border};
  border-radius: 0;
  box-shadow: ${({ theme }) => theme.shadow.card};
  font: inherit;
  text-align: start;
  cursor: pointer;
  ${focusRing}
  ${media.hover} { &:hover { border-color: ${({ theme }) => theme.color.accent.blue.solid}; } }
  > span:first-child { grid-area: icon; border-radius: 0; }
  > b { grid-area: name; font-size: ${size("secondary")}; line-height: 1.2; }
  > span[data-pick] { grid-area: pick; min-inline-size: 0; color: ${({ theme }) => theme.color.text}; font-size: ${size("caption")}; font-weight: ${({ theme }) => theme.typography.weight.bold}; line-height: 1.3; overflow-wrap: anywhere; }
  > span[data-value] { grid-area: value; display: flex; align-items: baseline; gap: 6px; line-height: 1.2; }
  > span[data-value] > strong { color: ${({ theme }) => theme.color.text}; font-size: ${size("section")}; font-variant-numeric: tabular-nums; }
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
      const price = selectedDetailPrice(data, family);
      return <div role="listitem" key={family} style={{ display: "grid", minInlineSize: 0 }}>
        <Tile type="button" $featured={family === featured} $family={family} data-market-tile={family} onClick={() => update((current) => ({ ...current, marketsOpen: true, market: family }))}
          aria-label={[messages.text("details.tileOpen", { market: marketName(messages, family), pick, probability: percent(messages, item?.market.selectedProbability ?? null) }),
            price ? `${messages.text("details.odds")}: ${price}` : null].filter(Boolean).join(". ")}>
          <IconBadge $accent={familyAccent[family]}><Icon /></IconBadge>
          <b>{messages.text(`market.code.${family}`)}</b>
          <span data-pick>{pick}<PredictionOdds odds={price} /></span>
          <span data-value><strong>{percent(messages, item?.market.selectedProbability ?? null)}</strong>
            {item && <ProbabilityBar $family={family} aria-hidden="true"><span style={{ inlineSize: `${item.market.selectedProbability * 100}%` }} /></ProbabilityBar>}</span>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={2}><path d="m9 6 6 6-6 6" /></svg>
        </Tile>
      </div>;
    })}
  </Tiles>;
});
