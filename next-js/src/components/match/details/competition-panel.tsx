"use client";

import { FloatingField } from "@/components/ui/floating-field";

import { controlBodyHeight, inlineControlRow } from "@/components/ui/control-layout";
import styled from "styled-components";
import { useMemo } from "react";
import type { MatchView } from "@/domain/match-view";
import type { CompetitionView, StandingRow } from "@/domain/competition-view";
import { utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { RadioGroup } from "@/components/ui/radio-group";
import { ContextIcon } from "./details-icons";
import { Note, SectionState, focusRing, useStableDetails } from "./details-ui";
import { TouchlineEmpty } from "./touchline-ui";
import { useInsightSection } from "./use-match-view";
import { CompetitionTable, FormDot } from "./competition-table";
import { KnockoutBracketView } from "./knockout-bracket";

const Toolbar = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; gap: 10px 24px; min-inline-size: 0;
  > label { display: grid; gap: 2px; min-inline-size: 0; color: ${({ theme }) => theme.color.mutedText}; font-size: .625rem; }
  select { min-block-size: var(--form-control-height, 40px); max-inline-size: 100%; padding: 3px 6px; color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surface};
    border: 0; font: inherit; font-size: .75rem; ${focusRing} }
  > small { margin-inline-start: auto; font-size: .6875rem; color: ${({ theme }) => theme.color.mutedText}; }
  ${inlineControlRow}
  &:has(> [data-floating-field]) > fieldset > label { ${controlBodyHeight} }
`;
const Footnote = styled.div`
  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 16px;
  > span { display: inline-flex; align-items: center; gap: 10px; }
  > span > small { display: inline-flex; align-items: center; gap: 4px; color: ${({ theme }) => theme.color.mutedText}; font-size: .625rem; }
  p { font-size: .625rem; }
`;

export function TouchlineStandings({ view }: { view: MatchView }) {
  const { data, fixtureId, preview, messages, update } = useStableDetails();
  const state = useInsightSection(fixtureId, "context", true, preview), context = state.data ?? preview?.sections.context;
  const supplied = context?.competitionView;
  const fallback = useMemo<CompetitionView["tables"]>(() => {
    const legacy = context?.standings;
    if (!legacy) return null;
    const rows: StandingRow[] = (["home", "away"] as const).flatMap(side => {
      const row = legacy[side], team = data.fixture[`${side}Team`];
      return row ? [{ rank: row.rank, team: {id:team.id, name:team.name, logoUrl:team.logoUrl ?? null},
        played:row.played, points:row.points, wins:null, draws:null, losses:null, goalsFor:null, goalsAgainst:null, goalDifference:null, form:[] }] : [];
    }).sort((a,b) => a.rank! - b.rank!);
    return rows.length ? { complete:false, retrievedAt:legacy.retrievedAt, groups:[{id:"available",name:null,rows}] } : null;
  }, [context?.standings, data.fixture]);
  const tables = supplied?.tables?.groups.length ? supplied.tables : fallback;
  const bracket = supplied?.bracket?.rounds.some(round => round.ties.length) ? supplied.bracket : null;
  const requested = view.tab === "bracket" ? "bracket" : view.tab?.startsWith("table") ? "table" : supplied?.defaultView;
  const mode = requested === "bracket" && bracket ? "bracket" : tables ? "table" : "bracket";
  const detailed = view.tab === "table-detail";
  const defaultGroup = tables?.groups.find(group => group.rows.some(row => row.team.id === data.fixture.homeTeam.id)) ?? tables?.groups[0];
  const group = tables?.groups.find(group => group.id === view.item) ?? defaultGroup;
  const changeView = (next: "table" | "bracket") => update(current => ({ ...current, section:"context", tab:next, item:null }), "replace");
  const retrievedAt = mode === "table" ? tables?.retrievedAt : bracket?.retrievedAt;
  return <>
    <SectionState loading={state.loading} error={state.error} onRetry={state.retry} />
    {tables || bracket ? <>
      <Toolbar data-competition-toolbar>
        {tables && bracket && <RadioGroup label={messages.text("competition.view")} value={mode} onChange={changeView}
          options={[{value:"table",label:messages.text("competition.table")},{value:"bracket",label:messages.text("competition.bracket")}]} />}
        {mode === "table" && <RadioGroup label={messages.text("competition.columns")} value={detailed ? "detailed" : "summary"}
          onChange={value => update(current => ({...current, section:"context", tab:value === "detailed" ? "table-detail" : "table"}), "replace")}
          options={[{value:"summary",label:messages.text("competition.summary")},{value:"detailed",label:messages.text("competition.detailed")}]} />}
        {mode === "table" && tables && tables.groups.length > 1 && <FloatingField label={messages.text("competition.group")}><select aria-label={messages.text("competition.group")} value={group?.id} onChange={event => {
            const item = event.target.value; update(current => ({...current,section:"context",item}), "replace");
          }}>{tables.groups.map((group,index) => <option key={group.id} value={group.id}>{group.name ?? `${messages.text("competition.group")} ${messages.number(index + 1)}`}</option>)}</select></FloatingField>}
        {supplied?.season && <small>{messages.text("competition.season", {year:String(supplied.season)})}</small>}
      </Toolbar>
      {mode === "table" && group && <>
        <CompetitionTable rows={group.rows} detailed={detailed} />
        {tables && !tables.complete && <Note>{messages.text("competition.tablePartial")}</Note>}
      </>}
      {mode === "bracket" && bracket && <>
        <KnockoutBracketView bracket={bracket} roundId={view.item} onRoundChange={item => update(current => ({...current,section:"context",tab:"bracket",item}), "replace")} />
        {!bracket.complete && <Note>{messages.text("competition.bracketPartial")}</Note>}
      </>}
      <Footnote>
        {mode === "table" && <span>{(["W","D","L"] as const).map(result => <small key={result}><FormDot $result={result} />{messages.text(`details.result.${result}`)}</small>)}</span>}
        {retrievedAt != null && <Note>{messages.text("competition.updated",{time:messages.reportingInstant(utcInstantFromEpochMilliseconds(retrievedAt))})}</Note>}
      </Footnote>
    </> : <TouchlineEmpty><ContextIcon aria-hidden="true" /><p>{messages.text("touchline.standingsMissing")}</p></TouchlineEmpty>}
  </>;
}
