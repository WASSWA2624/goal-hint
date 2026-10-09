import type { ReportingDate, UtcInstant } from "../domain/calendar.ts";
import type { FeedQuery } from "../domain/feed-query.ts";
import type { FixtureSnapshot } from "../domain/fixture-snapshot.ts";

export type FeedPage = Readonly<{ records: readonly FixtureSnapshot[]; page: number; nextPage: number | null }>;
export type FeedBootstrap = Readonly<{ query: FeedQuery; today: ReportingDate; data: FeedPage | null }>;
export type FeedRequest = Readonly<{
  id: number; generation: number; queryKey: string; page: number; mode: "replace" | "append" | "refresh";
}>;
export type FeedFailure = "network" | "unavailable" | "invalid-response" | "stale-data";
export type LoadedView = {
  ids: string[]; firstPage: number | null; lastPage: number | null; nextPage: number | null;
  scrollY: number; error: FeedFailure | null; phase: "idle" | "loading" | "ready" | "error";
};
export type NavigationCheckpoint = Readonly<{
  queryKey: string; query: FeedQuery; view: LoadedView; savedAt: UtcInstant;
}>;
export type FeedState = {
  query: FeedQuery; draft: FeedQuery; today: ReportingDate; queryKey: string;
  generation: number; requestSequence: number; request: FeedRequest | null;
  records: Record<string, FixtureSnapshot>; view: LoadedView;
  history: Record<string, NavigationCheckpoint>;
};
