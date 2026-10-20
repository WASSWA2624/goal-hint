import { createFeedRoute } from "@/app/_components/feed-route";

const route = createFeedRoute();
export const generateMetadata = route.generateMetadata;
export default route.Page;
