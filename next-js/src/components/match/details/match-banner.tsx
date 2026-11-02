"use client";

import { memo, type ComponentPropsWithoutRef } from "react";
import styled from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { OutcomeBadge } from "@/components/match/prediction-presentation";
import { providerImageSource } from "@/components/ui/provider-image";
import { formLetters } from "@/domain/match-details";
import type { MarketFamily } from "@/domain/markets";
import { toUtcIsoString } from "@/domain/calendar";
import { matchArchiveHref } from "@/domain/navigation";
import { media, type AccentName, type OutcomeTone } from "@/styles/theme";
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

function outcomeLabel(messages: Messages, status: OutcomeTone) {
  const label = status === "correct" ? "match.result.won" : status === "incorrect" ? "match.result.lost" : `outcome.${status}` as const;
  return messages.text(label);
}

export function DetailOutcome({ status, ...props }: Omit<ComponentPropsWithoutRef<"span">, "children"> & { status: OutcomeTone }) {
  const { messages } = useStableDetails();
  return <Outcome {...props} data-outcome={status} $outcome={status}>{outcomeLabel(messages, status)}</Outcome>;
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
  > img { display: inline-block; inline-size: var(--gh-size-4); block-size: var(--gh-size-4); margin-inline-end: var(--gh-spacing-1_5); object-fit: contain; vertical-align: calc(-1 * var(--gh-size-0_75)); }
  > span { white-space: nowrap; }
  /* Desktop clips the one line; the padding, taken back by the margin, keeps the day link's focus ring inside the clip. */
  ${desktop} {
    min-inline-size: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; padding-block: var(--gh-spacing-1_5); margin-block: calc(-1 * var(--gh-spacing-1_5));
    font-size: ${size("body")}; > img { inline-size: var(--gh-size-4_5); block-size: var(--gh-size-4_5); vertical-align: calc(-1 * var(--gh-size-1)); }
  }
`;
const CompetitionLogo = styled.img``;
/** The kickoff day links to that EAT day's predictions in the line's own colour; hover and focus show it is a link. */
const DayLink = styled(Link)`
  color: inherit;
  text-decoration: none;
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
  > b[data-score] { block-size: auto; color: ${({ theme }) => theme.color.text}; background: none; font-size: var(--gh-font-displayLarge); font-weight: ${({ theme }) => theme.typography.weight.heavy}; line-height: var(--gh-leading-dense); white-space: nowrap; }
  > span { color: ${({ theme }) => theme.color.mutedText}; font-size: ${size("secondary")}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  > span[data-live] { display: inline-flex; align-items: center; gap: var(--gh-spacing-1_25); color: ${({ theme }) => theme.color.live.text}; }
  > span[data-live]::before { content: ""; inline-size: var(--gh-size-1_75); block-size: var(--gh-size-1_75); background: ${({ theme }) => theme.color.live.solid}; border-radius: ${({ theme }) => theme.radius.circle}; }
  ${desktop} {
    gap: var(--gh-spacing-1);
    padding-block-start: 0;
    > b { min-inline-size: var(--gh-size-12); block-size: var(--gh-size-12); font-size: var(--gh-font-reading); }
    > b[data-score] { block-size: auto; font-size: var(--gh-font-hero); }
    > span { font-size: ${size("body")}; }
  }
`;

/**
 * Fixture scoreboard: competition, device-local kickoff, teams with recent form, and the score and clock once
 * the match is under way. It reads no view state, so section and filter changes skip it.
 */
export const MatchBanner = memo(function MatchBanner({ touchline = false }: { touchline?: boolean }) {
  const { data, preview, messages, locale, home, away } = useStableDetails();
  const fixture = data.fixture, context = preview?.sections.context;
  const played = fixture.score && (fixture.status === "live" || fixture.status.startsWith("finished") || fixture.status === "awarded");
  const form = (side: "home" | "away") => {
    const team = side === "home" ? fixture.homeTeam : fixture.awayTeam, records = preview?.sections.form[side] ?? [];
    return records.length ? <FormLetters letters={formLetters(records, team.id, 5)} label={messages.text("details.lastFive", { team: side === "home" ? home : away })} /> : null;
  };
  const status = fixture.status === "live" && fixture.liveClock
    ? fixture.liveClock.minute !== null ? messages.text("match.clock.minute", { minute: messages.number(fixture.liveClock.minute) }) : messages.text(`match.clock.${fixture.liveClock.phase}`)
    : messages.text(`match.status.${fixture.status}`);
  const competition = [fixture.competition.name || messages.text("match.competitionUnknown"), context?.competition.round].filter(Boolean).join("\u00a0· ");
  return <Box $touchline={touchline} id="current-match-summary" aria-labelledby="match-banner-title">
    <Context title={competition}>
      {fixture.competition.logoUrl && <CompetitionLogo src={providerImageSource(fixture.competition.logoUrl, 16)} alt="" width={16} height={16} referrerPolicy="no-referrer" />}
      {competition}{"\u00a0· "}
      {fixture.kickoffAt !== null ? <span><DayLink href={matchArchiveHref(fixture.kickoffAt, locale)!} prefetch={false}>
        <time dateTime={toUtcIsoString(fixture.kickoffAt)}>{messages.reportingDay(fixture.kickoffAt)}</time></DayLink>
        {"\u00a0· "}{messages.reportingTime(fixture.kickoffAt)} {messages.timeZone(fixture.kickoffAt)}</span> : <span>{messages.text("details.kickoffUnknown")}</span>}
    </Context>
    <h1 id="match-banner-title" style={{ position: "absolute", inlineSize: "var(--gh-size-0_25)", blockSize: "var(--gh-size-0_25)", overflow: "hidden", clipPath: "inset(50%)" }}>
      {messages.text("match.title", { home, away })}
    </h1>
    <Team $side="home"><Crest name={fixture.homeTeam.name} url={fixture.homeTeam.logoUrl} size={48} eager />
      <TeamText $side="home" $touchline={touchline}>{touchline && <small>{messages.text("touchline.home")}</small>}<strong title={home}>{home}</strong>{!touchline && form("home")}</TeamText></Team>
    <Versus>
      {played ? <b data-score>{messages.number(fixture.score!.home)} – {messages.number(fixture.score!.away)}</b> : <b>{fixture.status.startsWith("finished") || fixture.status === "awarded" ? "–" : messages.text("details.versus")}</b>}
      {(played || fixture.status !== "scheduled") && <span data-live={fixture.status === "live" || undefined}>{status}</span>}
    </Versus>
    <Team $side="away"><Crest name={fixture.awayTeam.name} url={fixture.awayTeam.logoUrl} size={48} eager />
      <TeamText $side="away" $touchline={touchline}>{touchline && <small>{messages.text("touchline.away")}</small>}<strong title={away}>{away}</strong>{!touchline && form("away")}</TeamText></Team>
  </Box>;
});
