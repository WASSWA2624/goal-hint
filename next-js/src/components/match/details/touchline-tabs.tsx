"use client";

import { useMemo, type KeyboardEvent, type ReactNode } from "react";
import styled from "styled-components";
import { matchDetailTabs, detailTabForView, hasMatchPredictionAccess, openDetailTab, type MatchDetailTab } from "@/domain/match-detail-tabs";
import { openSection, type MatchSection, type MatchView } from "@/domain/match-view";
import { LockIcon } from "@/components/ui/icons";
import { LiveMatchPanel } from "../live-match-panel";
import { CompareIcon, HeadToHeadIcon, ContextIcon, LineupIcon, MarketsIcon, HistoryIcon, NewsIcon, RefereeIcon } from "./details-icons";
import { DetailsProvider, Note, ViewProvider, focusRing, useStableDetails } from "./details-ui";
import { DisclosureProvider } from "./section-card";
import { FormSection, H2HSection, StatsSection } from "./team-sections";
import { InjuriesSection, LineupsSection } from "./squad-sections";
import { HistorySection, NewsSection, RefereeSection } from "./info-sections";
import { Explanation, MarketsCard } from "./markets-card";
import { TouchlineBody, TouchlineEmpty, TouchlineGrid, TouchlineHeading, TouchlineLinkButton, TouchlineSurface, focusMatchAccess } from "./touchline-ui";
import { TouchlineStandings, TouchlineVenue } from "./touchline-venue";

const icons = { stats: CompareIcon, h2h: HeadToHeadIcon, standings: ContextIcon, lineups: LineupIcon, markets: MarketsIcon,
  events: HistoryIcon, venue: RefereeIcon, analysis: NewsIcon };
const embeddedDisclosure = { open: true, byDefault: false, reveal: 0, embedded: true, toggle: () => {} };
const untitledDisclosure = { ...embeddedDisclosure, hideHeading: true };
const Navigation = styled.div`
  position: sticky; inset-block-start: calc(var(--review-height, 0px) + var(--app-header-height, ${({ theme }) => theme.header.desktopHeight}));
  z-index: 10; display: grid; grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 8px; padding-inline: ${({ theme }) => theme.layout.gutter}; border-block-end: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.surface};
`;
const Tab = styled.button`
  display: flex; align-items: center; justify-content: center; gap: 7px;
  min-inline-size: 0; min-block-size: 48px; padding: 8px 2px;
  background: transparent; color: ${({ theme }) => theme.color.mutedText};
  border: 0; border-block-end: 3px solid transparent; border-radius: ${({ theme }) => theme.radius.none};
  font: inherit; font-size: .75rem; line-height: 1.4; cursor: pointer;
  > svg { flex: none; inline-size: 17px; block-size: 17px; }
  > svg[data-lock] { inline-size: 11px; block-size: 11px; }
  &[aria-selected="true"] { color: ${({ theme }) => theme.color.brand}; border-block-end-color: currentColor; font-weight: 800; }
  &:hover { background: ${({ theme }) => theme.color.brandSoft}; }
  ${focusRing}
  @media (max-width: 1199px) { font-size: .6875rem; gap: 4px; > svg:not([data-lock]) { display: none; } }
`;
const Panel = styled.div`
  padding: 18px ${({ theme }) => theme.layout.gutter}; min-inline-size: 0;
  scroll-margin-block-start: calc(var(--review-height, 0px) + var(--app-header-height, 3rem) + 80px);
  ${focusRing}
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
  function select(panel: MatchDetailTab) { update(current => openDetailTab(current, panel)); }
  function keyDown(event: KeyboardEvent<HTMLButtonElement>, id: MatchDetailTab) {
    const index = matchDetailTabs.indexOf(id);
    const next = event.key === "Home" ? 0 : event.key === "End" ? matchDetailTabs.length - 1
      : event.key === "ArrowRight" ? (index + 1) % matchDetailTabs.length : event.key === "ArrowLeft" ? (index + matchDetailTabs.length - 1) % matchDetailTabs.length : null;
    if (next === null) return;
    event.preventDefault(); select(matchDetailTabs[next]!);
    document.getElementById(`match-tab-${matchDetailTabs[next]}`)?.focus({ preventScroll: true });
  }
  return <TouchlineSurface data-touchline-tabs>
    <Navigation role="tablist" aria-label={messages.text("touchline.tabs")} aria-orientation="horizontal">
      {matchDetailTabs.map(id => { const Icon = icons[id]; return <Tab type="button" key={id} id={`match-tab-${id}`} role="tab" aria-selected={selected === id}
        aria-controls="match-information-panel" tabIndex={selected === id ? 0 : -1} data-match-tab={id} onClick={() => select(id)} onKeyDown={event => keyDown(event, id)}>
        <Icon aria-hidden="true" /><span>{messages.text(`touchline.tab.${id}`)}</span>{!allowed && (id === "markets" || id === "analysis") && <LockIcon data-lock aria-hidden="true" />}
      </Tab>; })}
    </Navigation>
    <Panel role="tabpanel" id="match-information-panel" aria-labelledby={`match-tab-${selected}`} tabIndex={0} data-active-match-tab={selected}>
      <TouchlineHeading><h2 id="touchline-panel-title">{messages.text(`touchline.tab.${selected}`)}</h2><p>{messages.text(`touchline.hint.${selected}`)}</p></TouchlineHeading>
      {!allowed ? <TouchlineEmpty><LockIcon aria-hidden="true" /><p>{messages.text("touchline.accessAbove")}</p>
        <TouchlineLinkButton type="button" onClick={focusMatchAccess}>{messages.text("touchline.accessAction")}</TouchlineLinkButton></TouchlineEmpty>
      : <TouchlineBody>
        {selected === "stats" && <>
          {data.liveMatch && <Observations kind="statistics" />}
          <TouchlineGrid><Section section="stats" view={view}><StatsSection /></Section><Section section="form" view={view}><FormSection /></Section></TouchlineGrid>
        </>}
        {selected === "h2h" && <Section section="h2h" view={view} heading={false}><H2HSection /></Section>}
        {selected === "standings" && <TouchlineStandings />}
        {selected === "lineups" && <><Section section="lineups" view={view} heading={false}><LineupsSection /></Section><Section section="injuries" view={view}><InjuriesSection /></Section></>}
        {selected === "markets" && <ViewProvider value={{ ...view, marketsOpen: true }}><DisclosureProvider value={embeddedDisclosure}><MarketsCard embedded /></DisclosureProvider></ViewProvider>}
        {selected === "events" && <Observations kind="events" />}
        {selected === "venue" && <TouchlineGrid><TouchlineVenue /><Section section="referee" view={view}><RefereeSection /></Section></TouchlineGrid>}
        {selected === "analysis" && <><TouchlineGrid><section><h3>{messages.text("details.explanation")}</h3><Explanation /></section>
          <Section section="news" view={view}><NewsSection /></Section></TouchlineGrid>
          <details open={view.section === "history" || undefined}><summary>{messages.text("touchline.history")}</summary><Section section="history" view={view}><HistorySection /></Section></details>
          <Note>{messages.text("detail.probabilityDisclosure")}</Note></>}
      </TouchlineBody>}
    </Panel>
  </TouchlineSurface>;
}

function Observations({ kind }: { kind: "statistics" | "events" }) {
  const { data, home, away, locale } = useStableDetails();
  return <LiveMatchPanel snapshot={data.liveMatch ?? null} asOf={data.asOf} home={home} away={away} locale={locale}
    homeLogoUrl={data.fixture.homeTeam.logoUrl ?? null} awayLogoUrl={data.fixture.awayTeam.logoUrl ?? null}
    historical={data.selection !== "applicable"} fixtureStatus={data.fixture.status} section={kind} embedded={kind === "events"} />;
}
