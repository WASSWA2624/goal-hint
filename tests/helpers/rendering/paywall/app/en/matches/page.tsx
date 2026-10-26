import { createFeedRoute } from "@/app/_components/feed-route";
import { instant, policy, readFeed, resolveAccess } from "../../stored";
export const dynamic = "force-dynamic";
const route = createFeedRoute({ instant, policy, read: readFeed, resolveAccess,
  readOffer: async () => ({ priceUgx: 1000, durationDays: 1 }) });
export const generateMetadata = route.generateMetadata;
export default route.Page;
