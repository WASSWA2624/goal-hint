"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import styled from "styled-components";
import { matchDetailTabs, type MatchDetailTab } from "@/domain/match-detail-tabs";
import { fitNavigationItems } from "@/components/navigation/navigation-fit";
import { MoreList, MoreMenu } from "@/components/navigation/shell-styles";
import { ChevronLeftIcon, ChevronRightIcon, LockIcon, MoreIcon } from "@/components/ui/icons";
import { media } from "@/styles/theme";
import { CompareIcon, HeadToHeadIcon, ContextIcon, LineupIcon, MarketsIcon, HistoryIcon, NewsIcon, RefereeIcon, ReasonIcon, PlayerIcon } from "./details-icons";
import { IconBadge, focusRing, useStableDetails } from "./details-ui";
import { useOpenByDefault } from "./use-match-view";

const icons = { stats: CompareIcon, markets: MarketsIcon, lineups: LineupIcon, form: HeadToHeadIcon, analysis: ReasonIcon,
  events: HistoryIcon, standings: ContextIcon, players: PlayerIcon, news: NewsIcon, venue: ContextIcon, referee: RefereeIcon, history: HistoryIcon };
const tones = { stats: "blue", markets: "orange", lineups: "emerald", form: "violet", analysis: "amber", events: "teal",
  standings: "blue", players: "violet", news: "teal", venue: "emerald", referee: "amber", history: "blue" } as const;
const Bar = styled.div`
  position: sticky; inset-block-start: calc(var(--review-height, 0px) + var(--app-header-height, ${({ theme }) => theme.header.desktopHeight}));
  z-index: var(--gh-layer-sticky); display: flex; align-items: stretch; min-inline-size: 0;
  background: ${({ theme }) => theme.color.surface}; border-block-end: 0;
  ${media.belowDesktop} { inset-block-start: var(--review-height, 0px); }
`;
const Strip = styled.div`
  display: flex; flex: 1; min-inline-size: 0; overflow-x: auto; overscroll-behavior-inline: contain; scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
  ${media.desktop} { overflow: hidden; }
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
  ${media.desktop} { font-size: var(--gh-font-body); font-weight: var(--gh-weight-semibold); padding-inline: var(--gh-spacing-1_75); gap: var(--gh-spacing-1_25); }
`;
const ScrollButton = styled.button`
  display: grid; flex: none; place-items: center; inline-size: var(--gh-size-7_5); min-block-size: var(--form-control-height); padding: 0;
  background: ${({ theme }) => theme.color.brandSoft}; color: ${({ theme }) => theme.color.text}; border: 0; cursor: pointer;
  > svg { inline-size: var(--gh-size-4); block-size: var(--gh-size-4); }
  &:disabled { opacity: var(--gh-opacity-30); cursor: default; }
  ${focusRing}
  ${media.desktop} { display: none; }
`;
const Overflow = styled.div`
  flex: none;
  > details > summary { min-block-size: var(--form-control-height); padding: var(--gh-spacing-2_25) var(--gh-spacing-1_75); gap: var(--gh-spacing-1_25); font-size: var(--gh-font-body); font-weight: var(--gh-weight-semibold); color: ${({ theme }) => theme.color.mutedText}; }
  > details > summary > svg { inline-size: var(--gh-size-4); block-size: var(--gh-size-4); }
  > details > summary[aria-current="page"] { color: ${({ theme }) => theme.color.brand}; }
  > details[open] > summary { color: ${({ theme }) => theme.color.text}; }
`;
const MenuTab = styled(Tab)`inline-size: 100%; justify-content: start; min-block-size: var(--form-control-height); padding: var(--gh-spacing-2) var(--gh-spacing-3); border-block-end: 0;`;
const Measurements = styled.div`
  position: absolute; inline-size: 0; block-size: 0; overflow: hidden; visibility: hidden; pointer-events: none;
  > div { display: flex; inline-size: max-content; }
`;

export function MatchTabNavigation({ selected, allowed, onSelect }: { selected: MatchDetailTab; allowed: boolean; onSelect: (tab: MatchDetailTab) => void }) {
  const { messages } = useStableDetails(), wide = useOpenByDefault();
  const root = useRef<HTMLDivElement>(null), strip = useRef<HTMLDivElement>(null), measurements = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState<number>(matchDetailTabs.length);
  const [edges, setEdges] = useState({ left: false, right: false });
  const pendingFocus = useRef<{ key: string; previous: Element } | null>(null);
  useLayoutEffect(() => {
    const pending = pendingFocus.current; pendingFocus.current = null;
    const container = root.current;
    if (!pending || !container) return;
    const active = container.ownerDocument.activeElement;
    if (active !== pending.previous && active !== container.ownerDocument.body) return;
    const target = container.querySelector<HTMLElement>(`[data-match-tab="${pending.key}"]`);
    const menu = target?.closest("details"); if (menu) menu.open = true;
    target?.focus({ preventScroll: true });
  }, [count, wide]);
  useEffect(() => {
    const container = root.current, list = strip.current, pool = measurements.current;
    if (!container || !list || !pool) return;
    let mounted = true;
    const measureEdges = () => {
      if (!mounted) return;
      const left = list.scrollLeft > 1, right = list.scrollLeft + list.clientWidth < list.scrollWidth - 1;
      setEdges(previous => previous.left === left && previous.right === right ? previous : { left, right });
    };
    const measure = () => {
      if (!mounted) return;
      if (wide) {
        const widths = Array.from(pool.querySelectorAll<HTMLElement>("[data-tab-measure]")).map(item => item.getBoundingClientRect().width);
        const moreWidth = (pool.querySelector<HTMLElement>("[data-more-measure]")?.getBoundingClientRect().width ?? 65) + 4;
        const next = fitNavigationItems({ widths, moreWidth, availableWidth: container.clientWidth, maximumVisible: matchDetailTabs.length });
        if (next !== count) {
          const active = container.ownerDocument.activeElement, key = active?.closest<HTMLElement>("[data-match-tab]")?.dataset.matchTab;
          if (active && key && container.contains(active)) pendingFocus.current = { key, previous: active };
          setCount(next);
        }
      }
      measureEdges();
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container); observer.observe(list);
    // Scrolling changes only the arrow state; desktop label widths belong to layout changes.
    list.addEventListener("scroll", measureEdges, { passive: true });
    const fonts = container.ownerDocument.fonts;
    fonts.addEventListener("loadingdone", measure);
    void fonts.ready.then(measure); measure();
    return () => { mounted = false; observer.disconnect(); list.removeEventListener("scroll", measureEdges); fonts.removeEventListener("loadingdone", measure); };
  }, [wide, selected, count, allowed, messages]);
  useLayoutEffect(() => {
    if (wide) return;
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
  }, [selected, wide]);
  const visible = wide ? matchDetailTabs.slice(0, count) : matchDetailTabs;
  const overflow = wide ? matchDetailTabs.slice(count) : [];
  function keyDown(event: KeyboardEvent<HTMLButtonElement>, id: MatchDetailTab) {
    const index = matchDetailTabs.indexOf(id);
    const next = event.key === "Home" ? 0 : event.key === "End" ? matchDetailTabs.length - 1
      : event.key === "ArrowRight" ? (index + 1) % matchDetailTabs.length : event.key === "ArrowLeft" ? (index + matchDetailTabs.length - 1) % matchDetailTabs.length : null;
    if (next === null) return;
    event.preventDefault(); const target = matchDetailTabs[next]!; onSelect(target);
    const element = root.current?.querySelector<HTMLElement>(`[data-match-tab="${target}"]`);
    const menu = element?.closest("details"); if (menu) menu.open = true;
    element?.focus({ preventScroll: true });
  }
  function content(id: MatchDetailTab) {
    const Icon = icons[id];
    return <><IconBadge data-tab-icon $accent={tones[id]}><Icon aria-hidden="true" /></IconBadge><span>{messages.text(`touchline.tab.${id}`)}</span>
      {!allowed && (id === "markets" || id === "analysis") && <LockIcon data-lock aria-hidden="true" />}</>;
  }
  function scroll(direction: number) {
    const list = strip.current;
    list?.scrollBy({ left: direction * Math.max(160, list.clientWidth * .7), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  return <Bar ref={root} data-match-tab-navigation>
    <ScrollButton type="button" aria-label={messages.text("touchline.scrollTabsLeft")} disabled={!edges.left} onClick={() => scroll(-1)}><ChevronLeftIcon /></ScrollButton>
    <Strip ref={strip} role="tablist" aria-label={messages.text("touchline.tabs")} aria-orientation="horizontal">
      {visible.map(id => <Tab type="button" key={id} id={`match-tab-${id}`} role="tab" aria-selected={selected === id} aria-controls="match-information-panel"
        tabIndex={selected === id ? 0 : -1} data-match-tab={id} onClick={() => onSelect(id)} onKeyDown={event => keyDown(event, id)}>{content(id)}</Tab>)}
    </Strip>
    <ScrollButton type="button" aria-label={messages.text("touchline.scrollTabsRight")} disabled={!edges.right} onClick={() => scroll(1)}><ChevronRightIcon /></ScrollButton>
    {overflow.length > 0 && <Overflow data-match-tabs-more><MoreMenu current={overflow.includes(selected)} label={<><MoreIcon /><span>{messages.text("navigation.more")}</span></>}>
      <MoreList role="tablist" aria-label={`${messages.text("navigation.more")} ${messages.text("touchline.tabs")}`}>
        {overflow.map(id => <li key={id}><MenuTab type="button" id={`match-tab-${id}`} role="tab" aria-selected={selected === id} aria-controls="match-information-panel"
          data-match-tab={id} onKeyDown={event => keyDown(event, id)} onClick={event => {
            onSelect(id); const menu = event.currentTarget.closest("details"); if (menu) { menu.open = false; menu.querySelector("summary")?.focus({ preventScroll: true }); }
          }}>{content(id)}</MenuTab></li>)}
      </MoreList>
    </MoreMenu></Overflow>}
    <Measurements ref={measurements} aria-hidden="true" inert><div>
      {matchDetailTabs.map(id => <Tab as="span" key={id} data-tab-measure aria-selected={selected === id}>{content(id)}</Tab>)}
      <Tab as="span" data-more-measure><MoreIcon /><span>{messages.text("navigation.more")}</span></Tab>
    </div></Measurements>
  </Bar>;
}
