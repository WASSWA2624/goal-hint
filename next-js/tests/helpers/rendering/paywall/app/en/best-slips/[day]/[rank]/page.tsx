import { createPublicBestSlipRoute } from "@/app/_components/public-best-slip-route";
import { readCompletedBest } from "../../../../best";
import { resolveAccess } from "../../../../stored";
export const dynamic = "force-dynamic";
const page = createPublicBestSlipRoute({ access: resolveAccess, read: async (access) => readCompletedBest(access) });
export default async function Page({params}:{params:Promise<{day:string;rank:string}>}) {
  return page({ params: Promise.resolve({ ...await params, locale: "en" }) });
}
