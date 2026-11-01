"use client";

import { memo, useId, useRef } from "react";
import styled from "styled-components";
import { toUtcIsoString, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { horizontalPitchPositions, parsePlayerKey, playerKey, positionGroup, type PositionGroup } from "@/domain/match-details";
import type { InsightSections } from "@/domain/match-insights";
import { pageOf } from "@/domain/match-insight-presentation";
import { openItem, type TeamFocus } from "@/domain/match-view";
import { media } from "@/styles/theme";
import { InjuryIcon, LineupIcon, PlayerIcon } from "./details-icons";
import {
  ChoiceGroup, Crest, Facts, Note, Pager, PanelBar, Pill, RowButton, RowList, SectionState, Strong, focusRing, size, useDetails, type Messages,
} from "./details-ui";
import { ItemPanel, SectionCard, useReturnFocus } from "./section-card";
import { useInsightSection, useOpenByDefault } from "./use-match-view";
import { TouchlineLineupPitch } from "./touchline-lineup-pitch";
import { playerPositionLabel } from "./labels";
import { lineupDisplayFields, lineupDisplayFromTab, lineupDetailLabel, lineupDetailValue } from "./lineup-player-detail";
import { Icon } from "@/components/ui/icons";

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
  const { messages, home, away, view, update } = useDetails();
  return <ChoiceGroup label={messages.text("details.team")} value={view.team} onChange={(team: TeamFocus) => update((current) => ({ ...current, team, page: 1 }), "replace")}
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
      <dt>{messages.text("details.position")}</dt><dd>{playerPositionLabel(messages, player?.position ?? null)}</dd>
      {(["nationality", "age", "rating"] as const).map(field => <div key={field} style={{ display: "contents" }}>
        <dt>{lineupDetailLabel(messages, field)}</dt><dd>{lineupDetailValue(messages, player, field) ?? messages.text("details.notProvided")}</dd>
      </div>)}
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
  // Sections the preview already holds in full (lineups always) need no request.
  const players = useInsightSection(fixtureId, "players", open, preview), injuries = useInsightSection(fixtureId, "injuries", open, preview);
  const lineups = useInsightSection(fixtureId, "lineups", open, preview);
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

const PlayerRow = styled(RowButton)`
  grid-template-columns: 1.75rem minmax(0, 1fr) auto auto;
  > span[data-number] { color: ${({ theme }) => theme.color.mutedText}; font-variant-numeric: tabular-nums; text-align: end; }
  > span[data-name] { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
`;
const LineupGrid = styled.div<{ $besidePitch?: boolean; $single: boolean }>`
  display: grid;
  gap: 12px;
  @container details-card (min-width: 40rem) {
    grid-template-columns: ${({ $single }) => $single ? "minmax(0, 1fr)" : "repeat(2, minmax(0, 1fr))"};
    > section[data-side="away"] { grid-column: ${({ $single }) => $single ? "1" : "2"}; }
  }
  > section { display: grid; gap: 6px; align-content: start; min-inline-size: 0; }
  @container details-card (min-width: 72rem) {
    grid-template-columns: ${({ $besidePitch, $single }) => $besidePitch || $single ? "minmax(0, 1fr)" : "repeat(2, minmax(0, 1fr))"};
    > section[data-side="away"] { grid-column: ${({ $besidePitch, $single }) => $besidePitch || $single ? "1" : "2"}; }
  }
`;
const LineupWorkspace = styled.div<{ $pitch: boolean }>`
  display: grid; gap: 16px; min-inline-size: 0;
  > [data-field-column] { min-inline-size: 0; inline-size: 100%; max-inline-size: 840px; margin-inline: auto; display: grid; gap: 10px; }
  ${media.belowDesktop} { > [data-field-column] { max-inline-size: 440px; } }
  @container details-card (min-width: 72rem) {
    grid-template-columns: ${({ $pitch }) => $pitch ? "minmax(0, 840px) minmax(240px, 280px)" : "minmax(0, 1fr)"};
    ${({ $pitch }) => $pitch ? "max-inline-size: 1140px; inline-size: 100%; margin-inline: auto; align-items: start; gap: 20px;" : ""}
  }
`;
const PitchTeams = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px;
  > div { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; min-inline-size: 0; }
  > [data-side="home"] { grid-column: 1; }
  > [data-side="away"] { grid-column: 2; justify-content: end; }
  strong { font-size: .875rem; }
  small { color: ${({ theme }) => theme.color.mutedText}; font-size: .6875rem; }
  [data-formation] { padding: 4px 7px; background: ${({ theme }) => theme.color.surfaceMuted};
    color: ${({ theme }) => theme.color.text}; font-size: .75rem; white-space: nowrap; }
`;
const TeamSheetDetails = styled.details`
  color: ${({ theme }) => theme.color.mutedText}; font-size: .75rem;
  > summary { padding-block: 6px; cursor: pointer; }
  > div { display: grid; gap: 6px; padding-block: 8px; }
`;
const TeamTabs = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-block-end: 12px;
  border-block-end: 1px solid ${({ theme }) => theme.color.border};
  button { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 5px 7px;
    min-inline-size: 0; min-block-size: 48px; padding: 8px 4px; border: 0; border-block-end: 2px solid transparent;
    color: ${({ theme }) => theme.color.mutedText}; background: transparent; font: inherit; font-size: .8125rem; cursor: pointer; }
  button[aria-selected="true"] { color: ${({ theme }) => theme.color.text}; border-block-end-color: ${({ theme }) => theme.color.brand}; font-weight: 700; }
  button { ${focusRing} }
  small { font-size: .625rem; font-weight: 500; }
`;
const Availability = styled.div`
  display: grid; gap: 6px; margin-block-start: 6px; padding-block-start: 10px;
  border-block-start: 1px solid ${({ theme }) => theme.color.border};
`;
const allSides = ["home", "away"] as const;

function LineupTeamTabs({ selected, panelId }: { selected: "home" | "away"; panelId: string }) {
  const { data, home, away, messages, update } = useDetails();
  const select = (team: "home" | "away") => update(current => ({ ...current, team, page: 1, item: null }), "replace");
  return <TeamTabs role="tablist" aria-label={messages.text("details.team")} data-lineup-team-tabs>
    {allSides.map(side => <button key={side} id={`${panelId}-${side}`} type="button" role="tab" aria-selected={selected === side}
      aria-controls={panelId} tabIndex={selected === side ? 0 : -1} data-team={side} onClick={() => select(side)}
      onKeyDown={event => {
        const next = event.key === "Home" ? "home" : event.key === "End" ? "away" : ["ArrowLeft", "ArrowRight"].includes(event.key) ? side === "home" ? "away" : "home" : null;
        if (!next) return;
        event.preventDefault(); select(next);
        event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-team="${next}"]`)?.focus();
      }}>
      <Crest name={side === "home" ? home : away} url={side === "home" ? data.fixture.homeTeam.logoUrl : data.fixture.awayTeam.logoUrl} size={20} />
      <span>{side === "home" ? home : away}</span><small>{messages.text(`touchline.${side}`)}</small>
    </button>)}
  </TeamTabs>;
}

function LineupPlayerList({ players, side, kind }: { players: Lineup["starters"]; side: "home" | "away"; kind: "starters" | "substitutes" }) {
  const { messages, update, view } = useDetails();
  const display = lineupDisplayFromTab(view.tab);
  return <RowList data-lineup-players={kind}>{players.map(player => <li key={player.id}><PlayerRow type="button" data-item-key={playerKey(side, player.id)}
    onClick={() => update(current => ({ ...current, item: playerKey(side, player.id) }))}>
    <span data-number>{player.number ?? "–"}</span><span data-name>{playerName(messages, player)}</span>
    <span data-player-detail>{lineupDetailValue(messages, player, display === "number" ? "position" : display) ?? "–"}</span><span />
  </PlayerRow></li>)}</RowList>;
}

function LineupTimestamp({ lineup, teamName }: { lineup: Lineup; teamName?: string }) {
  const { messages } = useDetails();
  const time = at(lineup.updatedAt ?? lineup.retrievedAt);
  return <Note>{teamName && `${teamName} · `}{messages.text(lineup.updatedAt === null ? "touchline.lineupRetrieved" : "details.lineupStatus",
    { status: messages.text("details.confirmed") })}{" "}
    <time dateTime={toUtcIsoString(time)}>{messages.reportingInstant(time)}</time></Note>;
}

function LineupRosters({ lineups, sides, hasPitch, injuries }: { lineups: InsightSections["lineups"]; sides: readonly ("home" | "away")[]; hasPitch: boolean; injuries: readonly Injury[] }) {
  const { data, messages, home, away } = useDetails();
  const embedded = useOpenByDefault();
  return <LineupGrid $besidePitch={embedded && hasPitch} $single={sides.length === 1} data-touchline-bench={embedded && hasPitch || undefined}>
    {sides.map(side => {
      const lineup = lineups[side];
      const team = side === "home" ? data.fixture.homeTeam : data.fixture.awayTeam;
      return <section key={side} data-side={side} data-team-roster={side} aria-label={side === "home" ? home : away}>
        {embedded && !hasPitch && <Strong style={{ display: "flex", alignItems: "center", gap: 6 }}><Crest name={team.name} url={team.logoUrl} />
          {side === "home" ? home : away}{lineup?.formation ? ` · ${lineup.formation}` : ""}</Strong>}
        {lineup ? <>
          {(!embedded || !hasPitch) && <><Strong>{messages.text("details.starters")}</Strong><LineupPlayerList players={lineup.starters} side={side} kind="starters" /></>}
          <Strong>{embedded && hasPitch ? messages.text("touchline.teamSubstitutes", { team: side === "home" ? home : away }) : messages.text("details.substitutes")}</Strong>
          {lineup.substitutes.length ? <LineupPlayerList players={lineup.substitutes} side={side} kind="substitutes" /> : <Note>{messages.text("details.noSubstitutes")}</Note>}
        </> : <Note>{messages.text("details.lineupNotPublished")}</Note>}
        <TeamAbsences injuries={injuries} side={side} />
      </section>;
    })}
  </LineupGrid>;
}

export const LineupsSection = memo(function LineupsSection() {
  const { data, messages, home, away, view, update } = useDetails();
  const open = view.section === "lineups";
  const lookup = usePlayerLookup(open);
  const embedded = useOpenByDefault();
  const display = lineupDisplayFromTab(view.tab);
  const list = useRef<HTMLDivElement>(null);
  useReturnFocus(list, view.item);
  const lineups = lookup.allLineups;
  const selected = view.team === "away" ? "away" : "home";
  const panelId = useId();
  const sides: readonly ("home" | "away")[] = embedded ? view.team === "both" ? allSides : [view.team] : [selected];
  const pitchSides = embedded ? sides : allSides;
  const team = (side: "home" | "away") => side === "home" ? data.fixture.homeTeam : data.fixture.awayTeam;
  const any = Boolean(lineups.home || lineups.away);
  const hasPitch = pitchSides.every(side => {
    const lineup = lineups[side];
    return lineup && horizontalPitchPositions(lineup.starters, side, lineup.formation);
  });
  return <SectionCard section="lineups" icon={<LineupIcon />} title={messages.text(embedded ? "details.section.lineups" : "touchline.lineupsAvailability")}
    meta={open ? null : lineups.home?.formation && lineups.away?.formation ? messages.text("details.formations", { home: lineups.home.formation, away: lineups.away.formation })
      : messages.text(any ? "details.confirmed" : "details.lineupNotPublished")}
    itemLabel={lookup.key ? playerName(messages, lookup.player ?? (lookup.injury ? { name: lookup.injury.playerName } : null)) : null}>
    <SectionState loading={lookup.loading} error={lookup.error} onRetry={lookup.retry} />
    {lookup.key ? <PlayerPanel player={lookup.player} injury={lookup.injury} lineup={lookup.lineup} /> : <div ref={list} style={{ display: "grid", gap: 10 }}>
      <PanelBar>{embedded && <TeamChoice />}<label>{messages.text("touchline.profileDetails")} <select aria-label={messages.text("touchline.profileDetails")} value={display} onChange={event => {
        const tab = event.target.value === "number" ? null : `lineup-${event.target.value}`;
        update(current => ({ ...current, tab }), "replace");
      }}>
        {lineupDisplayFields.map(field => <option key={field} value={field}>{lineupDetailLabel(messages, field)}</option>)}
      </select></label></PanelBar>
      {!Object.values(lineups).some(lineup => lineup && [...lineup.starters, ...lineup.substitutes].some(player => lineupDetailValue(messages, player, display) !== null)) && any &&
        <Note>{messages.text("touchline.playerDetailMissing", { detail: lineupDetailLabel(messages, display) })}</Note>}
      <LineupWorkspace $pitch={embedded && hasPitch}>
      <div data-field-column>
        {hasPitch && <PitchTeams>{pitchSides.map(side => <div key={side} data-side={side}>
          <Crest name={team(side).name} url={team(side).logoUrl} size={24} />
          <strong>{side === "home" ? home : away}</strong><small>{messages.text(`touchline.${side}`)}{lineups[side] && ` · ${messages.text("details.confirmed")}`}</small>
          {lineups[side]?.formation && <b data-formation>{lineups[side]!.formation}</b>}
        </div>)}</PitchTeams>}
        {hasPitch ? <TouchlineLineupPitch lineups={lineups} sides={pitchSides} display={display} selectTeam={!embedded} />
          : any && <Note>{messages.text("touchline.positionsMissing")}</Note>}
      </div>
      <div style={{ minWidth: 0 }}>
        {!embedded && <LineupTeamTabs selected={selected} panelId={panelId} />}
        <div id={panelId} role={embedded ? undefined : "tabpanel"} aria-labelledby={embedded ? undefined : `${panelId}-${selected}`} tabIndex={embedded ? undefined : 0}>
          <LineupRosters lineups={lineups} sides={sides} hasPitch={hasPitch} injuries={lookup.allInjuries} />
        </div>
      </div>
      </LineupWorkspace>
      <TeamSheetDetails><summary>{messages.text("touchline.teamSheetDetails")}</summary><div>
        {sides.map(side => { const lineup = lineups[side]; return lineup && <LineupTimestamp key={side} lineup={lineup} teamName={side === "home" ? home : away} />; })}
        <Note>{messages.text("details.managerMissing")}</Note><Note>{messages.text("details.injuryBasis")}</Note>
      </div></TeamSheetDetails>
    </div>}
  </SectionCard>;
});

const Avatar = styled.span`
  display: grid;
  place-items: center;
  inline-size: 1.5rem;
  block-size: 1.5rem;
  color: ${({ theme }) => theme.color.mutedText};
  background: ${({ theme }) => theme.color.surfaceMuted};
  border-radius: ${({ theme }) => theme.radius.circle};
  font-size: 0.5625rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
`;
const SquadRow = styled(RowButton)`
  grid-template-columns: 1.5rem minmax(0, 1fr) auto;
  > span[data-name] { display: grid; min-inline-size: 0; }
  > span[data-name] > b { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  > span[data-name] > small { color: ${({ theme }) => theme.color.mutedText}; font-size: ${size("caption")}; }
`;
const initials = (name: string | null) => name?.split(/\s+/u).map((part) => [...part][0] ?? "").join("").slice(0, 2).toUpperCase() || "?";

export const PlayersSection = memo(function PlayersSection() {
  const { preview, messages, home, away, view, update } = useDetails();
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
    return <li key={key}><SquadRow type="button" data-item-key={key} onClick={() => update((current) => openItem(current, "players", key))}>
      <Avatar aria-hidden="true">{initials(player.name)}</Avatar>
      <span data-name><b>{playerName(messages, player)}</b><small>{[player.team === "home" ? home : away, player.position ? playerPositionLabel(messages, player.position) : null, player.number !== null ? `#${player.number}` : null].filter(Boolean).join(" · ")}</small></span>
      {injury ? <Pill $accent={statusAccent[injury.status]}>{messages.text(`details.injury.${injury.status}`)}</Pill>
        : player.role ? <Pill $accent={player.role === "starting" ? "emerald" : "blue"}>{messages.text(`details.role.${player.role}`)}</Pill> : <span />}
    </SquadRow></li>;
  };
  return <SectionCard section="players" icon={<PlayerIcon />} title={messages.text("details.section.players")}
    meta={total ? messages.plural("details.playerCount", total) : preview ? messages.text("details.summary.noPlayers") : null}
    itemLabel={lookup.key ? playerName(messages, lookup.player ?? (lookup.injury ? { name: lookup.injury.playerName } : null)) : null}>
    <SectionState loading={lookup.loading} error={lookup.error} onRetry={lookup.retry} />
    {lookup.key ? <PlayerPanel player={lookup.player} injury={lookup.injury} lineup={lookup.lineup} /> : <div ref={list} style={{ display: "grid", gap: 10 }}>
      <PanelBar>
        <TeamChoice />
        <ChoiceGroup label={messages.text("details.position")} value={group ?? "all"} onChange={(value: string) => update((current) => ({ ...current, tab: value === "all" ? null : value, page: 1 }), "replace")}
          options={[{ value: "all", label: messages.text("details.allPositions") },
            ...(["G", "D", "M", "F"] as PositionGroup[]).map((value) => ({ value, label: messages.text(`details.positionGroup.${value}`) }))]} />
      </PanelBar>
      {paged.items.length ? <RowList>{paged.items.map(row)}</RowList> : <Note>{messages.text(lookup.allPlayers.length ? "details.noFilteredPlayers" : "details.playersNone")}</Note>}
      <Pager page={paged.page} pages={paged.pages} onPage={(page) => update((current) => ({ ...current, page }), "replace")} />
      <Note>{messages.text("details.playerStatsMissing")}</Note>
    </div>}
  </SectionCard>;
});

const InjuryRow = styled(RowButton)`
  grid-template-columns: 1rem minmax(0, 1fr) auto;
  > svg { color: ${({ theme }) => theme.color.accent.red.solid}; }
  > span[data-name] { display: grid; min-inline-size: 0; }
  > span[data-name] > b { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  > span[data-name] > small { overflow: hidden; color: ${({ theme }) => theme.color.mutedText}; font-size: ${size("caption")}; white-space: nowrap; text-overflow: ellipsis; }
`;

function TeamAbsences({ injuries, side }: { injuries: readonly Injury[]; side: "home" | "away" }) {
  const { messages, update } = useDetails();
  const entries = injuries.filter(injury => injury.team === side);
  return <Availability data-team-absences={side}>
    <Strong>{messages.text("details.section.injuries")}</Strong>
    {entries.length ? <RowList>{entries.map(injury => {
      const key = playerKey(side, injury.playerId);
      const suspended = /suspend|suspension/iu.test(`${injury.type ?? ""} ${injury.reason ?? ""}`);
      return <li key={`${key}-${injury.type ?? ""}-${injury.reason ?? ""}`}><InjuryRow type="button" data-item-key={key}
        data-absence-kind={suspended ? "suspension" : "injury"}
        onClick={() => update(current => ({ ...current, item: key }))}>
        {suspended ? <Icon><circle cx="12" cy="12" r="8" /><path d="m6 6 12 12" /></Icon> : <InjuryIcon />}
        <span data-name><b>{playerName(messages, { name: injury.playerName })}</b>
          <small>{injury.reason ?? injury.type}</small></span>
        <Pill $accent={statusAccent[injury.status]}>{messages.text(`details.injury.${injury.status}`)}</Pill>
      </InjuryRow></li>;
    })}</RowList> : <Note>{messages.text("details.injuriesNone")}</Note>}
  </Availability>;
}
