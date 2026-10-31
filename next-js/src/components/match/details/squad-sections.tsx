"use client";

import { memo, useRef } from "react";
import styled from "styled-components";
import { toUtcIsoString, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { parsePlayerKey, pitchRows, playerKey, positionGroup, type PositionGroup } from "@/domain/match-details";
import type { InsightSections } from "@/domain/match-insights";
import { pageOf } from "@/domain/match-insight-presentation";
import { openItem, type TeamFocus } from "@/domain/match-view";
import { media } from "@/styles/theme";
import { InjuryIcon, LineupIcon, PlayerIcon } from "./details-icons";
import {
  ChoiceGroup, Crest, Facts, Note, Pager, PanelBar, Pill, RowButton, RowList, SectionState, Strong, desktop, size, useDetails, type Messages,
} from "./details-ui";
import { ItemPanel, SectionCard, useEmbeddedSection, useReturnFocus } from "./section-card";
import { useInsightSection } from "./use-match-view";
import { TouchlineLineupPitch } from "./touchline-lineup-pitch";

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

/** Vertical pitch for a full lineup, forwards at the top; names stay readable at phone width. */
const Pitch = styled.ol`
  position: relative;
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 10px 6px;
  list-style: none;
  background: repeating-linear-gradient(180deg, ${({ theme }) => theme.color.accent.emerald.soft} 0 2.5rem,
    color-mix(in srgb, ${({ theme }) => theme.color.accent.emerald.solid} 8%, ${({ theme }) => theme.color.accent.emerald.soft}) 2.5rem 5rem);
  border-radius: ${({ theme }) => theme.radius.surface};
  > li { position: relative; z-index: 1; display: flex; justify-content: space-around; gap: 4px; }
  > svg { position: absolute; inset: 12px; inline-size: calc(100% - 24px); block-size: calc(100% - 24px); color: ${({ theme }) => theme.color.accent.emerald.text}; opacity: .3; pointer-events: none; }
  button {
    display: grid;
    justify-items: center;
    gap: 2px;
    min-inline-size: 0;
    max-inline-size: 5.5rem;
    padding: 2px;
    color: ${({ theme }) => theme.color.accent.emerald.text};
    background: none;
    border: 0;
    border-radius: ${({ theme }) => theme.radius.control};
    font: inherit;
    font-size: ${size("micro")};
    line-height: 1.15;
    text-align: center;
    cursor: pointer;
    &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; }
    ${media.hover} { &:hover { background: ${({ theme }) => theme.color.surface}; } }
    > b { display: grid; place-items: center; inline-size: 1.5rem; block-size: 1.5rem; color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surface}; border-radius: ${({ theme }) => theme.radius.circle}; font-size: ${size("caption")}; }
    > span { overflow-wrap: anywhere; }
  }
  ${desktop} { button { font-size: ${size("caption")}; } }
`;
const PlayerRow = styled(RowButton)`
  grid-template-columns: 1.75rem minmax(0, 1fr) auto auto;
  > span[data-number] { color: ${({ theme }) => theme.color.mutedText}; font-variant-numeric: tabular-nums; text-align: end; }
  > span[data-name] { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
`;
const LineupGrid = styled.div`
  display: grid;
  gap: 12px;
  @container details-card (min-width: 40rem) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    > section[data-side="away"] { grid-column: 2; }
  }
  > section { display: grid; gap: 6px; align-content: start; min-inline-size: 0; }
`;
const PitchTeams = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px;
  > div { display: flex; align-items: center; gap: 8px; min-inline-size: 0; }
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

function short(name: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/u);
  return parts.length > 1 ? parts.at(-1)! : name;
}

export const LineupsSection = memo(function LineupsSection() {
  const { data, messages, home, away, view, update } = useDetails();
  const open = view.section === "lineups";
  const lookup = usePlayerLookup(open);
  const embedded = useEmbeddedSection();
  const display = view.tab === "lineup-position" ? "position" : "number";
  const list = useRef<HTMLDivElement>(null);
  useReturnFocus(list, view.item);
  const lineups = lookup.allLineups;
  const sides = view.team === "both" ? (["home", "away"] as const) : [view.team];
  const team = (side: "home" | "away") => side === "home" ? data.fixture.homeTeam : data.fixture.awayTeam;
  const playerButton = (player: Lineup["starters"][number]) => {
    const key = playerKey(player.team, player.id);
    return <button type="button" key={key} data-item-key={key} onClick={() => update((current) => ({ ...current, item: key }))}
      aria-label={messages.text("details.playerOpen", { player: playerName(messages, player) })}>
      <b>{player.number ?? "–"}</b><span>{short(player.name)}</span>
    </button>;
  };
  const any = Boolean(lineups.home || lineups.away);
  const hasPitch = sides.every(side => lineups[side] && pitchRows(lineups[side]!.starters));
  return <SectionCard section="lineups" icon={<LineupIcon />} title={messages.text("details.section.lineups")}
    meta={lineups.home?.formation && lineups.away?.formation ? messages.text("details.formations", { home: lineups.home.formation, away: lineups.away.formation })
      : messages.text(any ? "details.confirmed" : "details.lineupNotPublished")}
    itemLabel={lookup.key ? playerName(messages, lookup.player ?? (lookup.injury ? { name: lookup.injury.playerName } : null)) : null}>
    <SectionState loading={lookup.loading} error={lookup.error} onRetry={lookup.retry} />
    {lookup.key ? <PlayerPanel player={lookup.player} injury={lookup.injury} lineup={lookup.lineup} /> : <div ref={list} style={{ display: "grid", gap: 10 }}>
      <PanelBar><TeamChoice />{embedded && <label>{messages.text("touchline.profileDetails")} <select aria-label={messages.text("touchline.profileDetails")} value={display} onChange={event => {
        const tab = event.target.value === "position" ? "lineup-position" : null;
        update(current => ({ ...current, tab }), "replace");
      }}>
        <option value="number">{messages.text("details.number")}</option><option value="position">{messages.text("details.position")}</option>
        <option disabled>{messages.text("touchline.age")} · {messages.text("details.notAvailable")}</option><option disabled>{messages.text("touchline.rating")} · {messages.text("details.notAvailable")}</option>
      </select></label>}</PanelBar>
      {embedded && <>
        <PitchTeams>{sides.map(side => <div key={side} data-side={side}>
          <Crest name={team(side).name} url={team(side).logoUrl} size={24} />
          <strong>{side === "home" ? home : away}</strong><small>{messages.text(`touchline.${side}`)}</small>
          {lineups[side]?.formation && <b data-formation>{lineups[side]!.formation}</b>}
        </div>)}</PitchTeams>
        {hasPitch ? <TouchlineLineupPitch lineups={lineups} sides={sides} display={display} />
          : any && <Note>{messages.text("touchline.positionsMissing")}</Note>}
      </>}
      <LineupGrid>
        {sides.map((side) => {
          const lineup = lineups[side], rows = lineup ? pitchRows(lineup.starters) : null;
          return <section key={side} data-side={embedded ? side : undefined} aria-label={side === "home" ? home : away}>
            {!embedded && <Strong style={{ display: "flex", alignItems: "center", gap: 6 }}><Crest name={team(side).name} url={team(side).logoUrl} />
              {side === "home" ? home : away}{lineup?.formation ? ` · ${lineup.formation}` : ""}</Strong>}
            {lineup ? <>
              {!embedded && <Note>{messages.text("details.lineupStatus", { status: messages.text("details.confirmed") })}{" "}
                <time dateTime={toUtcIsoString(at(lineup.updatedAt ?? lineup.retrievedAt))}>{messages.reportingInstant(at(lineup.updatedAt ?? lineup.retrievedAt))}</time></Note>}
              {!embedded && rows && <Pitch aria-label={messages.text("details.formationView")} data-side={side}>
                {[...rows].reverse().map((row, index) => <li key={index}>{row.map(playerButton)}</li>)}
              </Pitch>}
              {(!embedded || !hasPitch) && <><Strong>{messages.text("details.starters")}</Strong>
              <RowList>{lineup.starters.map((player) => <li key={player.id}><PlayerRow type="button" data-item-key={playerKey(side, player.id)}
                onClick={() => update((current) => ({ ...current, item: playerKey(side, player.id) }))}>
                <span data-number>{player.number ?? "–"}</span><span data-name>{playerName(messages, player)}</span><span>{player.position ?? ""}</span><span />
              </PlayerRow></li>)}</RowList></>}
              <Strong>{messages.text("details.substitutes")}</Strong>
              {lineup.substitutes.length ? <RowList>{lineup.substitutes.map((player) => <li key={player.id}><PlayerRow type="button" data-item-key={playerKey(side, player.id)}
                onClick={() => update((current) => ({ ...current, item: playerKey(side, player.id) }))}>
                <span data-number>{player.number ?? "–"}</span><span data-name>{playerName(messages, player)}</span><span>{player.position ?? ""}</span><span />
              </PlayerRow></li>)}</RowList> : <Note>{messages.text("details.noSubstitutes")}</Note>}
              {!embedded && <Note>{messages.text("details.managerMissing")}</Note>}
            </> : <Note>{messages.text("details.lineupNotPublished")}</Note>}
          </section>;
        })}
      </LineupGrid>
      {embedded && <TeamSheetDetails><summary>{messages.text("touchline.teamSheetDetails")}</summary><div>
        {sides.map(side => { const lineup = lineups[side]; return lineup && <Note key={side}>{side === "home" ? home : away}{" · "}
          {messages.text("details.lineupStatus", { status: messages.text("details.confirmed") })}{" · "}
          <time dateTime={toUtcIsoString(at(lineup.updatedAt ?? lineup.retrievedAt))}>{messages.reportingInstant(at(lineup.updatedAt ?? lineup.retrievedAt))}</time></Note>; })}
        <Note>{messages.text("touchline.playerDetailsMissing")}</Note><Note>{messages.text("details.managerMissing")}</Note>
      </div></TeamSheetDetails>}
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
      <span data-name><b>{playerName(messages, player)}</b><small>{[player.team === "home" ? home : away, player.position, player.number !== null ? `#${player.number}` : null].filter(Boolean).join(" · ")}</small></span>
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

export const InjuriesSection = memo(function InjuriesSection() {
  const embedded = useEmbeddedSection();
  const { preview, messages, home, away, view, update } = useDetails();
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
    return <li key={`${key}-${injury.type ?? ""}`}><InjuryRow type="button" data-item-key={key} onClick={() => update((current) => openItem(current, "injuries", key))}>
      <InjuryIcon />
      <span data-name><b>{playerName(messages, { name: injury.playerName })}</b>
        <small>{[injury.team === "home" ? home : away, injury.type, injury.reason].filter(Boolean).join(" · ")}</small></span>
      <Pill $accent={statusAccent[injury.status]}>{messages.text(`details.injury.${injury.status}`)}</Pill>
    </InjuryRow></li>;
  };
  return <SectionCard section="injuries" icon={<InjuryIcon />} title={messages.text("details.section.injuries")}
    meta={total ? messages.plural("details.absenceCount", total) : preview ? messages.text("details.summary.noAbsences") : null}
    itemLabel={lookup.key ? playerName(messages, lookup.player ?? (lookup.injury ? { name: lookup.injury.playerName } : null)) : null}>
    <SectionState loading={lookup.loading} error={lookup.error} onRetry={lookup.retry} />
    {lookup.key ? <PlayerPanel player={lookup.player} injury={lookup.injury} lineup={lookup.lineup} /> : <div ref={list} style={{ display: "grid", gap: 10 }}>
      <PanelBar>
        {!embedded && <TeamChoice />}
        <ChoiceGroup label={messages.text("details.status")} value={status ?? "all"} onChange={(value: string) => update((current) => ({ ...current, tab: value === "all" ? null : value, page: 1 }), "replace")}
          options={[{ value: "all", label: messages.text("details.allStatuses") },
            ...(["out", "doubtful", "unknown"] as const).map((value) => ({ value, label: messages.text(`details.injury.${value}`) }))]} />
      </PanelBar>
      {paged.items.length ? <RowList>{paged.items.map(row)}</RowList> : <Note>{messages.text(lookup.allInjuries.length ? "details.noFilteredInjuries" : "details.injuriesNone")}</Note>}
      <Pager page={paged.page} pages={paged.pages} onPage={(page) => update((current) => ({ ...current, page }), "replace")} />
      <Note>{messages.text("details.injuryBasis")}</Note>
    </div>}
  </SectionCard>;
});
