import { notFound } from "next/navigation";
import { SlipTable } from "@/components/slips/slip-table";
import { HeaderBrand } from "@/components/ui/brand";
import { Container, PageMain, Stack } from "@/components/ui/layout";
import { fixtureShared, fixtureSlip, fixtureSource, scenarios, type Scenario } from "./data";

export const metadata = { title: "Slip sharing acceptance | Goal Hint", robots: { index: false, follow: false } };

export default async function FixturePage({ params }: { params: Promise<{ scenario?: string }> }) {
  const value = (await params).scenario ?? "builder";
  if (!scenarios.includes(value as Scenario)) notFound();
  const scenario = value as Scenario;
  return <PageMain><Container $wide><Stack $gap="md">
    <header><HeaderBrand alt="Goal Hint" /></header>
    <nav aria-label="Sharing acceptance scenarios">{scenarios.map(item => <a key={item} href={`/${item}`} style={{ marginInlineEnd: 14 }}>{item}</a>)}</nav>
    <h1>{scenario === "best" ? "Best Slips" : scenario === "shared" ? "Shared slip" : "Slip Builder"}</h1>
    <section data-sharing-scenario={scenario}>
      <SlipTable slip={fixtureSlip(scenario)} index={0} locale="en" initiallyOpen
        {...(scenario === "shared" ? { sharedSlip: fixtureShared(scenario) } : { shareSource: fixtureSource(scenario) })} />
    </section>
  </Stack></Container></PageMain>;
}
