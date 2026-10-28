import "server-only";

import { addReportingDays, type ReportingDateRange } from "../../domain/calendar.ts";
import { isDevelopmentDemo } from "../../domain/development-demo.ts";
import type { DatabaseRuntime } from "../database/client.ts";

/** Enrich the exact read window before opening the ordinary production read snapshot. */
export async function prepareDemoRange(database: DatabaseRuntime,
  range: Pick<ReportingDateRange, "startDate" | "dayCount">, nowMs: number): Promise<void> {
  if (!isDevelopmentDemo()) return;
  const { ensureDemoDates } = await import("./seed.ts");
  await ensureDemoDates(database, Array.from({ length: range.dayCount }, (_, index) => addReportingDays(range.startDate, index)), nowMs);
}

/** Canonical fixture rows for the entire schedule already exist after launcher setup. */
export async function prepareDemoFixture(database: DatabaseRuntime, id: string, nowMs: number): Promise<void> {
  if (!isDevelopmentDemo()) return;
  const { ensureDemoFixture } = await import("./seed.ts");
  await ensureDemoFixture(database, id, nowMs);
}
