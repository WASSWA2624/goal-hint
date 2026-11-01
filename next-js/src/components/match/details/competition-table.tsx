"use client";

import { filledTableRows } from "@/components/ui/filled-surfaces";
import { useId, useState } from "react";
import styled from "styled-components";
import type { StandingRow } from "@/domain/competition-view";
import { utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { CriteriaDialog, CriteriaDialogButton } from "@/components/ui/criteria-dialog";
import { media } from "@/styles/theme";
import { Crest, Note, focusRing, useStableDetails } from "./details-ui";

const Frame = styled.div`min-inline-size: 0; overflow-x: auto; overscroll-behavior-inline: contain;`;
const Table = styled.table<{ $detailed: boolean }>`
  ${filledTableRows}
  inline-size: 100%; min-inline-size: ${({ $detailed }) => $detailed ? "29rem" : "17.5rem"};
  table-layout: fixed; border-collapse: separate; border-spacing: 0; font-size: .75rem; font-variant-numeric: tabular-nums;
  th, td { block-size: 38px; padding: 4px; border-block-end: 0; text-align: center;
    white-space: nowrap; background: ${({ theme }) => theme.color.surface}; }
  thead th { block-size: 30px; background: ${({ theme }) => theme.color.surfaceMuted}; color: ${({ theme }) => theme.color.mutedText}; font-size: .625rem; }
  [data-rank] { position: sticky; inset-inline-start: 0; z-index: 1; }
  [data-team-cell] { position: sticky; inset-inline-start: 26px; z-index: 1; text-align: start; border-inline-end: 0; }
  thead [data-rank], thead [data-team-cell] { z-index: 2; }
  tbody [data-team-cell] { font-weight: 500; }
  tbody tr[data-side="home"] > * { background: ${({ theme }) => theme.color.accent.orange.soft}; }
  tbody tr[data-side="away"] > * { background: ${({ theme }) => theme.color.accent.blue.soft}; }
  tbody tr[data-side] [data-team-cell] { font-weight: 800; }
  [data-points] { font-weight: 800; }
  abbr { text-decoration: none; }
  [data-team-name] { display: flex; align-items: center; gap: 6px; min-inline-size: 0; }
  [data-team-name] > span:last-child { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  [data-short] { display: none; }
  ${media.belowDesktop} { [data-has-short] [data-full] { display: none; } [data-has-short] [data-short] { display: inline; } }
`;
export const FormDot = styled.span<{ $result: "W" | "D" | "L" }>`
  display: inline-block; flex: none; inline-size: 8px; block-size: 8px; border-radius: ${({ theme }) => theme.radius.circle};
  background: ${({ theme, $result }) => $result === "W" ? theme.color.accent.emerald.solid
    : $result === "L" ? theme.color.accent.red.solid : theme.color.mutedText};
`;
const FormButton = styled.button`
  display: inline-flex; align-items: center; justify-content: center; gap: 3px; min-block-size: 24px; min-inline-size: 60px;
  padding: 4px; background: none; border: 0; color: inherit; cursor: pointer; ${focusRing}
`;
const FormList = styled.ol`
  display: grid; gap: 12px; margin: 0; padding: 0; list-style: none;
  li { display: flex; align-items: center; gap: 10px; }
  li > div { display: grid; gap: 3px; }
  small { color: ${({ theme }) => theme.color.mutedText}; }
`;
const fullColumns = ["played", "wins", "draws", "losses", "goalsFor", "goalsAgainst", "goalDifference", "points"] as const;
const shortColumns = ["played", "goalDifference", "points"] as const;
const abbreviations = { played: "P", wins: "W", draws: "D", losses: "L", goalsFor: "GF", goalsAgainst: "GA", goalDifference: "GD", points: "PT" };

export function CompetitionTable({ rows, detailed }: { rows: readonly StandingRow[]; detailed: boolean }) {
  const { data, messages } = useStableDetails();
  const [form, setForm] = useState<StandingRow | null>(null), dialogId = useId();
  const columns = detailed ? fullColumns : shortColumns;
  const number = (value: number | null) => value === null ? "—" : messages.number(value);
  return <>
    <Frame data-standings-scroll tabIndex={0} aria-label={messages.text("details.standings")}>
      <Table $detailed={detailed} data-competition-table data-columns={detailed ? "detailed" : "summary"} aria-label={messages.text("details.standings")}>
        <colgroup><col style={{ width: 26 }} /><col />
          {columns.map(column => <col key={column} style={{ width: column === "goalDifference" ? 32 : 28 }} />)}<col style={{ width: 68 }} /></colgroup>
        <thead><tr><th scope="col" data-rank aria-label={messages.text("competition.rank")}>#</th>
          <th scope="col" data-team-cell>{messages.text("details.team")}</th>
          {columns.map(column => <th scope="col" key={column}><abbr title={messages.text(`competition.${column}`)}>{abbreviations[column]}</abbr></th>)}
          <th scope="col"><abbr title={messages.text("competition.formHelp")}>{messages.text("competition.form")}</abbr></th>
        </tr></thead><tbody>{rows.map(row => {
          const side = row.team.id === data.fixture.homeTeam.id ? "home" : row.team.id === data.fixture.awayTeam.id ? "away" : undefined;
          const name = row.team.name ?? messages.text("details.teamUnknown");
          const results = row.form.map(item => messages.text(`details.result.${item.result}`)).join(", ");
          return <tr key={row.team.id} data-standing-team={row.team.id} data-side={side}>
            <td data-rank>{number(row.rank)}</td><th scope="row" data-team-cell title={name} aria-label={name}>
              <span data-team-name data-has-short={Boolean(row.team.shortName && name.length > 14) || undefined}>
                <Crest name={name} url={row.team.logoUrl} size={16} /><span><span data-full>{name}</span><span data-short>{row.team.shortName ?? name}</span></span>
              </span></th>
            {columns.map(column => <td key={column} data-points={column === "points" || undefined}>{number(row[column])}</td>)}
            <td>{row.form.length ? <FormButton type="button" onClick={() => setForm(row)} aria-label={messages.text("competition.formLabel", { team:name, results })}
              title={`${name}: ${results}`} data-standing-form={row.team.id}>
              {row.form.map((item,index) => <FormDot key={index} $result={item.result} data-form-result={item.result} aria-hidden="true" title={messages.text(`details.result.${item.result}`)} />)}
            </FormButton> : <span aria-label={messages.text("details.notProvided")}>—</span>}</td>
          </tr>;
        })}</tbody></Table>
    </Frame>
    {form && <CriteriaDialog id={dialogId} open title={messages.text("competition.formTitle", {team:form.team.name ?? messages.text("details.teamUnknown")})}
      onCancel={() => setForm(null)} closeLabel={messages.text("competition.close")}
      footer={<CriteriaDialogButton type="button" onClick={() => setForm(null)}>{messages.text("competition.close")}</CriteriaDialogButton>}>
      <Note>{messages.text("competition.formHelp")}</Note>
      <FormList>{form.form.map((item,index) => <li key={index}><FormDot $result={item.result} /><div>
        <strong>{messages.text(`details.result.${item.result}`)}{item.opponent ? ` · ${item.opponent}` : ""}
          {item.goalsFor != null && item.goalsAgainst != null ? ` · ${number(item.goalsFor)}–${number(item.goalsAgainst)}` : ""}</strong>
        <small>{item.kickoffAt != null ? messages.reportingInstant(utcInstantFromEpochMilliseconds(item.kickoffAt)) : !item.opponent ? messages.text("competition.formMissing") : ""}</small>
      </div></li>)}</FormList>
    </CriteriaDialog>}
  </>;
}
