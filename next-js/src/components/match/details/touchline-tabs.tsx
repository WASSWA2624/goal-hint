"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import styled from "styled-components";
import { detailTabForView, hasMatchPredictionAccess, openDetailTab, type MatchDetailTab } from "@/domain/match-detail-tabs";
import { formWindows, openSection, type FormWindow, type VenueFocus, type MatchSection, type MatchView } from "@/domain/match-view";
import { media } from "@/styles/theme";
import { LockIcon } from "@/components/ui/icons";
import { RadioGroup, RadioGroups } from "@/components/ui/radio-group";
import { LiveMatchPanel } from "../live-match-panel";
import { DetailsProvider, Note, ViewProvider, focusRing, useStableDetails } from "./details-ui";
import { DisclosureProvider } from "./section-card";
import { FormSection, H2HSection, StatsSection } from "./team-sections";
import { LineupsSection, PlayersSection } from "./squad-sections";
import { ContextSection, HistorySection, NewsSection, RefereeSection } from "./info-sections";
import { Explanation, MarketsCard } from "./markets-card";
import { TouchlineBody, TouchlineEmpty, TouchlineLinkButton, TouchlineSurface, focusMatchAccess } from "./touchline-ui";
import { TouchlineStandings } from "./touchline-venue";
import { MatchTabNavigation } from "./match-tab-navigation";

const embeddedDisclosure = { open: true, byDefault: false, reveal: 0, embedded: true, toggle: () => {} };
const untitledDisclosure = { ...embeddedDisclosure, hideHeading: true };
const Surface = styled(TouchlineSurface)`
  align-self: start; overflow-anchor: none;
  ${media.belowDesktop} { margin-inline: calc(-1 * ${({ theme }) => theme.layout.gutter}); border-inline: 0; }
`;
const Panel = styled.div`
  padding: 16px ${({ theme }) => theme.layout.gutter}; min-inline-size: 0;
  min-block-size: max(min(280px, 40dvh), var(--match-panel-min-size, 0px));
  scroll-margin-block-start: calc(var(--review-height, 0px) + var(--app-header-height, 3rem) + 64px);
  ${media.belowDesktop} { padding: 12px; scroll-margin-block-start: calc(var(--review-height, 0px) + 50px);
  }
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
  const panel = useRef<HTMLDivElement>(null);
  const selected = detailTabForView(view), allowed = hasMatchPredictionAccess(data);
  const previousTab = useRef(selected);
  const preserveViewport = useCallback(() => {
    const element = panel.current;
    if (!element) return;
    // Reserve only the space beneath the current viewport. A shorter panel must neither
    // clamp the page's scroll position nor pull its sticky tabs out of their container.
    element.style.setProperty("--match-panel-min-size", `${Math.max(0, window.innerHeight - element.getBoundingClientRect().top)}px`);
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
      {!allowed ? <TouchlineEmpty><LockIcon aria-hidden="true" /><p>{messages.text("touchline.accessAbove")}</p>
        <TouchlineLinkButton type="button" onClick={focusMatchAccess}>{messages.text("touchline.accessAction")}</TouchlineLinkButton></TouchlineEmpty>
      : <TouchlineBody>
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
  function chooseTeam(value: "home" | "away" | "h2h") {
    update(current => ({ ...openDetailTab(current, "form"), section: value === "h2h" ? "h2h" : "form",
      team: value === "away" ? "away" : "home", venue: current.venue, window: current.window,
      tab: value === "h2h" && current.window === 0 ? "h2h-all" : null }), "replace");
  }
  return <>
    <RadioGroups data-results-filters>
      <section data-row="teams">
        <RadioGroup label={messages.text("touchline.teams")} value={selected} onChange={chooseTeam}
          options={[{ value: "home", label: home }, { value: "away", label: away }, { value: "h2h", label: messages.text("details.section.h2h") }]} />
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
    </RadioGroups>
    <Section section={section} view={view} heading={false}>{section === "h2h" ? <H2HSection filters={false} /> : <FormSection singleTeam />}</Section>
  </>;

}

function Observations({ kind }: { kind: "statistics" | "events" }) {
  const { data, home, away, locale } = useStableDetails();
  return <LiveMatchPanel snapshot={data.liveMatch ?? null} asOf={data.asOf} home={home} away={away} locale={locale}
    homeLogoUrl={data.fixture.homeTeam.logoUrl ?? null} awayLogoUrl={data.fixture.awayTeam.logoUrl ?? null}
    liveClock={data.fixture.liveClock ?? null}
    historical={data.selection !== "applicable"} fixtureStatus={data.fixture.status} section={kind} embedded />;
}
