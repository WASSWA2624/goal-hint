import { createSlipsRoute } from "@/app/_components/slips-route";
import { readBestSnapshot } from "../../best";
import { at, instant, resolveAccess } from "../../stored";
export const dynamic = "force-dynamic";
const route = createSlipsRoute({ instant, resolveAccess, read: async () => {
  if ((await resolveAccess()).tier === "free") throw Error("A free slip request must not read.");
  const slip = (await readBestSnapshot()).slips[0]!.slip!;
  return { state: "generated", asOf: at, examined: slip.selections.length, searchLimited: false, partialCoverage: false, retryAfterSeconds: null,
    data: { slips: [{ ...slip, id: "SENTINEL-BUILDER-RESULT" }], qualifyingMatches: slip.selections.length,
      excludedMissingOdds: 0, excludedMissingForecast: 0, searchLimited: false } };
} });
export default route.Page;
