"use client";

import styled from "styled-components";
import { horizontalPitchPositions, playerKey } from "@/domain/match-details";
import type { InsightSections } from "@/domain/match-insights";
import { focusRing, useStableDetails } from "./details-ui";

type Side = "home" | "away";
type Lineups = InsightSections["lineups"];

const Field = styled.div`
  position: relative; isolation: isolate; min-inline-size: 0; block-size: clamp(336px, 29vw, 396px);
  overflow: hidden; border: 1px solid ${({ theme }) => theme.color.border};
  background: repeating-linear-gradient(90deg, ${({ theme }) => theme.color.accent.emerald.soft} 0 10%,
    color-mix(in srgb, ${({ theme }) => theme.color.accent.emerald.solid} 9%, ${({ theme }) => theme.color.accent.emerald.soft}) 10% 20%);
  > svg { position: absolute; inset: 12px; inline-size: calc(100% - 24px); block-size: calc(100% - 24px);
    color: ${({ theme }) => theme.color.accent.emerald.text}; opacity: .3; pointer-events: none; }
  &::before { content: ""; position: absolute; inset-inline-start: 50%; inset-block-start: 50%;
    inline-size: 16%; aspect-ratio: 1; max-inline-size: 110px; transform: translate(-50%, -50%);
    border: 1px solid ${({ theme }) => theme.color.accent.emerald.text}; border-radius: ${({ theme }) => theme.radius.circle}; opacity: .3; }
`;
const Marker = styled.button`
  position: absolute; transform: translate(-50%, -50%); z-index: 1;
  display: grid; justify-items: center; align-content: center; gap: 2px;
  inline-size: 10.5%; max-inline-size: 124px; min-block-size: 52px; padding: 3px 2px;
  border: 0; border-radius: ${({ theme }) => theme.radius.none}; background: transparent;
  color: ${({ theme }) => theme.color.text}; font: inherit; font-size: .75rem; font-weight: 700; line-height: 1.25;
  text-align: center; cursor: pointer;
  &:hover { background: ${({ theme }) => theme.color.surface}; }
  ${focusRing}
  [data-shirt] { position: relative; inline-size: 32px; block-size: 34px; color: ${({ theme }) => theme.color.accent.orange.solid}; }
  &[data-side="away"] [data-shirt] { color: ${({ theme }) => theme.color.accent.blue.solid}; }
  [data-shirt] > svg { inline-size: 32px; block-size: 34px; }
  [data-shirt] > b { position: absolute; inset-block-start: 9px; inset-inline: 0; color: ${({ theme }) => theme.color.onBrand}; font-size: .6875rem; }
  [data-player-name] { max-inline-size: 100%; overflow-wrap: anywhere; text-wrap: balance; }
  [data-position] { color: ${({ theme }) => theme.color.mutedText}; font-size: .625rem; font-weight: 500; }
`;

/** Both sides share one field. No positions are inferred when provider grid coordinates are absent. */
export function TouchlineLineupPitch({ lineups, sides, display }: { lineups: Lineups; sides: readonly Side[]; display: "number" | "position" }) {
  const { messages, home, away, update } = useStableDetails();
  const teams = sides.map(side => {
    const positions = horizontalPitchPositions(lineups[side]?.starters ?? [], side);
    const lines = new Set(positions?.map(position => position.x)).size;
    return { side, positions, width: Math.min(10.5, 35 / Math.max(1, lines - 1) - 1) };
  });
  if (teams.some(team => !team.positions)) return null;
  return <Field data-touchline-pitch role="group" aria-label={messages.text("details.formationView")}>
    <svg viewBox="0 0 1000 420" preserveAspectRatio="none" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M8 8h984v404H8ZM500 8v404M8 100h140v220H8M8 157h50v106H8M992 100H852v220h140M992 157h-50v106h50" />
      <path data-pitch-goal="left" d="M8 175H1v70h7" /><path data-pitch-goal="right" d="M992 175h7v70h-7" />
      <circle cx="500" cy="210" r="2" fill="currentColor" /><circle cx="105" cy="210" r="2" fill="currentColor" /><circle cx="895" cy="210" r="2" fill="currentColor" />
      <path d="M148 166a57 57 0 0 1 0 88M852 166a57 57 0 0 0 0 88" />
    </svg>
    {teams.map(({ side, positions, width }) => <div key={side} role="group" aria-label={side === "home" ? home : away}>
      {positions?.map(({ player, x, y }) => <Marker type="button" key={player.id} data-side={side} data-item-key={playerKey(side, player.id)}
        style={{ left: `${x}%`, top: `${y}%`, width: `${width}%` }} onClick={() => update(current => ({ ...current, item: playerKey(side, player.id) }))}
        aria-label={messages.text("details.playerOpen", { player: player.name ?? messages.text("details.playerUnknown") })}>
        <span data-shirt aria-hidden="true"><svg viewBox="0 0 42 44" fill="currentColor" stroke="white" strokeWidth="1"><path d="m12 3-9 5-2 10 7 3 3-5v26h20V16l3 5 7-3-2-10-9-5c-1 7-17 7-18 0Z" /></svg><b>{player.number ?? "–"}</b></span>
        <span data-player-name>{player.name ?? messages.text("details.playerUnknown")}</span>
        {display === "position" && <span data-position>{player.position ?? "—"}</span>}
      </Marker>)}
    </div>)}
  </Field>;
}
