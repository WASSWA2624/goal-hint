"use client";

import { useRef } from "react";
import styled from "styled-components";
import { toUtcIsoString, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { parsePlayerKey, pitchRows, playerKey, positionGroup, type PositionGroup } from "@/domain/match-details";
import { pageOf, type InsightSections } from "@/domain/match-insights";
import { openItem, type TeamFocus } from "@/domain/match-view";
import { InjuryIcon, LineupIcon, PlayerIcon } from "./details-icons";
import {
  ChoiceGroup, Crest, Facts, Note, Pager, PanelBar, Pill, RowButton, RowList, SectionState, Strong, desktop, useDetails, type Messages,
} from "./details-ui";
import { ItemPanel, SectionCard, useReturnFocus } from "./section-card";
import { useInsightSection } from "./use-match-view";

type Player = InsightSections["players"]["players"][number];
type Injury = InsightSections["injuries"]["injuries"][number];
type Lineup = NonNullable<InsightSections["lineups"]["home"]>;
const at = (value: number) => utcInstantFromEpochMilliseconds(value);
const statusAccent = { out: "red", doubtful: "amber", unknown: "blue" } as const;

function playerName(messages: Messages, player: { name: string | null } | null | undefined) {
  return player?.name ?? messages.text("details.playerUnknown");
}

/** Team switch shared by squad sections; "both" lists home then away. */
function TeamChoice() {
  const { messages, home, away, view, go } = useDetails();
  return <ChoiceGroup label={messages.text("details.team")} value={view.team} onChange={(team: TeamFocus) => go({ ...view, team, page: 1 }, "replace")}
    options={[{ value: "both", label: messages.text("details.bothTeams") }, { value: "home", label: home }, { value: "away", label: away }]} />;
}

/** Profile, lineup role and availability of one player, from this match's permitted evidence only. */
function PlayerPanel({ player, injury, lineup }: { player: Player | null; injury: Injury | null; lineup: Lineup | null }) {
  const { messages, home, away, view } = useDetails();
  const key = parsePlayerKey(view.item);
  const side = player?.team ?? injury?.team ?? key?.team ?? "home";
  return <ItemPanel itemKey={view.item ?? ""} title={playerName(messages, player ?? (injury ? { name: injury.playerName } : null))}>
    <Facts>
      <dt>{messages.text("details.team")}</dt><dd>{side === "home" ? home : away}</dd>
      <dt>{messages.text("details.number")}</dt><dd>{player?.number ?? "—"}</dd>
      <dt>{messages.text("details.position")}</dt><dd>{player?.position ?? messages.text("details.notAvailable")}</dd>
      <dt>{messages.text("details.lineupRole")}</dt><dd>{player?.role ? messages.text(`details.role.${player.role}`)
        : messages.text(lineup ? "details.notInLineup" : "details.lineupNotPublished")}</dd>
      <dt>{messages.text("details.availability")}</dt><dd>{injury ? <>
        <Pill $accent={statusAccent[injury.status]}>{messages.text(`details.injury.${injury.status}`)}</Pill>
        {" "}{[injury.type, injury.reason].filter(Boolean).join(" · ")}
      </> : messages.text("details.noAbsenceReported")}</dd>
      {injury && <><dt>{messages.text("details.reported")}</dt><dd>{injury.source} · {injury.updatedAt !== null
        ? <time dateTime={toUtcIsoString(at(injury.updatedAt))}>{messages.reportingInstant(at(injury.updatedAt))}</time>
        : <time dateTime={toUtcIsoString(at(injury.retrievedAt))}>{messages.reportingInstant(at(injury.retrievedAt))}</time>}</dd></>}
      <dt>{messages.text("details.expectedReturn")}</dt><dd>{messages.text("details.notProvided")}</dd>
    </Facts>
    <Note>{messages.text("details.playerStatsMissing")}</Note>
  </ItemPanel>;
}

/** Looks a player up across the players, lineups and injuries collections. */
function usePlayerLookup(open: boolean) {
  const { preview, view, fixtureId } = useDetails();
  const players = useInsightSection(fixtureId, "players", open), injuries = useInsightSection(fixtureId, "injuries", open);
  const lineups = useInsightSection(fixtureId, "lineups", open);
  const allPlayers = players.data?.players ?? preview?.sections.players.players ?? [];
  const allInjuries = injuries.data?.injuries ?? preview?.sections.injuries.injuries ?? [];
  const allLineups = lineups.data ?? preview?.sections.lineups ?? { home: null, away: null };
  const key = parsePlayerKey(view.item);
  const player = key ? allPlayers.find((entry) => entry.team === key.team && entry.id === key.id)
    ?? [...(allLineups[key.team]?.starters ?? []), ...(allLineups[key.team]?.substitutes ?? [])].find((entry) => entry.id === key.id) ?? null : null;
  const injury = key ? allInjuries.find((entry) => entry.team === key.team && entry.playerId === key.id) ?? null : null;
  return { key, player, injury, lineup: key ? allLineups[key.team] : null, allPlayers, allInjuries, allLineups,
    loading: players.loading || injuries.loading || lineups.loading, error: players.error || injuries.error || lineups.error,
    retry: () => { players.retry(); injuries.retry(); lineups.retry(); } };
}

const MiniPitch = styled.div`
  display: none;
  @container details-card (min-width: 15rem) {
    position: relative;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    block-size: 6.5rem;
    padding: 4px;
    background: linear-gradient(90deg, #15803D 0%, #16A34A 50%, #15803D 100%);
    border-radius: 4px;
    &::after { content: ""; position: absolute; inset-block: 4px; inset-inline-start: 50%; border-inline-start: 1px solid rgb(255 255 255 / 55%); }
  }
  > div { display: flex; justify-content: space-around; padding-inline: 4px; }
  > div[data-away] { flex-direction: row-reverse; }
  > div > div { display: flex; flex-direction: column; justify-content: space-around; }
  > div > div > span { inline-size: 9px; block-size: 9px; border: 1.5px solid #fff; border-radius: 50%; }
  > div[data-home] > div > span { background: ${({ theme }) => theme.color.accent.red.solid}; }
  > div[data-away] > div > span { background: ${({ theme }) => theme.color.text}; }
`;
/** Vertical pitch for a full lineup, forwards at the top; names stay readable at phone width. */
const Pitch = styled.ol`
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 10px 6px;
  list-style: none;
  background: repeating-linear-gradient(180deg, #15803D 0 2.5rem, #16A34A 2.5rem 5rem);
  border-radius: 4px;
  > li { display: flex; justify-content: space-around; gap: 4px; }
  button {
    display: grid;
    justify-items: center;
    gap: 2px;
    min-inline-size: 0;
    max-inline-size: 5.5rem;
    padding: 2px;
    color: #fff;
    background: none;
    border: 0;
    border-radius: 4px;
    font: inherit;
    font-size: 0.625rem;
    line-height: 1.15;
    text-align: center;
    cursor: pointer;
    &:focus-visible { outline: 2px solid #fff; }
    &:hover { background: rgb(255 255 255 / 15%); }
    > b { display: grid; place-items: center; inline-size: 1.5rem; block-size: 1.5rem; color: ${({ theme }) => theme.color.text}; background: #fff; border-radius: 50%; font-size: 0.6875rem; }
    > span { overflow-wrap: anywhere; }
  }
  ${desktop} { button { font-size: 0.6875rem; } }
`;
const PlayerRow = styled(RowButton)`
  grid-template-columns: 1.75rem minmax(0, 1fr) auto auto;
  > span[data-number] { color: ${({ theme }) => theme.color.mutedText}; font-variant-numeric: tabular-nums; text-align: end; }
  > span[data-name] { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
`;
const LineupGrid = styled.div`
  display: grid;
  gap: 12px;
  @container details-card (min-width: 40rem) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  > section { display: grid; gap: 6px; align-content: start; min-inline-size: 0; }
`;

function short(name: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/u);
  return parts.length > 1 ? parts.at(-1)! : name;
}

export function LineupsSection() {
  const { data, messages, home, away, view, go } = useDetails();
  const open = view.section === "lineups";
  const lookup = usePlayerLookup(open);
  const list = useRef<HTMLDivElement>(null);
  useReturnFocus(list, view.item);
  const lineups = lookup.allLineups;
  const sides = view.team === "both" ? (["home", "away"] as const) : [view.team];
  const team = (side: "home" | "away") => side === "home" ? data.fixture.homeTeam : data.fixture.awayTeam;
  const playerButton = (player: Lineup["starters"][number]) => {
    const key = playerKey(player.team, player.id);
    return <button type="button" key={key} data-item-key={key} onClick={() => go({ ...view, item: key })}
      aria-label={messages.text("details.playerOpen", { player: playerName(messages, player) })}>
      <b>{player.number ?? "–"}</b><span>{short(player.name)}</span>
    </button>;
  };
  const mini = (side: "home" | "away") => {
    const rows = lineups[side] ? pitchRows(lineups[side]!.starters) : null;
    return <div data-home={side === "home" || undefined} data-away={side === "away" || undefined}>
      {(rows ?? []).map((row, index) => <div key={index}>{row.map((player) => <span key={player.id} />)}</div>)}
    </div>;
  };
  const any = Boolean(lineups.home || lineups.away);
  return <SectionCard section="lineups" icon={<LineupIcon />} accent="emerald" title={messages.text("details.section.lineups")}
    meta={any ? messages.text("details.confirmed") : null} viewAll={messages.text("details.viewAll.lineups")}
    itemLabel={lookup.key ? playerName(messages, lookup.player ?? (lookup.injury ? { name: lookup.injury.playerName } : null)) : null}
    preview={any ? <>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "0.75rem" }}>
        {(["home", "away"] as const).map((side) => <span key={side} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Crest name={team(side).name} url={team(side).logoUrl} />
          <Strong>{lineups[side]?.formation ?? messages.text("details.formationUnknown")}</Strong>
        </span>)}
      </div>
      <MiniPitch aria-hidden="true">{mini("home")}{mini("away")}</MiniPitch>
    </> : <Note>{messages.text("details.lineupsNone")}</Note>}>
    <SectionState loading={lookup.loading} error={lookup.error} onRetry={lookup.retry} />
    {lookup.key ? <PlayerPanel player={lookup.player} injury={lookup.injury} lineup={lookup.lineup} /> : <div ref={list} style={{ display: "grid", gap: 10 }}>
      <PanelBar><TeamChoice /></PanelBar>
      <LineupGrid>
        {sides.map((side) => {
          const lineup = lineups[side], rows = lineup ? pitchRows(lineup.starters) : null;
          return <section key={side} aria-label={side === "home" ? home : away}>
            <Strong style={{ display: "flex", alignItems: "center", gap: 6 }}><Crest name={team(side).name} url={team(side).logoUrl} />
              {side === "home" ? home : away}{lineup?.formation ? ` · ${lineup.formation}` : ""}</Strong>
            {lineup ? <>
              <Note>{messages.text("details.lineupStatus", { status: messages.text("details.confirmed") })}{" "}
                <time dateTime={toUtcIsoString(at(lineup.updatedAt ?? lineup.retrievedAt))}>{messages.reportingInstant(at(lineup.updatedAt ?? lineup.retrievedAt))}</time></Note>
              {rows && <Pitch aria-label={messages.text("details.formationView")}>
                {[...rows].reverse().map((row, index) => <li key={index}>{row.map(playerButton)}</li>)}
              </Pitch>}
              <Strong>{messages.text("details.starters")}</Strong>
              <RowList>{lineup.starters.map((player) => <li key={player.id}><PlayerRow type="button" data-item-key={playerKey(side, player.id)}
                onClick={() => go({ ...view, item: playerKey(side, player.id) })}>
                <span data-number>{player.number ?? "–"}</span><span data-name>{playerName(messages, player)}</span><span>{player.position ?? ""}</span><span />
              </PlayerRow></li>)}</RowList>
              <Strong>{messages.text("details.substitutes")}</Strong>
              {lineup.substitutes.length ? <RowList>{lineup.substitutes.map((player) => <li key={player.id}><PlayerRow type="button" data-item-key={playerKey(side, player.id)}
                onClick={() => go({ ...view, item: playerKey(side, player.id) })}>
                <span data-number>{player.number ?? "–"}</span><span data-name>{playerName(messages, player)}</span><span>{player.position ?? ""}</span><span />
              </PlayerRow></li>)}</RowList> : <Note>{messages.text("details.noSubstitutes")}</Note>}
              <Note>{messages.text("details.managerMissing")}</Note>
            </> : <Note>{messages.text("details.lineupNotPublished")}</Note>}
          </section>;
        })}
      </LineupGrid>
    </div>}
  </SectionCard>;
}

const Avatar = styled.span`
  display: grid;
  place-items: center;
  inline-size: 1.5rem;
  block-size: 1.5rem;
  color: ${({ theme }) => theme.color.mutedText};
  background: ${({ theme }) => theme.color.surfaceMuted};
  border-radius: 50%;
  font-size: 0.5625rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
`;
const SquadRow = styled(RowButton)`
  grid-template-columns: 1.5rem minmax(0, 1fr) auto;
  > span[data-name] { display: grid; min-inline-size: 0; }
  > span[data-name] > b { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  > span[data-name] > small { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.6875rem; }
`;
const initials = (name: string | null) => name?.split(/\s+/u).map((part) => [...part][0] ?? "").join("").slice(0, 2).toUpperCase() || "?";

export function PlayersSection() {
  const { preview, messages, home, away, view, go } = useDetails();
  const open = view.section === "players";
  const lookup = usePlayerLookup(open);
  const list = useRef<HTMLDivElement>(null);
  useReturnFocus(list, view.item);
  const group = (["G", "D", "M", "F"] as const).find((entry) => entry === view.tab) ?? null;
  const filtered = lookup.allPlayers.filter((player) => (view.team === "both" || player.team === view.team) && (group === null || positionGroup(player.position) === group));
  const paged = pageOf(filtered, view.page, 15);
  const injuryFor = (player: Player) => lookup.allInjuries.find((entry) => entry.team === player.team && entry.playerId === player.id) ?? null;
  const total = lookup.allPlayers.length || preview?.totals.players || 0;
  const row = (player: Player) => {
    const key = playerKey(player.team, player.id), injury = injuryFor(player);
    return <li key={key}><SquadRow type="button" data-item-key={key} onClick={() => go(openItem(view, "players", key))}>
      <Avatar aria-hidden="true">{initials(player.name)}</Avatar>
      <span data-name><b>{playerName(messages, player)}</b><small>{[player.team === "home" ? home : away, player.position, player.number !== null ? `#${player.number}` : null].filter(Boolean).join(" · ")}</small></span>
      {injury ? <Pill $accent={statusAccent[injury.status]}>{messages.text(`details.injury.${injury.status}`)}</Pill>
        : player.role ? <Pill $accent={player.role === "starting" ? "emerald" : "blue"}>{messages.text(`details.role.${player.role}`)}</Pill> : <span />}
    </SquadRow></li>;
  };
  return <SectionCard section="players" icon={<PlayerIcon />} accent="blue" title={messages.text("details.section.players")}
    meta={total ? messages.plural("details.playerCount", total) : null} viewAll={messages.text("details.viewAll.players")}
    itemLabel={lookup.key ? playerName(messages, lookup.player ?? (lookup.injury ? { name: lookup.injury.playerName } : null)) : null}
    preview={(preview?.sections.players.players.length ?? 0) > 0
      ? <RowList>{preview!.sections.players.players.slice(0, 3).map(row)}</RowList> : <Note>{messages.text("details.playersNone")}</Note>}>
    <SectionState loading={lookup.loading} error={lookup.error} onRetry={lookup.retry} />
    {lookup.key ? <PlayerPanel player={lookup.player} injury={lookup.injury} lineup={lookup.lineup} /> : <div ref={list} style={{ display: "grid", gap: 10 }}>
      <PanelBar>
        <TeamChoice />
        <ChoiceGroup label={messages.text("details.position")} value={group ?? "all"} onChange={(value: string) => go({ ...view, tab: value === "all" ? null : value, page: 1 }, "replace")}
          options={[{ value: "all", label: messages.text("details.allPositions") },
            ...(["G", "D", "M", "F"] as PositionGroup[]).map((value) => ({ value, label: messages.text(`details.positionGroup.${value}`) }))]} />
      </PanelBar>
      {paged.items.length ? <RowList>{paged.items.map(row)}</RowList> : <Note>{messages.text(lookup.allPlayers.length ? "details.noFilteredPlayers" : "details.playersNone")}</Note>}
      <Pager page={paged.page} pages={paged.pages} onPage={(page) => go({ ...view, page }, "replace")} />
      <Note>{messages.text("details.playerStatsMissing")}</Note>
    </div>}
  </SectionCard>;
}

const InjuryRow = styled(RowButton)`
  grid-template-columns: 1rem minmax(0, 1fr) auto;
  > svg { color: ${({ theme }) => theme.color.accent.red.solid}; }
  > span[data-name] { display: grid; min-inline-size: 0; }
  > span[data-name] > b { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  > span[data-name] > small { overflow: hidden; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.6875rem; white-space: nowrap; text-overflow: ellipsis; }
`;

export function InjuriesSection() {
  const { preview, messages, home, away, view, go } = useDetails();
  const open = view.section === "injuries";
  const lookup = usePlayerLookup(open);
  const list = useRef<HTMLDivElement>(null);
  useReturnFocus(list, view.item);
  const status = (["out", "doubtful", "unknown"] as const).find((entry) => entry === view.tab) ?? null;
  const filtered = lookup.allInjuries.filter((injury) => (view.team === "both" || injury.team === view.team) && (status === null || injury.status === status));
  const paged = pageOf(filtered, view.page, 15);
  const total = lookup.allInjuries.length || preview?.totals.injuries || 0;
  const row = (injury: Injury) => {
    const key = playerKey(injury.team, injury.playerId);
    return <li key={`${key}-${injury.type ?? ""}`}><InjuryRow type="button" data-item-key={key} onClick={() => go(openItem(view, "injuries", key))}>
      <InjuryIcon />
      <span data-name><b>{playerName(messages, { name: injury.playerName })}</b>
        <small>{[injury.team === "home" ? home : away, injury.type, injury.reason].filter(Boolean).join(" · ")}</small></span>
      <Pill $accent={statusAccent[injury.status]}>{messages.text(`details.injury.${injury.status}`)}</Pill>
    </InjuryRow></li>;
  };
  return <SectionCard section="injuries" icon={<InjuryIcon />} accent="red" title={messages.text("details.section.injuries")}
    meta={total ? messages.plural("details.absenceCount", total) : null} viewAll={messages.text("details.viewAll.injuries")}
    itemLabel={lookup.key ? playerName(messages, lookup.player ?? (lookup.injury ? { name: lookup.injury.playerName } : null)) : null}
    preview={(preview?.sections.injuries.injuries.length ?? 0) > 0
      ? <RowList>{preview!.sections.injuries.injuries.slice(0, 3).map(row)}</RowList> : <Note>{messages.text("details.injuriesNone")}</Note>}>
    <SectionState loading={lookup.loading} error={lookup.error} onRetry={lookup.retry} />
    {lookup.key ? <PlayerPanel player={lookup.player} injury={lookup.injury} lineup={lookup.lineup} /> : <div ref={list} style={{ display: "grid", gap: 10 }}>
      <PanelBar>
        <TeamChoice />
        <ChoiceGroup label={messages.text("details.status")} value={status ?? "all"} onChange={(value: string) => go({ ...view, tab: value === "all" ? null : value, page: 1 }, "replace")}
          options={[{ value: "all", label: messages.text("details.allStatuses") },
            ...(["out", "doubtful", "unknown"] as const).map((value) => ({ value, label: messages.text(`details.injury.${value}`) }))]} />
      </PanelBar>
      {paged.items.length ? <RowList>{paged.items.map(row)}</RowList> : <Note>{messages.text(lookup.allInjuries.length ? "details.noFilteredInjuries" : "details.injuriesNone")}</Note>}
      <Pager page={paged.page} pages={paged.pages} onPage={(page) => go({ ...view, page }, "replace")} />
      <Note>{messages.text("details.injuryBasis")}</Note>
    </div>}
  </SectionCard>;
}
