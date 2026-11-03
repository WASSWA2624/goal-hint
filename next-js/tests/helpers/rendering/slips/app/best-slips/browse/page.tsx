import { PublicShell } from "@/app/_components/public-shell";
import { BestSlips } from "@/components/slips/best-slips";
import { parseBestSlipsQuery } from "@/domain/best-slips-query";
import { fixtureBrowseBestSlips } from "../../best-slips-filter-data";
import { today } from "../../stored";

/** Multi-day synthetic publications for the public filter and pagination workflow. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = parseBestSlipsQuery(await searchParams, today);
  const result = await fixtureBrowseBestSlips({ tier: "full", signedIn: true, mode: "off" }, query);
  return <PublicShell locale="en" today={today} current="best-slips" app compact>
    <BestSlips locale="en" result={result} signedIn />
  </PublicShell>;
}
