import { cookies } from "next/headers";
import { createSlipsRoute } from "@/app/_components/slips-route";
import { utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { fixtureBuild, viewer } from "../../data";

const route = createSlipsRoute({ resolveAccess: async () => viewer((await cookies()).toString()),
  instant: async () => utcInstantFromEpochMilliseconds(Date.now()), completionInstant: () => utcInstantFromEpochMilliseconds(Date.now()),
  jointModel: () => null, read: async criteria => fixtureBuild(criteria) });
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return route.Page({ params: Promise.resolve({ locale: "en" }), searchParams });
}
