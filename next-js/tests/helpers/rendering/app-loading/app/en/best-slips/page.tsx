import { cookies } from "next/headers";
import { createBestSlipsRoute } from "@/app/_components/best-slips-route";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { emptySlipBrowsePage } from "@/domain/slip-browse-window";
import { archiveFixture } from "../../archive-fixture";

export const dynamic = "force-dynamic";
export const metadata = { title: "Synthetic Best Slips loading", robots: { index: false } };
const route = createBestSlipsRoute({ access: async () => ({ tier: "free", signedIn: false, mode: "off" }),
  read: async query => {
    await new Promise(resolve => setTimeout(resolve, 1_800));
    const day = getReportingDate(utcInstantFromEpochMilliseconds(Date.now()));
    if ((await cookies()).get("synthetic-best-slips-unavailable")?.value === "1") {
      return emptySlipBrowsePage(day, query, "data-unavailable");
    }
    return archiveFixture(query);
  } });

export default function Page(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return route.Page({ ...props, params: Promise.resolve({ locale: "en" }) });
}
