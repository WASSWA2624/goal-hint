"use client";

import { memo, type ComponentPropsWithoutRef } from "react";
import styled from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { OutcomeBadge } from "@/components/match/prediction-presentation";
import { CompetitionLogo } from "@/components/match/competition-media";
import { LiveMatchTime, ScoreFigures, liveScoreText, matchScoreDescription } from "@/components/match/score-presentation";
import { matchCardScore } from "@/domain/match-card";
import { formLetters } from "@/domain/match-details";
import type { MarketFamily } from "@/domain/markets";
import { isPlayedFinalStatus } from "@/domain/market-settlement";
import { toUtcIsoString } from "@/domain/calendar";
import { matchArchiveHref } from "@/domain/navigation";
import { media, type AccentName } from "@/styles/theme";
import { featuredSettlementTone, type ExtendedSettlementStatus } from "@/domain/extended-markets";
import { ShieldIcon } from "@/components/ui/icons";
import { contentGutter, desktopContentPadding } from "@/components/ui/layout";
import { BothTeamsIcon, GoalsIcon, ResultIcon } from "./details-icons";
import { Crest, FormLetters, desktop, focusRing, scrollClearance, size, useStableDetails, type Messages } from "./details-ui";

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
    font-size: var(--gh-font-body);
  }
`;

function outcomeLabel(messages: Messages, status: ExtendedSettlementStatus) {
  const label = status === "half-win" || status === "half-loss" || status === "push" ? `match.featuredSettlement.${status}` as const
    : status === "correct" ? "match.result.won" : status === "incorrect" ? "match.result.lost" : `outcome.${status}` as const;
  return messages.text(label);
}

export function DetailOutcome({ status, ...props }: Omit<ComponentPropsWithoutRef<"span">, "children"> & { status: ExtendedSettlementStatus }) {
  const { messages } = useStableDetails();
  return <Outcome {...props} data-outcome={status} $outcome={featuredSettlementTone(status)}>{outcomeLabel(messages, status)}</Outcome>;
}

/**
 * A scoreboard under a home/away colour band, with competition, date and time on one line above the teams.
 * Phones place crests above the names; desktop sets each crest beside its name. Both follow the shared page rails.
 */
const Box = styled.section<{ $touchline: boolean }>`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  grid-template-areas: "ctx ctx ctx" "home vs away";
  align-items: start;
  gap: var(--gh-spacing-2_5) var(--gh-spacing-2);
  margin-inline: calc(-1 * ${contentGutter});
  padding: var(--gh-spacing-3) ${({ theme }) => theme.layout.gutter} var(--gh-size-3_5);
  background: linear-gradient(90deg, ${({ theme }) => theme.color.accent.orange.solid} 0 50%, ${({ theme }) => theme.color.accent.blue.solid} 50% 100%) top / 100% var(--gh-size-0_75) no-repeat,
    ${({ theme }) => theme.color.surface};
  ${scrollClearance}
  ${desktop} {
    align-items: center;
    gap: var(--gh-spacing-2) var(--gh-spacing-7);
    margin-inline: 0;
    padding: var(--gh-spacing-3_75) var(--gh-spacing-6) var(--gh-spacing-4_5);
    border: 0;
    border-radius: ${({ theme }) => theme.radius.none};
    min-block-size: ${({ $touchline }) => $touchline ? "var(--gh-size-32)" : "auto"};
  }
  ${desktopContentPadding(true)}
`;
/**
 * Competition, round, date and time on one centred line above the teams. Each separator is glued to the item
 * before it, so a long competition name wraps after a dot, never before one.
 */
const Context = styled.p`
  grid-area: ctx;
  margin: 0;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${size("secondary")};
  font-variant-numeric: tabular-nums;
  line-height: var(--gh-leading-compact);
  text-align: center;
  text-wrap: balance;
  > [data-competition-logo] { margin-inline-end: var(--gh-spacing-1_5); vertical-align: calc(-1 * var(--gh-size-0_75)); }
  > span { white-space: nowrap; }
  /* Desktop clips the one line; the padding, taken back by the margin, keeps the day link's focus ring inside the clip. */
  ${desktop} {
    min-inline-size: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; padding-block: var(--gh-spacing-1_5); margin-block: calc(-1 * var(--gh-spacing-1_5));
    font-size: ${size("body")}; > [data-competition-logo] { --gh-league-mark-size: var(--gh-size-4_5); vertical-align: calc(-1 * var(--gh-size-1)); }
  }
`;
/** The kickoff day links to that EAT day's predictions in the line's own colour; hover and focus show it is a link. */
const DayLink = styled(Link)`
  color: inherit;
  text-decoration: none;
  [data-kickoff-full-date] { display: none; }
  ${desktop} {
    [data-kickoff-short-date] { display: none; }
    [data-kickoff-full-date] { display: inline; }
  }
  ${media.hover} { &:hover { text-decoration: underline; } }
  ${focusRing}
`;
/** Phones: 44px crests and 14px names; long names such as "Manchester United" wrap between words. */
const Team = styled.div<{ $side: "home" | "away" }>`
  grid-area: ${({ $side }) => $side};
  display: grid;
  justify-items: center;
  gap: var(--gh-spacing-1);
  min-inline-size: 0;
  text-align: center;
  > :first-child { --gh-logo-size: var(--gh-size-11); --gh-logo-font: var(--gh-size-4); }
  /* Desktop: both crests sit beside the score, with the name centred on the crest and the home name aligned towards it. */
  ${desktop} {
    display: flex;
    flex-direction: ${({ $side }) => $side === "home" ? "row-reverse" : "row"};
    align-items: center;
    gap: var(--gh-spacing-3_5);
    text-align: ${({ $side }) => $side === "home" ? "end" : "start"};
    > :first-child { --gh-logo-size: var(--gh-size-14); --gh-logo-font: var(--gh-size-5); flex: none; }
  }
`;
/** Name over recent form; phones keep both as direct items of the centred team stack. */
const TeamText = styled.div<{ $side: "home" | "away"; $touchline: boolean }>`
  display: contents;
  > strong { font-size: ${size("emphasis")}; line-height: var(--gh-leading-control); overflow-wrap: anywhere; }
  ${desktop} {
    display: grid;
    flex: 1;
    justify-items: ${({ $side }) => $side === "home" ? "end" : "start"};
    gap: var(--gh-spacing-1_25);
    > small { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-caption); letter-spacing: var(--gh-tracking-heading); text-transform: uppercase; }
    min-inline-size: 0;
    > strong { min-inline-size: 0; max-inline-size: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: ${({ $touchline }) => $touchline ? "var(--gh-font-feature)" : "var(--gh-font-page)"}; }
  }
`;
const Versus = styled.div`
  grid-area: vs;
  display: grid;
  justify-items: center;
  gap: var(--gh-spacing-0_5);
  padding-block-start: var(--gh-spacing-0_5);
  > b {
    display: grid;
    place-items: center;
    min-inline-size: var(--gh-size-9);
    block-size: var(--gh-size-9);
    padding-inline: var(--gh-spacing-1_5);
    color: ${({ theme }) => theme.color.mutedText};
    background: ${({ theme }) => theme.color.surfaceMuted};
    border-radius: ${({ theme }) => theme.radius.control};
    font-size: ${size("body")};
    font-variant-numeric: tabular-nums;
  }
  > b[data-score] { display: flex; align-items: baseline; gap: var(--gh-spacing-1); block-size: auto; color: ${({ theme }) => theme.color.text}; background: none; font-size: var(--gh-font-displayLarge); font-weight: ${({ theme }) => theme.typography.weight.heavy}; line-height: var(--gh-leading-dense); white-space: nowrap; }
  > b[data-live-score] { ${liveScoreText} }
  > span { color: ${({ theme }) => theme.color.mutedText}; font-size: ${size("secondary")}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  > span[data-live] { display: inline-flex; align-items: center; gap: var(--gh-spacing-1_25); color: ${({ theme }) => theme.color.live.text}; }
  > span[data-live]::before { content: ""; inline-size: var(--gh-size-1_75); block-size: var(--gh-size-1_75); background: ${({ theme }) => theme.color.live.solid}; border-radius: ${({ theme }) => theme.radius.circle}; }
  ${desktop} {
    gap: var(--gh-spacing-1);
    padding-block-start: 0;
    > b { min-inline-size: var(--gh-size-12); block-size: var(--gh-size-12); font-size: var(--gh-font-reading); }
    > b[data-score] { block-size: auto; font-size: var(--gh-font-hero); }
    > span { font-size: ${size("body")}; }
    > span[data-live] { margin-block-start: var(--gh-spacing-0_5); font-size: ${size("emphasis")}; }
  }
`;

/**
 * Fixture scoreboard: competition, device-local kickoff, teams with recent form, and the score and clock once
 * the match is under way. It reads no view state, so section and filter changes skip it.
 */
export const MatchBanner = memo(function MatchBanner({ touchline = false }: { touchline?: boolean }) {
  const { data, preview, messages, locale, home, away } = useStableDetails();
  const fixture = data.fixture, context = preview?.sections.context;
  const currentLiveScore = fixture.status === "live";
  const final = isPlayedFinalStatus(fixture.status) || fixture.status === "awarded";
  const display = matchCardScore(fixture, true);
  const score = currentLiveScore || final ? display.score : null;
  const shootout = display.shootout && { home: messages.number(display.shootout.home), away: messages.number(display.shootout.away) };
  const delayed = (fixture.status === "scheduled" || fixture.status === "unknown") && fixture.kickoffAt !== null &&
    fixture.kickoffAt <= data.asOf && fixture.update?.statusFreshness?.state === "awaiting-update";
  const form = (side: "home" | "away") => {
    const team = side === "home" ? fixture.homeTeam : fixture.awayTeam, records = preview?.sections.form[side] ?? [];
    return records.length ? <FormLetters letters={formLetters(records, team.id, 5)} label={messages.text("details.lastFive", { team: side === "home" ? home : away })} /> : null;
  };
  const status = currentLiveScore && fixture.liveClock && (fixture.liveClock.minute !== null || fixture.liveClock.phase !== "in-play")
    ? <LiveMatchTime clock={fixture.liveClock} messages={messages} showStoppageSeconds />
    : delayed ? messages.text("match.result.delayed") : messages.text(`match.status.${fixture.status}`);
  const competition = [fixture.competition.name || messages.text("match.competitionUnknown"), context?.competition.round].filter(Boolean).join("\u00a0· ");
  return <Box $touchline={touchline} id="current-match-summary" aria-labelledby="match-banner-title">
    <Context title={competition}>
      <CompetitionLogo country={fixture.competition.country} url={fixture.competition.logoUrl} />
      {competition}{"\u00a0· "}
      {fixture.kickoffAt !== null ? <span><DayLink href={matchArchiveHref(fixture.kickoffAt, locale)!} prefetch={false}>
        <time dateTime={toUtcIsoString(fixture.kickoffAt)}>
          <span data-kickoff-short-date>{messages.reportingDay(fixture.kickoffAt)}</span>
          <span data-kickoff-full-date>{messages.shortKickoffDate(fixture.kickoffAt, true)}</span>
        </time></DayLink>
        {"\u00a0· "}{messages.kickoffTime(fixture.kickoffAt)}</span> : <span>{messages.text("details.kickoffUnknown")}</span>}
    </Context>
    <h1 id="match-banner-title" style={{ position: "absolute", inlineSize: "var(--gh-size-0_25)", blockSize: "var(--gh-size-0_25)", overflow: "hidden", clipPath: "inset(50%)" }}>
      {messages.text("match.title", { home, away })}
    </h1>
    <Team $side="home"><Crest name={fixture.homeTeam.name} url={fixture.homeTeam.logoUrl} size={48} eager />
      <TeamText $side="home" $touchline={touchline}>{touchline && <small>{messages.text("touchline.home")}</small>}<strong title={home}>{home}</strong>{!touchline && form("home")}</TeamText></Team>
    <Versus>
      {score ? <b data-score data-live-score={currentLiveScore || undefined}
        title={shootout || display.regulationOnly ? matchScoreDescription(display, { home, away }, messages, final, false) : undefined}>
        {shootout ? <ScoreFigures home={messages.number(score.home)} away={messages.number(score.away)} shootout={shootout} />
          : <>{messages.number(score.home)} – {messages.number(score.away)}</>}
      </b> : <b>{final ? "–" : messages.text("details.versus")}</b>}
      {(fixture.status !== "scheduled" || delayed) && <span data-live={currentLiveScore || undefined}
        title={delayed ? messages.text("match.result.delayedDetail") : undefined}>{status}</span>}
    </Versus>
    <Team $side="away"><Crest name={fixture.awayTeam.name} url={fixture.awayTeam.logoUrl} size={48} eager />
      <TeamText $side="away" $touchline={touchline}>{touchline && <small>{messages.text("touchline.away")}</small>}<strong title={away}>{away}</strong>{!touchline && form("away")}</TeamText></Team>
  </Box>;
});
