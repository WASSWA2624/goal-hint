import { createFeedRoute } from "@/app/_components/feed-route";
import { instant, policy, readFeed, resolveAccess } from "../stored";
export const dynamic = "force-dynamic";
const route = createFeedRoute({ instant, policy, read: readFeed, resolveAccess });
export const generateMetadata = route.generateMetadata;
export default route.Page;
