import { cookies } from "next/headers";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { hashFeedContinuation, supportsFeedContinuation } from "@/domain/feed-continuation";
import { parseFeedQuery } from "@/domain/feed-query";
import { supportsFeedWindow } from "@/domain/feed-pagination";
import { gateFeedResponse } from "@/domain/paywall";
import { feedFixture, fixturePrefixIds, guestHistoryFixture, guestHistoryShiftFixture } from "../../feed-fixture";
export async function GET(request: Request) {
  const parameters = new URL(request.url).searchParams; parameters.delete("leagues");
  const through = parameters.get("through"); parameters.delete("through");
  const prefix = parameters.get("prefix"); parameters.delete("prefix");
  const rebase = parameters.get("rebase") === "1"; parameters.delete("rebase");
  const at = utcInstantFromEpochMilliseconds(Date.now()), today = getReportingDate(at);
  const query = parseFeedQuery(parameters, { today });
  const jar = await cookies(), guest = jar.has(guestHistoryFixture), shifted = jar.has(guestHistoryShiftFixture);
  const access = { tier: guest ? "free" : "full", signedIn: false, mode: "off" } as const;
  const readPage = (page: number) => gateFeedResponse(feedFixture({ ...query, page }, at, guest, shifted), access);
  const readWindow = (firstPage: number, lastPage: number) => {
    const pages = [readPage(firstPage)];
    for (let page = firstPage + 1; page <= lastPage && pages.at(-1)?.nextPage === page; page++) pages.push(readPage(page));
    return pages;
  };
  const headers = { "Cache-Control": "no-store" };
  if (prefix !== null) {
    const [start, claimed] = prefix.split(":"), firstPage = Number(start);
    if (!supportsFeedContinuation(firstPage, query.page, query.pageSize)) return Response.json({ error: "invalid-query" }, { status: 400, headers });
    const hash = await hashFeedContinuation(firstPage, fixturePrefixIds(query, at, firstPage, guest, shifted));
    if (hash === claimed) return Response.json({ page: readPage(query.page), prefix: hash }, { headers });
    if (rebase && supportsFeedWindow(firstPage, query.page, query.pageSize)) {
      return Response.json({ pages: readWindow(firstPage, query.page), prefix: claimed }, { headers });
    }
    return Response.json({ error: "changed" }, { status: 409, headers });
  }
  if (through === null) return Response.json(readPage(query.page), { headers });
  const last = Number(through);
  if (!supportsFeedWindow(query.page, last, query.pageSize)) return Response.json({ error: "invalid-query" }, { status: 400, headers });
  return Response.json({ pages: readWindow(query.page, last) }, { headers });
}
