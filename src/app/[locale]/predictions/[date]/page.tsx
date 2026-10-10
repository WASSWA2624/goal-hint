import { createFeedRoute } from "@/app/_components/feed-route";

const route = createFeedRoute({ dated: true });
export const generateMetadata = route.generateMetadata;
export default route.Page;
