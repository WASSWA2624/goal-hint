import { createFeedRoute } from "@/app/_components/feed-route";
import { isBrowserDocumentRequest } from "@/server/seo/read-status";

const route = createFeedRoute({ browserDocument: isBrowserDocumentRequest });
export const generateMetadata = route.generateMetadata;
export default route.Page;
