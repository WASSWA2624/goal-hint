import { cookies } from "next/headers";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { parseFeedQuery } from "@/domain/feed-query";
import { guestHistoryFixture, summaryFixture } from "../../../feed-fixture";

export async function GET(request: Request) {
  const today = getReportingDate(utcInstantFromEpochMilliseconds(Date.now()));
  const query = parseFeedQuery(new URL(request.url).searchParams, { today });
  const guest = (await cookies()).has(guestHistoryFixture), summary = summaryFixture(query, guest);
  const result = guest ? { ...summary, access: { tier: "free", signedIn: false } } : summary;
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
