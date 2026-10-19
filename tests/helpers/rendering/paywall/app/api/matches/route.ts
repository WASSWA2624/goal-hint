import { createMatchFeedHandler } from "@/server/matches/feed-http";
import { at, readFeed, requestAccess } from "../../stored";
export const GET = createMatchFeedHandler(readFeed, { now: () => at }, requestAccess);
