import "server-only";

import { getReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { isDevelopmentDemo } from "../../domain/development-demo.ts";
import type { CacheDescriptor } from "../cache/public-cache.ts";
import { assertDemoDatabase } from "./member.ts";

/** Demo analytics are explicitly dated snapshots. Keep their original source clock
 * while today's live observations advance; all other invalidations still apply. */
export function demoAnalyticsCacheDescriptor<T>(descriptor: CacheDescriptor<T>, asOf: number): CacheDescriptor<T> {
  if (!isDevelopmentDemo()) return descriptor;
  try { assertDemoDatabase(); } catch { return descriptor; }
  const todayTag = `date:${getReportingDate(utcInstantFromEpochMilliseconds(asOf))}`;
  // Full dense reports take several minutes to validate during preparation.
  // Keep enough of the resulting browsing session after that initial work.
  return { ...descriptor, lifetimeMs: 60 * 60_000,
    tags: Object.freeze(descriptor.tags.filter((tag) => tag !== todayTag)) };
}
