"use client";

import { useId, type ReactNode } from "react";
import Image from "next/image";
import Link from "@/components/navigation/navigation-link";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { toUtcIsoString, type UtcInstant } from "@/domain/calendar";
import { countryDisplayName } from "@/domain/country-code";
import { countryFlagAsset } from "@/domain/country-flag";
import type { FixtureSnapshot } from "@/domain/fixture-snapshot";
import { isPlayedFinalStatus } from "@/domain/market-settlement";
import type { MarketFamily } from "@/domain/markets";
import { createMessages, type Messages } from "@/i18n/messages";
import type { OutcomeTone } from "@/styles/theme";
import { TeamLogo } from "./team-logo";
import { TruncatedText } from "./truncated-text";
import { MatchStatus } from "./match-status";
import { MatchClockText, ScoreFigures, Scoreline } from "./score-presentation";

type RowTeam = Readonly<Pick<FixtureSnapshot["homeTeam"], "name" | "logoUrl">>;
type RowCompetition = Readonly<Pick<FixtureSnapshot["competition"], "name" | "country" | "logoUrl">>;

export type DesktopMatchRowProps = Readonly<{
  fixtureId: string; locale: string; kickoffAt: UtcInstant | null;
  homeTeam: RowTeam; awayTeam: RowTeam; competition: RowCompetition;
  status: FixtureSnapshot["status"]; score: Readonly<{ home: number; away: number }> | null;
  liveClock?: FixtureSnapshot["liveClock"]; outcome: OutcomeTone;
  /** A preformatted authorized market; the row never selects or fabricates a forecast. */
  market: ReactNode; marketFamily?: MarketFamily; marketDescription?: string;
  odds: ReactNode; probability: ReactNode; analysisHref?: string;
  headingLevel?: 2 | 3 | 4; titleNote?: string; position?: number;
  matchState?: string; savedScore?: boolean; scoreDescription?: string; regulationOnly?: boolean;
  details?: ReactNode; pickState?: string;
  eagerLogos?: boolean; offline?: boolean; preview?: boolean;
  /** Feed timestamps follow the device; slips retain their reporting-zone default. */
  messages?: Messages;
  /** Optional content before the kickoff date, such as a slip-local match ordinal. */
  datePrefix?: ReactNode;
}>;

/** One approved desktop match row for live feed records and immutable slip selections. */
export function DesktopMatchRow({ fixtureId, locale, kickoffAt, homeTeam, awayTeam, competition, status, score, liveClock,
  outcome, market, marketFamily, marketDescription, odds, probability, analysisHref, headingLevel = 4, titleNote, position,
  matchState: suppliedMatchState, savedScore = false, scoreDescription: suppliedScoreDescription, regulationOnly = false, details,
  pickState, eagerLogos = false, offline = false, preview = false, messages, datePrefix }: DesktopMatchRowProps) {
  const m = messages ?? createMessages(locale), id = useId();
  const final = isPlayedFinalStatus(status), clock = !offline && status === "live" ? liveClock : null;
  const halftime = status === "live" && clock?.phase === "half-time";
  const matchState = suppliedMatchState ?? (status === "scheduled" ? "upcoming" : halftime ? "halftime" : final ? "finished" : status);
  const minute = clock?.minute === null || clock?.minute === undefined ? null : m.number(clock.minute);
  const elapsed = minute === null ? null : minute + (clock?.stoppageMinutes ? `+${m.number(clock.stoppageMinutes)}` : "");
  const clockText = offline ? "" : final ? m.text(`match.final.${status as "finished-regulation" | "finished-extra-time" | "finished-penalties"}`) + (regulationOnly ? "*" : "")
    : status !== "live" ? "" : elapsed !== null ? m.text("match.clock.minute", { minute: elapsed }) : m.text(`match.clock.${clock?.phase ?? "in-play"}`);
  const home = homeTeam.name?.trim() || m.text("match.homeUnknown"), away = awayTeam.name?.trim() || m.text("match.awayUnknown");
  const title = `${home} ${m.text("match.versus")} ${away}`;
  const league = competition.name?.trim() || m.text("match.competitionUnknown"), country = countryDisplayName(competition.country) || "—";
  const flag = offline ? null : countryFlagAsset(competition.country);
  const detailsHref = offline ? undefined : analysisHref;
  const iso = kickoffAt === null ? undefined : toUtcIsoString(kickoffAt);
  const scoreDescription = suppliedScoreDescription ?? (score ? m.text("match.scoreline", {
    label: m.text(status === "live" ? "match.liveScore" : "match.regulationScoreNote"), home, away,
    homeScore: m.number(score.home), awayScore: m.number(score.away),
  }) : status === "live" ? m.text("match.scoreUnknown") : final ? m.text("match.finalScoreUnknown") : undefined);
  const scoreTitle = score && status !== "live" ? suppliedScoreDescription ?? m.text("match.regulationScoreNote") : undefined;
  const clockTitle = regulationOnly ? m.text("match.regulationScoreNote") : clockText && clock ? m.text(`match.clock.${clock.phase}`) : undefined;
  const kickoffTitle = kickoffAt === null ? undefined : m.reportingInstant(kickoffAt);
  const analysisTitle = [...new Set([m.text("match.analysisLabel", { home, away }), kickoffTitle, scoreTitle, clockTitle,
    marketDescription, m.text(`match.status.${status}`)].filter(Boolean))].join(" · ");
  const scoreProps = { id: `${id}-score`, "aria-label": scoreDescription, title: scoreTitle };
  const scoreContent = score ? <Scoreline data-score {...scoreProps} data-saved-score={savedScore ? "" : undefined}>
    <ScoreFigures home={m.number(score.home)} away={m.number(score.away)} /></Scoreline>
    : <span data-score {...scoreProps}>{status === "live" || final ? "–" : "VS"}</span>;
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
  const descriptionIds = ["date", "time", "country", "league", "score", "clock", "market", "odds", "probability", "status", ...(details ? ["details"] : [])]
    .map((name) => `${id}-${name}`).join(" ");
  return <div data-desktop-row data-desktop-design="aligned-ledger" data-desktop-preview-row={preview || undefined}
    data-fixture-id={preview ? undefined : fixtureId} data-market={marketFamily} data-outcome={outcome} data-pick-state={pickState}
    data-status={status} data-match-state={matchState} data-numbered-date={datePrefix ? "" : undefined}
    role="group" tabIndex={-1} aria-labelledby={`${id}-teams`} aria-describedby={descriptionIds}>
    {datePrefix ? <span data-row-date data-kickoff-unknown={kickoffAt === null ? "" : undefined} id={`${id}-date`}>
      {datePrefix}{kickoffAt === null ? <span>{m.text("match.kickoffUnknown")}</span>
        : <time data-match-kickoff dateTime={iso} title={kickoffTitle}>{m.shortKickoffDate(kickoffAt)}</time>}
    </span> : kickoffAt === null ? <span data-row-date data-kickoff-unknown id={`${id}-date`}>{m.text("match.kickoffUnknown")}</span>
      : <time data-row-date id={`${id}-date`} dateTime={iso} title={kickoffTitle}>{m.shortKickoffDate(kickoffAt)}</time>}
    {kickoffAt === null ? <span data-row-time id={`${id}-time`} hidden>—</span>
      : <time data-row-time id={`${id}-time`} dateTime={iso}>{m.reportingTime(kickoffAt)} {m.timeZone(kickoffAt)}</time>}
    <span data-row-country id={`${id}-country`}>{flag && <Image data-country-flag src={flag} alt="" width={18} height={12} loading="lazy" unoptimized />}<TruncatedText text={country} href={detailsHref} /></span>
    <span data-row-league id={`${id}-league`}><TeamLogo name={league} url={offline ? undefined : competition.logoUrl ?? undefined} eager={eagerLogos} size={14} /><TruncatedText text={league} href={detailsHref} /></span>
    <Heading data-row-teams id={`${id}-teams`} aria-label={titleNote ? `${title}, ${titleNote}` : title}>
      {position !== undefined && <VisuallyHidden data-row-number>{m.number(position)}. </VisuallyHidden>}
      <span data-home><TruncatedText text={home} href={detailsHref} /><TeamLogo name={home} url={offline ? undefined : homeTeam.logoUrl ?? undefined} eager={eagerLogos} size={14} /></span>
      <span data-centre>{scoreContent}
        <span data-clock id={`${id}-clock`} aria-hidden={!clockText || undefined}
          title={clockTitle}>
          <MatchClockText text={clockText} />{regulationOnly && <VisuallyHidden>. {m.text("match.regulationScoreNote")}</VisuallyHidden>}
        </span></span>
      <span data-away><TeamLogo name={away} url={offline ? undefined : awayTeam.logoUrl ?? undefined} eager={eagerLogos} size={14} /><TruncatedText text={away} href={detailsHref} /></span>
    </Heading>
    <span data-row-market id={`${id}-market`} title={marketDescription}>{market}</span>
    <span data-row-odds id={`${id}-odds`}><span data-number-label data-row-number-label>{m.text("slips.odds")}</span><strong>{odds}</strong></span>
    <span data-row-probability id={`${id}-probability`}><span data-number-label data-row-number-label aria-hidden="true">Prob.</span><VisuallyHidden>{m.text("slips.probability")}: </VisuallyHidden><strong>{probability}</strong></span>
    <span data-row-status id={`${id}-status`}><MatchStatus status={status} outcome={outcome} messages={m}
      snapshot={matchState === "snapshot"} offline={offline} /></span>
    {details && <div data-row-details id={`${id}-details`}>{details}</div>}
    {detailsHref && <Link data-row-analysis data-match-analysis-link href={detailsHref} prefetch={false}
      aria-label={m.text("match.analysisLabel", { home, away })} aria-describedby={descriptionIds}
      title={analysisTitle}>
      <VisuallyHidden>{m.text("match.analysisLabel", { home, away })}</VisuallyHidden>
    </Link>}
  </div>;
}
