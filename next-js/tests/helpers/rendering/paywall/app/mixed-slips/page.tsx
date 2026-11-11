import { createBestSlipsRoute } from "@/app/_components/best-slips-route";
import { policy, resolveAccess } from "../stored";
import { readMixedBestSnapshot } from "../best";
export const dynamic = "force-dynamic";
const route = createBestSlipsRoute({ read: readMixedBestSnapshot, access: resolveAccess, policy });
export default function Page() { return route.Page({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({}) }); }
