import "server-only";

import type { Metadata } from "next";
import type { Clock } from "../../domain/calendar.ts";
import type { MatchDetailResponse } from "../../domain/match-detail.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import { createMessages } from "../../i18n/messages.ts";
import { parseMatchDetailQuery } from "./detail-query.ts";
import { MatchFeedError } from "./feed-error.ts";
import { readPublicMatchDetail } from "./public-detail.ts";

export type DetailPageResult = Readonly<{ data: MatchDetailResponse; error: null } |
  { data: null; error: "not-found" | "unavailable" | "rate-limited" }>;

export function matchDetailPageParameters(parameters: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    if (value === undefined) continue;
    if (typeof value !== "string") throw new MatchFeedError("invalid-query");
    query.set(key, value);
  }
  query.sort();
  return query;
}
export function parseMatchDetailPageInput(id: string, parameters: Record<string, string | string[] | undefined>) {
  parseMatchDetailQuery(id, matchDetailPageParameters(parameters));
  return id.toLowerCase();
}
export async function loadMatchDetailPage(id: string, clock: Clock, read: typeof readPublicMatchDetail = readPublicMatchDetail,
  parameters = new URLSearchParams()): Promise<DetailPageResult> {
  try {
    parseMatchDetailQuery(id, parameters);
    return { data: await read(id, parameters, clock), error: null };
  } catch (error) {
    return { data: null, error: error instanceof MatchFeedError && ["invalid-query", "not-found"].includes(error.code) ? "not-found"
      : error instanceof MatchFeedError && error.code === "rate-limited" ? "rate-limited" : "unavailable" };
  }
}
export function matchDetailMetadata(result: DetailPageResult, locale = "en"): Metadata {
  const messages = createMessages(locale), data = result.data;
  if (!data) return { title: messages.text("detail.unavailableTitle"), robots: { index: false, follow: true } };
  const title = messages.text("match.title", { home: data.fixture.homeTeam.name || messages.text("match.homeUnknown"),
    away: data.fixture.awayTeam.name || messages.text("match.awayUnknown") });
  const pageTitle = messages.text("detail.metadataTitle", { match: title.slice(0, 180) });
  const description = messages.text("detail.metadataDescription", { match: title.slice(0, 240) });
  const canonical = new URL(data.route.path, publicPolicy.origin).href;
  return { title: pageTitle, description, alternates: { canonical }, robots: { index: false, follow: true },
    openGraph: { type: "website", siteName: publicPolicy.name, title: pageTitle, description, url: canonical,
      images: [{ url: new URL("/brand/goal-hint-open-graph.png", publicPolicy.origin).href, width: 1200, height: 630, alt: publicPolicy.name }] },
    twitter: { card: "summary_large_image", title: pageTitle, description,
      images: [new URL("/brand/goal-hint-open-graph.png", publicPolicy.origin).href] } };
}
