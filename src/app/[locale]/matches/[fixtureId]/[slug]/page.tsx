import { createMatchDetailRoute } from "@/app/_components/match-detail-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const route = createMatchDetailRoute();
export const generateMetadata = route.generateMetadata;
export default route.Page;
