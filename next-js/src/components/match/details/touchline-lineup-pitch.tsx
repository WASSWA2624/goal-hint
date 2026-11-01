"use client";

import styled from "styled-components";
import type { CSSProperties } from "react";
import { media } from "@/styles/theme";
import { pitchCanvas, pitchCanvasPosition, referencePitch } from "@/domain/football-pitch";
import { horizontalPitchPositions, playerKey } from "@/domain/match-details";
import type { InsightSections } from "@/domain/match-insights";
import { FootballPitch } from "../football-pitch";
import { focusRing, useStableDetails } from "./details-ui";
import { lineupDetailLabel, lineupDetailValue, type LineupDisplay } from "./lineup-player-detail";

type Side = "home" | "away";
type Lineups = InsightSections["lineups"];

const Field = styled.div`
  position: relative; isolation: isolate; min-inline-size: 0; inline-size: 100%; aspect-ratio: ${pitchCanvas.length} / ${pitchCanvas.width};
  overflow: hidden; border: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.accent.emerald.soft};
  > svg { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; color: ${({ theme }) => theme.color.accent.emerald.text}; pointer-events: none; }
  [data-stripe="0"] { fill: ${({ theme }) => theme.color.accent.emerald.soft}; }
  [data-stripe="1"] { fill: color-mix(in srgb, ${({ theme }) => theme.color.accent.emerald.solid} 9%, ${({ theme }) => theme.color.accent.emerald.soft}); }
  [data-markings] { opacity: .5; }
  ${media.belowDesktop} {
    aspect-ratio: ${pitchCanvas.width} / ${pitchCanvas.length};
    > svg { inset: auto; inset-inline-start: 50%; inset-block-start: 50%;
      inline-size: ${100 * pitchCanvas.length / pitchCanvas.width}%; block-size: ${100 * pitchCanvas.width / pitchCanvas.length}%;
      transform: translate(-50%, -50%) rotate(-90deg); }
  }
`;
const Marker = styled.button`
  position: absolute; left: var(--player-x); top: var(--player-y); transform: translate(-50%, -18px); z-index: 1;
  display: grid; grid-template-columns: minmax(0, 1fr); justify-items: center; align-content: start; gap: 2px;
  inline-size: var(--player-width); max-inline-size: 124px; min-block-size: 52px; padding: 3px 2px;
  border: 0; border-radius: ${({ theme }) => theme.radius.none}; background: transparent;
  color: ${({ theme }) => theme.color.text}; font: inherit; font-size: .75rem; font-weight: 700; line-height: 1.25;
  text-align: center; cursor: pointer;
  &:hover { background: ${({ theme }) => theme.color.surface}; }
  ${focusRing}
  [data-shirt] { position: relative; inline-size: 28px; block-size: 30px; color: ${({ theme }) => theme.color.accent.orange.solid}; }
  &[data-side="away"] [data-shirt] { color: ${({ theme }) => theme.color.accent.blue.solid}; }
  [data-shirt] > svg { inline-size: 28px; block-size: 30px; }
  [data-shirt] > b { position: absolute; inset-block-start: 8px; inset-inline: 0; color: ${({ theme }) => theme.color.onBrand}; font-size: .625rem; }
  [data-phone-position] { display: none; }
  [data-player-name] { max-inline-size: 100%; overflow-wrap: anywhere; text-wrap: balance; }
  [data-phone-name] { display: none; }
  [data-position] { color: ${({ theme }) => theme.color.mutedText}; font-size: .6875rem; font-weight: 500; overflow-wrap: normal; }
  ${media.belowDesktop} {
    left: var(--phone-x); top: var(--phone-y); inline-size: var(--phone-width); min-block-size: 44px;
    transform: translate(-50%, -15px); padding: 2px 1px; gap: 1px; font-size: .6875rem; line-height: 1.1;
    [data-shirt], [data-shirt] > svg { inline-size: 24px; block-size: 26px; }
    [data-shirt] > b { inset-block-start: 7px; }
    [data-shirt] > [data-phone-position] { display: block; font-size: .5rem; }
    &:not([data-profile="number"]) [data-shirt-number] { display: none; }
    [data-player-name] { display: none; }
    [data-phone-name] { display: block; max-inline-size: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    [data-position] { display: none; }
  }
  @media (max-width: 360px) {
    min-block-size: 36px; transform: translate(-50%, -12.5px); gap: 0; font-size: .625rem;
    [data-shirt], [data-shirt] > svg { inline-size: 20px; block-size: 21px; }
    [data-shirt] > b { inset-block-start: 5px; font-size: .5rem; }
  }
`;

const compactName = (name: string) => {
  const parts = name.trim().split(/\s+/u);
  return parts.length > 1 ? `${Array.from(parts[0]!)[0]}. ${parts.at(-1)}` : name;
};

/** Both sides share one field. No positions are inferred when provider grid coordinates are absent. */
export function TouchlineLineupPitch({ lineups, sides, display, selectTeam = false }: { lineups: Lineups; sides: readonly Side[]; display: LineupDisplay; selectTeam?: boolean }) {
  const { messages, home, away, update } = useStableDetails();
  const teams = sides.map(side => {
    const positions = horizontalPitchPositions(lineups[side]?.starters ?? [], side, lineups[side]?.formation);
    const lines = new Set(positions?.map(position => position.x)).size;
    const perLine = new Map<number, number>();
    positions?.forEach(position => perLine.set(position.x, (perLine.get(position.x) ?? 0) + 1));
    return { side, positions, width: Math.min(10.5, 35 / Math.max(1, lines - 1) - 1), phoneWidth: Math.min(22, 85 / Math.max(1, ...perLine.values())) };
  });
  if (teams.some(team => !team.positions)) return null;
  return <Field data-touchline-pitch role="group" aria-label={messages.text("details.formationView")}>
    <FootballPitch aria-hidden="true" />
    {teams.map(({ side, positions, width, phoneWidth }) => <div key={side} role="group" aria-label={side === "home" ? home : away}>
      {positions?.map(({ player, x, y }) => { const point = pitchCanvasPosition(x, y);
        return <Marker type="button" key={player.id} data-side={side} data-profile={display} data-item-key={playerKey(side, player.id)}
        style={{ "--player-x": `${point.x}%`, "--player-y": `${point.y}%`, "--player-width": `${width * referencePitch.length / pitchCanvas.length}%`,
          "--phone-x": `${point.y}%`, "--phone-y": `${100 - point.x}%`, "--phone-width": `${phoneWidth}%` } as CSSProperties}
        onClick={() => update(current => ({ ...current, ...(selectTeam ? { team: side } : {}), item: playerKey(side, player.id) }))}
        title={`${player.name ?? messages.text("details.playerUnknown")} · ${lineupDetailLabel(messages, display)}: ${lineupDetailValue(messages, player, display) ?? messages.text("details.notProvided")}`}
        aria-label={`${messages.text("details.playerOpen", { player: player.name ?? messages.text("details.playerUnknown") })} · ${lineupDetailLabel(messages, display)}: ${lineupDetailValue(messages, player, display) ?? messages.text("details.notProvided")}`}>
        <span data-shirt aria-hidden="true"><svg viewBox="0 0 42 44" fill="currentColor" stroke="white" strokeWidth="1"><path d="m12 3-9 5-2 10 7 3 3-5v26h20V16l3 5 7-3-2-10-9-5c-1 7-17 7-18 0Z" /></svg><b data-shirt-number>{player.number ?? "–"}</b>
          {display !== "number" && <b data-phone-position>{lineupDetailValue(messages, player, display, true) ?? "–"}</b>}
        </span>
        <span data-player-name>{player.name ?? messages.text("details.playerUnknown")}</span>
        <span data-phone-name aria-hidden="true">{player.name ? compactName(player.name) : messages.text("details.playerUnknown")}</span>
        {display !== "number" && <span data-position>{lineupDetailValue(messages, player, display) ?? "–"}</span>}
      </Marker>; })}
    </div>)}
  </Field>;
}
