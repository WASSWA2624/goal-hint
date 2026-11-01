"use client";

import Link from "@/components/navigation/navigation-link";
import { memo, useRef } from "react";
import styled from "styled-components";
import { media } from "@/styles/theme";
import { toUtcIsoString, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { formLetters } from "@/domain/match-details";
import type { InsightResult } from "@/domain/match-insights";
import {
  comparisonMetrics, formRecords, headToHead, pageOf, perMatchValue, resultFor, teamComparison,
  type ComparisonMetric,
} from "@/domain/match-insight-presentation";
import { formWindows, openItem, type FormWindow, type MatchSection, type VenueFocus } from "@/domain/match-view";
import { matchHref } from "@/domain/navigation";
import { plainClick } from "@/components/match/filter-parts";
import { CompareIcon, FormIcon, HeadToHeadIcon } from "./details-icons";
import {
  Bar, ChoiceGroup, Crest, Facts, FormLetters, MiniForm, Note, Pager, PanelBar, RowButton, RowList, SectionState, Strong,
  desktop, size, useDetails, useStableDetails, type Messages,
} from "./details-ui";
import { ItemPanel, SectionCard, useEmbeddedSection, useReturnFocus } from "./section-card";
import { useInsightSection } from "./use-match-view";
import { percent } from "./labels";

const pageSize = 10;
const at = (value: number) => utcInstantFromEpochMilliseconds(value);

function metricText(messages: Messages, kind: "average" | "rate", value: number | null) {
  return value === null ? "—" : kind === "rate" ? percent(messages, value) : messages.number(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
const metricKind = (metric: ComparisonMetric) => ["pointsPerGame", "goalsFor", "goalsAgainst"].includes(metric) ? "average" as const : "rate" as const;

const TeamsRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: ${size("secondary")};
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  > span { display: inline-flex; align-items: center; gap: 6px; min-inline-size: 0; }
  > span > span[data-name] { min-inline-size: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  ${desktop} { font-size: ${size("body")}; }
`;
/**
 * Mirrored comparison bars: home value and bar, metric label, away bar and value. Narrow cards put
 * the label on its own row above equal-width bars, so it stays on one line.
 */
const CompareRows = styled.div`
  display: grid;
  gap: 5px;
  > div, > button {
    display: grid;
    grid-template-columns: 2rem minmax(0, 1fr) minmax(0, 1fr) 2rem;
    grid-template-areas: "label label label label" "hv hb ab av";
    align-items: center;
    gap: 1px 4px;
    font-size: ${size("caption")};
    font-variant-numeric: tabular-nums;
    @container details-card (min-width: 24rem) {
      grid-template-columns: 2.75rem minmax(0, 1fr) minmax(6rem, 1.2fr) minmax(0, 1fr) 2.75rem;
      grid-template-areas: "hv hb label ab av";
      gap: 2px 6px;
      font-size: ${size("secondary")};
    }
  }
  b[data-home] { grid-area: hv; } b[data-away] { grid-area: av; text-align: end; }
  span[data-label] { grid-area: label; color: ${({ theme }) => theme.color.mutedText}; text-align: center; }
  span[data-home-bar] { grid-area: hb; } span[data-away-bar] { grid-area: ab; }
`;

function Teams() {
  const { data, home, away } = useStableDetails();
  return <TeamsRow aria-hidden="true">
    <span><Crest name={data.fixture.homeTeam.name} url={data.fixture.homeTeam.logoUrl} /><span data-name>{home}</span></span>
    <span><span data-name>{away}</span><Crest name={data.fixture.awayTeam.name} url={data.fixture.awayTeam.logoUrl} /></span>
  </TeamsRow>;
}

/** Score, competition and date of one stored verified result, with a link to its own match page. */
export function RecordPanel({ record }: { record: InsightResult }) {
  const { messages, locale } = useStableDetails();
  const name = (team: InsightResult["home"]) => team.name ?? messages.text("details.teamUnknown");
  return <ItemPanel itemKey={record.fixtureId} title={messages.text("match.title", { home: name(record.home), away: name(record.away) })}>
    <Facts>
      <dt>{messages.text("details.date")}</dt><dd><time dateTime={toUtcIsoString(at(record.kickoffAt))}>{messages.reportingInstant(at(record.kickoffAt))}</time></dd>
      <dt>{messages.text("details.competition")}</dt><dd>{record.competition.name ?? messages.text("match.competitionUnknown")}</dd>
      <dt>{messages.text("details.score")}</dt><dd><Strong>{name(record.home)} {messages.number(record.homeGoals)} – {messages.number(record.awayGoals)} {name(record.away)}</Strong></dd>
      <dt>{messages.text("details.status")}</dt><dd>{messages.text(`match.status.${record.status}`)}</dd>
    </Facts>
    <Note>{messages.text("details.regulationNote")}</Note>
    <Link href={matchHref(record.fixtureId, record.slug, locale)} prefetch={false} style={{ fontSize: "0.8125rem", fontWeight: 700 }}>
      {messages.text("details.openMatch")}
    </Link>
  </ItemPanel>;
}

/** A stored result: plain clicks open it in place, while the row stays a real link to its own match page. */
const RecordRow = styled(RowButton)`
  grid-template-columns: 4rem minmax(0, 1fr) auto minmax(0, 1fr) 1.125rem;
  gap: 6px; min-block-size: 44px; text-decoration: none; font-size: .75rem;
  > time { color: ${({ theme }) => theme.color.mutedText}; font-size: .625rem; white-space: nowrap; font-variant-numeric: tabular-nums; }
  > span[data-team] { display: flex; align-items: center; gap: 4px; min-inline-size: 0; }
  > span[data-team="home"] { justify-content: end; text-align: end; }
  > span[data-team] > span { min-inline-size: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  > span[data-score] { display: flex; gap: 3px; align-items: center; white-space: nowrap; font-variant-numeric: tabular-nums; }
  [data-winner="true"] { font-weight: 800; color: ${({ theme }) => theme.color.text}; }
  [data-winner="false"] { color: ${({ theme }) => theme.color.mutedText}; }
  ${media.belowDesktop} { padding-inline: 0; gap: 4px; font-size: .6875rem;
    grid-template-columns: 3.9rem minmax(0, 1fr) auto minmax(0, 1fr) 1.125rem;
    > span[data-team] > :first-child:not(:last-child) { display: none; }
  }
`;
const MeetingBalance = styled.div`
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px;
  padding: 20px; background: ${({ theme }) => theme.color.surfaceMuted}; text-align: center;
  > div { display: grid; gap: 4px; }
  strong { font-size: 1.75rem; line-height: 1.3; }
  > div:first-child strong { color: ${({ theme }) => theme.color.accent.orange.text}; }
  > div:nth-child(3) strong { color: ${({ theme }) => theme.color.accent.blue.text}; }
  small { color: ${({ theme }) => theme.color.mutedText}; font-size: .75rem; }
  > span { grid-column: 1/-1; display: flex; gap: 3px; block-size: 6px; }
  i:nth-child(1) { background: ${({ theme }) => theme.color.accent.orange.solid}; }
  i:nth-child(2) { background: ${({ theme }) => theme.color.mutedText}; }
  i:nth-child(3) { background: ${({ theme }) => theme.color.accent.blue.solid}; }
`;
function ResultRows({ records, perspective, section }: {
  records: readonly InsightResult[]; perspective: string; section: MatchSection;
}) {
  const { messages, locale, update } = useStableDetails();
  return <RowList data-result-list>
    {records.map(record => {
      const letter = resultFor(record, perspective), draw = record.homeGoals === record.awayGoals;
      const homeName = record.home.name ?? messages.text("details.teamUnknown"), awayName = record.away.name ?? messages.text("details.teamUnknown");
      return <li key={record.fixtureId}>
        <RecordRow as={Link} href={matchHref(record.fixtureId, record.slug, locale)} prefetch={false} data-item-key={record.fixtureId}
          aria-label={`${messages.reportingInstant(at(record.kickoffAt))} · ${homeName} ${record.homeGoals}–${record.awayGoals} ${awayName}`}
          onClick={event => plainClick(event, () => update(current => openItem(current, section, record.fixtureId)))}>
          <time dateTime={toUtcIsoString(at(record.kickoffAt))} title={messages.reportingInstant(at(record.kickoffAt))}>{messages.reportingDay(at(record.kickoffAt))}</time>
          <span data-team="home" data-winner={!draw && record.homeGoals > record.awayGoals} title={homeName}>
            <Crest name={homeName} url={record.home.logoUrl} size={16} /><span>{homeName}</span>
          </span>
          <span data-score><b data-winner={!draw && record.homeGoals > record.awayGoals}>{messages.number(record.homeGoals)}</b><span>–</span>
            <b data-winner={!draw && record.awayGoals > record.homeGoals}>{messages.number(record.awayGoals)}</b></span>
          <span data-team="away" data-winner={!draw && record.awayGoals > record.homeGoals} title={awayName}>
            <Crest name={awayName} url={record.away.logoUrl} size={16} /><span>{awayName}</span>
          </span>
          <FormLetters letters={[letter]} label={messages.text("touchline.resultForTeam", { team: perspective === record.home.id ? homeName : awayName })} />
        </RecordRow>
      </li>;
    })}
  </RowList>;
}

const SelectFilters = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px;
  > label { display: grid; gap: 4px; font-size: .6875rem; color: ${({ theme }) => theme.color.mutedText}; }
  select { inline-size: 100%; min-inline-size: 0; min-block-size: 36px; padding: 5px 7px; font: inherit; font-size: .8125rem;
    color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surface}; border: 1px solid ${({ theme }) => theme.color.controlBorder}; }
  ${media.desktop} { display: none; }
`;
const DesktopFilters = styled.div`${media.belowDesktop} { display: none; }`;
/** Window and venue filters shared by form and comparison; values live in the URL. */
function FormFilters({ venueLabels }: { venueLabels?: Record<VenueFocus, string> }) {
  const { messages, view, update } = useDetails();
  const setVenue = (venue: VenueFocus) => update(current => ({ ...current, venue, page: 1 }), "replace");
  const setWindow = (window: FormWindow) => update(current => ({ ...current, window, page: 1 }), "replace");
  const venues = (["all", "home", "away"] as const).map(value => ({ value, label: venueLabels?.[value] ?? messages.text(`details.venue.${value}`) }));
  const windows = formWindows.map(value => ({ value, label: value === 0 ? messages.text("details.allStored") : messages.text("details.lastN", { count: String(value) }) }));
  return <>
    <SelectFilters data-form-filters>
      <label>{messages.text("details.venue")}<select aria-label={messages.text("details.venue")} value={view.venue} onChange={event => setVenue(event.target.value as VenueFocus)}>
        {venues.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select></label>
      <label>{messages.text("details.window")}<select aria-label={messages.text("details.window")} value={view.window} onChange={event => setWindow(Number(event.target.value) as FormWindow)}>
        {windows.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select></label>
    </SelectFilters>
    <DesktopFilters><PanelBar>
      <ChoiceGroup label={messages.text("details.venue")} value={view.venue} onChange={setVenue} options={venues} />
      <ChoiceGroup label={messages.text("details.window")} value={view.window} onChange={setWindow} options={windows} />
    </PanelBar></DesktopFilters>
  </>;
}

export const StatsSection = memo(function StatsSection() {
  const { data, preview, messages, home, away, view, update, fixtureId } = useDetails();
  const open = view.section === "stats";
  const form = useInsightSection(fixtureId, "form", open, preview), stats = useInsightSection(fixtureId, "stats", open, preview);
  const homeId = data.fixture.homeTeam.id, awayId = data.fixture.awayTeam.id;
  const previewForm = preview?.sections.form ?? { home: [], away: [] };
  const all = form.data ?? previewForm;
  const homeRecords = formRecords(all.home, homeId, view.venue, view.window), awayRecords = formRecords(all.away, awayId, view.venue, view.window);
  const metric = comparisonMetrics.find((entry) => entry === view.item) ?? null;
  const list = useRef<HTMLDivElement>(null);
  useReturnFocus(list, view.item);
  const evidence = stats.data?.evidence ?? preview?.sections.stats.evidence ?? [];
  const sample = (records: readonly InsightResult[]) => messages.plural("details.sampleResults", records.length);
  const points = teamComparison(previewForm.home.slice(0, 10), previewForm.away.slice(0, 10), homeId, awayId).rows.find((row) => row.metric === "pointsPerGame");
  return <SectionCard section="stats" icon={<CompareIcon />} title={messages.text("details.section.stats")}
    meta={points && points.home !== null && points.away !== null ? messages.text("details.pointsPerGame", {
      home: metricText(messages, "average", points.home), away: metricText(messages, "average", points.away) })
      : preview && previewForm.home.length + previewForm.away.length === 0 ? messages.text("details.summary.noResults") : null}
    itemLabel={metric ? messages.text(`details.metric.${metric}`) : null}>
    <SectionState loading={form.loading || stats.loading} error={form.error || stats.error} onRetry={() => { form.retry(); stats.retry(); }} />
    {metric ? <ItemPanel itemKey={metric} title={messages.text(`details.metric.${metric}`)}>
      <Note>{messages.text(`details.metricHelp.${metricKind(metric)}`)}</Note>
      {([["home", homeRecords, homeId, home], ["away", awayRecords, awayId, away]] as const).map(([side, records, teamId, name]) => <div key={side}>
        <Strong>{name} · {metricText(messages, metricKind(metric), teamComparison(records, [], teamId, "").rows.find((row) => row.metric === metric)?.home ?? null)}</Strong>
        {records.length ? <RowList>{records.map((record) => <li key={record.fixtureId} style={{ display: "grid", gridTemplateColumns: "4.25rem minmax(0,1fr) auto", gap: 6, padding: "3px 4px", fontSize: "0.75rem" }}>
          <time dateTime={toUtcIsoString(at(record.kickoffAt))}>{messages.reportingDay(at(record.kickoffAt))}</time>
          <span>{record.home.name} {messages.number(record.homeGoals)}–{messages.number(record.awayGoals)} {record.away.name}</span>
          <b>{messages.number(perMatchValue(record, teamId, metric))}</b>
        </li>)}</RowList> : <Note>{messages.text("details.noStoredResults")}</Note>}
      </div>)}
    </ItemPanel> : <div ref={list} style={{ display: "grid", gap: 10 }}>
      <FormFilters />
      <Teams />
      <CompareRows>
        {teamComparison(homeRecords, awayRecords, homeId, awayId).rows.map((row) => {
          const scale = row.kind === "rate" ? 1 : Math.max(row.home ?? 0, row.away ?? 0, 0.0001);
          return <RowButton key={row.metric} type="button" data-item-key={row.metric} onClick={() => update((current) => ({ ...current, item: row.metric }))}
            aria-label={messages.text("details.metricOpen", { metric: messages.text(`details.metric.${row.metric}`) })} style={{ padding: "3px 2px" }}>
            <b data-home>{metricText(messages, row.kind, row.home)}</b>
            <span data-home-bar><Bar value={(row.home ?? 0) / scale} $reverse aria-hidden="true" /></span>
            <span data-label>{messages.text(`details.metric.${row.metric}`)}</span>
            <span data-away-bar><Bar value={(row.away ?? 0) / scale} $accent="blue" aria-hidden="true" /></span>
            <b data-away>{metricText(messages, row.kind, row.away)}</b>
          </RowButton>;
        })}
      </CompareRows>
      <Note>{messages.text("details.comparisonSample", { home: sample(homeRecords), away: sample(awayRecords) })} {messages.text("details.comparisonBasis")}</Note>
      {evidence.length ? <><Strong>{messages.text("details.evidenceStats")}</Strong><Facts>
        {evidence.map((entry) => <div key={entry.metric} style={{ display: "contents" }}>
          <dt>{entry.metric}{entry.unit ? ` (${entry.unit})` : ""}</dt>
          <dd>{home}: {entry.home ? `${messages.number(entry.home.average, { maximumFractionDigits: 2 })} (${messages.plural("details.samples", entry.home.samples)})` : "—"}
            {" · "}{away}: {entry.away ? `${messages.number(entry.away.average, { maximumFractionDigits: 2 })} (${messages.plural("details.samples", entry.away.samples)})` : "—"}</dd>
        </div>)}
      </Facts></> : <Note>{messages.text("details.noEvidenceStats")}</Note>}
    </div>}
  </SectionCard>;
});

export const FormSection = memo(function FormSection({ singleTeam = false }: { singleTeam?: boolean }) {
  const { data, preview, messages, home, away, view, update, fixtureId } = useDetails();
  const open = view.section === "form";
  const form = useInsightSection(fixtureId, "form", open, preview);
  const all = form.data ?? preview?.sections.form ?? { home: [], away: [] };
  const sides = singleTeam ? [view.team === "away" ? "away" as const : "home" as const] : view.team === "both" ? (["home", "away"] as const) : [view.team];
  const team = (side: "home" | "away") => side === "home" ? data.fixture.homeTeam : data.fixture.awayTeam;
  const record = view.item ? [...all.home, ...all.away].find((entry) => entry.fixtureId === view.item) ?? null : null;
  const list = useRef<HTMLDivElement>(null);
  useReturnFocus(list, view.item);
  const ticks = (side: "home" | "away") => <MiniForm letters={formLetters((preview?.sections.form[side] ?? []).slice(0, 5), team(side).id, 5)}
    label={messages.text("details.lastFive", { team: side === "home" ? home : away })} />;
  return <SectionCard section="form" icon={<FormIcon />} title={messages.text("details.section.form")}
    meta={(preview?.sections.form.home.length ?? 0) + (preview?.sections.form.away.length ?? 0) > 0 ? <>{ticks("home")} {ticks("away")}</>
      : preview ? messages.text("details.summary.noResults") : null}
    itemLabel={record ? messages.text("match.title", { home: record.home.name ?? "", away: record.away.name ?? "" }) : null}>
    <SectionState loading={form.loading} error={form.error} onRetry={form.retry} />
    {record ? <RecordPanel record={record} /> : <div ref={list} style={{ display: "grid", gap: 10 }}>
      {!singleTeam && <PanelBar>
        <ChoiceGroup label={messages.text("details.team")} value={view.team} onChange={(value) => update((current) => ({ ...current, team: value, page: 1 }), "replace")}
          options={[{ value: "both", label: messages.text("details.bothTeams") }, { value: "home", label: home }, { value: "away", label: away }]} />
      </PanelBar>}
      <FormFilters />
      {sides.map((side) => {
        const records = formRecords(all[side], team(side).id, view.venue, view.window), summary = teamComparison(records, [], team(side).id, "").home;
        const paged = pageOf(records, view.page, pageSize);
        return <div key={side} style={{ display: "grid", gap: 6 }}>
          <Strong>{side === "home" ? home : away}</Strong>
          {records.length ? <>
            <Note>{messages.text("details.formSummary", { wins: messages.number(summary.wins), draws: messages.number(summary.draws), losses: messages.number(summary.losses),
              scored: messages.number(summary.goalsFor), conceded: messages.number(summary.goalsAgainst), count: messages.plural("details.sampleResults", records.length) })}</Note>
            <ResultRows records={paged.items} perspective={team(side).id} section="form" />
            <Pager page={paged.page} pages={paged.pages} onPage={(page) => update((current) => ({ ...current, page }), "replace")} />
          </> : <Note>{messages.text("details.noStoredResults")}</Note>}
        </div>;
      })}
    </div>}
  </SectionCard>;
});

export const H2HSection = memo(function H2HSection() {
  const { data, preview, messages, home, away, view, update, fixtureId } = useDetails();
  const open = view.section === "h2h";
  const embedded = useEmbeddedSection();
  const h2h = useInsightSection(fixtureId, "h2h", open, preview);
  const availableMeetings = h2h.data?.meetings ?? preview?.sections.h2h.meetings ?? [];
  const cutoff = new Date(data.fixture.kickoffAt ?? data.asOf); cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 3);
  const awayId = data.fixture.awayTeam.id;
  const meetings = embedded ? availableMeetings.filter(meeting =>
    ((meeting.home.id === data.fixture.homeTeam.id && meeting.away.id === awayId) || (meeting.away.id === data.fixture.homeTeam.id && meeting.home.id === awayId)) &&
    (view.tab === "h2h-all" || meeting.kickoffAt >= cutoff.getTime()))
    .sort((a, b) => b.kickoffAt - a.kickoffAt).slice(0, 20) : availableMeetings;
  const total = h2h.data?.meetings.length ?? preview?.totals.meetings ?? 0;
  const homeId = data.fixture.homeTeam.id;
  const competitions = [...new Map(meetings.map((meeting) => [meeting.competition.id, meeting.competition.name ?? messages.text("match.competitionUnknown")])).entries()];
  const filtered = meetings.filter((meeting) => (view.venue === "all" || (view.venue === "home" ? meeting.home.id === homeId : meeting.away.id === homeId)) &&
    (view.competition === null || meeting.competition.id === view.competition));
  const totals = headToHead(filtered, homeId), paged = pageOf(filtered, view.page, pageSize);
  const record = view.item ? meetings.find((entry) => entry.fixtureId === view.item) ?? null : null;
  const list = useRef<HTMLDivElement>(null);
  useReturnFocus(list, view.item);
  return <SectionCard section="h2h" icon={<HeadToHeadIcon />} title={messages.text("details.section.h2h")}
    meta={total ? messages.plural("details.meetings", total) : preview ? messages.text("details.summary.noMeetings") : null}
    itemLabel={record ? messages.text("match.title", { home: record.home.name ?? "", away: record.away.name ?? "" }) : null}>
    <SectionState loading={h2h.loading} error={h2h.error} onRetry={h2h.retry} />
    {record ? <RecordPanel record={record} /> : <div ref={list} style={{ display: "grid", gap: 10 }}>
      {embedded && <MeetingBalance aria-label={messages.text("details.section.h2h")}><div><strong>{messages.number(totals.homeWins)}</strong><small>{messages.text("details.winsFor", { team: home })}</small></div>
        <div><strong>{messages.number(totals.draws)}</strong><small>{messages.text("details.draws")}</small></div><div><strong>{messages.number(totals.awayWins)}</strong><small>{messages.text("details.winsFor", { team: away })}</small></div>
        <span aria-hidden="true"><i style={{ flex: totals.homeWins }} /><i style={{ flex: totals.draws }} /><i style={{ flex: totals.awayWins }} /></span></MeetingBalance>}
      <Facts>
        <dt>{messages.text("details.meetingsLabel")}</dt><dd>{messages.number(totals.meetings)}</dd>
        {!embedded && <><dt>{messages.text("details.winsFor", { team: home })}</dt><dd>{messages.number(totals.homeWins)}</dd>
        <dt>{messages.text("details.draws")}</dt><dd>{messages.number(totals.draws)}</dd>
        <dt>{messages.text("details.winsFor", { team: away })}</dt><dd>{messages.number(totals.awayWins)}</dd></>}
        <dt>{messages.text("details.averageGoals")}</dt><dd>{totals.averageGoals === null ? "—" : messages.number(totals.averageGoals, { maximumFractionDigits: 1 })}</dd>
        <dt>{messages.text("details.metric.bttsRate")}</dt><dd>{percent(messages, totals.bttsRate)}</dd>
        <dt>{messages.text("details.metric.over25Rate")}</dt><dd>{percent(messages, totals.over25Rate)}</dd>
      </Facts>
      <PanelBar>
        {embedded && <ChoiceGroup label={messages.text("touchline.h2hWindow")} value={view.tab === "h2h-all" ? "h2h-all" : "h2h-recent"}
          onChange={(tab: string) => update(current => ({ ...current, tab, page: 1 }), "replace")}
          options={[{ value: "h2h-recent", label: messages.text("touchline.lastSeasons") }, { value: "h2h-all", label: messages.text("touchline.lastMeetings") }]} />}
        <ChoiceGroup label={messages.text("details.venue")} value={view.venue} onChange={(venue: VenueFocus) => update((current) => ({ ...current, venue, page: 1 }), "replace")}
          options={[{ value: "all", label: messages.text("details.venue.all") }, { value: "home", label: messages.text("details.hostedBy", { team: home }) },
            { value: "away", label: messages.text("details.hostedBy", { team: away }) }]} />
        {competitions.length > 1 && <ChoiceGroup label={messages.text("details.competition")} value={view.competition ?? ""}
          onChange={(value) => update((current) => ({ ...current, competition: value || null, page: 1 }), "replace")}
          options={[{ value: "", label: messages.text("details.allCompetitions") }, ...competitions.map(([id, name]) => ({ value: id, label: name }))]} />}
      </PanelBar>
      {paged.items.length ? <ResultRows records={paged.items} perspective={homeId} section="h2h" /> : <Note>{messages.text(meetings.length ? "details.noFilteredMeetings" : "details.noMeetings")}</Note>}
      <Pager page={paged.page} pages={paged.pages} onPage={(page) => update((current) => ({ ...current, page }), "replace")} />
      <Note>{messages.text("details.h2hBasis")}</Note>
    </div>}
  </SectionCard>;
});
