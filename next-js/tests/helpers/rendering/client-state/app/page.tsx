import { connection } from "next/server";
import { parseReportingDate } from "@/domain/calendar";
import { parseFeedQuery } from "@/domain/feed-query";
import { parseFixtureSnapshot } from "@/domain/fixture-snapshot";
import { Harness } from "./harness";
export default async function Page({ searchParams }: { searchParams: Promise<{ seed?: string }> }) {
  await connection();
  const input = await searchParams;
  const seed = /^[a-z]{1,20}$/.test(input.seed ?? "") ? input.seed! : "request";
  const today = parseReportingDate("2026-10-09");
  const query = parseFeedQuery(new URLSearchParams({ q: seed }), { today });
  const snapshot = parseFixtureSnapshot("__CLIENT_FIXTURE__");
  const initial = { today, query, data: { records: [snapshot], page: 1, nextPage: 2 } };
  return <Harness initial={initial} />;
}
