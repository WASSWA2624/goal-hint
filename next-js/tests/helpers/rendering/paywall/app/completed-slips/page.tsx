import { createBestSlipsRoute } from "@/app/_components/best-slips-route";
import { readCompletedBest } from "../best";
import { policy, resolveAccess } from "../stored";

export const dynamic = "force-dynamic";
const route = createBestSlipsRoute({ read: readCompletedBest, access: resolveAccess, policy });

export default function Page() {
  return route.Page({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({}) });
}
