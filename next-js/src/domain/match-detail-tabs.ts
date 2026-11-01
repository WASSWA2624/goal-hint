import type { MatchDetailTab, MatchSection, MatchView } from "./match-view.ts";
import { openSection } from "./match-view.ts";
import type { MatchDetailResponse } from "./match-detail.ts";
import { isCompletedFixtureStatus } from "./market-settlement.ts";

export { matchDetailTabs, type MatchDetailTab } from "./match-view.ts";
export const hasMatchPredictionAccess = (data: MatchDetailResponse) => data.access.tier === "full" || isCompletedFixtureStatus(data.fixture.status);
const sections: Record<MatchDetailTab, MatchSection | null> = {
  stats: "stats", markets: null, lineups: "lineups", form: "form", analysis: null, events: null,
  standings: "context", players: "players", news: "news", venue: "context", referee: "referee", history: "history",
};
const sectionTabs: Record<MatchSection, MatchDetailTab> = {
  stats: "stats", form: "form", h2h: "form", lineups: "lineups", players: "players", injuries: "lineups",
  news: "news", history: "history", context: "venue", referee: "referee",
};
export function detailTabForView(view: MatchView): MatchDetailTab {
  return view.panel ?? (view.market ? "markets" : view.section ? sectionTabs[view.section] : "stats");
}
export function openDetailTab(view: MatchView, panel: MatchDetailTab): MatchView {
  return { ...openSection(view, sections[panel]), panel, market: null, marketsOpen: true };
}
