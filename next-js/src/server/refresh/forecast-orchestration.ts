import "server-only";

import { z } from "zod";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { jobHash } from "../jobs/job-input.ts";

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

/** Lineup membership, role and formation matter. Provider labels, images and observation times do not. */
export function forecastLineupHash(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const teams = new Map<number, unknown>();
  for (const row of value) {
    const lineup = record(row), team = positiveId(record(lineup?.team)?.id);
    if (team === null || teams.has(team)) return null;
    const players = (rows: unknown) => !Array.isArray(rows) ? null : rows.flatMap(item => {
      const player = record(record(item)?.player), id = positiveId(player?.id);
      if (id === null) return [];
      return [{ id, position: text(player?.pos), grid: text(player?.grid) }];
    }).sort((left, right) => left.id - right.id);
    const formation = text(lineup?.formation), coach = positiveId(record(lineup?.coach)?.id);
    const starters = players(lineup?.startXI), substitutes = players(lineup?.substitutes);
    teams.set(team, formation || coach || starters?.length || substitutes?.length ? { formation, coach, starters, substitutes } : null);
  }
  const material = [...teams].filter(([, lineup]) => lineup !== null).sort(([left], [right]) => left - right);
  return material.length === 0 ? null : evidenceFingerprint(material);
}
