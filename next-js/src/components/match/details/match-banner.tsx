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
import { desktopContentPadding } from "@/components/ui/layout";
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

/**
 * A scoreboard under a home/away colour band, with competition, date and time on one line above the teams.
 * Phones run it full bleed with the crests above the names; desktop frames it and sets each crest beside its name.
 */
const Box = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  grid-template-areas: "ctx ctx ctx" "home vs away";
  align-items: start;
  gap: 10px 8px;
  margin-inline: calc(-1 * ${({ theme }) => theme.layout.gutter});
  padding: 12px ${({ theme }) => theme.layout.gutter} 14px;
  background: linear-gradient(90deg, ${({ theme }) => theme.color.accent.orange.solid} 0 50%, ${({ theme }) => theme.color.accent.blue.solid} 50% 100%) top / 100% 3px no-repeat,
    ${({ theme }) => theme.color.surface};
  ${scrollClearance}
  ${desktop} {
    align-items: center;
    gap: 8px 28px;
    margin-inline: 0;
    padding: 15px 24px 18px;
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    border-radius: ${({ theme }) => theme.radius.none};
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
  line-height: 1.4;
  text-align: center;
  text-wrap: balance;
  > img { display: inline-block; inline-size: 16px; block-size: 16px; margin-inline-end: 6px; object-fit: contain; vertical-align: -3px; }
  > span { white-space: nowrap; }
  /* Desktop clips the one line; the padding, taken back by the margin, keeps the day link's focus ring inside the clip. */
  ${desktop} {
    min-inline-size: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; padding-block: 6px; margin-block: -6px;
    font-size: ${size("body")}; > img { inline-size: 18px; block-size: 18px; vertical-align: -4px; }
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
  gap: 4px;
  min-inline-size: 0;
  text-align: center;
  > :first-child { --gh-logo-size: 44px; --gh-logo-font: 16px; }
  /* Desktop: both crests sit beside the score, with the name centred on the crest and the home name aligned towards it. */
  ${desktop} {
    display: flex;
    flex-direction: ${({ $side }) => $side === "home" ? "row-reverse" : "row"};
    align-items: center;
    gap: 14px;
    text-align: ${({ $side }) => $side === "home" ? "end" : "start"};
    > :first-child { --gh-logo-size: 56px; --gh-logo-font: 20px; flex: none; }
  }
`;
/** Name over recent form; phones keep both as direct items of the centred team stack. */
const TeamText = styled.div<{ $side: "home" | "away" }>`
  display: contents;
  > strong { font-size: ${size("emphasis")}; line-height: 1.2; overflow-wrap: anywhere; }
  ${desktop} {
    display: grid;
    flex: 1;
    justify-items: ${({ $side }) => $side === "home" ? "end" : "start"};
    gap: 5px;
    min-inline-size: 0;
    > strong { min-inline-size: 0; max-inline-size: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 1.375rem; }
  }
`;
const Versus = styled.div`
  grid-area: vs;
  display: grid;
  justify-items: center;
  gap: 2px;
  padding-block-start: 2px;
  > b {
    display: grid;
    place-items: center;
    min-inline-size: 2.25rem;
    block-size: 2.25rem;
    padding-inline: 6px;
    color: ${({ theme }) => theme.color.mutedText};
    background: ${({ theme }) => theme.color.surfaceMuted};
    border-radius: ${({ theme }) => theme.radius.control};
    font-size: ${size("body")};
    font-variant-numeric: tabular-nums;
  }
  > b[data-score] { block-size: auto; color: ${({ theme }) => theme.color.text}; background: none; font-size: 2rem; font-weight: ${({ theme }) => theme.typography.weight.heavy}; line-height: 1.05; white-space: nowrap; }
  > span { color: ${({ theme }) => theme.color.mutedText}; font-size: ${size("secondary")}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  > span[data-live] { display: inline-flex; align-items: center; gap: 5px; color: ${({ theme }) => theme.color.live.text}; }
  > span[data-live]::before { content: ""; inline-size: 7px; block-size: 7px; background: ${({ theme }) => theme.color.live.solid}; border-radius: ${({ theme }) => theme.radius.circle}; }
  ${desktop} {
    gap: 4px;
    padding-block-start: 0;
    > b { min-inline-size: 3rem; block-size: 3rem; font-size: 0.9375rem; }
    > b[data-score] { block-size: auto; font-size: 2.5rem; }
    > span { font-size: ${size("body")}; }
  }
`;

/**
 * Fixture scoreboard: competition, device-local kickoff, teams with recent form, and the score and clock once
 * the match is under way. It reads no view state, so section and filter changes skip it.
 */
export const MatchBanner = memo(function MatchBanner() {
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
  return <Box id="current-match-summary" aria-labelledby="match-banner-title">
    <Context title={competition}>
      {fixture.competition.logoUrl && <CompetitionLogo src={providerImageSource(fixture.competition.logoUrl, 16)} alt="" width={16} height={16} referrerPolicy="no-referrer" />}
      {competition}{"\u00a0· "}
      {fixture.kickoffAt !== null ? <span><DayLink href={matchArchiveHref(fixture.kickoffAt, locale)!} prefetch={false}>
        <time dateTime={toUtcIsoString(fixture.kickoffAt)}>{messages.reportingDay(fixture.kickoffAt)}</time></DayLink>
        {"\u00a0· "}{messages.reportingTime(fixture.kickoffAt)} {messages.timeZone(fixture.kickoffAt)}</span> : <span>{messages.text("details.kickoffUnknown")}</span>}
    </Context>
    <h1 id="match-banner-title" style={{ position: "absolute", inlineSize: 1, blockSize: 1, overflow: "hidden", clipPath: "inset(50%)" }}>
      {messages.text("match.title", { home, away })}
    </h1>
    <Team $side="home"><Crest name={fixture.homeTeam.name} url={fixture.homeTeam.logoUrl} size={48} eager />
      <TeamText $side="home"><strong title={home}>{home}</strong>{form("home")}</TeamText></Team>
    <Versus>
      {played ? <b data-score>{messages.number(fixture.score!.home)} – {messages.number(fixture.score!.away)}</b> : <b>{fixture.status.startsWith("finished") || fixture.status === "awarded" ? "–" : messages.text("details.versus")}</b>}
      {(played || fixture.status !== "scheduled") && <span data-live={fixture.status === "live" || undefined}>{status}</span>}
    </Versus>
    <Team $side="away"><Crest name={fixture.awayTeam.name} url={fixture.awayTeam.logoUrl} size={48} eager />
      <TeamText $side="away"><strong title={away}>{away}</strong>{form("away")}</TeamText></Team>
  </Box>;
});
