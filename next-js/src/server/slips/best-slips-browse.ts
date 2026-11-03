import { defaultBestSlipOddsBand } from "../../domain/best-slip-odds-bands.ts";
import "server-only";

import type { BestSlipsResult } from "../../domain/best-slips.ts";
import { bestSlipsQueryRules, parseBestSlipsQuery, resolveBestSlipsDates, serializeBestSlipsQuery, type BestSlipsQuery } from "../../domain/best-slips-query.ts";
import { addReportingDays, getReportingDate, utcInstantFromEpochMilliseconds, type ReportingDate } from "../../domain/calendar.ts";
import { isDevelopmentDemo } from "../../domain/development-demo.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import { getDatabase } from "../database/client.ts";
import type { ViewerAccess } from "../members/viewer-access.ts";
import { yesterday } from "../../domain/browse-period.ts";
import { gateBestSlips } from "./best-slips.ts";
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

export function createBestSlipsBrowseService({ read = readPublishedBestSlips, providerOdds = publicPolicy.features.providerOdds, now = Date.now }: {
  read?: typeof readPublishedBestSlips; providerOdds?: boolean; now?: () => number;
} = {}) {
  return async (access: ViewerAccess, input: BestSlipsQuery, _locale = "en"): Promise<BestSlipsResult> => {
    const asOf = now(), day = getReportingDate(utcInstantFromEpochMilliseconds(asOf));
    const query = parseBestSlipsQuery(serializeBestSlipsQuery(input), day), dates = resolveBestSlipsDates(query, day);
    const empty = { day, entitled: access.tier === "full", slips: [], searchLimited: false, partialCoverage: false, statistics: null,
      browse: { query, total: query.period === "all" ? null : 0, pageSize: bestSlipsQueryRules.pageSize,
        hasMore: false, nextCursor: null, ...dates } } as const;
    if (!providerOdds) return { ...empty, state: "odds-unavailable" };
    try {
      const date = yesterday(day);
      const [result, yesterdaySummary] = await Promise.all([
        read(query, day, _locale, false),
        query.summary === "yesterday" ? read({ period: "yesterday", status: "all", oddsBand: query.oddsBand ?? defaultBestSlipOddsBand, page: 1 }, day, _locale, false).catch(() => null) : null,
      ]);
      const summary = query.summary === "yesterday" ? yesterdaySummary : result;
      return gateBestSlips({ ...result, summary: { asOf, from: query.summary ? date : dates.from,
        to: query.summary ? date : dates.to, statistics: summary?.statistics ?? null } }, access);
    }
    catch { return { ...empty, state: "data-unavailable" }; }
  };
}

export const readBestSlipsBrowse = createBestSlipsBrowseService();
