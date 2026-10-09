import { createMatchFeedHandler } from "../../../server/matches/feed-http.ts";
import { readPublicMatchFeed } from "../../../server/matches/public-feed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createMatchFeedHandler(readPublicMatchFeed);
