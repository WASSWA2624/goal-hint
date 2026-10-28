"use client";

import styled from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import { publicPolicy } from "@/domain/public-policy";
import type { ForecastSourceFamily, ForecastSourceScores, ForecastSourcesReport } from "@/domain/forecast-sources";
import { media } from "@/styles/theme";
import { DeskHead, DeskTitle, FactList, MetaLine, Panel, PanelBody, PanelHead, RowList, RowMeta, RowTitle, Segmented, StatGrid } from "./desk-styles";

const familyLabels = { "match-result": "Match result", "double-chance": "Double chance", "total-goals": "Total goals",
  "both-teams-to-score": "Both teams to score" } as const;
const selectionLabels: Readonly<Record<string, string>> = { "home-win": "Home win", draw: "Draw", "away-win": "Away win" };
const outcomeLabels: Readonly<Record<string, string>> = { correct: "Correct", incorrect: "Incorrect", pending: "Pending", void: "Void", unavailable: "Unavailable" };
const markets = [["all", "All markets"], ...Object.entries(familyLabels)] as const;
const kickoffFormat = new Intl.DateTimeFormat("en-GB", { timeZone: publicPolicy.reportingTimeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const percent = (value: number | null) => value === null ? "—" : `${(value * 100).toFixed(1)}%`;
const score = (value: number | null) => value === null ? "—" : value.toFixed(3);
const signed = (value: number | null) => value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(3)}`;
const interval = (value: { lower: number; upper: number } | null) => value === null ? "" : ` (${percent(value.lower)}–${percent(value.upper)})`;

function Scores({ value, label }: { value: ForecastSourceScores; label: string }) {
  if (value.count === 0) return <PanelBody><MetaLine>{label}: no matched settled predictions yet.</MetaLine></PanelBody>;
  const rows = [
    ["Matched settled predictions", String(value.count)],
    ["Brier · AI / API-Football", `${score(value.ai.brier)} / ${score(value["api-football"].brier)}`],
    ["Brier difference (AI − API-Football)", signed(value.brierDifference)],
    ["Log loss · AI / API-Football", `${score(value.ai.logLoss)} / ${score(value["api-football"].logLoss)}`],
    ["Log loss difference (AI − API-Football)", signed(value.logLossDifference)],
    ["Hit rate · AI", `${percent(value.ai.hitRate)}${interval(value.hitRateIntervals.ai)}`],
    ["Hit rate · API-Football", `${percent(value["api-football"].hitRate)}${interval(value.hitRateIntervals["api-football"])}`],
    ["Calibration error · AI / API-Football", `${score(value.ai.calibrationError)} / ${score(value["api-football"].calibrationError)}`],
  ] as const;
  return <PanelBody><FactList aria-label={label}>{rows.map(([name, text]) => <div key={name}><dt>{name}</dt><dd>{text}</dd></div>)}</FactList></PanelBody>;
}

function FamilyPanel({ value, replay = false }: { value: ForecastSourceFamily; replay?: boolean }) {
  const { coverage } = value, id = `forecast-source-${value.family}`;
  const tiles = [["Locked", coverage.locked], [replay ? "Pairs present" : "Both captured", coverage.captured], [replay ? "Pairs missing" : "Not captured", coverage.notCaptured],
    ["Both available", coverage.both], ["AI only", coverage.aiOnly], ["API-Football only", coverage.providerOnly],
    ["Settled pairs", coverage.settled], ["Pending pairs", coverage.pending]] as const;
  return <Panel aria-labelledby={id}>
    <PanelHead><h2 id={id}>{familyLabels[value.family]}</h2>
      {value.reason === "no-provider-counterpart" ? <Quiet>API-Football supplies no {familyLabels[value.family].toLowerCase()} prediction</Quiet>
        : value.derivedFrom ? <Quiet>Derived from the match result; not a separate sample</Quiet> : null}</PanelHead>
    <StatGrid $columns={4} aria-label={`${familyLabels[value.family]} coverage`}>
      {tiles.map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}</StatGrid>
    {value.reason !== "no-provider-counterpart" && <Scores value={value.matched} label={`${familyLabels[value.family]} matched scores`} />}
  </Panel>;
}

/** Owner-only diagnostic: AI and API-Football predictions captured in the same refreshes, scored on the same settled matches. */
export function ForecastSourcesReport({ value }: { value: ForecastSourcesReport }) {
  const result = value.comparisons.find((entry) => entry.family === "match-result");
  const query = (market: string) => `/admin/forecasts?${new URLSearchParams({ from: value.from, to: value.to, ...(market === "all" ? {} : { market }) })}`;
  return <Report>
    <DeskHead><DeskTitle><h1>Forecast sources</h1>
      <MetaLine>{value.from} to {value.to} · {value.fixtureCount} fixtures · kickoff dates in East Africa Time</MetaLine></DeskTitle></DeskHead>
    <Notice $tone="info">Diagnostic only. Small samples are noisy; AI-first publication needs an owner-approved evaluation report.</Notice>
    {value.diagnostic && <Notice $tone="info" role="note">{value.diagnostic.label} {value.diagnostic.replayedFixtures} legacy fixtures use replay diagnostics; source-order totals below retain the original audit.</Notice>}
    <Segmented aria-label="Market">{markets.map(([key, label]) =>
      <Link key={key} href={query(key)} prefetch={false} aria-current={value.market === key ? "page" : undefined}>{label}</Link>)}</Segmented>
    <Panel aria-labelledby="forecast-source-order">
      <PanelHead><h2 id="forecast-source-order">Source order of locked predictions</h2></PanelHead>
      <StatGrid $columns={3}>
        <div><dt>API-Football first</dt><dd>{value.orders["provider-first"]}</dd></div>
        <div><dt>AI first</dt><dd>{value.orders["ai-first"]}</dd></div>
        <div><dt>Before source receipts</dt><dd>{value.orders.none}</dd></div>
      </StatGrid>
    </Panel>
    {value.comparisons.map((entry) => <FamilyPanel key={entry.family} value={entry} replay={!!value.diagnostic} />)}
    {result && <>
      <Panel aria-labelledby="forecast-source-disagreements">
        <PanelHead><h2 id="forecast-source-disagreements">Disagreements · match result</h2>
          <Quiet>{result.disagreements.count} settled matches where the two predictions differ</Quiet></PanelHead>
        {result.disagreements.count > 0 && <PanelBody><FactList>
          <div><dt>AI correct</dt><dd>{result.disagreements.aiCorrect}</dd></div>
          <div><dt>API-Football correct</dt><dd>{result.disagreements.providerCorrect}</dd></div>
          <div><dt>Brier · AI / API-Football</dt><dd>{score(result.disagreements.ai.brier)} / {score(result.disagreements["api-football"].brier)}</dd></div>
        </FactList></PanelBody>}
      </Panel>
      <Panel aria-labelledby="forecast-source-evidence">
        <PanelHead><h2 id="forecast-source-evidence">Conflicting or limited evidence · match result</h2></PanelHead>
        <Scores value={result.segments.conflictingEvidence} label="Conflicting evidence" />
        <Scores value={result.segments.limitedNews} label="Limited news" />
      </Panel>
    </>}
    <Panel aria-labelledby="forecast-source-recent">
      <PanelHead><h2 id="forecast-source-recent">Recent matched predictions</h2><Quiet>{value.diagnostic ? "Synthetic replay pairs, newest kickoff first" : "Match result, newest kickoff first"}</Quiet></PanelHead>
      {value.recent.length === 0 ? <PanelBody><MetaLine>No locked match has both predictions yet.</MetaLine></PanelBody>
        : <RowList>{value.recent.map((pair) => <Pair key={pair.fixtureId}>
          <RowTitle><Link href={pair.href} prefetch={false}>{pair.matchLabel}</Link></RowTitle>
          <RowMeta>{kickoffFormat.format(new Date(pair.kickoffAt))} · published {pair.published === "ai" ? "AI" : pair.published === "api-football" ? "API-Football" : "none"}</RowMeta>
          <RowMeta>AI {selectionLabels[pair.ai.selection] ?? pair.ai.selection} {percent(pair.ai.probability)} · {outcomeLabels[pair.ai.outcome] ?? pair.ai.outcome}
            {" · "}API-Football {selectionLabels[pair["api-football"].selection] ?? pair["api-football"].selection} {percent(pair["api-football"].probability)} · {outcomeLabels[pair["api-football"].outcome] ?? pair["api-football"].outcome}</RowMeta>
        </Pair>)}</RowList>}
    </Panel>
  </Report>;
}

const Report = styled.div`
  display: grid;
  gap: 12px;
  min-inline-size: 0;
  ${media.desktop} { gap: 16px; }
`;
const Quiet = styled.span`
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
`;
const Pair = styled.li`
  display: grid;
  gap: 2px;
  padding: 10px 14px;
  a { color: ${({ theme }) => theme.color.link}; }
  ${media.desktop} { padding-inline: 16px; }
`;
