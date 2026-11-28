import { after } from "next/server";
import { createFeedRoute } from "@/app/_components/feed-route";
import { createGatedFeedSummary } from "@/server/matches/feed-summary-read";
import { readPublicMatchFeedSummary } from "@/server/matches/public-feed";
import { isBrowserDocumentRequest } from "@/server/seo/read-status";

const readSummary = createGatedFeedSummary((parameters, context, clock) => readPublicMatchFeedSummary(parameters, context, clock, after));
const route = createFeedRoute({ browserDocument: isBrowserDocumentRequest, earlyBrowserSummary: true, readSummary });
export const generateMetadata = route.generateMetadata;
export default route.Page;
