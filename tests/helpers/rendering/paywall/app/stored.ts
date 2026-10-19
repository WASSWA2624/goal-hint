import { headers } from "next/headers";
import type { StoredMatchFeedResponse } from "@/domain/match-feed";
import type { StoredMatchDetailResponse } from "@/domain/match-detail";
import type { StoredMatchInsights } from "@/domain/match-insights";
import { MatchFeedError } from "@/server/matches/feed-error";
import { parseMatchDetailQuery } from "@/server/matches/detail-query";
import type { ViewerAccess } from "@/server/members/viewer-access";
import { parseFeedQuery, type FeedParameters } from "@/domain/feed-query";
import { parseUtcInstant, getReportingDate } from "@/domain/calendar";
import data from "./scenarios.json";

type Scenario = { detail: StoredMatchDetailResponse; prior: StoredMatchDetailResponse; feed: StoredMatchFeedResponse; insights: StoredMatchInsights };
export const scenarios = data as unknown as Record<string, Scenario>;
export const at = parseUtcInstant("2026-10-09T09:00:00Z"), instant = async () => at;
export const accessFor = (viewer: string | null): ViewerAccess => ({ tier: ["entitled", "off"].includes(viewer ?? "") ? "full" : "free",
  signedIn: ![null, "anonymous", "off", "evicted"].includes(viewer), mode: viewer === "off" ? "off" : "on" });
export const resolveAccess = async () => accessFor((await headers()).get("x-test-viewer"));
export const requestAccess = async (request: Request) => accessFor(request.headers.get("x-test-viewer"));
export const policy = () => ({ deployment: "production", index: true } as const);
const find = (id: string) => { const value = Object.values(scenarios).find(item => item.detail.fixture.fixtureId === id); if (!value) throw new MatchFeedError("not-found"); return value; };
export const readFeed = async (parameters: FeedParameters) => scenarios[parseFeedQuery(parameters, { today: getReportingDate(at) }).search || "scheduled"]?.feed ?? scenarios.scheduled!.feed;
export const readDetail = async (id: string, parameters = new URLSearchParams()) => {
  const query = parseMatchDetailQuery(id, parameters), value = find(id);
  return query.cycle || query.revision ? { ...value.prior, selection: query.cycle ? "cycle" as const : "revision" as const } : value.detail;
};
export const readInsights = async (id: string) => find(id).insights;
export const readStatus = async (id: string) => find(id).detail.fixture.status;
