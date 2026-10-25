import type { SavedSlipView } from "./saved-slips.ts";
import type { SlipPerformanceSummary } from "./slip-performance.ts";

export const publishedSlipRules = Object.freeze({ maximumDays: 31, maximumDailySlips: 10, maximumPageSize: 50, pageSize: 10 });
export type PublishedSlipView = SavedSlipView & Readonly<{
  publicationDay: string; publishedAt: string; modelId: string; rank: number; estimatedProbability: number;
}>;
export type PublishedSlipHistoryQuery = Readonly<{ from: string; to: string; page: number; pageSize: number }>;
export type PublishedSlipHistory = Readonly<{
  records: readonly PublishedSlipView[]; page: number; pageSize: number; total: number; asOf: number;
  /** Whole selected publication period, including counts of hidden active slips; never a page-only denominator. */
  statistics: SlipPerformanceSummary | null;
}>;
