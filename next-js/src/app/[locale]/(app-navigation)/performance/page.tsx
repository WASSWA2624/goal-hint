import { createPerformanceRoute } from "@/app/_components/performance-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const route = createPerformanceRoute();
export const generateMetadata = route.generateMetadata;
export default route.Page;
