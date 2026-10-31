"use client";

import styled from "styled-components";
import { pitchCanvas, pitchCanvasPosition, referencePitch } from "@/domain/football-pitch";
import { horizontalPitchPositions, playerKey } from "@/domain/match-details";
import type { InsightSections } from "@/domain/match-insights";
import { FootballPitch } from "../football-pitch";
import { focusRing, useStableDetails } from "./details-ui";
import { playerPositionLabel } from "./labels";

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
`;
const Marker = styled.button`
  position: absolute; transform: translate(-50%, -18px); z-index: 1;
  display: grid; grid-template-columns: minmax(0, 1fr); justify-items: center; align-content: start; gap: 2px;
  inline-size: 10.5%; max-inline-size: 124px; min-block-size: 52px; padding: 3px 2px;
  border: 0; border-radius: ${({ theme }) => theme.radius.none}; background: transparent;
  color: ${({ theme }) => theme.color.text}; font: inherit; font-size: .75rem; font-weight: 700; line-height: 1.25;
  text-align: center; cursor: pointer;
  &:hover { background: ${({ theme }) => theme.color.surface}; }
  ${focusRing}
  [data-shirt] { position: relative; inline-size: 28px; block-size: 30px; color: ${({ theme }) => theme.color.accent.orange.solid}; }
  &[data-side="away"] [data-shirt] { color: ${({ theme }) => theme.color.accent.blue.solid}; }
  [data-shirt] > svg { inline-size: 28px; block-size: 30px; }
  [data-shirt] > b { position: absolute; inset-block-start: 8px; inset-inline: 0; color: ${({ theme }) => theme.color.onBrand}; font-size: .625rem; }
  [data-player-name] { max-inline-size: 100%; overflow-wrap: anywhere; text-wrap: balance; }
  [data-position] { color: ${({ theme }) => theme.color.mutedText}; font-size: .6875rem; font-weight: 500; overflow-wrap: normal; }
`;

/** Both sides share one field. No positions are inferred when provider grid coordinates are absent. */
export function TouchlineLineupPitch({ lineups, sides, display }: { lineups: Lineups; sides: readonly Side[]; display: "number" | "position" }) {
  const { messages, home, away, update } = useStableDetails();
  const teams = sides.map(side => {
    const positions = horizontalPitchPositions(lineups[side]?.starters ?? [], side, lineups[side]?.formation);
    const lines = new Set(positions?.map(position => position.x)).size;
    return { side, positions, width: Math.min(10.5, 35 / Math.max(1, lines - 1) - 1) };
  });
  if (teams.some(team => !team.positions)) return null;
  return <Field data-touchline-pitch role="group" aria-label={messages.text("details.formationView")}>
    <FootballPitch aria-hidden="true" />
    {teams.map(({ side, positions, width }) => <div key={side} role="group" aria-label={side === "home" ? home : away}>
      {positions?.map(({ player, x, y }) => { const point = pitchCanvasPosition(x, y); return <Marker type="button" key={player.id} data-side={side} data-item-key={playerKey(side, player.id)}
        style={{ left: `${point.x}%`, top: `${point.y}%`, width: `${width * referencePitch.length / pitchCanvas.length}%` }} onClick={() => update(current => ({ ...current, item: playerKey(side, player.id) }))}
        aria-label={messages.text("details.playerOpen", { player: player.name ?? messages.text("details.playerUnknown") })}>
        <span data-shirt aria-hidden="true"><svg viewBox="0 0 42 44" fill="currentColor" stroke="white" strokeWidth="1"><path d="m12 3-9 5-2 10 7 3 3-5v26h20V16l3 5 7-3-2-10-9-5c-1 7-17 7-18 0Z" /></svg><b>{player.number ?? "–"}</b></span>
        <span data-player-name>{player.name ?? messages.text("details.playerUnknown")}</span>
        {display === "position" && <span data-position>{playerPositionLabel(messages, player.position)}</span>}
      </Marker>; })}
    </div>)}
  </Field>;
}
