import { fullAccess } from '@/../tests/helpers/full-access';
import { createSlipsRoute } from "@/app/_components/slips-route";
import { createSlipBuildService } from "@/server/slips/slip-service";
import { now, syntheticJointModel, syntheticPricePage } from "../stored";

/** The real route, stored service and whole-slip ranking with an explicitly synthetic, never production, joint model. */
const route = createSlipsRoute({ resolveAccess: fullAccess, instant: async () => now, completionInstant: () => now,
  jointModel: () => ({ model: syntheticJointModel, verifyModel: () => true }),
  read: async (criteria, clock, locale) => createSlipBuildService({ providerOdds: true, ...(clock ? { clock } : {}), consume: async () => {},
    jointModel: () => ({ model: syntheticJointModel, verifyModel: () => true }),
    read: async (parameters, _context, requestClock) => syntheticPricePage(parameters, requestClock.now()),
  }).query(criteria, locale),
});
export default async function Page({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return route.Page({ params: Promise.resolve({ locale: "en" }), searchParams });
}
