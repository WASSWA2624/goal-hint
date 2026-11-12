import "server-only";

import { apiFootballEndpoints } from "./api-football-contract.ts";
import type { FootballHistoryPlayerStatisticsTarget } from "./history-player-statistics.ts";

export const playerStatisticsPageSize = apiFootballEndpoints.playerStatistics.pageSize;
export const playerProfilePageSize = apiFootballEndpoints.playerProfiles.pageSize;
export const positiveInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
export const playerStatisticsProviderId = (value: unknown): value is number => positiveInteger(value) && value <= 4_294_967_295;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

export function validPlayerArchivePageSize(page: number, totalPages: number, rowCount: number, pageSize: number): boolean {
  return positiveInteger(page) && positiveInteger(totalPages) && page <= totalPages && Number.isInteger(rowCount) && rowCount >= 0 &&
    rowCount <= pageSize && (page < totalPages ? rowCount === pageSize : rowCount > 0 || page === 1);
}

export const validPlayerStatisticsPageSize = (page: number, totalPages: number, rowCount: number) =>
  validPlayerArchivePageSize(page, totalPages, rowCount, playerStatisticsPageSize);

export function archivedPlayerProfileRowId(row: unknown): number | null {
  return record(row) && record(row.player) && playerStatisticsProviderId(row.player.id) ? row.player.id : null;
}

export function archivedPlayerStatisticsRowId(row: unknown, selector: FootballHistoryPlayerStatisticsTarget): number | null {
  const id = archivedPlayerProfileRowId(row);
  if (id === null || !record(row) || !Array.isArray(row.statistics)) return null;
  return row.statistics.some((statistic) => record(statistic) && record(statistic.team) && playerStatisticsProviderId(statistic.team.id) &&
    record(statistic.league) && statistic.league.id === selector.competitionId && statistic.league.season === selector.season) ? id : null;
}
