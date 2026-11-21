import { cookies } from "next/headers";
import { createSlipsRoute } from "@/app/_components/slips-route";
import { syntheticBuild } from "@/../tests/helpers/rendering/slips/app/stored";
import { additionalGoalFixture, now } from "@/../tests/helpers/slip-additional-goal-fixture.mjs";
import { utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { memberCookieName } from "@/server/members/member-sessions";
import { createSlipBuildService } from "@/server/slips/slip-service";
import { services } from "../../fixture";

const instant = () => utcInstantFromEpochMilliseconds(Date.now());
const resolveAccess = async () => {
  const { config, sessions } = await services();
  const token = (await cookies()).get(memberCookieName(config.production))?.value;
  return { tier: "full", signedIn: !!await sessions?.verify(token), mode: "off" } as const;
};

const route = createSlipsRoute({
  resolveAccess,
  instant: async () => instant(), completionInstant: instant, jointModel: () => null, read: async criteria => syntheticBuild(criteria),
});

const { readCohort } = additionalGoalFixture();
const marketRoute = createSlipsRoute({
  resolveAccess, instant: async () => now, completionInstant: () => now, jointModel: () => null,
  read: (criteria, clock, locale) => createSlipBuildService({ readCohort, consume: async () => {}, clock, providerOdds: true }).query(criteria, locale),
});

export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const selectedRoute = query.build === "1" && (query["picks.team-goals"] || query["picks.total-goals"] === "under-3.5") ? marketRoute : route;
  return selectedRoute.Page({ params: Promise.resolve({ locale: "en" }), searchParams });
}
