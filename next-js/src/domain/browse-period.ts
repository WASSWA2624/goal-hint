import { addReportingDays, type ReportingDate } from "./calendar.ts";
import type { PerformanceSummaryCounts } from "./performance-summary.ts";

export const browseRules = Object.freeze({ pageSize: 20, defaultDays: 30 });
export type PeriodPerformance = Readonly<{ asOf?: number; from: ReportingDate | null; to: ReportingDate | null; statistics: PerformanceSummaryCounts | null }>;
export const yesterday = (today: ReportingDate) => addReportingDays(today, -1);
