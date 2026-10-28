import { notFound } from "next/navigation";
import { PublicShell } from "@/app/_components/public-shell";
import { BestSlips } from "@/components/slips/best-slips";
import { bestSlipViews, type BestSlip, type BestSlipsResult } from "@/domain/best-slips";
import { criteria, syntheticBuild, today } from "../../stored";

/** Presentation fixtures only: cloned synthetic picks never enter a publication or live service. */
export default async function Page({ params }: { params: Promise<{ scenario: string }> }) {
  const { scenario } = await params;
  if (!["entitled", "locked", "hundred", "limited"].includes(scenario)) notFound();
  const count = scenario === "hundred" ? 100 : 3;
  const source = syntheticBuild(criteria, false, false, true).data!.slips[0]!;
  const slips: BestSlip[] = Array.from({ length: count }, (_, index) => ({
    ...source, id: `synthetic-best-${index + 1}`, estimatedProbability: 0.75 - index / 1000,
    selections: source.selections.map((selection, leg) => ({ ...selection,
      fixtureId: `synthetic-best-${index + 1}-leg-${leg + 1}` })),
  }));
  const result: BestSlipsResult = { day: today, state: "generated",
    slips: bestSlipViews(slips, scenario !== "locked"), searchLimited: scenario === "limited", partialCoverage: false };
  return <PublicShell locale="en" today={today} current="best-slips" app compact>
    <BestSlips locale="en" result={result} signedIn={scenario !== "locked"} />
  </PublicShell>;
}
