import "server-only";

import { z } from "zod";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { jobHash } from "../jobs/job-input.ts";
import { coordinatedLiveDetailDefaults } from "../live-match/live-match-contract.ts";

export const FORECAST_JOB_COALESCE_MS = 60_000;
export const FORECAST_RECOVERY_INTERVAL_MS = 60 * 60_000;

export const forecastLifecyclePolicy = z.strictObject({ engineVersion: jobHash,
  marketRegistryVersion: z.string().regex(/^[a-z][a-z0-9.-]{0,63}$/u) });
export type ForecastLifecyclePolicy = Readonly<z.infer<typeof forecastLifecyclePolicy>>;

/** This hash names the forecast intent, independently of which run discovers it. */
export function forecastJobIdentity({ fixtureId, cycleId, scheduleHash, evidenceHash, lineupHash, engineVersion, marketRegistryVersion }:
  ForecastLifecyclePolicy & Readonly<{
  fixtureId: string; cycleId: string; scheduleHash: string; evidenceHash: string; lineupHash: string | null;
}>) {
  return evidenceFingerprint({ forecastType: "pre-match", fixtureId, cycleId, scheduleHash, evidenceHash, lineupHash, engineVersion, marketRegistryVersion });
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function positiveId(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}
const text = (value: unknown) => typeof value === "string" && value.trim() !== "" ? value.trim() : null;
export const forecastLineupObservationKey = "goalHintPreMatchLineup";
export type ForecastLineupScope = Readonly<{ kickoffAt: number; homeExternalId: number; awayExternalId: number;
  cycleId: string | null; initialCycleOpenedAt?: number }>;

function lineupPlayers(rows: unknown) {
  if (!Array.isArray(rows)) return null;
  const ids = new Set<number>();
  const players = [];
  for (const item of rows) {
    const player = record(record(item)?.player), id = positiveId(player?.id);
    if (id === null || ids.has(id)) return null;
    ids.add(id);
    players.push({ id, position: text(player?.pos), grid: text(player?.grid) });
  }
  return players.sort((left, right) => left.id - right.id);
}

/** Lineup membership, role and formation matter. Provider labels, images and observation times do not. */
export function forecastLineupHash(value: unknown, { homeExternalId, awayExternalId }: Pick<ForecastLineupScope, "homeExternalId" | "awayExternalId">): string | null {
  if (!Array.isArray(value) || value.length !== 2 || positiveId(homeExternalId) === null || positiveId(awayExternalId) === null ||
    homeExternalId === awayExternalId) return null;
  const teams = new Map<number, unknown>();
  const started = new Set<number>();
  for (const row of value) {
    const lineup = record(row), team = positiveId(record(lineup?.team)?.id);
    if (team === null || team !== homeExternalId && team !== awayExternalId || teams.has(team)) return null;
    const formation = text(lineup?.formation), coach = positiveId(record(lineup?.coach)?.id);
    const starters = lineupPlayers(lineup?.startXI), substitutes = lineupPlayers(lineup?.substitutes);
    if (starters?.length !== 11 || starters.some(({ id }) => started.has(id))) return null;
    starters.forEach(({ id }) => started.add(id));
    teams.set(team, { formation, coach, starters, substitutes });
  }
  return evidenceFingerprint([...teams].sort(([left], [right]) => left - right));
}

export function forecastLineupWindow(kickoffAt: number, retrievedAt: number, selectedAt: number) {
  return Number.isSafeInteger(kickoffAt) && Number.isSafeInteger(retrievedAt) && Number.isSafeInteger(selectedAt) &&
    retrievedAt >= kickoffAt - coordinatedLiveDetailDefaults.lineupLeadMs &&
    retrievedAt < kickoffAt && retrievedAt <= selectedAt && selectedAt < kickoffAt;
}

/** The private observation marker is written only for a complete, occurrence-bound live response. */
export function observedForecastLineup(value: unknown, scope: ForecastLineupScope, selectedAt: number) {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [home, away] = value.map((row) => record(record(row)?.[forecastLineupObservationKey]));
  const retrievedAt = home?.retrievedAt, cycleId = home?.cycleId;
  if (home?.kickoffAt !== scope.kickoffAt || away?.kickoffAt !== scope.kickoffAt || away.retrievedAt !== retrievedAt || away.cycleId !== cycleId ||
    typeof retrievedAt !== "number" || !forecastLineupWindow(scope.kickoffAt, retrievedAt, selectedAt)) return null;
  if (cycleId !== scope.cycleId && !(cycleId === null && scope.initialCycleOpenedAt !== undefined && retrievedAt <= scope.initialCycleOpenedAt)) return null;
  const hash = forecastLineupHash(value, scope);
  return hash ? { hash, retrievedAt } : null;
}
