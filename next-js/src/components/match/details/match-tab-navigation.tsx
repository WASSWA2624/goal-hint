"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import styled from "styled-components";
import { matchDetailTabs, type MatchInformationTab } from "@/domain/match-view";
import { ChevronLeftIcon, ChevronRightIcon, LockIcon } from "@/components/ui/icons";
import { CompareIcon, HeadToHeadIcon, ContextIcon, LineupIcon, MarketsIcon, HistoryIcon, NewsIcon, RefereeIcon, ReasonIcon, PlayerIcon } from "./details-icons";
import { IconBadge, focusRing, useStableDetails } from "./details-ui";

const icons = { stats: CompareIcon, markets: MarketsIcon, lineups: LineupIcon, form: HeadToHeadIcon, analysis: ReasonIcon,
  events: HistoryIcon, standings: ContextIcon, players: PlayerIcon, news: NewsIcon, venue: ContextIcon, referee: RefereeIcon, history: HistoryIcon };
const tones = { stats: "blue", markets: "orange", lineups: "emerald", form: "violet", analysis: "amber", events: "teal",
  standings: "blue", players: "violet", news: "teal", venue: "emerald", referee: "amber", history: "blue" } as const;
const Bar = styled.div`
  position: sticky; inset-block-start: var(--review-height, 0px);
  z-index: var(--gh-layer-sticky); display: flex; align-items: stretch; min-inline-size: 0;
  background: ${({ theme }) => theme.color.surface}; border-block-end: 0;
`;
const Strip = styled.div`
  display: flex; flex: 1; min-inline-size: 0; overflow-x: auto; overscroll-behavior-inline: contain; scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
`;
const Tab = styled.button`
  display: inline-flex; flex: 1 0 auto; align-items: center; justify-content: center; gap: var(--gh-spacing-1_5);
  min-block-size: var(--form-control-height); padding: var(--gh-spacing-2_25) var(--gh-spacing-2_5); white-space: nowrap;
  background: transparent; color: ${({ theme }) => theme.color.mutedText}; border: 0; border-block-end: 0;
  border-radius: ${({ theme }) => theme.radius.none}; font: inherit; font-size: var(--gh-font-secondary); line-height: var(--gh-leading-compact); cursor: pointer;
  > svg { flex: none; inline-size: var(--gh-size-4); block-size: var(--gh-size-4); }
  > svg[data-lock] { inline-size: var(--gh-size-2_75); block-size: var(--gh-size-2_75); }
  > [data-tab-icon] { flex: none; inline-size: var(--gh-size-5_5); block-size: var(--gh-size-5_5); font-size: var(--gh-font-emphasis); }
  &[aria-selected="true"] { background: ${({ theme }) => theme.color.brandSoft}; color: ${({ theme }) => theme.color.brand};  font-weight: var(--gh-weight-heavy); }
  &:hover { background: ${({ theme }) => theme.color.brandSoft}; }
  ${focusRing}
`;
const ScrollButton = styled.button`
  display: grid; flex: none; place-items: center; inline-size: var(--gh-size-7_5); min-block-size: var(--form-control-height); padding: 0;
  background: ${({ theme }) => theme.color.brandSoft}; color: ${({ theme }) => theme.color.text}; border: 0; cursor: pointer;
  > svg { inline-size: var(--gh-size-4); block-size: var(--gh-size-4); }
  &:disabled { opacity: var(--gh-opacity-30); cursor: default; }
  ${focusRing}
`;

export function MatchTabNavigation({ selected, allowed, onSelect }: { selected: MatchInformationTab; allowed: boolean; onSelect: (tab: MatchInformationTab) => void }) {
  const { messages } = useStableDetails();
  const strip = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const list = strip.current;
    if (!list) return;
    let mounted = true;
    const measureEdges = () => {
      if (!mounted) return;
      const left = list.scrollLeft > 1, right = list.scrollLeft + list.clientWidth < list.scrollWidth - 1;
      setEdges(previous => previous.left === left && previous.right === right ? previous : { left, right });
    };
    const observer = new ResizeObserver(measureEdges);
    observer.observe(list);
    list.addEventListener("scroll", measureEdges, { passive: true });
    const fonts = list.ownerDocument.fonts;
    fonts.addEventListener("loadingdone", measureEdges);
    void fonts.ready.then(measureEdges); measureEdges();
    return () => { mounted = false; observer.disconnect(); list.removeEventListener("scroll", measureEdges); fonts.removeEventListener("loadingdone", measureEdges); };
  }, [selected, allowed, messages]);
  useLayoutEffect(() => {
    const list = strip.current, target = list?.querySelector<HTMLElement>(`[data-match-tab="${selected}"]`);
    if (!list || !target) return;
    const center = () => {
      const box = list.getBoundingClientRect(), tab = target.getBoundingClientRect();
      const last = list.scrollWidth - list.clientWidth;
      const left = selected === matchDetailTabs[0] ? 0 : selected === matchDetailTabs.at(-1) ? last
        : Math.max(0, Math.min(last, list.scrollLeft + tab.left + tab.width / 2 - box.left - box.width / 2));
      list.scrollTo({ left, behavior: "instant" });
    };
    center();
    // Selected font weight and responsive widths can settle after this commit.
    const observer = new ResizeObserver(center);
    observer.observe(list); observer.observe(target);
    return () => observer.disconnect();
  }, [selected]);
  function keyDown(event: KeyboardEvent<HTMLButtonElement>, id: MatchInformationTab) {
    const index = matchDetailTabs.indexOf(id);
    const next = event.key === "Home" ? 0 : event.key === "End" ? matchDetailTabs.length - 1
      : event.key === "ArrowRight" ? (index + 1) % matchDetailTabs.length : event.key === "ArrowLeft" ? (index + matchDetailTabs.length - 1) % matchDetailTabs.length : null;
    if (next === null) return;
    event.preventDefault(); const target = matchDetailTabs[next]!; onSelect(target);
    strip.current?.querySelector<HTMLElement>(`[data-match-tab="${target}"]`)?.focus({ preventScroll: true });
  }
  function content(id: MatchInformationTab) {
    const Icon = icons[id];
    return <><IconBadge data-tab-icon $accent={tones[id]}><Icon aria-hidden="true" /></IconBadge><span>{messages.text(`touchline.tab.${id}`)}</span>
      {!allowed && (id === "markets" || id === "analysis") && <LockIcon data-lock aria-hidden="true" />}</>;
  }
  function scroll(direction: number) {
    const list = strip.current;
    list?.scrollBy({ left: direction * Math.max(160, list.clientWidth * .7), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  return <Bar data-match-tab-navigation>
    <ScrollButton type="button" aria-label={messages.text("touchline.scrollTabsLeft")} disabled={!edges.left} onClick={() => scroll(-1)}><ChevronLeftIcon /></ScrollButton>
    <Strip ref={strip} role="tablist" aria-label={messages.text("touchline.tabs")} aria-orientation="horizontal">
      {matchDetailTabs.map(id => <Tab type="button" key={id} id={`match-tab-${id}`} role="tab" aria-selected={selected === id} aria-controls="match-information-panel"
        tabIndex={selected === id ? 0 : -1} data-match-tab={id} onClick={() => onSelect(id)} onKeyDown={event => keyDown(event, id)}>{content(id)}</Tab>)}
    </Strip>
    <ScrollButton type="button" aria-label={messages.text("touchline.scrollTabsRight")} disabled={!edges.right} onClick={() => scroll(1)}><ChevronRightIcon /></ScrollButton>
  </Bar>;
}
