import { getReportingDate, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { parseFeedQuery } from "@/domain/feed-query";
import { feedFixture } from "../../feed-fixture";
export function GET(request: Request) {
  const parameters = new URL(request.url).searchParams; parameters.delete("leagues");
  const today = getReportingDate(utcInstantFromEpochMilliseconds(Date.now()));
  return Response.json({ ...feedFixture(parseFeedQuery(parameters, { today })), access: { tier: "full", signedIn: false } }, { headers: { "Cache-Control": "no-store" } });
}
