import { notFound } from "next/navigation";
import { SlipList } from "@/components/slips/slip-styles";
import { SlipCard, SlipCardSummary } from "@/components/slips/slip-card";
import { HeaderBrand } from "@/components/ui/brand";
import { Container, PageMain, Stack } from "@/components/ui/layout";
import { createdAt, today, fixtureShared, fixtureSlip, fixtureSource, scenarios, type Scenario } from "./data";

export const metadata = { title: "Slip sharing acceptance | Goal Hint", robots: { index: false, follow: false } };

export default async function FixturePage({ params }: { params: Promise<{ scenario?: string }> }) {
  const value = (await params).scenario ?? "builder";
  if (!scenarios.includes(value as Scenario)) notFound();
  const scenario = value as Scenario;
  const multi = scenario === "builder" || scenario === "best";
  const statuses = multi ? ["pending", "in-progress", "not-started", "won", "lost", "void", "cancelled"] as const : ["pending"] as const;
  return <PageMain><Container $wide><Stack $gap="md">
    <header><HeaderBrand alt="Goal Hint" /></header>
    <nav aria-label="Sharing acceptance scenarios">{scenarios.map(item => <a key={item} href={`/${item}`} style={{ marginInlineEnd: 14 }}>{item}</a>)}</nav>
    <h1>{scenario === "best" ? "Best Slips" : scenario === "shared" ? "Shared slip" : "Slip Builder"}</h1>
    <section data-sharing-scenario={scenario}>
      <SlipList $phoneGap={scenario === "best" ? 9 : 13.5} data-slip-list>
        {statuses.map((status, index) => <SlipCard key={status} slip={fixtureSlip(scenario)} index={index} locale="en" initiallyOpen={scenario === "shared"}
          status={status} outcome={status === "won" || status === "lost" || status === "void" ? status : status === "cancelled" ? "void" : "pending"}
          {...(scenario === "best" ? { publicationDay: today } : { publishedAt: Date.parse(createdAt) })}
          {...(scenario === "shared" ? { sharedSlip: fixtureShared(scenario) } : { shareSource: fixtureSource(scenario) })} />)}
        {multi && <SlipCardSummary locale="en" index={7} totalOdds="4.10" averageProbability={0.758} selectionCount={3} collapsible={false}>{null}</SlipCardSummary>}
      </SlipList>
    </section>
  </Stack></Container></PageMain>;
}
