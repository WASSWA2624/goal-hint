import "server-only";

import type { BestSlipsResult } from "../../domain/best-slips.ts";
import { bestSlipsQueryRules, parseBestSlipsQuery, resolveBestSlipsDates, serializeBestSlipsQuery, type BestSlipsQuery } from "../../domain/best-slips-query.ts";
import { addReportingDays, getReportingDate, utcInstantFromEpochMilliseconds, type ReportingDate } from "../../domain/calendar.ts";
import { isDevelopmentDemo } from "../../domain/development-demo.ts";
import { emptySlipBrowsePage } from "../../domain/slip-browse-window.ts";
import { getDatabase } from "../database/client.ts";
import { timedRequestPhase } from "../http/request-timing.ts";
import type { ViewerAccess } from "../members/viewer-access.ts";
import { publicOddsEnabled } from "../odds/public-odds-policy.ts";
import { gateBestSlips } from "./slip-preview.ts";
import { createPublishedSlips } from "./published-slips.ts";

type BestSlipsBrowseReader = (query: BestSlipsQuery, today: ReportingDate, locale: string, completedOnly: boolean) => Promise<BestSlipsResult>;
const readPublishedBestSlips: BestSlipsBrowseReader = async (query, today, _locale, completedOnly) => {
  const database = getDatabase();
  if (isDevelopmentDemo()) {
    const dates = resolveBestSlipsDates(query, today);
    const { ensureDemoSlipDates } = await import("../demo/slips-seed.ts");
    // Demo seeding has its own finite date bounds; future dates never create a publication.
    const from = dates.from ?? addReportingDays(today, 1 - bestSlipsQueryRules.scanDays), to = dates.to && dates.to < today ? dates.to : today;
    const days: string[] = [];
    for (let day = from; day <= to; day = addReportingDays(day, 1)) days.push(day);
    await ensureDemoSlipDates(database, days);
  }
  return createPublishedSlips(database).browse(query, today, completedOnly);
};

function createBestSlipsSnapshotReader({ read = readPublishedBestSlips, providerOdds, now = Date.now }: {
  read?: typeof readPublishedBestSlips; providerOdds?: boolean; now?: () => number;
} = {}) {
  return async (input: BestSlipsQuery, locale = "en"): Promise<BestSlipsResult> => {
    const asOf = now(), day = getReportingDate(utcInstantFromEpochMilliseconds(asOf));
    const query = parseBestSlipsQuery(serializeBestSlipsQuery(input), day), dates = resolveBestSlipsDates(query, day);
    if (!(providerOdds ?? publicOddsEnabled())) return emptySlipBrowsePage(day, query, "odds-unavailable");
    try {
      // The browse reader aggregates the entire selected period before outcome
      // filtering and pagination. Reuse that snapshot for both list and summary.
      const result = await timedRequestPhase("archive", () => read(query, day, locale, false));
      const state = result.state === "generated" && dates.from === day && dates.to === day
        && (result.browse?.bandTotal ?? result.statistics?.total) === 0
        ? "awaiting-publication" : result.state;
      return { ...result, state, summary: { asOf: result.summary?.asOf ?? asOf, ...dates, statistics: result.statistics ?? null } };
    }
    catch { return emptySlipBrowsePage(day, query, "data-unavailable"); }
  };
}

/** Server-only publication snapshot. Check access immediately before returning a viewer projection. */
export const readBestSlipsBrowseSnapshot = createBestSlipsSnapshotReader();

export function createBestSlipsBrowseService(options?: Parameters<typeof createBestSlipsSnapshotReader>[0]) {
  const snapshot = createBestSlipsSnapshotReader(options);
  return async (access: ViewerAccess, input: BestSlipsQuery, locale?: string): Promise<BestSlipsResult> =>
    gateBestSlips(await snapshot(input, locale), access);
}

export const readBestSlipsBrowse = createBestSlipsBrowseService();
