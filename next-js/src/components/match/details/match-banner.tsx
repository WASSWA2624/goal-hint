"use client";

import { memo, type ComponentPropsWithoutRef } from "react";
import styled, { css } from "styled-components";
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
import { VisuallyHidden } from "@/components/ui/visually-hidden";
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
 * Both layouts share the fixture values. The desktop workspace gives the score its own bordered panel.
 */
const Box = styled.section<{ $workspace: boolean }>`
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
  ${desktopContentPadding(true)}
  ${({ $workspace }) => $workspace && css`
    align-items: center;
    gap: var(--gh-spacing-3) var(--gh-spacing-5);
    margin-inline: 0;
    padding: var(--gh-spacing-4);
    background: ${({ theme }) => theme.color.section};
    border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
    border-radius: ${({ theme }) => theme.radius.control};
    scroll-margin-block-start: var(--gh-spacing-4);
  `}
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
/** Crests sit above team names, which can wrap as the available space narrows. */
const Team = styled.div<{ $side: "home" | "away" }>`
  grid-area: ${({ $side }) => $side};
  display: grid;
  justify-items: center;
  gap: var(--gh-spacing-1);
  min-inline-size: 0;
  text-align: center;
  > :first-child { --gh-logo-size: var(--gh-size-11); --gh-logo-font: var(--gh-size-4); }
  ${desktop} {
    gap: var(--gh-spacing-2);
    > :first-child { --gh-logo-size: var(--gh-size-14); --gh-logo-font: var(--gh-size-5); }
  }
`;
/** Name over recent form; phones keep both as direct items of the centred team stack. */
const TeamText = styled.div`
  display: contents;
  > strong { font-size: ${size("emphasis")}; line-height: var(--gh-leading-control); overflow-wrap: anywhere; }
  ${desktop} {
    display: grid;
    gap: var(--gh-spacing-1_25);
    > small { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); }
    min-inline-size: 0;
    > strong { font-size: var(--gh-font-feature); text-wrap: balance; }
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
export const MatchBanner = memo(function MatchBanner({ workspace = false, summaryId = "current-match-summary" }: { workspace?: boolean; summaryId?: string }) {
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
  const titleId = `${summaryId}-title`;
  return <Box $workspace={workspace} id={summaryId} aria-label={workspace ? messages.text("touchline.scoreboard") : undefined}
    aria-labelledby={workspace ? undefined : titleId}>
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
    {!workspace && <VisuallyHidden as="h1" id={titleId}>
      {messages.text("match.title", { home, away })}
    </VisuallyHidden>}
    <Team $side="home"><Crest name={fixture.homeTeam.name} url={fixture.homeTeam.logoUrl} size={48} eager />
      <TeamText><strong title={home}>{home}</strong>{workspace ? <small>{messages.text("touchline.home")}</small> : form("home")}</TeamText></Team>
    <Versus>
      {score ? <b data-score data-live-score={currentLiveScore || undefined}
        title={shootout || display.regulationOnly ? matchScoreDescription(display, { home, away }, messages, final, false) : undefined}>
        {shootout ? <ScoreFigures home={messages.number(score.home)} away={messages.number(score.away)} shootout={shootout} />
          : <>{messages.number(score.home)} – {messages.number(score.away)}</>}
      </b> : <b>{final ? "–" : messages.text("details.versus")}</b>}
      {(workspace || fixture.status !== "scheduled" || delayed) && <span data-live={currentLiveScore || undefined}
        title={delayed ? messages.text("match.result.delayedDetail") : undefined}>{workspace && currentLiveScore && typeof status !== "string"
          ? <>{messages.text("match.status.live")} · {status}</> : status}</span>}
    </Versus>
    <Team $side="away"><Crest name={fixture.awayTeam.name} url={fixture.awayTeam.logoUrl} size={48} eager />
      <TeamText><strong title={away}>{away}</strong>{workspace ? <small>{messages.text("touchline.away")}</small> : form("away")}</TeamText></Team>
  </Box>;
});
