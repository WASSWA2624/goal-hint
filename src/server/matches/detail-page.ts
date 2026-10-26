import "server-only";

import type { Metadata } from "next";
import { getReportingDate, utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import type { MatchDetailResponse } from "../../domain/match-detail.ts";
import { breadcrumbStructuredData, matchPageIndexable, type DiscoveryPolicy } from "../../domain/discovery.ts";
import { homeHref, matchArchiveHref } from "../../domain/navigation.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import type { ViewerAccess } from "../members/viewer-access.ts";
import { resolveViewerAccess } from "../members/viewer-access.ts";
import { createGatedReads, type AccessResolver } from "../members/gated-reads.ts";
import { createMessages } from "../../i18n/messages.ts";
import { parseMatchDetailQuery } from "./detail-query.ts";
import { MatchFeedError } from "./feed-error.ts";
import { readPublicMatchDetail } from "./public-detail.ts";
import { pageMetadata } from "../seo/metadata.ts";
import { getDiscoveryPolicy } from "../seo/policy.ts";

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
  parameters = new URLSearchParams(), resolveAccess: AccessResolver = resolveViewerAccess): Promise<DetailPageResult> {
  try {
    parseMatchDetailQuery(id, parameters);
    return { data: await createGatedReads({ readDetail: read, resolveAccess }).detail(id, parameters, clock), error: null };
  } catch (error) {
    return { data: null, error: error instanceof MatchFeedError && ["invalid-query", "not-found"].includes(error.code) ? "not-found"
      : error instanceof MatchFeedError && error.code === "rate-limited" ? "rate-limited" : "unavailable" };
  }
}
export function matchDetailMetadata(result: DetailPageResult, locale = "en", variant = false, policy: DiscoveryPolicy = getDiscoveryPolicy(), mode: ViewerAccess["mode"] = "off"): Metadata {
  const messages = createMessages(locale), data = result.data;
  if (!data) return pageMetadata({ title: messages.text("detail.unavailableTitle"), description: messages.text("detail.unavailable") });
  const title = messages.text("match.title", { home: data.fixture.homeTeam.name || messages.text("match.homeUnknown"),
    away: data.fixture.awayTeam.name || messages.text("match.awayUnknown") });
  const date = data.fixture.kickoffAt == null ? null : getReportingDate(utcInstantFromEpochMilliseconds(data.fixture.kickoffAt));
  const indexable = matchPageIndexable(data.fixture), competition = data.fixture.competition?.name?.slice(0, 120) ?? "";
  // Only a page with a published forecast is titled a prediction, so noindex shells never claim one; neither quotes a selection.
  const pageTitle = date ? messages.text(indexable ? "detail.predictionMetadataTitle" : "detail.datedMetadataTitle", { match: title.slice(0, 180), date: messages.reportingDateMedium(date) })
    : messages.text("detail.metadataTitle", { match: title.slice(0, 180) });
  const description = date ? messages.text(competition ? "detail.competitionMetadataDescription" : "detail.datedMetadataDescription",
    { match: title.slice(0, 240), date: messages.reportingDate(date), competition })
    : messages.text("detail.metadataDescription", { match: title.slice(0, 240) });
  const preview = mode === "on" ? `${description} ${messages.text("detail.subscriberMetadataDescription")}` : description;
  return pageMetadata({ title: pageTitle, description: preview, path: data.route.path,
    index: policy.index && !variant && indexable });
}

/** Home → the kickoff's EAT-day collection → this match; the banner's kickoff date links to that same collection. */
export function matchStructuredData(data: MatchDetailResponse, locale = "en") {
  const messages = createMessages(locale), fixture = data.fixture;
  const match = messages.text("match.title", { home: fixture.homeTeam.name || messages.text("match.homeUnknown"),
    away: fixture.awayTeam.name || messages.text("match.awayUnknown") });
  const date = fixture.kickoffAt == null ? null : getReportingDate(utcInstantFromEpochMilliseconds(fixture.kickoffAt));
  const archive = matchArchiveHref(fixture.kickoffAt, locale);
  return breadcrumbStructuredData([{ name: publicPolicy.name, path: homeHref(locale) },
    ...(date && archive ? [{ name: messages.text("metadata.breadcrumbArchive", { date: messages.reportingDate(date) }), path: archive }] : []),
    { name: match }]);
}
