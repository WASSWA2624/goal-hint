import { headers } from "next/headers";
import { createSlipsRoute } from "@/app/_components/slips-route";
import { readBestSnapshot } from "../../best";
import { accessFor, instant, resolveAccess } from "../../stored";

export const dynamic = "force-dynamic";

export default async function Page(props: Parameters<ReturnType<typeof createSlipsRoute>["Page"]>[0]) {
  const toggleDuringBuild = (await headers()).get("x-test-viewer") === "toggle-during-build";
  let paidAccessOn = false;
  const resolve = () => toggleDuringBuild ? Promise.resolve(accessFor(paidAccessOn ? "anonymous" : "off")) : resolveAccess();
  const route = createSlipsRoute({ instant, resolveAccess: resolve, read: async () => {
    if ((await resolve()).tier !== "full") throw new Error("A restricted slip request must not read.");
    const snapshot = await readBestSnapshot();
    const slip = snapshot.slips[0]!.slip!;
    if (toggleDuringBuild) paidAccessOn = true;
    return { state: "generated", data: { slips: [slip], qualifyingMatches: slip.selections.length, excludedMissingOdds: 0,
      excludedMissingForecast: 0, searchLimited: false }, asOf: await instant(), examined: slip.selections.length,
      searchLimited: false, partialCoverage: false, retryAfterSeconds: null };
  } });
  return route.Page(props);
}
