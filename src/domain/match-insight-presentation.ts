import type { InsightResult, InsightsPreview, MatchInsights, TeamSummary } from "./match-insights.ts";
import type { MatchSection } from "./match-view.ts";

/** W/D/L from one team's perspective, using the verified regulation score. */
export function resultFor(record: Pick<InsightResult, "home" | "homeGoals" | "awayGoals">, teamId: string): "W" | "D" | "L" {
  const home = record.home.id === teamId;
  const scored = home ? record.homeGoals : record.awayGoals, conceded = home ? record.awayGoals : record.homeGoals;
  return scored > conceded ? "W" : scored < conceded ? "L" : "D";
}

/** Totals and rates over the supplied records; rates are null without a sample. */
export function summarize(records: readonly InsightResult[], teamId: string): TeamSummary {
  let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0, btts = 0, over = 0, clean = 0, blank = 0;
  for (const record of records) {
    const home = record.home.id === teamId;
    const scored = home ? record.homeGoals : record.awayGoals, conceded = home ? record.awayGoals : record.homeGoals;
    goalsFor += scored; goalsAgainst += conceded;
    if (scored > conceded) wins++; else if (scored < conceded) losses++; else draws++;
    if (scored > 0 && conceded > 0) btts++;
    if (scored + conceded >= 3) over++;
    if (conceded === 0) clean++;
    if (scored === 0) blank++;
  }
  const n = records.length, share = (value: number) => n === 0 ? null : value / n;
  return { matches: n, wins, draws, losses, goalsFor, goalsAgainst,
    bttsRate: share(btts), over25Rate: share(over), cleanSheetRate: share(clean), failedToScoreRate: share(blank) };
}

/** Filters a team's results by venue and window (0 = every stored result). */
export function formRecords(records: readonly InsightResult[], teamId: string, venue: "all" | "home" | "away", window: number): InsightResult[] {
  const filtered = records.filter((record) => venue === "all" || (venue === "home" ? record.home.id === teamId : record.away.id === teamId));
  return window > 0 ? filtered.slice(0, window) : filtered;
}

/** Head-to-head totals from the fixture's home-team perspective. */
export function headToHead(meetings: readonly InsightResult[], homeTeamId: string) {
  let homeWins = 0, draws = 0, awayWins = 0, goals = 0, btts = 0, over = 0;
  for (const meeting of meetings) {
    const result = resultFor(meeting, homeTeamId);
    if (result === "W") homeWins++; else if (result === "L") awayWins++; else draws++;
    goals += meeting.homeGoals + meeting.awayGoals;
    if (meeting.homeGoals > 0 && meeting.awayGoals > 0) btts++;
    if (meeting.homeGoals + meeting.awayGoals >= 3) over++;
  }
  const n = meetings.length;
  return { meetings: n, homeWins, draws, awayWins, averageGoals: n ? goals / n : null, bttsRate: n ? btts / n : null, over25Rate: n ? over / n : null };
}

/** Provider injury types map to availability without guessing a return date. */
export function injuryStatus(type: string | null): "out" | "doubtful" | "unknown" {
  const value = type?.toLowerCase() ?? "";
  return value.includes("missing") ? "out" : value.includes("questionable") || value.includes("doubtful") ? "doubtful" : "unknown";
}

/** One page of a complete collection; callers expose every page. */
export function pageOf<T>(items: readonly T[], page: number, size: number) {
  const pages = Math.max(1, Math.ceil(items.length / size)), current = Math.min(Math.max(1, page), pages);
  return { items: items.slice((current - 1) * size, current * size), page: current, pages, total: items.length };
}

/** First rows shown on overview cards; the full collections load when a section opens. */
export const previewRules = Object.freeze({ form: 10, meetings: 5, players: 6, injuries: 6, news: 3, stats: 6 });
/** Whether the overview preview already holds every entry of a section: previews truncate only lists. */
export function previewHoldsSection(preview: InsightsPreview, section: MatchSection): boolean {
  const { sections: s, totals: t } = preview;
  switch (section) {
    case "form": return s.form.home.length >= t.formHome && s.form.away.length >= t.formAway;
    case "h2h": return s.h2h.meetings.length >= t.meetings;
    case "stats": return s.stats.evidence.length >= t.stats;
    case "players": return s.players.players.length >= t.players;
    case "injuries": return s.injuries.injuries.length >= t.injuries;
    case "news": return s.news.items.length >= t.news;
    default: return true;
  }
}

/** Truncates each collection for the overview and records the complete totals for "View all" labels. */
export function insightsPreview(insights: MatchInsights): InsightsPreview {
  const s = insights.sections;
  return { fixtureId: insights.fixtureId, asOf: insights.asOf, home: insights.home, away: insights.away,
    sections: { ...s,
      form: { home: s.form.home.slice(0, previewRules.form), away: s.form.away.slice(0, previewRules.form) },
      h2h: { meetings: s.h2h.meetings.slice(0, previewRules.meetings) },
      stats: { ...s.stats, evidence: s.stats.evidence.slice(0, previewRules.stats) },
      players: { players: s.players.players.slice(0, previewRules.players) },
      injuries: { injuries: s.injuries.injuries.slice(0, previewRules.injuries) },
      news: { ...s.news, items: s.news.items.slice(0, previewRules.news) } },
    totals: { formHome: s.form.home.length, formAway: s.form.away.length, meetings: s.h2h.meetings.length, players: s.players.players.length,
      injuries: s.injuries.injuries.length, news: s.news.items.length, stats: s.stats.evidence.length } };
}

export const comparisonMetrics = ["pointsPerGame", "goalsFor", "goalsAgainst", "winRate", "cleanSheetRate", "bttsRate", "over25Rate", "failedToScoreRate"] as const;
export type ComparisonMetric = (typeof comparisonMetrics)[number];
export type ComparisonRow = Readonly<{ metric: ComparisonMetric; kind: "average" | "rate"; home: number | null; away: number | null }>;

/** One metric's value for one team over the supplied records; null without a sample. */
export function metricValue(summary: TeamSummary, metric: ComparisonMetric): number | null {
  const n = summary.matches;
  if (n === 0) return null;
  switch (metric) {
    case "pointsPerGame": return (summary.wins * 3 + summary.draws) / n;
    case "goalsFor": return summary.goalsFor / n;
    case "goalsAgainst": return summary.goalsAgainst / n;
    case "winRate": return summary.wins / n;
    case "cleanSheetRate": return summary.cleanSheetRate;
    case "bttsRate": return summary.bttsRate;
    case "over25Rate": return summary.over25Rate;
    case "failedToScoreRate": return summary.failedToScoreRate;
  }
}

/** Side-by-side averages and rates from each team's own stored verified results. */
export function teamComparison(home: readonly InsightResult[], away: readonly InsightResult[], homeId: string, awayId: string) {
  const homeSummary = summarize(home, homeId), awaySummary = summarize(away, awayId);
  const rows: ComparisonRow[] = comparisonMetrics.map((metric) => ({ metric, kind: ["pointsPerGame", "goalsFor", "goalsAgainst"].includes(metric) ? "average" : "rate",
    home: metricValue(homeSummary, metric), away: metricValue(awaySummary, metric) }));
  return { home: homeSummary, away: awaySummary, rows };
}

/** Per-match value of a comparison metric for its match-by-match breakdown. */
export function perMatchValue(record: InsightResult, teamId: string, metric: ComparisonMetric): number {
  const home = record.home.id === teamId;
  const scored = home ? record.homeGoals : record.awayGoals, conceded = home ? record.awayGoals : record.homeGoals;
  switch (metric) {
    case "pointsPerGame": return scored > conceded ? 3 : scored === conceded ? 1 : 0;
    case "goalsFor": return scored;
    case "goalsAgainst": return conceded;
    case "winRate": return scored > conceded ? 1 : 0;
    case "cleanSheetRate": return conceded === 0 ? 1 : 0;
    case "bttsRate": return scored > 0 && conceded > 0 ? 1 : 0;
    case "over25Rate": return scored + conceded >= 3 ? 1 : 0;
    case "failedToScoreRate": return scored === 0 ? 1 : 0;
  }
}
