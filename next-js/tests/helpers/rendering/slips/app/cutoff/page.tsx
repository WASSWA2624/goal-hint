import { fullAccess } from '@/../tests/helpers/full-access';
import { createSlipsRoute } from "@/app/_components/slips-route";
import { calendarRules, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { createSlipBuildService } from "@/server/slips/slip-service";
import { now, records, syntheticPricePage } from "../stored";

/** The real route/service clock integration excludes a pick whose cutoff is crossed during the build. */
const completedAt = utcInstantFromEpochMilliseconds(records[0]!.kickoffAt! - calendarRules.cutoffSecondsBeforeKickoff * 1000 + 1);
const route = createSlipsRoute({ resolveAccess: fullAccess,  instant: async () => now, completionInstant: () => completedAt,
  read: async (criteria, clock, locale) => createSlipBuildService({ providerOdds: true, ...(clock ? { clock } : {}), consume: async () => {},
    read: async (parameters, _context, requestClock) => syntheticPricePage(parameters, requestClock.now()),
  }).query(criteria, locale),
});
export default async function Page({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return route.Page({ params: Promise.resolve({ locale: "en" }), searchParams });
}
