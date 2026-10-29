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
import { createMessages } from "@/i18n/messages";
import { autoInitialStates, autoSlip, desktopSlip, matchStates, savedResults, stateSlip } from "./data";
import { autoControl } from "./auto-state";

export const metadata = { title: "Desktop slip acceptance | Goal Hint", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function FixturePage({ params }: { params: Promise<{ scenario: string }> }) {
  const { scenario } = await params;
  const locked = scenario === "locked" || scenario === "locked-member";
  const best = scenario === "best-locked" || scenario === "best-locked-member" || scenario === "best-full" || scenario === "best-auto";
  const builder = scenario === "builder" || scenario === "builder-auto";
  const automatic = scenario === "best-auto" || scenario === "builder-auto";
  const revoked = automatic && autoControl().mode === "forbidden";
  const scenarios = ["desktop", "saved", "states", "locked", "locked-member", "responsive", "best-locked", "best-locked-member", "best-full", "builder", "best-auto", "builder-auto"];
  if (!scenarios.includes(scenario)) notFound();
  const publicResult: BestSlipsResult = { day: parseReportingDate("2026-10-28"), state: "generated",
    slips: [{ rank: 1, totalOdds: "21.95", averageProbability: 0.7237666666666667, estimatedProbability: 0.45, matchCount: 3 }],
    searchLimited: false, partialCoverage: false };
  const shownSlip = automatic ? autoSlip : stateSlip, shownStates = automatic ? autoInitialStates : matchStates;
  const fullResult: BestSlipsResult = { ...publicResult, slips: [0, 1].map((index) => ({
    rank: index + 1, totalOdds: shownSlip.totalOdds, averageProbability: shownSlip.averageProbability,
    estimatedProbability: 0.45, matchCount: shownSlip.selections.length, matchStates: shownStates,
    slip: { ...shownSlip, id: `desktop-best-${index}`, estimatedProbability: 0.45 },
  })) };
  const today = parseReportingDate("2026-10-28");
  return <PageMain><Container $wide><Stack $gap="sm">
    {!best && !builder && <h1>Desktop slip acceptance</h1>}
    <nav aria-label="Acceptance cases">
      {scenarios.map((value) => <a key={value} href={`/${value}`}>{value}{" "}</a>)}
    </nav>
    <section data-desktop-acceptance={scenario}>
      {best ? <BestSlips result={!revoked && (scenario === "best-full" || scenario === "best-auto") ? fullResult : publicResult} locale="en" signedIn={scenario === "best-locked-member" || scenario === "best-auto"} /> : builder ? <SlipBuilder locale="en" today={today} subscriberOnly={revoked} signedIn={automatic}
        criteria={{ ...defaultSlipCriteria(today), slips: 2 }} result={revoked ? null : { state: "generated", asOf: Date.parse("2026-10-28T17:00:00Z"), examined: shownSlip.selections.length,
          searchLimited: false, partialCoverage: false, retryAfterSeconds: null, matchStates: shownStates,
          data: { slips: [0, 1].map((index) => ({ ...shownSlip, id: `desktop-builder-${index}` })), qualifyingMatches: shownSlip.selections.length,
            excludedMissingForecast: 0, excludedMissingOdds: 0, searchLimited: false } }} /> : locked ? <DesktopSlipDisclosure index={0} locale="en" totalOdds="21.95" averageProbability={0.7237666666666667} selectionCount={3}>
        <ButtonLink prefetch={false} href={scenario === "locked-member" ? "/en/subscribe" : "/en/account?view=login"}>
          {createMessages("en").text(scenario === "locked-member" ? "account.subscribe" : "auth.signInToAccess")}
        </ButtonLink>
      </DesktopSlipDisclosure> : scenario === "states" ? <DesktopSlip slip={stateSlip} matchStates={matchStates} index={0} locale="en" />
        : scenario === "responsive" ? <SlipTable slip={desktopSlip} index={0} locale="en" />
        : <DesktopSlip slip={desktopSlip} index={0} locale="en" {...(scenario === "saved" ? { results: savedResults } : {})} />}
    </section>
  </Stack></Container></PageMain>;
}
