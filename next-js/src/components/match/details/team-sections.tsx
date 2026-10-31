"use client";

import Link from "@/components/navigation/navigation-link";
import { memo, useRef } from "react";
import styled from "styled-components";
import { getReportingDate, toUtcIsoString, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
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
  Bar, ChoiceGroup, Crest, Facts, FormLetters, MiniForm, Note, Pager, PanelBar, Pill, RowButton, RowList, SectionState, Strong,
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
  grid-template-columns: 4.25rem minmax(0, 1fr) auto auto;
  text-decoration: none;
  > time { color: ${({ theme }) => theme.color.mutedText}; font-variant-numeric: tabular-nums; }
  > span[data-teams] { display: flex; align-items: center; gap: 4px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  > b { font-variant-numeric: tabular-nums; white-space: nowrap; }
  > span[data-teams] > span { display: flex; align-items: center; gap: 4px; min-inline-size: 0; overflow: hidden; }
  &[data-meeting] > span[data-teams] { display: grid; gap: 3px; }
  small { color: ${({ theme }) => theme.color.mutedText}; font-size: .6875rem; }
  ${desktop} { &[data-meeting] { grid-template-columns: 7.5rem minmax(0, 1fr) auto auto; } }
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
function ResultRows({ records, perspective, section, show = "both" }: {
  records: readonly InsightResult[]; perspective: string; section: MatchSection; show?: "both" | "opponent";
}) {
  const { messages, locale, update } = useStableDetails();
  const meeting = useEmbeddedSection() && section === "h2h";
  return <RowList>
    {records.map((record) => {
      const letter = resultFor(record, perspective), home = record.home.id === perspective;
      const opponent = home ? record.away : record.home;
      return <li key={record.fixtureId}>
        <RecordRow as={Link} href={matchHref(record.fixtureId, record.slug, locale)} prefetch={false} data-item-key={record.fixtureId} data-meeting={meeting || undefined}
          onClick={(event) => plainClick(event, () => update((current) => openItem(current, section, record.fixtureId)))}>
          <time dateTime={toUtcIsoString(at(record.kickoffAt))}>{meeting ? messages.reportingDateMedium(getReportingDate(at(record.kickoffAt))) : messages.reportingDay(at(record.kickoffAt))}</time>
          <span data-teams><span>{show === "opponent" ? <>
            <Pill $accent={home ? "teal" : "violet"} title={messages.text(home ? "details.atHome" : "details.away")}>{messages.text(home ? "details.homeShort" : "details.awayShort")}</Pill>
            <Crest name={opponent.name} url={opponent.logoUrl} size={16} />{opponent.name ?? messages.text("details.teamUnknown")}
          </> : <>
            <Crest name={record.home.name} url={record.home.logoUrl} size={16} />{record.home.name ?? messages.text("details.teamUnknown")}
            <span aria-hidden="true">–</span>{record.away.name ?? messages.text("details.teamUnknown")}<Crest name={record.away.name} url={record.away.logoUrl} size={16} />
          </>}</span>{meeting && <small>{record.competition.name ?? messages.text("match.competitionUnknown")}</small>}</span>
          <b>{messages.number(record.homeGoals)}–{messages.number(record.awayGoals)}</b>
          <FormLetters letters={[letter]} label={messages.text("details.resultFor")} />
        </RecordRow>
      </li>;
    })}
  </RowList>;
}

/** Window and venue filters shared by form and comparison; values live in the URL. */
function FormFilters({ venueLabels }: { venueLabels?: Record<VenueFocus, string> }) {
  const { messages, view, update } = useDetails();
  return <PanelBar>
    <ChoiceGroup label={messages.text("details.window")} value={view.window} onChange={(window: FormWindow) => update((current) => ({ ...current, window, page: 1 }), "replace")}
      options={formWindows.map((window) => ({ value: window, label: window === 0 ? messages.text("details.allStored") : messages.text("details.lastN", { count: String(window) }) }))} />
    <ChoiceGroup label={messages.text("details.venue")} value={view.venue} onChange={(venue: VenueFocus) => update((current) => ({ ...current, venue, page: 1 }), "replace")}
      options={(["all", "home", "away"] as const).map((venue) => ({ value: venue, label: venueLabels?.[venue] ?? messages.text(`details.venue.${venue}`) }))} />
  </PanelBar>;
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
      <Strong>{messages.text("details.evidenceStats")}</Strong>
      {evidence.length ? <Facts>
        {evidence.map((entry) => <div key={entry.metric} style={{ display: "contents" }}>
          <dt>{entry.metric}{entry.unit ? ` (${entry.unit})` : ""}</dt>
          <dd>{home}: {entry.home ? `${messages.number(entry.home.average, { maximumFractionDigits: 2 })} (${messages.plural("details.samples", entry.home.samples)})` : "—"}
            {" · "}{away}: {entry.away ? `${messages.number(entry.away.average, { maximumFractionDigits: 2 })} (${messages.plural("details.samples", entry.away.samples)})` : "—"}</dd>
        </div>)}
      </Facts> : <Note>{messages.text("details.noEvidenceStats")}</Note>}
      <Note>{messages.text("details.statsNotCollected")}</Note>
    </div>}
  </SectionCard>;
});

export const FormSection = memo(function FormSection() {
  const { data, preview, messages, home, away, view, update, fixtureId } = useDetails();
  const open = view.section === "form";
  const embedded = useEmbeddedSection();
  const form = useInsightSection(fixtureId, "form", open, preview);
  const all = form.data ?? preview?.sections.form ?? { home: [], away: [] };
  const sides = view.team === "both" ? (["home", "away"] as const) : [view.team];
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
      <PanelBar>
        <ChoiceGroup label={messages.text("details.team")} value={view.team} onChange={(value) => update((current) => ({ ...current, team: value, page: 1 }), "replace")}
          options={[{ value: "both", label: messages.text("details.bothTeams") }, { value: "home", label: home }, { value: "away", label: away }]} />
      </PanelBar>
      {!embedded && <FormFilters />}
      {sides.map((side) => {
        const records = formRecords(all[side], team(side).id, view.venue, view.window), summary = teamComparison(records, [], team(side).id, "").home;
        const paged = pageOf(records, view.page, pageSize);
        return <div key={side} style={{ display: "grid", gap: 6 }}>
          <Strong>{side === "home" ? home : away}</Strong>
          {records.length ? <>
            <Note>{messages.text("details.formSummary", { wins: messages.number(summary.wins), draws: messages.number(summary.draws), losses: messages.number(summary.losses),
              scored: messages.number(summary.goalsFor), conceded: messages.number(summary.goalsAgainst), count: messages.plural("details.sampleResults", records.length) })}</Note>
            <ResultRows records={paged.items} perspective={team(side).id} section="form" show="opponent" />
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
