import { getReportingDate, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { parseFeedQuery } from "@/domain/feed-query";
import { summaryFixture } from "../../../feed-fixture";

export function GET(request: Request) {
  const today = getReportingDate(utcInstantFromEpochMilliseconds(Date.now()));
  const query = parseFeedQuery(new URL(request.url).searchParams, { today });
  return Response.json(summaryFixture(query), { headers: { "Cache-Control": "no-store" } });
}
