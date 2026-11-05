import type { SlipResultView } from "./slip-snapshot.ts";
import type { SlipPerformanceSummary } from "./slip-performance.ts";
import { bestSlipsRules } from "./best-slips.ts";
import type { BestSlipOddsBand } from "./best-slip-odds-bands.ts";
import type { PredictionResult } from "./performance-summary.ts";

export const publishedSlipRules = Object.freeze({ maximumDays: 31, maximumDailySlips: bestSlipsRules.count, maximumPageSize: 50, pageSize: 10 });
export type PublishedSlipView = SlipResultView & Readonly<{
  publicationDay: string; publishedAt: string; modelId: string; rank: number; estimatedProbability: number;
}>;
export type PublishedSlipHistoryQuery = Readonly<{ from: string; to: string; page: number; pageSize: number; oddsBand?: BestSlipOddsBand; status?: "all" | PredictionResult }>;
export type PublishedSlipHistory = Readonly<{
  records: readonly PublishedSlipView[]; page: number; pageSize: number; total: number; asOf: number;
  /** Whole selected publication period, including counts of hidden active slips; never a page-only denominator. */
  statistics: SlipPerformanceSummary | null;
}>;
