import { notFound } from "next/navigation";
import { BestSlips } from "@/components/slips/best-slips";
import { SlipBuilder } from "@/components/slips/slip-builder";
import { PerformanceDashboard, type PerformanceDashboardProps } from "@/components/performance/performance-dashboard";
import { AnalyticsDashboard } from "@/components/analytics/dashboard/analytics-dashboard";
import { OverviewReport } from "@/components/admin/owner-reports";
import { AdminShell } from "@/components/admin/admin-shell";
import { DeskHead, DeskTitle } from "@/components/admin/desk-styles";
import { PublicShell } from "@/app/_components/public-shell";
import { MatchFeedPage } from "@/app/_components/match-feed-page";
import { InformationShell } from "@/app/_components/information-shell";
import { HelpContent } from "@/app/_components/help-content";
import { PrivacyContent } from "@/app/_components/privacy-content";
import { TermsContent } from "@/app/_components/terms-content";
import { ContactContent } from "@/app/_components/contact-content";
import { createAccountRoute } from "@/app/_components/account-route";
import { parseBestSlipsQuery } from "@/domain/best-slips-query";
import { parseSlipCriteria } from "@/domain/slip-builder";
import { parsePerformancePageQuery } from "@/server/performance/performance-page";
import { findDesktopTheme, isPreviewScreen, type PreviewScreen } from "./catalog";
import { criteria, now, previewBestSlips, previewFeed, previewMemberServices, syntheticBuild, today, viewer } from "./data";
import { DesktopReview } from "./review";

type Parameters = Record<string, string | string[] | undefined>;
const Account = createAccountRoute({ services: previewMemberServices, plans: async () => [] });

async function Screen({ screen, input, performance }: { screen: PreviewScreen; input: Parameters; performance: PerformanceDashboardProps }) {
  if (screen === "best-slips") return <PublicShell locale="en" today={today} current="best-slips" app compact>
    <BestSlips result={await previewBestSlips(viewer, parseBestSlipsQuery(input, today))} locale="en" signedIn />
  </PublicShell>;
  if (screen === "matches") return <MatchFeedPage {...previewFeed(input)} showAccount subscriberOnly={false} />;
  if (screen === "slip-builder") {
    let draft = criteria;
    try { if (input.build === "1") draft = parseSlipCriteria(input, today); } catch { /* Keep the review editable. */ }
    return <PublicShell locale="en" today={today} current="slips" app compact>
      <SlipBuilder locale="en" today={today} criteria={draft} result={syntheticBuild(draft)} signedIn showAccount />
    </PublicShell>;
  }
  if (screen === "results") {
    let filters = performance.filters;
    if (Object.keys(input).length) {
      try {
        const { query } = parsePerformancePageQuery(input, today);
        filters = { from: query.range.startDate, to: query.range.endDate, market: query.market,
          source: query.source, model: query.model, version: query.version, leaguePage: query.leaguePage };
      } catch { /* Malformed review filters retain the original sample range. */ }
    }
    return <PublicShell locale="en" today={today} current="performance" app compact>
      <PerformanceDashboard {...performance} filters={filters} />
    </PublicShell>;
  }
  if (screen === "help") return <InformationShell locale="en" page="help"><HelpContent locale="en" /></InformationShell>;
  if (screen === "privacy") return <InformationShell locale="en" page="privacy"><PrivacyContent locale="en" /></InformationShell>;
  if (screen === "terms") return <InformationShell locale="en" page="terms"><TermsContent locale="en" /></InformationShell>;
  if (screen === "contacts") return <InformationShell locale="en" page="contact"><ContactContent locale="en" contact={null} /></InformationShell>;
  if (screen === "invites" || screen === "dashboard") return <Account locale="en" searchParams={Promise.resolve({ ...input,
    ...(screen === "invites" ? { section: "referrals" } : {}) })} />;
  if (screen === "analytics") return <AdminShell username="Preview administrator" current="analytics" pendingCount={3}>
    <AnalyticsDashboard today={today} />
  </AdminShell>;
  return <AdminShell username="Preview administrator" current="overview" pendingCount={3}>
    <DeskHead><DeskTitle><h1>Overview</h1></DeskTitle></DeskHead>
    <OverviewReport value={{ pending: 3, active: 248, weekRevenue: 385000, monthRevenue: 1420000, trials: 32,
      busy: 0, paymentNumbersChangedAt: "2026-10-12T08:00:00.000Z", creditHeld: 74000, creditOwed: 0 }}
      payments={[{ id: "preview-payment-1", reference: "P-DEMO-1042", network: "mtn", amount: 5000, submittedAt: "2026-10-13T07:30:00.000Z" },
        { id: "preview-payment-2", reference: "P-DEMO-1043", network: "airtel", amount: 15000, submittedAt: "2026-10-13T07:45:00.000Z" }]} now={now} />
  </AdminShell>;
}

export async function ThemePage({ params, searchParams, performance }: {
  params: Promise<{ theme: string; screen?: string[] }>;
  searchParams: Promise<Parameters>;
  performance: PerformanceDashboardProps;
}) {
  const { theme, screen: segments } = await params, screen = segments?.[0] ?? "best-slips";
  if (!findDesktopTheme(theme) || !isPreviewScreen(screen) || (segments?.length ?? 0) > 1) notFound();
  return <DesktopReview key={theme} themeId={theme} screen={screen}>
    <Screen screen={screen} input={await searchParams} performance={performance} />
  </DesktopReview>;
}
