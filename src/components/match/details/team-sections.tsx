"use client";

import Link from "next/link";
import { useRef } from "react";
import styled from "styled-components";
import { toUtcIsoString, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { formLetters, goalTotals, marketRow } from "@/domain/match-details";
import {
  comparisonMetrics, formRecords, headToHead, pageOf, perMatchValue, resultFor, teamComparison,
  type ComparisonMetric, type InsightResult,
} from "@/domain/match-insights";
import { formWindows, openItem, type FormWindow, type MatchSection, type VenueFocus } from "@/domain/match-view";
import { matchHref } from "@/domain/navigation";
import { CompareIcon, FormIcon, HeadToHeadIcon } from "./details-icons";
import {
  ChoiceGroup, Crest, Facts, FormLetters, Note, Pager, PanelBar, Pill, RowButton, RowList, SectionState, Strong, Track,
  desktop, useDetails, type Messages,
} from "./details-ui";
import { ItemPanel, SectionCard, useReturnFocus } from "./section-card";
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
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  > span { display: inline-flex; align-items: center; gap: 6px; min-inline-size: 0; }
  > span > span[data-name] { min-inline-size: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  ${desktop} { font-size: 0.8125rem; }
`;
/** Mirrored comparison bars: home value and bar, metric label, away bar and value. */
const CompareRows = styled.div`
  display: grid;
  gap: 5px;
  > div, > button {
    display: grid;
    grid-template-columns: 2.5rem minmax(0, 1fr) 2.5rem;
    grid-template-areas: "hv label av" "hb hb ab";
    align-items: center;
    gap: 2px 6px;
    font-size: 0.6875rem;
    font-variant-numeric: tabular-nums;
    @container details-card (min-width: 24rem) {
      grid-template-columns: 2.75rem minmax(0, 1fr) minmax(6rem, 1.2fr) minmax(0, 1fr) 2.75rem;
      grid-template-areas: "hv hb label ab av";
      font-size: 0.75rem;
    }
  }
  b[data-home] { grid-area: hv; } b[data-away] { grid-area: av; text-align: end; }
  span[data-label] { grid-area: label; color: ${({ theme }) => theme.color.mutedText}; text-align: center; }
  span[data-home-bar] { grid-area: hb; } span[data-away-bar] { grid-area: ab; }
`;

function Comparison({ home, away, limit }: { home: readonly InsightResult[]; away: readonly InsightResult[]; limit?: number }) {
  const { data, messages } = useDetails();
  const { rows } = teamComparison(home, away, data.fixture.homeTeam.id, data.fixture.awayTeam.id);
  return <CompareRows>
    {rows.slice(0, limit).map((row) => {
      const scale = row.kind === "rate" ? 1 : Math.max(row.home ?? 0, row.away ?? 0, 0.0001);
      return <div key={row.metric}>
        <b data-home>{metricText(messages, row.kind, row.home)}</b>
        <span data-home-bar><Track $value={(row.home ?? 0) / scale} $reverse aria-hidden="true" /></span>
        <span data-label>{messages.text(`details.metric.${row.metric}`)}</span>
        <span data-away-bar><Track $value={(row.away ?? 0) / scale} $accent="blue" aria-hidden="true" /></span>
        <b data-away>{metricText(messages, row.kind, row.away)}</b>
      </div>;
    })}
  </CompareRows>;
}

function Teams() {
  const { data, home, away } = useDetails();
  return <TeamsRow aria-hidden="true">
    <span><Crest name={data.fixture.homeTeam.name} url={data.fixture.homeTeam.logoUrl} /><span data-name>{home}</span></span>
    <span><span data-name>{away}</span><Crest name={data.fixture.awayTeam.name} url={data.fixture.awayTeam.logoUrl} /></span>
  </TeamsRow>;
}

/** Score, competition and date of one stored verified result, with a link to its own match page. */
export function RecordPanel({ record }: { record: InsightResult }) {
  const { messages, locale } = useDetails();
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

const RecordRow = styled(RowButton)`
  grid-template-columns: 4.25rem minmax(0, 1fr) auto auto;
  > time { color: ${({ theme }) => theme.color.mutedText}; font-variant-numeric: tabular-nums; }
  > span[data-teams] { display: flex; align-items: center; gap: 4px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  > b { font-variant-numeric: tabular-nums; white-space: nowrap; }
`;
function ResultRows({ records, perspective, section, show = "both" }: {
  records: readonly InsightResult[]; perspective: string; section: MatchSection; show?: "both" | "opponent";
}) {
  const { messages, view, go } = useDetails();
  return <RowList>
    {records.map((record) => {
      const letter = resultFor(record, perspective), home = record.home.id === perspective;
      const opponent = home ? record.away : record.home;
      return <li key={record.fixtureId}>
        <RecordRow type="button" data-item-key={record.fixtureId} onClick={() => go(openItem(view, section, record.fixtureId))}>
          <time dateTime={toUtcIsoString(at(record.kickoffAt))}>{messages.reportingDay(at(record.kickoffAt))}</time>
          <span data-teams>{show === "opponent" ? <>
            <Pill $accent={home ? "teal" : "violet"} title={messages.text(home ? "details.atHome" : "details.away")}>{messages.text(home ? "details.homeShort" : "details.awayShort")}</Pill>
            <Crest name={opponent.name} url={opponent.logoUrl} size={16} />{opponent.name ?? messages.text("details.teamUnknown")}
          </> : <>
            <Crest name={record.home.name} url={record.home.logoUrl} size={16} />{record.home.name ?? messages.text("details.teamUnknown")}
            <span aria-hidden="true">–</span>{record.away.name ?? messages.text("details.teamUnknown")}<Crest name={record.away.name} url={record.away.logoUrl} size={16} />
          </>}</span>
          <b>{messages.number(record.homeGoals)}–{messages.number(record.awayGoals)}</b>
          <FormLetters letters={[letter]} label={messages.text("details.resultFor")} />
        </RecordRow>
      </li>;
    })}
  </RowList>;
}

/** Window and venue filters shared by form and comparison; values live in the URL. */
function FormFilters({ venueLabels }: { venueLabels?: Record<VenueFocus, string> }) {
  const { messages, view, go } = useDetails();
  return <PanelBar>
    <ChoiceGroup label={messages.text("details.window")} value={view.window} onChange={(window: FormWindow) => go({ ...view, window, page: 1 }, "replace")}
      options={formWindows.map((window) => ({ value: window, label: window === 0 ? messages.text("details.allStored") : messages.text("details.lastN", { count: String(window) }) }))} />
    <ChoiceGroup label={messages.text("details.venue")} value={view.venue} onChange={(venue: VenueFocus) => go({ ...view, venue, page: 1 }, "replace")}
      options={(["all", "home", "away"] as const).map((venue) => ({ value: venue, label: venueLabels?.[venue] ?? messages.text(`details.venue.${venue}`) }))} />
  </PanelBar>;
}

export function StatsSection() {
  const { data, preview, messages, home, away, view, go, fixtureId } = useDetails();
  const open = view.section === "stats";
  const form = useInsightSection(fixtureId, "form", open), stats = useInsightSection(fixtureId, "stats", open);
  const homeId = data.fixture.homeTeam.id, awayId = data.fixture.awayTeam.id;
  const previewForm = preview?.sections.form ?? { home: [], away: [] };
  const all = form.data ?? previewForm;
  const homeRecords = formRecords(all.home, homeId, view.venue, view.window), awayRecords = formRecords(all.away, awayId, view.venue, view.window);
  const result = marketRow(data, "match-result").item;
  const metric = comparisonMetrics.find((entry) => entry === view.item) ?? null;
  const list = useRef<HTMLDivElement>(null);
  useReturnFocus(list, view.item);
  const evidence = stats.data?.evidence ?? preview?.sections.stats.evidence ?? [];
  const sample = (records: readonly InsightResult[]) => messages.plural("details.sampleResults", records.length);
  return <SectionCard section="stats" icon={<CompareIcon />} accent="orange" title={messages.text("details.section.stats")}
    viewAll={messages.text("details.viewAll.stats")} itemLabel={metric ? messages.text(`details.metric.${metric}`) : null}
    preview={<>
      <Teams />
      {result && <TeamsRow>
        <span><Strong>{percent(messages, (result.market.probabilities as Record<string, number>)["home-win"] ?? null)}</Strong></span>
        <Note as="span">{messages.text("details.winProbability")}</Note>
        <span><Strong>{percent(messages, (result.market.probabilities as Record<string, number>)["away-win"] ?? null)}</Strong></span>
      </TeamsRow>}
      {previewForm.home.length + previewForm.away.length > 0 ? <>
        <Comparison home={previewForm.home.slice(0, 10)} away={previewForm.away.slice(0, 10)} limit={4} />
        <Note>{messages.text("details.comparisonSample", { home: sample(previewForm.home.slice(0, 10)), away: sample(previewForm.away.slice(0, 10)) })}</Note>
      </> : <Note>{messages.text("details.noStoredResults")}</Note>}
    </>}>
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
          return <RowButton key={row.metric} type="button" data-item-key={row.metric} onClick={() => go({ ...view, item: row.metric })}
            aria-label={messages.text("details.metricOpen", { metric: messages.text(`details.metric.${row.metric}`) })} style={{ padding: "3px 2px" }}>
            <b data-home>{metricText(messages, row.kind, row.home)}</b>
            <span data-home-bar><Track $value={(row.home ?? 0) / scale} $reverse aria-hidden="true" /></span>
            <span data-label>{messages.text(`details.metric.${row.metric}`)}</span>
            <span data-away-bar><Track $value={(row.away ?? 0) / scale} $accent="blue" aria-hidden="true" /></span>
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
}

const Spark = styled.svg`
  inline-size: 100%;
  max-inline-size: 7rem;
  block-size: 1.5rem;
  overflow: visible;
  color: ${({ theme }) => theme.color.accent.orange.solid};
`;
/** Goals scored per match, oldest to newest, from stored results only. */
function Sparkline({ series }: { series: readonly number[] }) {
  if (series.length < 2) return null;
  const max = Math.max(1, ...series), step = 100 / (series.length - 1);
  const points = series.map((value, index) => `${(index * step).toFixed(1)},${(22 - (value / max) * 20).toFixed(1)}`).join(" ");
  return <Spark viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
    <polyline points={points} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />
  </Spark>;
}
const FormTeams = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  > div { display: grid; gap: 4px; min-inline-size: 0; }
  > div > span:first-child { display: flex; align-items: center; gap: 6px; min-inline-size: 0; font-size: 0.75rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; white-space: nowrap; }
  > div > span:first-child > span[data-name] { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; }
`;

export function FormSection() {
  const { data, preview, messages, home, away, view, go, fixtureId } = useDetails();
  const open = view.section === "form";
  const form = useInsightSection(fixtureId, "form", open);
  const all = form.data ?? preview?.sections.form ?? { home: [], away: [] };
  const sides = view.team === "both" ? (["home", "away"] as const) : [view.team];
  const team = (side: "home" | "away") => side === "home" ? data.fixture.homeTeam : data.fixture.awayTeam;
  const record = view.item ? [...all.home, ...all.away].find((entry) => entry.fixtureId === view.item) ?? null : null;
  const list = useRef<HTMLDivElement>(null);
  useReturnFocus(list, view.item);
  const previewTeam = (side: "home" | "away") => {
    const records = (preview?.sections.form[side] ?? []).slice(0, 5), totals = goalTotals(records, team(side).id);
    return <div key={side}>
      <span><Crest name={team(side).name} url={team(side).logoUrl} /><span data-name>{side === "home" ? home : away}</span></span>
      <FormLetters letters={formLetters(records, team(side).id, 5)} label={messages.text("details.lastFive", { team: side === "home" ? home : away })} />
      <Sparkline series={goalTotals((preview?.sections.form[side] ?? []).slice(0, 10), team(side).id).series} />
      {records.length > 0 && <Note>{messages.text("details.goalsLine", { scored: messages.number(totals.scored), conceded: messages.number(totals.conceded) })}</Note>}
    </div>;
  };
  return <SectionCard section="form" icon={<FormIcon />} accent="emerald" title={messages.text("details.section.form")}
    viewAll={messages.text("details.viewAll.form")} itemLabel={record ? messages.text("match.title", { home: record.home.name ?? "", away: record.away.name ?? "" }) : null}
    preview={<FormTeams>{previewTeam("home")}{previewTeam("away")}</FormTeams>}>
    <SectionState loading={form.loading} error={form.error} onRetry={form.retry} />
    {record ? <RecordPanel record={record} /> : <div ref={list} style={{ display: "grid", gap: 10 }}>
      <PanelBar>
        <ChoiceGroup label={messages.text("details.team")} value={view.team} onChange={(value) => go({ ...view, team: value, page: 1 }, "replace")}
          options={[{ value: "both", label: messages.text("details.bothTeams") }, { value: "home", label: home }, { value: "away", label: away }]} />
      </PanelBar>
      <FormFilters />
      {sides.map((side) => {
        const records = formRecords(all[side], team(side).id, view.venue, view.window), summary = teamComparison(records, [], team(side).id, "").home;
        const paged = pageOf(records, view.page, pageSize);
        return <div key={side} style={{ display: "grid", gap: 6 }}>
          <Strong>{side === "home" ? home : away}</Strong>
          {records.length ? <>
            <Note>{messages.text("details.formSummary", { wins: messages.number(summary.wins), draws: messages.number(summary.draws), losses: messages.number(summary.losses),
              scored: messages.number(summary.goalsFor), conceded: messages.number(summary.goalsAgainst), count: messages.plural("details.sampleResults", records.length) })}</Note>
            <ResultRows records={paged.items} perspective={team(side).id} section="form" show="opponent" />
            <Pager page={paged.page} pages={paged.pages} onPage={(page) => go({ ...view, page }, "replace")} />
          </> : <Note>{messages.text("details.noStoredResults")}</Note>}
        </div>;
      })}
    </div>}
  </SectionCard>;
}

const H2HSummary = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  font-size: 0.75rem;
  > span { color: ${({ theme }) => theme.color.mutedText}; }
`;
const PreviewRows = styled.div`
  display: none;
  @container details-card (min-width: 17rem) { display: block; }
`;

export function H2HSection() {
  const { data, preview, messages, home, away, view, go, fixtureId } = useDetails();
  const open = view.section === "h2h";
  const h2h = useInsightSection(fixtureId, "h2h", open);
  const meetings = h2h.data?.meetings ?? preview?.sections.h2h.meetings ?? [];
  const total = h2h.data?.meetings.length ?? preview?.totals.meetings ?? 0;
  const homeId = data.fixture.homeTeam.id;
  const competitions = [...new Map(meetings.map((meeting) => [meeting.competition.id, meeting.competition.name ?? messages.text("match.competitionUnknown")])).entries()];
  const filtered = meetings.filter((meeting) => (view.venue === "all" || (view.venue === "home" ? meeting.home.id === homeId : meeting.away.id === homeId)) &&
    (view.competition === null || meeting.competition.id === view.competition));
  const totals = headToHead(filtered, homeId), paged = pageOf(filtered, view.page, pageSize);
  const record = view.item ? meetings.find((entry) => entry.fixtureId === view.item) ?? null : null;
  const list = useRef<HTMLDivElement>(null);
  useReturnFocus(list, view.item);
  const previewMeetings = (preview?.sections.h2h.meetings ?? []).slice(0, 5);
  return <SectionCard section="h2h" icon={<HeadToHeadIcon />} accent="violet" title={messages.text("details.section.h2h")}
    meta={total ? messages.plural("details.meetings", total) : null}
    viewAll={messages.text("details.viewAll.h2h")} itemLabel={record ? messages.text("match.title", { home: record.home.name ?? "", away: record.away.name ?? "" }) : null}
    preview={previewMeetings.length ? <>
      <H2HSummary><span>{messages.text("details.lastMeetings", { count: messages.number(previewMeetings.length) })}</span>
        <FormLetters letters={formLetters(previewMeetings, homeId, 5)} label={messages.text("details.h2hFor", { team: home })} /></H2HSummary>
      <PreviewRows><ResultRows records={previewMeetings} perspective={homeId} section="h2h" /></PreviewRows>
    </> : <Note>{messages.text("details.noMeetings")}</Note>}>
    <SectionState loading={h2h.loading} error={h2h.error} onRetry={h2h.retry} />
    {record ? <RecordPanel record={record} /> : <div ref={list} style={{ display: "grid", gap: 10 }}>
      <Facts>
        <dt>{messages.text("details.meetingsLabel")}</dt><dd>{messages.number(totals.meetings)}</dd>
        <dt>{messages.text("details.winsFor", { team: home })}</dt><dd>{messages.number(totals.homeWins)}</dd>
        <dt>{messages.text("details.draws")}</dt><dd>{messages.number(totals.draws)}</dd>
        <dt>{messages.text("details.winsFor", { team: away })}</dt><dd>{messages.number(totals.awayWins)}</dd>
        <dt>{messages.text("details.averageGoals")}</dt><dd>{totals.averageGoals === null ? "—" : messages.number(totals.averageGoals, { maximumFractionDigits: 1 })}</dd>
        <dt>{messages.text("details.metric.bttsRate")}</dt><dd>{percent(messages, totals.bttsRate)}</dd>
        <dt>{messages.text("details.metric.over25Rate")}</dt><dd>{percent(messages, totals.over25Rate)}</dd>
      </Facts>
      <PanelBar>
        <ChoiceGroup label={messages.text("details.venue")} value={view.venue} onChange={(venue: VenueFocus) => go({ ...view, venue, page: 1 }, "replace")}
          options={[{ value: "all", label: messages.text("details.venue.all") }, { value: "home", label: messages.text("details.hostedBy", { team: home }) },
            { value: "away", label: messages.text("details.hostedBy", { team: away }) }]} />
        {competitions.length > 1 && <ChoiceGroup label={messages.text("details.competition")} value={view.competition ?? ""}
          onChange={(value) => go({ ...view, competition: value || null, page: 1 }, "replace")}
          options={[{ value: "", label: messages.text("details.allCompetitions") }, ...competitions.map(([id, name]) => ({ value: id, label: name }))]} />}
      </PanelBar>
      {paged.items.length ? <ResultRows records={paged.items} perspective={homeId} section="h2h" /> : <Note>{messages.text(meetings.length ? "details.noFilteredMeetings" : "details.noMeetings")}</Note>}
      <Pager page={paged.page} pages={paged.pages} onPage={(page) => go({ ...view, page }, "replace")} />
      <Note>{messages.text("details.h2hBasis")}</Note>
    </div>}
  </SectionCard>;
}
