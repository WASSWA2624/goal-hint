"use client";

import { FloatingField } from "@/components/ui/floating-field";

import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { inlineControlRow } from "@/components/ui/control-layout";
import styled from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { CriteriaDialog, CriteriaDialogButton } from "@/components/ui/criteria-dialog";
import { bracketGeometry, layoutBracket, tieScore, type KnockoutBracket, type KnockoutTie } from "@/domain/competition-view";
import { matchHref } from "@/domain/navigation";
import { utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { Crest, Note, focusRing, useStableDetails } from "./details-ui";

const Toolbar = styled.div`
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-inline-size: 0;
  > label { display: flex; align-items: center; gap: 6px; min-inline-size: 0; font-size: .6875rem; color: ${({ theme }) => theme.color.mutedText}; }
  select { max-inline-size: 100%; min-inline-size: 0; min-block-size: var(--form-control-height, 40px); padding: 4px 6px; font: inherit;
    color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surface}; border: 0; ${focusRing} }
  ${inlineControlRow}
`;
const Control = styled.button`
  display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-block-size: var(--form-control-height, 40px); padding: 4px 8px;
  border: 0; border-radius: ${({ theme }) => theme.radius.control};
  color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.brandSoft}; font: inherit; font-size: .6875rem; cursor: pointer;
  > svg { inline-size: 14px; block-size: 14px; } &:disabled { opacity: .35; cursor: default; } ${focusRing}
`;
const Canvas = styled.div`
  position: relative; min-inline-size: 0; overflow: auto; max-block-size: min(68dvh, 680px);
  background: ${({ theme }) => theme.color.surfaceMuted}; border: 0;
  overscroll-behavior: contain; scroll-snap-type: x proximity; scrollbar-width: thin; cursor: grab;
  &[data-dragging] { cursor: grabbing; user-select: none; } ${focusRing}
`;
const Scene = styled.div`
  position: relative;
  > svg { position: absolute; inset-block-start: 32px; inset-inline-start: 0; pointer-events: none; overflow: visible; }
  path { fill: none; stroke: ${({ theme }) => theme.color.border}; stroke-width: 2; }
  path[data-relevant] { stroke: ${({ theme }) => theme.color.accent.blue.solid}; }
`;
const RoundHeadings = styled.div`
  position: sticky; inset-block-start: 0; block-size: 32px; z-index: 3; background: ${({ theme }) => theme.color.surfaceMuted};
  > h3 { position: absolute; inset-block-start: 0; margin: 0; block-size: 32px; display: flex; align-items: center;
    font-size: .75rem; font-weight: 700; scroll-snap-align: start; scroll-margin-inline-start: 16px; }
  > h3[data-active] { color: ${({ theme }) => theme.color.brand}; }
`;
const TieCard = styled.button`
  position: absolute; display: grid; grid-template-rows: 16px 25px 25px 14px; align-content: center; gap: 1px;
  box-sizing: border-box; padding: 6px 8px; border: 0;
  border-radius: ${({ theme }) => theme.radius.small}; color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surface};
  font: inherit; text-align: start; cursor: pointer;
  &[data-current] { background: ${({ theme }) => theme.color.brandSoft}; }
  > small { display: flex; align-items: center; justify-content: space-between; gap: 4px; font-size: .5625rem; color: ${({ theme }) => theme.color.mutedText}; }
  > small > b { color: ${({ theme }) => theme.color.brand}; }
  > span { display: flex; align-items: center; gap: 6px; min-inline-size: 0; font-size: .75rem; }
  > span > span[data-name] { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; flex: 1; }
  > span[data-winner] { font-weight: 800; color: ${({ theme }) => theme.color.accent.emerald.text}; }
  > span > small { font-size: .625rem; color: ${({ theme }) => theme.color.mutedText}; }
  > em { font-size: .5625rem; font-style: normal; color: ${({ theme }) => theme.color.mutedText}; }
  &:hover { background: ${({ theme }) => theme.color.rowHover}; } ${focusRing}
`;
const FixtureList = styled.div`
  display: grid; gap: 16px;
  > section { display: grid; gap: 8px; border-block-start: 0; padding-block-start: 12px; }
  > section > div { display: flex; align-items: center; gap: 6px; }
  > section > div > span { flex: 1; }
  > section > div > b { font-variant-numeric: tabular-nums; }
  a { color: ${({ theme }) => theme.color.link}; font-size: .8125rem; }
`;
const scrollBehavior = (animate: boolean) => animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "instant";

export function KnockoutBracketView({ bracket, roundId, onRoundChange }: {
  bracket: KnockoutBracket; roundId: string | null; onRoundChange: (id: string) => void;
}) {
  const { data, messages, locale } = useStableDetails(), canvas = useRef<HTMLDivElement>(null);
  const geometry = useMemo(() => layoutBracket(bracket), [bracket]);
  const currentTie = bracket.rounds.flatMap(round => round.ties).find(tie => tie.fixtures.some(match => match.fixtureId === data.fixture.fixtureId));
  const currentRound = Math.max(0, bracket.rounds.findIndex(round => round.ties.some(tie => tie.id === currentTie?.id)));
  const requested = bracket.rounds.findIndex(round => round.id === roundId);
  const [pan, setPan] = useState<{ request: string | null; index: number } | null>(null);
  const active = Math.max(0, Math.min(bracket.rounds.length - 1, pan?.request === roundId ? pan.index : requested >= 0 ? requested : currentRound));
  const [selected, setSelected] = useState<KnockoutTie | null>(null);
  const initialized = useRef(false), previousRound = useRef(roundId), frame = useRef<number | null>(null);
  const programmatic = useRef(false), centerRequested = useRef(false), lastLeft = useRef(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null);
  const dialogId = useId(), hintId = useId();
  const showRound = useCallback((index: number, animate = true) => {
    const next = Math.max(0, Math.min(bracket.rounds.length - 1, index));
    programmatic.current = true;
    canvas.current?.scrollTo({ left: next * (bracketGeometry.cardWidth + bracketGeometry.columnGap), behavior: scrollBehavior(animate) });
  }, [bracket.rounds.length]);
  const showCurrent = useCallback((animate = true) => {
    const point = currentTie ? geometry.positions.get(currentTie.id) : null, element = canvas.current;
    if (!point || !element) { showRound(currentRound, animate); return; }
    programmatic.current = true;
    element.scrollTo({ left: Math.max(0, point.x - (element.clientWidth - bracketGeometry.cardWidth) / 2),
      top: Math.max(0, point.y + 32 - (element.clientHeight - bracketGeometry.cardHeight) / 2), behavior: scrollBehavior(animate) });
  }, [currentTie, geometry, currentRound, showRound]);
  function navigate(index: number) {
    const next = Math.max(0, Math.min(bracket.rounds.length - 1, index));
    setPan({request:roundId,index:next});
    if (bracket.rounds[next]!.id === roundId) showRound(next);
    else onRoundChange(bracket.rounds[next]!.id);
  }
  useLayoutEffect(() => {
    if (initialized.current && previousRound.current === roundId) return;
    const animate = initialized.current;
    previousRound.current = roundId; initialized.current = true;
    const index = bracket.rounds.findIndex(round => round.id === roundId);
    if (centerRequested.current || index < 0) { centerRequested.current = false; showCurrent(animate); }
    else showRound(index, animate);
  }, [roundId, geometry, bracket.rounds, showRound, showCurrent]);
  useLayoutEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);
  const number = (value: number | null) => value === null ? "—" : messages.number(value);
  const teamName = (tie: KnockoutTie, id: string) => (id === tie.home?.id ? tie.home.name : id === tie.away?.id ? tie.away.name : null) ?? messages.text("competition.toBeDecided");
  const date = (value: number | null) => value === null ? messages.text("competition.toBeDecided") : messages.shortKickoffDate(utcInstantFromEpochMilliseconds(value), true);
  return <>
    <Toolbar data-bracket-controls>
      <Control type="button" aria-label={messages.text("competition.previousRound")} disabled={active === 0} onClick={() => navigate(active - 1)}><ChevronLeftIcon /></Control>
      <FloatingField label={messages.text("competition.round")}><select aria-label={messages.text("competition.round")} value={bracket.rounds[active]?.id ?? ""}
        onChange={event => navigate(bracket.rounds.findIndex(round => round.id === event.target.value))}>{bracket.rounds.map(round => <option key={round.id} value={round.id}>{round.name}</option>)}</select></FloatingField>
      <Control type="button" aria-label={messages.text("competition.nextRound")} disabled={active >= bracket.rounds.length - 1} onClick={() => navigate(active + 1)}><ChevronRightIcon /></Control>
      <Control type="button" disabled={!currentTie} onClick={() => {
        setPan({request:roundId,index:currentRound});
        if (bracket.rounds[currentRound]!.id === roundId) showCurrent();
        else { centerRequested.current = true; onRoundChange(bracket.rounds[currentRound]!.id); }
      }}>{messages.text("competition.currentMatch")}</Control>
    </Toolbar>
    <Note id={hintId}>{messages.text("competition.panHint")}</Note>
    <Canvas ref={canvas} tabIndex={0} role="region" aria-label={messages.text("competition.bracketLabel")} aria-describedby={hintId}
      data-knockout-canvas data-dragging={dragging || undefined}
      onScroll={() => {
        if (frame.current !== null) return;
        frame.current = requestAnimationFrame(() => { frame.current = null; const element = canvas.current;
          if (!element || element.scrollLeft === lastLeft.current) return;
          lastLeft.current = element.scrollLeft;
          if (!programmatic.current && element.scrollWidth > element.clientWidth + 1) setPan({request:roundId,index:Math.max(0,Math.min(bracket.rounds.length - 1,
            Math.round((element.scrollLeft + element.clientWidth / 2 - bracketGeometry.padding - bracketGeometry.cardWidth / 2) / (bracketGeometry.cardWidth + bracketGeometry.columnGap))))});
        });
      }}
      onWheel={() => { programmatic.current = false; }}
      onKeyDown={event => {
        if (event.target !== event.currentTarget || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? bracket.rounds.length - 1 : active + (event.key === "ArrowRight" ? 1 : -1);
        navigate(next);
      }}
      onPointerDown={event => {
        programmatic.current = false;
        if (event.pointerType !== "mouse" || event.button !== 0 || (event.target as Element).closest("button, a, select")) return;
        event.preventDefault(); drag.current = { id:event.pointerId, x:event.clientX, y:event.clientY, left:event.currentTarget.scrollLeft, top:event.currentTarget.scrollTop };
        event.currentTarget.setPointerCapture(event.pointerId); setDragging(true);
      }}
      onPointerMove={event => { const start = drag.current; if (!start || start.id !== event.pointerId) return;
        event.currentTarget.scrollLeft = start.left + start.x - event.clientX; event.currentTarget.scrollTop = start.top + start.y - event.clientY; }}
      onPointerUp={event => { if (drag.current?.id === event.pointerId) { drag.current = null; setDragging(false); event.currentTarget.releasePointerCapture(event.pointerId); } }}
      onLostPointerCapture={() => { drag.current = null; setDragging(false); }}>
      <Scene style={{ width: geometry.width, height: geometry.height + 32 }}>
        <RoundHeadings>{bracket.rounds.map((round,index) => <h3 key={round.id} data-active={index === active || undefined}
          style={{ left:bracketGeometry.padding + index * (bracketGeometry.cardWidth + bracketGeometry.columnGap), width:bracketGeometry.cardWidth }}>{round.name}</h3>)}</RoundHeadings>
        <svg width={geometry.width} height={geometry.height} aria-hidden="true">{bracket.rounds.flatMap(round => round.ties).map(tie => {
          const from = geometry.positions.get(tie.id), to = tie.nextTieId ? geometry.positions.get(tie.nextTieId) : null;
          if (!from || !to) return null;
          const startX = from.x + bracketGeometry.cardWidth, y = from.y + bracketGeometry.cardHeight / 2, endY = to.y + bracketGeometry.cardHeight / 2;
          return <path key={tie.id} data-bracket-edge data-relevant={tie.winnerId === data.fixture.homeTeam.id || tie.winnerId === data.fixture.awayTeam.id || undefined}
            d={`M${startX} ${y} H${startX + bracketGeometry.columnGap / 2} V${endY} H${to.x}`} />;
        })}</svg>
        {bracket.rounds.flatMap(round => round.ties).map(tie => {
          const point = geometry.positions.get(tie.id)!, score = tieScore(tie), match = tie.fixtures[0];
          const penalties = tie.fixtures.find(fixture => fixture.penaltyHome !== null && fixture.penaltyAway !== null);
          const isCurrent = tie.id === currentTie?.id;
          return <TieCard key={tie.id} type="button" data-knockout-tie={tie.id} data-current={isCurrent || undefined} onClick={() => setSelected(tie)}
            aria-label={`${tie.home?.name ?? messages.text("competition.toBeDecided")} v ${tie.away?.name ?? messages.text("competition.toBeDecided")}. ${messages.text("competition.tieDetails")}`}
            style={{ left:point.x, top:point.y + 32, width:bracketGeometry.cardWidth, height:bracketGeometry.cardHeight }}>
            <small><span>{date(match?.kickoffAt ?? null)}</span>{isCurrent && <b>{messages.text("competition.current")}</b>}</small>
            {(["home","away"] as const).map(side => <span key={side} data-winner={Boolean(tie[side] && tie.winnerId === tie[side]?.id) || undefined}>
              {tie[side] && <Crest name={tie[side]!.name} url={tie[side]!.logoUrl} size={16} />}<span data-name>{tie[side]?.name ?? messages.text("competition.toBeDecided")}</span>
              <b>{number(score[side])}</b>{penalties && <small title={messages.text("competition.penalties")}>{number(penalties.homeId === tie[side]?.id ? penalties.penaltyHome : penalties.penaltyAway)}</small>}
            </span>)}
            <em>{score.aggregate ? messages.text("competition.aggregate") : tie.fixtures.length > 1 ? messages.text("competition.fixtures",{count:messages.number(tie.fixtures.length)})
              : penalties ? messages.text("competition.penalties") : match?.scorePeriod === "regulation" ? messages.text("competition.regulation")
                : match?.scorePeriod === "live" ? messages.text("competition.live") : ""}</em>
          </TieCard>;
        })}
      </Scene>
    </Canvas>
    {selected && <CriteriaDialog id={dialogId} open title={`${selected.home?.name ?? messages.text("competition.toBeDecided")} v ${selected.away?.name ?? messages.text("competition.toBeDecided")}`}
      onCancel={() => setSelected(null)} closeLabel={messages.text("competition.close")}
      footer={<CriteriaDialogButton type="button" onClick={() => setSelected(null)}>{messages.text("competition.close")}</CriteriaDialogButton>}>
      {selected.aggregateHome !== null && selected.aggregateAway !== null && <Note>{messages.text("competition.aggregate")}: {number(selected.aggregateHome)}–{number(selected.aggregateAway)}</Note>}
      <FixtureList>{selected.fixtures.map((fixture,index) => <section key={fixture.fixtureId ?? index}>
        <Note>{fixture.kickoffAt === null ? messages.text("competition.toBeDecided") : messages.reportingInstant(utcInstantFromEpochMilliseconds(fixture.kickoffAt))}</Note>
        <div><span>{teamName(selected, fixture.homeId)}</span><b>{number(fixture.homeGoals)}–{number(fixture.awayGoals)}</b><span>{teamName(selected, fixture.awayId)}</span></div>
        {fixture.scorePeriod === "regulation" && <Note>{messages.text("competition.regulation")}</Note>}
        {fixture.penaltyHome !== null && fixture.penaltyAway !== null && <Note>{messages.text("competition.penalties")}: {number(fixture.penaltyHome)}–{number(fixture.penaltyAway)}</Note>}
        {fixture.fixtureId && fixture.slug && <Link href={matchHref(fixture.fixtureId, fixture.slug, locale)} prefetch={false}>{messages.text("competition.openMatch")}</Link>}
      </section>)}</FixtureList>
      {!selected.fixtures.length && <Note>{messages.text("competition.noFixtures")}</Note>}
    </CriteriaDialog>}
  </>;
}
