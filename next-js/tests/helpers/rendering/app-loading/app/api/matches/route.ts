import { cookies } from "next/headers";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { hashFeedContinuation, supportsFeedContinuation } from "@/domain/feed-continuation";
import { parseFeedQuery } from "@/domain/feed-query";
import { supportsFeedWindow } from "@/domain/feed-pagination";
import { gateFeedResponse } from "@/domain/paywall";
import { feedFixture, fixturePrefixIds, guestHistoryFixture } from "../../feed-fixture";
export async function GET(request: Request) {
  const parameters = new URL(request.url).searchParams; parameters.delete("leagues");
  const through = parameters.get("through"); parameters.delete("through");
  const prefix = parameters.get("prefix"); parameters.delete("prefix");
  const at = utcInstantFromEpochMilliseconds(Date.now()), today = getReportingDate(at);
  const query = parseFeedQuery(parameters, { today });
  const guest = (await cookies()).has(guestHistoryFixture);
  const access = { tier: guest ? "free" : "full", signedIn: false, mode: "off" } as const;
  const first = gateFeedResponse(feedFixture(query, at, guest), access);
  const headers = { "Cache-Control": "no-store" };
  if (prefix !== null) {
    const [start, claimed] = prefix.split(":"), firstPage = Number(start);
    if (!supportsFeedContinuation(firstPage, query.page, query.pageSize)) return Response.json({ error: "invalid-query" }, { status: 400, headers });
    const hash = await hashFeedContinuation(firstPage, fixturePrefixIds(query, at, firstPage, guest));
    if (hash !== claimed) return Response.json({ error: "changed" }, { status: 409, headers });
    return Response.json({ page: first, prefix: hash }, { headers });
  }
  if (through === null) return Response.json(first, { headers });
  const last = Number(through);
  if (!supportsFeedWindow(query.page, last, query.pageSize)) return Response.json({ error: "invalid-query" }, { status: 400, headers });
  const pages = [first];
  for (let page = query.page + 1; page <= last && pages.at(-1)?.nextPage === page; page++) {
    pages.push(gateFeedResponse(feedFixture({ ...query, page }, at, guest), access));
  }
  return Response.json({ pages }, { headers });
}
