import { createBestSlipsRoute } from "@/app/_components/best-slips-route";
import { policy, resolveAccess } from "../stored";
import { readBest } from "../best";
export const dynamic = "force-dynamic";
const route = createBestSlipsRoute({ read: readBest, access: resolveAccess, policy });
export const generateMetadata = route.generateMetadata;
export default route.Page;
