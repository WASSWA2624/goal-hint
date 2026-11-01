"use client";

import { useEffect, useMemo, useRef, type KeyboardEvent, type ReactNode } from "react";
import styled from "styled-components";
import { matchDetailTabs, detailTabForView, hasMatchPredictionAccess, openDetailTab, type MatchDetailTab } from "@/domain/match-detail-tabs";
import { openSection, type MatchSection, type MatchView } from "@/domain/match-view";
import { media } from "@/styles/theme";
import { LockIcon } from "@/components/ui/icons";
import { LiveMatchPanel } from "../live-match-panel";
import { CompareIcon, HeadToHeadIcon, ContextIcon, LineupIcon, MarketsIcon, HistoryIcon, NewsIcon, RefereeIcon, ReasonIcon, PlayerIcon } from "./details-icons";
import { DetailsProvider, Note, ViewProvider, focusRing, useStableDetails } from "./details-ui";
import { DisclosureProvider } from "./section-card";
import { FormSection, H2HSection, StatsSection } from "./team-sections";
import { LineupsSection, PlayersSection } from "./squad-sections";
import { ContextSection, HistorySection, NewsSection, RefereeSection } from "./info-sections";
import { Explanation, MarketsCard } from "./markets-card";
import { TouchlineBody, TouchlineEmpty, TouchlineHeading, TouchlineLinkButton, TouchlineSurface, focusMatchAccess } from "./touchline-ui";
import { TouchlineStandings } from "./touchline-venue";

const icons = { stats: CompareIcon, markets: MarketsIcon, lineups: LineupIcon, form: HeadToHeadIcon, analysis: ReasonIcon,
  events: HistoryIcon, standings: ContextIcon, players: PlayerIcon, news: NewsIcon, venue: ContextIcon, referee: RefereeIcon, history: HistoryIcon };
const embeddedDisclosure = { open: true, byDefault: false, reveal: 0, embedded: true, toggle: () => {} };
const untitledDisclosure = { ...embeddedDisclosure, hideHeading: true };
const Surface = styled(TouchlineSurface)`
  ${media.belowDesktop} { margin-inline: calc(-1 * ${({ theme }) => theme.layout.gutter}); border-inline: 0; }
`;
const Navigation = styled.div`
  position: sticky; inset-block-start: calc(var(--review-height, 0px) + var(--app-header-height, ${({ theme }) => theme.header.desktopHeight}));
  z-index: 10; display: flex; overflow-x: auto; overscroll-behavior-inline: contain;
  border-block-end: 1px solid ${({ theme }) => theme.color.border}; background: ${({ theme }) => theme.color.surface};
  scrollbar-width: thin;
  ${media.belowDesktop} { inset-block-start: var(--review-height, 0px); scrollbar-width: none; }
`;
const Tab = styled.button`
  display: inline-flex; flex: 1 0 auto; align-items: center; justify-content: center; gap: 6px;
  min-block-size: 46px; padding: 9px 10px; white-space: nowrap;
  background: transparent; color: ${({ theme }) => theme.color.mutedText};
  border: 0; border-block-end: 2px solid transparent; border-radius: ${({ theme }) => theme.radius.none};
  font: inherit; font-size: .75rem; line-height: 1.4; cursor: pointer;
  > svg { flex: none; inline-size: 16px; block-size: 16px; }
  > svg[data-lock] { inline-size: 11px; block-size: 11px; }
  &[aria-selected="true"] { color: ${({ theme }) => theme.color.brand}; border-block-end-color: currentColor; font-weight: 800; }
  &:hover { background: ${({ theme }) => theme.color.brandSoft}; }
  ${focusRing}
  ${media.desktop} { font-size: .6875rem; padding-inline: 7px; gap: 5px; }
`;
const Panel = styled.div`
  padding: 16px ${({ theme }) => theme.layout.gutter}; min-inline-size: 0;
  scroll-margin-block-start: calc(var(--review-height, 0px) + var(--app-header-height, 3rem) + 64px);
  ${TouchlineHeading} { margin-block-end: 12px; }
  ${media.belowDesktop} { padding: 12px; scroll-margin-block-start: calc(var(--review-height, 0px) + 50px);
    ${TouchlineHeading} h2 { font-size: 1rem; } ${TouchlineHeading} p { display: none; } }
  ${focusRing}
`;
const ResultFilter = styled.label`
  display: flex; align-items: center; gap: 10px; font-size: .8125rem;
  > select { min-inline-size: 0; max-inline-size: 100%; min-block-size: 36px; padding: 5px 8px; color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.surface}; border: 1px solid ${({ theme }) => theme.color.controlBorder}; font: inherit; ${focusRing} }
`;

/** Reuse the existing section bodies with independent item state and shared group filters. */
function Section({ section, view, children, heading = true }: { section: MatchSection; view: MatchView; children: ReactNode; heading?: boolean }) {
  const details = useStableDetails();
  const scopedView = useMemo(() => ({ ...view, section, item: view.section === section ? view.item : null,
    tab: view.section === section ? view.tab : null }), [section, view]);
  const scoped = useMemo(() => ({ ...details, update: ((change, mode) => details.update(current => {
    const next = change(current.section === section ? current : { ...openSection(current, section), panel: current.panel,
      window: current.window, venue: current.venue, competition: current.competition, team: current.team });
    return { ...next, panel: current.panel };
  }, mode)) satisfies typeof details.update }), [details, section]);
  return <DetailsProvider value={scoped}><ViewProvider value={scopedView}>
    <DisclosureProvider value={heading ? embeddedDisclosure : untitledDisclosure}>{children}</DisclosureProvider>
  </ViewProvider></DetailsProvider>;
}

export function TouchlineTabs({ view }: { view: MatchView }) {
  const { data, messages, update } = useStableDetails();
  const selected = detailTabForView(view), allowed = hasMatchPredictionAccess(data);
  const navigation = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = navigation.current, tab = list?.querySelector<HTMLElement>(`[data-match-tab="${selected}"]`);
    if (!list || !tab) return;
    const box = list.getBoundingClientRect(), target = tab.getBoundingClientRect();
    if (target.left < box.left) list.scrollBy({ left: target.left - box.left });
    else if (target.right > box.right) list.scrollBy({ left: target.right - box.right });
    const content = document.getElementById("match-information-panel");
    if (content && content.getBoundingClientRect().top < box.bottom) content.scrollIntoView({ block: "start" });
  }, [selected]);
  function select(panel: MatchDetailTab) { update(current => openDetailTab(current, panel)); }
  function keyDown(event: KeyboardEvent<HTMLButtonElement>, id: MatchDetailTab) {
    const index = matchDetailTabs.indexOf(id);
    const next = event.key === "Home" ? 0 : event.key === "End" ? matchDetailTabs.length - 1
      : event.key === "ArrowRight" ? (index + 1) % matchDetailTabs.length : event.key === "ArrowLeft" ? (index + matchDetailTabs.length - 1) % matchDetailTabs.length : null;
    if (next === null) return;
    event.preventDefault(); select(matchDetailTabs[next]!);
    document.getElementById(`match-tab-${matchDetailTabs[next]}`)?.focus({ preventScroll: true });
  }
  return <Surface data-touchline-tabs>
    <Navigation ref={navigation} role="tablist" aria-label={messages.text("touchline.tabs")} aria-orientation="horizontal">
      {matchDetailTabs.map(id => { const Icon = icons[id]; return <Tab type="button" key={id} id={`match-tab-${id}`} role="tab" aria-selected={selected === id}
        aria-controls="match-information-panel" tabIndex={selected === id ? 0 : -1} data-match-tab={id} onClick={() => select(id)} onKeyDown={event => keyDown(event, id)}>
        <Icon aria-hidden="true" /><span>{messages.text(`touchline.tab.${id}`)}</span>{!allowed && (id === "markets" || id === "analysis") && <LockIcon data-lock aria-hidden="true" />}
      </Tab>; })}
    </Navigation>
    <Panel role="tabpanel" id="match-information-panel" aria-labelledby={`match-tab-${selected}`} tabIndex={0} data-active-match-tab={selected}>
      {(selected !== "events" || !allowed) && <TouchlineHeading><h2 id="touchline-panel-title">{messages.text(`touchline.tab.${selected}`)}</h2><p>{messages.text(`touchline.hint.${selected}`)}</p></TouchlineHeading>}
      {!allowed ? <TouchlineEmpty><LockIcon aria-hidden="true" /><p>{messages.text("touchline.accessAbove")}</p>
        <TouchlineLinkButton type="button" onClick={focusMatchAccess}>{messages.text("touchline.accessAction")}</TouchlineLinkButton></TouchlineEmpty>
      : <TouchlineBody key={selected}>
        {selected === "stats" && <>
          <Section section="stats" view={view} heading={false}><StatsSection /></Section>
          {Boolean(data.liveMatch?.statistics.items.length) && <Observations kind="statistics" />}
        </>}
        {selected === "form" && <FormAndH2H view={view} />}
        {selected === "standings" && <TouchlineStandings />}
        {selected === "lineups" && <Section section="lineups" view={view} heading={false}><LineupsSection /></Section>}
        {selected === "players" && <Section section="players" view={view} heading={false}><PlayersSection /></Section>}
        {selected === "markets" && <ViewProvider value={{ ...view, marketsOpen: true }}><DisclosureProvider value={embeddedDisclosure}><MarketsCard embedded /></DisclosureProvider></ViewProvider>}
        {selected === "events" && <Observations kind="events" />}
        {selected === "venue" && <Section section="context" view={view} heading={false}><ContextSection /></Section>}
        {selected === "referee" && <Section section="referee" view={view} heading={false}><RefereeSection /></Section>}
        {selected === "news" && <Section section="news" view={view} heading={false}><NewsSection omitPredictionAnalysis /></Section>}
        {selected === "analysis" && <><Explanation /><Note>{messages.text("detail.probabilityDisclosure")}</Note></>}
        {selected === "history" && <Section section="history" view={view} heading={false}><HistorySection /></Section>}
      </TouchlineBody>}
    </Panel>
  </Surface>;
}

function FormAndH2H({ view }: { view: MatchView }) {
  const { home, away, messages, update } = useStableDetails();
  const section = view.section === "h2h" ? "h2h" : "form";
  const selected = section === "h2h" ? "h2h" : view.team === "away" ? "away" : "home";
  return <>
    <ResultFilter>{messages.text("touchline.results")}<select aria-label={messages.text("touchline.results")} value={selected}
      onChange={event => { const value = event.target.value; update(current => ({ ...openDetailTab(current, "form"),
        section: value === "h2h" ? "h2h" : "form", team: value === "away" ? "away" : "home" }), "replace"); }}>
      <option value="home">{home}</option><option value="away">{away}</option><option value="h2h">{messages.text("details.section.h2h")}</option>
    </select></ResultFilter>
    <Section section={section} view={view} heading={false}>{section === "h2h" ? <H2HSection /> : <FormSection singleTeam />}</Section>
  </>;
}

function Observations({ kind }: { kind: "statistics" | "events" }) {
  const { data, home, away, locale } = useStableDetails();
  return <LiveMatchPanel snapshot={data.liveMatch ?? null} asOf={data.asOf} home={home} away={away} locale={locale}
    homeLogoUrl={data.fixture.homeTeam.logoUrl ?? null} awayLogoUrl={data.fixture.awayTeam.logoUrl ?? null}
    liveClock={data.fixture.liveClock ?? null}
    historical={data.selection !== "applicable"} fixtureStatus={data.fixture.status} section={kind} embedded={kind === "events"} />;
}
