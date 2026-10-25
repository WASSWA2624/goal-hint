import "server-only";

import { notFound } from "next/navigation";
import { getReportingDate, type UtcInstant } from "@/domain/calendar";
import { performanceHref } from "@/domain/navigation";
import { createMessages } from "@/i18n/messages";
import { PerformanceDashboard } from "@/components/performance/performance-dashboard";
import { MatchFeedError } from "@/server/matches/feed-error";
import { parsePerformancePageQuery, performancePageSize } from "@/server/performance/performance-page";
import { readPublicPerformance } from "@/server/performance/public-performance";
import { readPublishedSlipHistory } from "@/server/slips/published-slips";
import { pageMetadata } from "@/server/seo/metadata";
import { getShellInstant, PublicShell } from "./public-shell";

type Props = Readonly<{ params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }>;
export function createPerformanceRoute({ read = readPublicPerformance, history = readPublishedSlipHistory, instant = getShellInstant } = {}) {
  return {
    async generateMetadata({ params }: Props) {
      const { locale } = await params, m = createMessages(locale);
      return pageMetadata({ title: m.text("performance.metadataTitle"), description: m.text("performance.description"), path: performanceHref(locale) });
    },
    async Page({ params, searchParams }: Props) {
      const { locale } = await params, at: UtcInstant = await instant();
      let parsed;
      try { parsed = parsePerformancePageQuery(await searchParams, getReportingDate(at)); }
      catch (error) { if (error instanceof MatchFeedError && error.code === "invalid-query") notFound(); throw error; }
      const { query, parameters, page } = parsed;
      const [predictions, publications] = await Promise.allSettled([
        read(parameters, { now: () => at }), history({ from: query.range.startDate, to: query.range.endDate, page, pageSize: performancePageSize }),
      ]);
      return <PublicShell locale={locale} today={getReportingDate(at)} current="performance" app compact>
        <PerformanceDashboard key={parameters.toString()} locale={locale} filters={{ from: query.range.startDate, to: query.range.endDate,
          market: query.market, source: query.source, model: query.model, version: query.version, leaguePage: query.leaguePage }}
          report={predictions.status === "fulfilled" ? predictions.value : null}
          history={publications.status === "fulfilled" ? publications.value : null} />
      </PublicShell>;
    },
  };
}
