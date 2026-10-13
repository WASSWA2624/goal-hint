import { createSlipsRoute } from "@/app/_components/slips-route";
import { now, syntheticBuild } from "../../stored";

/** Exercise the real native GET route with an explicit synthetic reader, never production odds. */
const route = createSlipsRoute({ instant: async () => now, completionInstant: () => now, read: async (criteria) => syntheticBuild(criteria) });
const params = () => Promise.resolve({ locale: "en" });
export const generateMetadata = () => route.generateMetadata({ params: params(), searchParams: Promise.resolve({}) });
export default async function Page({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return route.Page({ params: params(), searchParams });
}
