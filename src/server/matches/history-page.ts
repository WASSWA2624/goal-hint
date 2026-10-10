import "server-only";

import type { MatchDetailResponse } from "../../domain/match-detail.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import { parseMatchDetailQuery } from "./detail-query.ts";

/** Convert only validated same-fixture public cursors into canonical page links. */
export function historyPageHref(data: MatchDetailResponse, query = new URLSearchParams()) {
  parseMatchDetailQuery(data.fixture.fixtureId, query);
  return `${data.route.path}${query.size ? `?${query}` : ""}#revision-history`;
}
export function historyNextHref(data: MatchDetailResponse, next: string | null) {
  if (next === null) return null;
  const url = new URL(next, publicPolicy.origin);
  if (url.origin !== publicPolicy.origin || url.pathname !== `/api/matches/${data.fixture.fixtureId}` || url.hash) return null;
  return historyPageHref(data, url.searchParams);
}
export function historySelectionHref(data: MatchDetailResponse, parameters: URLSearchParams, kind: "revision" | "cycle", id: string) {
  const query = new URLSearchParams(parameters);
  query.delete("revision"); query.delete("cycle");
  query.set(kind, id);
  // Pin both lists while inspecting snapshots, including empty history.
  query.set("revisionAnchor", String(data.history.revisions.anchor));
  query.set("cycleAnchor", String(data.history.cycles.anchor));
  return historyPageHref(data, query);
}
export function publicationStatus(entry: MatchDetailResponse["history"]["revisions"]["entries"][number], currentRevisionId: string | null) {
  return { current: entry.cycle.state === "open" && entry.revisionId === currentRevisionId, locked: entry.revisionId === entry.cycle.lockedRevisionId,
    void: entry.cycle.state === "void", superseded: entry.revisionId !== entry.cycle.lockedRevisionId &&
      (entry.cycle.state === "open" ? entry.revisionId !== currentRevisionId : entry.revisionId !== entry.cycle.currentRevisionId) };
}
