"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import styled from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { TeamLogo } from "@/components/match/team-logo";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { getReportingDate, toUtcIsoString } from "@/domain/calendar";
import { countryDisplayName } from "@/domain/country-code";
import { countryFlagAsset } from "@/domain/country-flag";
import { snapshotCardPrediction } from "@/domain/match-card";
import { isPlayedFinalStatus } from "@/domain/market-settlement";
import { canonicalMatchSlug } from "@/domain/match-slug";
import { matchHref } from "@/domain/navigation";
import { predictionDescription, predictionLabel } from "@/domain/prediction-label";
import type { SavedSlipView } from "@/domain/saved-slips";
import { slipSelectionCard } from "@/domain/slip-card";
import type { SlipSelection } from "@/domain/slip-builder";
import { slipMatchStateForSelection, type SlipMatchState } from "@/domain/slip-match-state";
import { createMessages } from "@/i18n/messages";
import { formatSlipProbability } from "../slip-format";

const TextControl = styled.button`
  display: block; min-inline-size: 0; max-inline-size: 100%; padding: 0; margin: 0;
  border: 0; background: none; color: inherit; font: inherit; line-height: inherit; text-align: start;
  cursor: default;
  &[tabindex="0"] { cursor: help; }
  > [data-ellipsis-text] { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
`;

const Tooltip = styled.span`
  position: fixed; z-index: 100; inline-size: max-content; max-inline-size: min(35rem, calc(100vw - 16px));
  padding: 6px 8px; border: 1px solid ${({ theme }) => theme.color.border}; border-radius: 0;
  color: ${({ theme }) => theme.color.surface}; background: ${({ theme }) => theme.color.text};
  font-size: 0.75rem; line-height: 1.5; white-space: normal; overflow-wrap: anywhere;
`;

function FullTextTooltip({ id, text, anchor, onEnter, onLeave }: {
  id: string; text: string; anchor: RefObject<HTMLButtonElement | null>; onEnter: () => void; onLeave: () => void;
}) {
  const tip = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  useLayoutEffect(() => {
    const trigger = anchor.current?.getBoundingClientRect(), bubble = tip.current?.getBoundingClientRect();
    if (!trigger || !bubble) return;
    setPosition({
      left: Math.max(8, Math.min(trigger.left, window.innerWidth - bubble.width - 8)),
      top: trigger.bottom + bubble.height + 14 <= window.innerHeight ? trigger.bottom + 6 : Math.max(8, trigger.top - bubble.height - 6),
    });
  }, [anchor, text]);
  return createPortal(<Tooltip ref={tip} id={id} role="tooltip" style={position} onMouseEnter={onEnter} onMouseLeave={onLeave}>{text}</Tooltip>, document.body);
}

/** Only clipped names enter the tab order; their full text stays in the DOM and is visible on focus or hover. */
export function TruncatedText({ text }: { text: string }) {
  const trigger = useRef<HTMLButtonElement>(null), label = useRef<HTMLSpanElement>(null), id = useId();
  const hovered = useRef(false), tooltipHovered = useRef(false), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [truncated, setTruncated] = useState(false), [open, setOpen] = useState(false);
  const cancelClose = () => { if (timer.current !== null) { clearTimeout(timer.current); timer.current = null; } };
  const show = () => {
    cancelClose();
    const clipped = Boolean(label.current && label.current.clientWidth > 0 && label.current.scrollWidth > label.current.clientWidth + 1);
    setTruncated(clipped); setOpen(clipped);
  };
  const scheduleClose = () => {
    cancelClose();
    timer.current = setTimeout(() => {
      if (!hovered.current && !tooltipHovered.current && document.activeElement !== trigger.current) setOpen(false);
      timer.current = null;
    }, 120);
  };
  useEffect(() => {
    const element = label.current;
    if (!element) return;
    const measure = () => {
      const clipped = element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1;
      setTruncated(clipped);
      if (!clipped) setOpen(false);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element); measure();
    return () => { observer.disconnect(); if (timer.current !== null) clearTimeout(timer.current); };
  }, [text]);
  useEffect(() => {
    if (!open) return;
    const dismiss = () => setOpen(false);
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") dismiss(); };
    document.addEventListener("keydown", key);
    document.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("scroll", dismiss, true); window.removeEventListener("resize", dismiss); };
  }, [open]);
  return <>
    <TextControl ref={trigger} type="button" data-truncation data-full-text={text} title="" tabIndex={truncated ? 0 : -1}
      aria-label={text} aria-describedby={open ? id : undefined} onFocus={show} onBlur={scheduleClose}
      onMouseEnter={() => { hovered.current = true; show(); }} onMouseLeave={() => { hovered.current = false; scheduleClose(); }} onClick={show}>
      <span ref={label} data-ellipsis-text title="">{text}</span>
    </TextControl>
    {open && <FullTextTooltip id={id} text={text} anchor={trigger}
      onEnter={() => { tooltipHovered.current = true; cancelClose(); }} onLeave={() => { tooltipHovered.current = false; scheduleClose(); }} />}
  </>;
}

const shortMarkets = { "match-result": "Result", "double-chance": "DC", "total-goals": "Goals", "both-teams-to-score": "BTTS" } as const;

/** Desktop rows retain original snapshots and keep analysis navigation separate from full-name tooltip controls. */
export function DesktopSlipRow({ selection, locale, result, matchStates, analysisLinks = false, preview = false }: {
  selection: SlipSelection; locale: string; result?: SavedSlipView["results"][number]; matchStates?: readonly SlipMatchState[];
  analysisLinks?: boolean; preview?: boolean;
}) {
  const m = createMessages(locale), id = useId();
  const { fixture, snapshotPick } = slipSelectionCard(selection, result), prediction = snapshotCardPrediction(snapshotPick);
  const hasResult = result?.fixtureId === selection.fixtureId;
  const state = slipMatchStateForSelection(selection, matchStates), status = state?.status ?? "unknown";
  const final = isPlayedFinalStatus(status), halftime = status === "live" && state?.liveClock?.phase === "half-time";
  const matchState = status === "scheduled" ? "upcoming" : halftime ? "halftime" : final ? "finished"
    : status === "unknown" && !state && hasResult ? "snapshot" : status;
  const outcome = state?.outcome ?? prediction.status, score = state ? state.score : hasResult ? fixture.score : null;
  const clock = status === "live" ? state?.liveClock : null;
  const minute = clock?.minute === null || clock?.minute === undefined ? null : m.number(clock.minute);
  const elapsed = minute === null ? null : minute + (clock?.stoppageMinutes ? `+${m.number(clock.stoppageMinutes)}` : "");
  const clockText = final ? m.text(`match.final.${status as "finished-regulation" | "finished-extra-time" | "finished-penalties"}`)
    : status !== "live" ? "" : elapsed !== null ? m.text("match.clock.minute", { minute: elapsed })
      : m.text(`match.clock.${clock?.phase ?? "in-play"}`);
  const matchLabel = status === "scheduled" ? m.text("match.result.upcoming") : halftime ? m.text("match.clock.half-time")
    : final ? m.text("match.status.finished-regulation") : matchState === "snapshot" ? m.text("slips.match.snapshot")
      : status === "unknown" ? m.text("slips.match.unknown") : m.text(`match.status.${status}`);
  const outcomeLabel = m.text(outcome === "correct" ? "slips.result.won" : outcome === "incorrect" ? "slips.result.lost" : `outcome.${outcome}`);
  const scoreText = score ? `${m.number(score.home)}-${m.number(score.away)}` : status === "live" || final ? "–" : "VS";
  const kickoff = fixture.kickoffAt!, iso = toUtcIsoString(kickoff), date = m.reportingDayParts(getReportingDate(kickoff));
  const home = selection.homeTeam.name?.trim() || m.text("match.homeUnknown"), away = selection.awayTeam.name?.trim() || m.text("match.awayUnknown");
  const scoreDescription = score ? m.text("match.scoreline", { label: m.text(status === "live" ? "match.liveScore" : "match.regulationScoreNote"),
    home, away, homeScore: m.number(score.home), awayScore: m.number(score.away) })
    : status === "live" ? m.text("match.scoreUnknown") : final ? m.text("match.finalScoreUnknown") : undefined;
  const league = selection.competition.name || m.text("match.competitionUnknown"), country = countryDisplayName(selection.competition.country) || "—";
  const flag = countryFlagAsset(selection.competition.country), family = m.text(`market.family.${selection.family}`), description = predictionDescription(m, selection.selection);
  const scoreContent = <span data-score id={`${id}-score`} aria-label={scoreDescription}
    data-saved-score={hasResult && score ? "" : undefined} title={score && status !== "live" ? m.text("match.regulationScoreNote") : undefined}>{scoreText}</span>;
  return <li data-slip-selection={selection.fixtureId} data-compact-selection={selection.fixtureId} data-preview-selection={preview ? selection.fixtureId : undefined}>
    <div data-desktop-row data-desktop-preview-row={preview || undefined} data-fixture-id={preview ? undefined : selection.fixtureId} data-market={selection.family} data-outcome={outcome}
      data-status={status} data-match-state={matchState} role="group" aria-labelledby={`${id}-teams`}
      aria-describedby={`${id}-date ${id}-time ${id}-country ${id}-league ${id}-score ${id}-clock ${id}-market ${id}-odds ${id}-probability ${id}-status`}>
      <time data-row-date id={`${id}-date`} dateTime={iso} title={m.reportingInstant(kickoff)}>{date.day}-{date.month}</time>
      <time data-row-time id={`${id}-time`} dateTime={iso}>{m.reportingTime(kickoff)} {m.timeZone(kickoff)}</time>
      <span data-row-country id={`${id}-country`}>{flag && <Image data-country-flag src={flag} alt="" width={18} height={12} loading="lazy" unoptimized />}<TruncatedText text={country} /></span>
      <span data-row-league id={`${id}-league`}><TeamLogo name={league} url={selection.competition.logoUrl ?? undefined} eager={false} size={14} /><TruncatedText text={league} /></span>
      <h4 data-row-teams id={`${id}-teams`} aria-label={`${home} ${m.text("match.versus")} ${away}`}>
        <span data-home><TruncatedText text={home} /><TeamLogo name={home} url={selection.homeTeam.logoUrl ?? undefined} eager={false} size={14} /></span>
        <span data-centre>{analysisLinks ? <Link data-row-analysis data-match-analysis-link href={matchHref(selection.fixtureId, canonicalMatchSlug(selection.homeTeam.name, selection.awayTeam.name), locale)}
          prefetch={false} title={m.text("match.analysisLabel", { home, away })} aria-label={m.text("match.analysisLabel", { home, away })}>{scoreContent}</Link>
          : scoreContent}<span data-clock id={`${id}-clock`} aria-hidden={!clockText || undefined} title={clockText && clock ? m.text(`match.clock.${clock.phase}`) : undefined}>{clockText}</span></span>
        <span data-away><TeamLogo name={away} url={selection.awayTeam.logoUrl ?? undefined} eager={false} size={14} /><TruncatedText text={away} /></span>
      </h4>
      <span data-row-market id={`${id}-market`} title={`${family}: ${description}`}><span data-market-label data-row-market-label aria-hidden="true">{shortMarkets[selection.family]}</span><strong data-pick-label aria-hidden="true">{predictionLabel(m, selection.selection)}</strong><VisuallyHidden>{family}: {description}</VisuallyHidden></span>
      <span data-row-odds id={`${id}-odds`}><span data-number-label data-row-number-label>{m.text("slips.odds")}</span><strong>{selection.odds}</strong></span>
      <span data-row-probability id={`${id}-probability`}><span data-number-label data-row-number-label aria-hidden="true">Prob.</span><VisuallyHidden>{m.text("slips.probability")}: </VisuallyHidden><strong>{formatSlipProbability(selection.probability, m)}</strong></span>
      <span data-row-status id={`${id}-status`}><span data-match-label title={m.text(`match.status.${status}`)}>{matchLabel}</span><span data-outcome-label>{outcomeLabel}</span></span>
    </div>
  </li>;
}
