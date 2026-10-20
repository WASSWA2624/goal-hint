import { notFound } from "next/navigation";
import { PublicShell } from "@/app/_components/public-shell";
import { SlipBuilder } from "@/components/slips/slip-builder";
import { parseSlipCriteria, SlipCriteriaError, type SlipCriteria, type SlipCriteriaErrorCode } from "@/domain/slip-builder";
import type { SlipBuildPageResult } from "@/server/slips/slip-service";
import { cases, criteria, syntheticBuild, today } from "./stored";

export default async function FixturePage({ params, searchParams }: {
  params: Promise<{ scenario?: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { scenario } = await params, input = await searchParams;
  if (scenario) {
    const selected = cases[scenario]; if (!selected) notFound();
    return <PublicShell locale="en" today={today} current="slips" app compact>
      <SlipBuilder locale="en" today={today} {...selected} />
    </PublicShell>;
  }
  let selected: SlipCriteria = criteria, result: SlipBuildPageResult | null = null;
  let error: { code: SlipCriteriaErrorCode; field: keyof SlipCriteria | "query" } | null = null;
  try {
    selected = parseSlipCriteria(input, today);
    if (input.build === "1") result = syntheticBuild(selected);
  } catch (failure) {
    if (!(failure instanceof SlipCriteriaError)) throw failure;
    error = { code: failure.code, field: failure.field };
  }
  return <PublicShell locale="en" today={today} current="slips" app compact>
    <SlipBuilder locale="en" today={today} criteria={selected} result={result} error={error} />
  </PublicShell>;
}
