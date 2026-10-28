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
import { canonicalMatchSlug } from "@/domain/match-slug";
import { matchHref } from "@/domain/navigation";
import { predictionDescription, predictionLabel } from "@/domain/prediction-label";
import type { SavedSlipView } from "@/domain/saved-slips";
import { slipSelectionCard } from "@/domain/slip-card";
import type { SlipSelection } from "@/domain/slip-builder";
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
function TruncatedText({ text }: { text: string }) {
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
export function DesktopSlipRow({ selection, locale, result, analysisLinks = false }: {
  selection: SlipSelection; locale: string; result?: SavedSlipView["results"][number]; analysisLinks?: boolean;
}) {
  const m = createMessages(locale), id = useId();
  const { fixture, snapshotPick } = slipSelectionCard(selection, result), prediction = snapshotCardPrediction(snapshotPick);
  const hasResult = result?.fixtureId === selection.fixtureId;
  const kickoff = fixture.kickoffAt!, iso = toUtcIsoString(kickoff), date = m.reportingDayParts(getReportingDate(kickoff));
  const home = selection.homeTeam.name?.trim() || m.text("match.homeUnknown"), away = selection.awayTeam.name?.trim() || m.text("match.awayUnknown");
  const league = selection.competition.name || m.text("match.competitionUnknown"), country = countryDisplayName(selection.competition.country) || "—";
  const flag = countryFlagAsset(selection.competition.country), family = m.text(`market.family.${selection.family}`), description = predictionDescription(m, selection.selection);
  const outcome = prediction.status === "correct" ? m.text("match.result.won") : prediction.status === "incorrect" ? m.text("match.result.lost") : m.text(`outcome.${prediction.status}`);
  return <li data-slip-selection={selection.fixtureId} data-compact-selection={selection.fixtureId}>
    <div data-desktop-row data-fixture-id={selection.fixtureId} data-market={selection.family} data-outcome={prediction.status}
      data-status="unknown" data-match-state="snapshot" role="group" aria-labelledby={`${id}-teams`}
      aria-describedby={`${id}-date ${id}-time ${id}-league ${id}-country ${id}-market ${id}-odds ${id}-probability${hasResult ? ` ${id}-result` : ""}`}>
      <time data-row-date id={`${id}-date`} dateTime={iso} title={m.reportingInstant(kickoff)}>{date.day} {date.month}</time>
      <time data-row-time id={`${id}-time`} dateTime={iso}>{m.reportingTime(kickoff)} {m.timeZone(kickoff)}</time>
      <span data-row-league id={`${id}-league`}><TeamLogo name={league} url={selection.competition.logoUrl ?? undefined} eager={false} size={14} /><TruncatedText text={league} /></span>
      <span data-row-country id={`${id}-country`}>{flag && <Image data-country-flag src={flag} alt="" width={18} height={12} loading="lazy" unoptimized />}<TruncatedText text={country} /></span>
      <h4 data-row-teams id={`${id}-teams`} aria-label={`${home} ${m.text("match.versus")} ${away}`}>
        <span data-home><TruncatedText text={home} /><TeamLogo name={home} url={selection.homeTeam.logoUrl ?? undefined} eager={false} size={14} /></span>
        {analysisLinks ? <Link data-versus data-row-analysis data-match-analysis-link href={matchHref(selection.fixtureId, canonicalMatchSlug(selection.homeTeam.name, selection.awayTeam.name), locale)}
          prefetch={false} title={m.text("match.analysisLabel", { home, away })} aria-label={m.text("match.analysisLabel", { home, away })}>{m.text("match.versus")}</Link>
          : <span data-versus>{m.text("match.versus")}</span>}
        <span data-away><TeamLogo name={away} url={selection.awayTeam.logoUrl ?? undefined} eager={false} size={14} /><TruncatedText text={away} /></span>
      </h4>
      <span data-row-market id={`${id}-market`} title={`${family}: ${description}`}><span data-market-label data-row-market-label aria-hidden="true">{shortMarkets[selection.family]}</span><strong data-pick-label aria-hidden="true">{predictionLabel(m, selection.selection)}</strong><VisuallyHidden>{family}: {description}</VisuallyHidden></span>
      <span data-row-odds id={`${id}-odds`}><span data-number-label data-row-number-label>{m.text("slips.odds")}</span><strong>{selection.odds}</strong></span>
      <span data-row-probability id={`${id}-probability`}><span data-number-label data-row-number-label aria-hidden="true">Prob.</span><VisuallyHidden>{m.text("slips.probability")}: </VisuallyHidden><strong>{formatSlipProbability(selection.probability, m)}</strong></span>
      {hasResult && <span data-row-result data-outcome={prediction.status} id={`${id}-result`}><span data-outcome-label>{outcome}</span>{fixture.score && <span data-saved-score title={m.text("match.regulationScoreNote")}><VisuallyHidden>{m.text("match.regulationScoreNote")}: </VisuallyHidden>{m.number(fixture.score.home)}–{m.number(fixture.score.away)}</span>}</span>}
    </div>
  </li>;
}
