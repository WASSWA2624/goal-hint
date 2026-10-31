import type { MatchDetailTab, MatchSection, MatchView } from "./match-view.ts";
import { openSection } from "./match-view.ts";
import type { MatchDetailResponse } from "./match-detail.ts";
import { isCompletedFixtureStatus } from "./market-settlement.ts";

export { matchDetailTabs, type MatchDetailTab } from "./match-view.ts";
export const hasMatchPredictionAccess = (data: MatchDetailResponse) => data.access.tier === "full" || isCompletedFixtureStatus(data.fixture.status);
const sections: Record<MatchDetailTab, MatchSection | null> = {
  stats: "stats", h2h: "h2h", standings: "context", lineups: "lineups", markets: null, events: null, venue: "context", analysis: "news",
};
const sectionTabs: Record<MatchSection, MatchDetailTab> = {
  stats: "stats", form: "stats", h2h: "h2h", lineups: "lineups", players: "lineups", injuries: "lineups",
  news: "analysis", history: "analysis", context: "venue", referee: "venue",
};
export function detailTabForView(view: MatchView): MatchDetailTab {
  return view.panel ?? (view.market ? "markets" : view.section ? sectionTabs[view.section] : "stats");
}
export function openDetailTab(view: MatchView, panel: MatchDetailTab): MatchView {
  return { ...openSection(view, sections[panel]), panel, market: null, marketsOpen: true };
}
