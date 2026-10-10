import "server-only";

import { getReportingDate } from "@/domain/calendar";
import { loadPerformancePage } from "@/server/performance/performance-page";
import { readPublicPerformance } from "@/server/performance/public-performance";
import { MethodologyPage } from "./methodology-page";
import { getShellInstant } from "./public-shell";

/** The production page and isolated SQL-backed acceptance share this server path. */
export function createMethodologyRoute(read = readPublicPerformance, instant = getShellInstant) {
  return async function Page({ params, searchParams }: {
    params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
  }) {
    const { locale } = await params, at = await instant();
    const result = await loadPerformancePage(await searchParams, { now: () => at }, read);
    return <MethodologyPage result={result} locale={locale} today={getReportingDate(at)} />;
  };
}
