import { createSlipsRoute } from "@/app/_components/slips-route";
import { syntheticBuild } from "@/../tests/helpers/rendering/slips/app/stored";
import { utcInstantFromEpochMilliseconds } from "@/domain/calendar";

const instant = () => utcInstantFromEpochMilliseconds(Date.now());
const route = createSlipsRoute({ resolveAccess: async () => ({ tier: "full", signedIn: true, mode: "test" }),
  instant: async () => instant(), completionInstant: instant, jointModel: () => null, read: async criteria => syntheticBuild(criteria) });
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return route.Page({ params: Promise.resolve({ locale: "en" }), searchParams });
}
