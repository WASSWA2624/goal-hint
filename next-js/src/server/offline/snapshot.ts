import "server-only";

import { getReportingDate, utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import { offlineRules, offlineSnapshotSchema, type OfflineSnapshot } from "../../domain/offline.ts";
import type { MatchFeedResponse } from "../../domain/match-feed.ts";
import { createGatedReads } from "../members/gated-reads.ts";
import { readPublicMatchFeed } from "../matches/public-feed.ts";

const headers = Object.freeze({ "cache-control": "public, max-age=0, must-revalidate",
  "x-goalhint-offline-snapshot": "1", "x-content-type-options": "nosniff" });

/** Copy approved fields rather than persisting a raw feed or a sanitized spread. */
export function projectOfflineSnapshot(feed: MatchFeedResponse): OfflineSnapshot {
  const team = ({ id, name, code }: MatchFeedResponse["records"][number]["homeTeam"]) => ({ id, name, code: code ?? null });
  return offlineSnapshotSchema.parse({ schemaVersion: offlineRules.schemaVersion,
    capturedAt: feed.asOf, expiresAt: feed.asOf + offlineRules.retentionMs, reportingDate: getReportingDate(utcInstantFromEpochMilliseconds(feed.asOf)),
    records: feed.records.slice(0, offlineRules.maximumRecords).map((record) => ({
      fixtureId: record.fixtureId, dataVersion: record.dataVersion, homeTeam: team(record.homeTeam), awayTeam: team(record.awayTeam),
      competition: { id: record.competition.id, name: record.competition.name, country: record.competition.country },
      kickoffAt: record.kickoffAt, syncedAt: record.syncedAt, status: record.status, score: record.score, scorePeriod: record.scorePeriod ?? null,
    })) });
}

/** This endpoint deliberately never resolves the request's cookies, query or viewer. */
export function createOfflineSnapshotHandler({ readFeed = readPublicMatchFeed,
  clock = { now: () => utcInstantFromEpochMilliseconds(Date.now()) } }: { readFeed?: typeof readPublicMatchFeed; clock?: Clock } = {}) {
  const reads = createGatedReads({ readFeed, resolveAccess: async () => ({ tier: "free", signedIn: false, mode: "free" }) });
  return async function GET(): Promise<Response> {
    try {
      const at = clock.now();
      const feed = await reads.feed(new URLSearchParams({ page: "1", pageSize: String(offlineRules.maximumRecords) }),
        { locale: "en" }, { now: () => at });
      if (feed.page !== 1 || feed.state === "data-unavailable" || feed.asOf > at) throw new Error("Anonymous feed unavailable.");
      const snapshot = projectOfflineSnapshot(feed);
      const body = JSON.stringify(snapshot);
      if (snapshot.expiresAt <= at || Buffer.byteLength(body, "utf8") > offlineRules.maximumSnapshotBytes) throw new Error("Anonymous snapshot unavailable.");
      return new Response(body, { headers: { ...headers, "content-type": "application/json; charset=utf-8" } });
    } catch {
      return Response.json({ error: "Offline content is not available yet. Try again when connected." },
        { status: 503, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff", "retry-after": "30" } });
    }
  };
}
