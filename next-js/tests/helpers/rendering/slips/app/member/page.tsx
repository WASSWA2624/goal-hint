import { createSlipsRoute } from "@/app/_components/slips-route";
import { createSlipBuildService } from "@/server/slips/slip-service";
import { now, syntheticPricePage } from "../stored";

/** Signed-in generation uses the real route and stored service, with no saved-slip dependencies. */
const route = createSlipsRoute({
  resolveAccess: async () => ({ tier: "full", signedIn: true, mode: "off" }),
  instant: async () => now,
  completionInstant: () => now,
  read: async (criteria, clock, locale) => createSlipBuildService({
    providerOdds: true, ...(clock ? { clock } : {}), consume: async () => {},
    read: async (parameters, _context, requestClock) => syntheticPricePage(parameters, requestClock.now()),
  }).query(criteria, locale),
});

export default async function Page({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return route.Page({ params: Promise.resolve({ locale: "en" }), searchParams });
}
