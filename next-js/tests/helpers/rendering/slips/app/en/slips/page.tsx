import { fullAccess } from '@/../tests/helpers/full-access';
import { headers } from "next/headers";
import { createSlipsRoute } from "@/app/_components/slips-route";
import { now, syntheticBuild } from "../../stored";

/** Exercise the real native GET route with an explicit synthetic reader, never production odds. */
const options = { resolveAccess: fullAccess, instant: async () => now, completionInstant: () => now,
  read: async (criteria: Parameters<typeof syntheticBuild>[0]) => syntheticBuild(criteria) };
const route = createSlipsRoute(options);
const params = () => Promise.resolve({ locale: "en" });
export const generateMetadata = () => route.generateMetadata({ params: params(), searchParams: Promise.resolve({}) });
export default async function Page({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const scenario = (await headers()).get("x-builder-fixture-access");
  const delayed = scenario === "slow" || scenario === "timeout" ? createSlipsRoute({ ...options,
    viewerDeadlineMs: scenario === "timeout" ? 1500 : 8000,
    resolveAccess: async () => {
      await new Promise((resolve) => setTimeout(resolve, scenario === "timeout" ? 3500 : 1800));
      return fullAccess();
    },
  }) : route;
  return delayed.Page({ params: params(), searchParams });
}
