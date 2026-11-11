"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import styled from "styled-components";
import { detailTabForView, hasMatchPredictionAccess, openDetailTab, type MatchDetailTab } from "@/domain/match-detail-tabs";
import { formWindows, openSection, type FormWindow, type TeamFocus, type VenueFocus, type MatchSection, type MatchView } from "@/domain/match-view";
import { media } from "@/styles/theme";
import { contentGutter } from "@/components/ui/layout";
import { LockedSurface, UnlockLink } from "@/components/members/prediction-unlock";
import { RadioGroup, RadioGroups } from "@/components/ui/radio-group";
import { LiveMatchPanel } from "../live-match-panel";
import { DetailsProvider, Note, ViewProvider, focusRing, useStableDetails } from "./details-ui";
import { DisclosureProvider } from "./section-card";
import { FormSection, H2HSection, StatsSection } from "./team-sections";
import { LineupsSection, PlayersSection } from "./squad-sections";
import { ContextSection, HistorySection, NewsSection, RefereeSection } from "./info-sections";
import { Explanation, MarketsCard } from "./markets-card";
import { TouchlineBody, TouchlineEmpty, TouchlineSurface } from "./touchline-ui";
import { TouchlineStandings } from "./touchline-venue";
import { MatchTabNavigation } from "./match-tab-navigation";
import { BookmakerOddsPanel, MarketOddsPanel } from "./in-play-odds";

const embeddedDisclosure = { open: true, byDefault: false, reveal: 0, embedded: true, toggle: () => {} };
const untitledDisclosure = { ...embeddedDisclosure, hideHeading: true };
const Surface = styled(TouchlineSurface)`
  align-self: start; overflow-anchor: none;
  ${media.belowDesktop} { margin-inline: calc(-1 * ${contentGutter}); border-inline: 0; }
`;
const Panel = styled.div`
  padding: var(--gh-spacing-4) ${({ theme }) => theme.layout.gutter}; min-inline-size: 0;
  min-block-size: min(var(--gh-size-70), 40dvh);
  scroll-margin-block-start: calc(var(--review-height, 0px) + var(--app-header-height, var(--gh-size-12)) + var(--gh-spacing-16));
  ${media.belowDesktop} { padding: var(--gh-spacing-3); scroll-margin-block-start: calc(var(--review-height, 0px) + var(--gh-spacing-12_5));
  }
  ${focusRing}
`;
const ResultFilters = styled(RadioGroups)`
  ${media.desktop} { grid-template-columns: minmax(0, 1.25fr) repeat(2, minmax(0, 1fr)); }
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
  const { data, locale, messages, update } = useStableDetails();
  const panel = useRef<HTMLDivElement>(null);
  const selected = detailTabForView(view), allowed = hasMatchPredictionAccess(data);
  const previousTab = useRef(selected);
  const preserveViewport = useCallback(() => {
    const element = panel.current;
    if (!element) return;
    // Reserve only the space beneath the current viewport. A shorter panel must neither
    // clamp the page's scroll position nor pull its sticky tabs out of their container.
    const minimum = `${Math.max(Math.min(280, window.innerHeight * .4), window.innerHeight - element.getBoundingClientRect().top)}px`;
    if (element.style.minBlockSize === minimum) return;
    element.style.minBlockSize = minimum;
    // Establish the scroll floor before React removes a longer panel's content.
    void element.offsetHeight;
  }, []);
  useLayoutEffect(() => {
    if (previousTab.current === selected) return;
    previousTab.current = selected;
    const element = panel.current, navigation = element?.previousElementSibling;
    if (!element || !(navigation instanceof HTMLElement)) return;
    const content = element.getBoundingClientRect(), bar = navigation.getBoundingClientRect();
    if (content.top < bar.bottom - 1) {
      const inset = Number.parseFloat(getComputedStyle(navigation).top) || 0;
      // Scroll on the retained height first, then release the old tab's reserved space.
      // Both happen before paint, with the sticky tabs still at their existing position.
      // Round up so fractional CSS pixels cannot unpin the sticky navigation.
      window.scrollTo({ top: Math.max(0, Math.ceil(window.scrollY + content.top - bar.height - inset)), behavior: "instant" });
    }
    preserveViewport();
  }, [selected, preserveViewport]);
  function select(tab: MatchDetailTab) { preserveViewport(); update(current => openDetailTab(current, tab)); }
  return <Surface data-touchline-tabs onClickCapture={preserveViewport} onChangeCapture={preserveViewport}
    onKeyDownCapture={event => { if (["Enter", " ", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) preserveViewport(); }}>
    <MatchTabNavigation selected={selected} allowed={allowed} onSelect={select} />
    <Panel ref={panel} role="tabpanel" id="match-information-panel" aria-labelledby={`match-tab-${selected}`} tabIndex={0} data-active-match-tab={selected}>
      {!allowed ? <LockedSurface><TouchlineEmpty><UnlockLink locale={locale} signedIn={data.access.signedIn} returnTo={data.route.path} stretch /></TouchlineEmpty></LockedSurface>
      : <TouchlineBody>
        {selected === "stats" && <>
          <Section section="stats" view={view} heading={false}><StatsSection /></Section>
          {Boolean(data.liveMatch?.statistics.items.length) && <Observations kind="statistics" />}
        </>}
        {selected === "form" && <FormAndH2H view={view} />}
        {selected === "standings" && <TouchlineStandings view={view} />}
        {selected === "lineups" && <Section section="lineups" view={view} heading={false}><LineupsSection /></Section>}
        {selected === "players" && <Section section="players" view={view} heading={false}><PlayersSection /></Section>}
        {selected === "markets" && <>
          <ViewProvider value={{ ...view, marketsOpen: true }}><DisclosureProvider value={embeddedDisclosure}><MarketsCard embedded /></DisclosureProvider></ViewProvider>
          {data.selection === "applicable" && <>
            <MarketOddsPanel kind="in-play" observation={data.inPlayOdds} messages={messages} search={view.marketSearch} />
            {data.bookmakerOdds ? <BookmakerOddsPanel observation={data.bookmakerOdds} messages={messages} search={view.marketSearch} />
              : <MarketOddsPanel kind="pre-match" observation={data.fixture.marketOdds} messages={messages} />}
          </>}
        </>}
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
  const selected = section === "h2h" ? "h2h" : view.team;
  function chooseTeam(value: TeamFocus | "h2h") {
    update(current => ({ ...openDetailTab(current, "form"), section: value === "h2h" ? "h2h" : "form",
      team: value === "h2h" ? "both" : value, venue: current.venue, window: current.window,
      tab: value === "h2h" && current.window === 0 ? "h2h-all" : null }), "replace");
  }
  return <>
    <ResultFilters data-results-filters>
      <section data-row="teams">
        <RadioGroup label={messages.text("touchline.teams")} value={selected} onChange={chooseTeam}
          options={[{ value: "both", label: messages.text("details.bothTeams") }, { value: "home", label: home },
            { value: "away", label: away }, { value: "h2h", label: messages.text("details.section.h2h") }]} />
      </section>
      <section data-row="venues">
        <RadioGroup label={messages.text("touchline.venues")} value={view.venue} onChange={(venue: VenueFocus) => update(current => ({ ...current, venue, page: 1, item: null }), "replace")}
          options={(["all", "home", "away"] as const).map(value => ({ value, label: value === "all" ? messages.text("details.venue.all")
            : section === "h2h" ? messages.text("details.hostedBy", { team: value === "home" ? home : away }) : messages.text(`details.venue.${value}`) }))} />
      </section>
      <section data-row="matches">
        <RadioGroup label={messages.text("touchline.matches")} value={view.window} onChange={(window: FormWindow) => update(current => ({ ...current, window, page: 1, item: null,
          tab: section === "h2h" && window === 0 ? "h2h-all" : null }), "replace")}
          options={formWindows.map(value => ({ value, label: value === 0 ? messages.text("details.allStored") : messages.text("details.lastN", { count: String(value) }) }))} />
      </section>
    </ResultFilters>
    <Section section={section} view={view} heading={false}>{section === "h2h" ? <H2HSection filters={false} /> : <FormSection sharedFilters />}</Section>
  </>;

}

function Observations({ kind }: { kind: "statistics" | "events" }) {
  const { data, home, away, locale } = useStableDetails();
  return <LiveMatchPanel snapshot={data.liveMatch ?? null} asOf={data.asOf} home={home} away={away} locale={locale}
    homeLogoUrl={data.fixture.homeTeam.logoUrl ?? null} awayLogoUrl={data.fixture.awayTeam.logoUrl ?? null}
    liveClock={data.fixture.liveClock ?? null}
    historical={data.selection !== "applicable"} fixtureStatus={data.fixture.status} section={kind} embedded />;
}
