import { notFound } from "next/navigation";
import { DesktopSlip, DesktopSlipDisclosure } from "@/components/slips/desktop-slip/desktop-slip";
import { BestSlips } from "@/components/slips/best-slips";
import { SlipTable } from "@/components/slips/slip-table";
import { SlipBuilder } from "@/components/slips/slip-builder";
import { parseReportingDate } from "@/domain/calendar";
import type { BestSlipsResult } from "@/domain/best-slips";
import { defaultSlipCriteria } from "@/domain/slip-builder";
import { ButtonLink } from "@/components/ui/controls";
import { Container, PageMain, Stack } from "@/components/ui/layout";
import { desktopSlip, matchStates, savedResults, stateSlip } from "./data";

export const metadata = { title: "Desktop slip acceptance | Goal Hint", robots: { index: false, follow: false } };

export default async function FixturePage({ params }: { params: Promise<{ scenario: string }> }) {
  const { scenario } = await params;
  const locked = scenario === "locked" || scenario === "locked-member";
  const best = scenario === "best-locked" || scenario === "best-locked-member" || scenario === "best-full";
  const builder = scenario === "builder";
  const scenarios = ["desktop", "saved", "states", "locked", "locked-member", "responsive", "best-locked", "best-locked-member", "best-full", "builder"];
  if (!scenarios.includes(scenario)) notFound();
  const publicResult: BestSlipsResult = { day: parseReportingDate("2026-10-28"), state: "generated",
    slips: [{ rank: 1, totalOdds: "21.95", averageProbability: 0.7237666666666667, estimatedProbability: 0.45, matchCount: 3 }],
    searchLimited: false, partialCoverage: false };
  const fullResult: BestSlipsResult = { ...publicResult, slips: [0, 1].map((index) => ({
    rank: index + 1, totalOdds: stateSlip.totalOdds, averageProbability: stateSlip.averageProbability,
    estimatedProbability: 0.45, matchCount: stateSlip.selections.length, matchStates,
    slip: { ...stateSlip, id: `desktop-best-${index}`, estimatedProbability: 0.45 },
  })) };
  const today = parseReportingDate("2026-10-28");
  return <PageMain><Container $wide><Stack $gap="sm">
    {!best && !builder && <h1>Desktop slip acceptance</h1>}
    <nav aria-label="Acceptance cases">
      {scenarios.map((value) => <a key={value} href={`/${value}`}>{value}{" "}</a>)}
    </nav>
    <section data-desktop-acceptance={scenario}>
      {best ? <BestSlips result={scenario === "best-full" ? fullResult : publicResult} locale="en" signedIn={scenario === "best-locked-member"} /> : builder ? <SlipBuilder locale="en" today={today}
        criteria={{ ...defaultSlipCriteria(today), slips: 2 }} result={{ state: "generated", asOf: Date.parse("2026-10-28T17:00:00Z"), examined: 5,
          searchLimited: false, partialCoverage: false, retryAfterSeconds: null, matchStates,
          data: { slips: [0, 1].map((index) => ({ ...stateSlip, id: `desktop-builder-${index}` })), qualifyingMatches: 5,
            excludedMissingForecast: 0, excludedMissingOdds: 0, searchLimited: false } }} /> : locked ? <DesktopSlipDisclosure index={0} locale="en" totalOdds="21.95" averageProbability={0.7237666666666667} selectionCount={3}>
        <ButtonLink prefetch={false} href={scenario === "locked-member" ? "/en/subscribe" : "/en/account?view=login"}>
          {scenario === "locked-member" ? "Subscribe" : "Log in to access"}
        </ButtonLink>
      </DesktopSlipDisclosure> : scenario === "states" ? <DesktopSlip slip={stateSlip} matchStates={matchStates} index={0} locale="en" />
        : scenario === "responsive" ? <SlipTable slip={desktopSlip} index={0} locale="en" />
        : <DesktopSlip slip={desktopSlip} index={0} locale="en" {...(scenario === "saved" ? { results: savedResults } : {})} />}
    </section>
  </Stack></Container></PageMain>;
}
