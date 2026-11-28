import { cookies } from "next/headers";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { parseFeedQuery } from "@/domain/feed-query";
import { supportsFeedWindow } from "@/domain/feed-pagination";
import { feedFixture, guestHistoryFixture } from "../../feed-fixture";
export async function GET(request: Request) {
  const parameters = new URL(request.url).searchParams; parameters.delete("leagues");
  const through = parameters.get("through"); parameters.delete("through");
  const at = utcInstantFromEpochMilliseconds(Date.now()), today = getReportingDate(at);
  const query = parseFeedQuery(parameters, { today });
  const access = { tier: (await cookies()).has(guestHistoryFixture) ? "free" : "full", signedIn: false } as const;
  const first = { ...feedFixture(query, at), access };
  const headers = { "Cache-Control": "no-store" };
  if (through === null) return Response.json(first, { headers });
  const last = Number(through);
  if (!supportsFeedWindow(query.page, last, query.pageSize)) return Response.json({ error: "invalid-query" }, { status: 400, headers });
  const pages = [first];
  for (let page = query.page + 1; page <= last && pages.at(-1)?.nextPage === page; page++) {
    pages.push({ ...feedFixture({ ...query, page }, at), access });
  }
  return Response.json({ pages }, { headers });
}
