import { parseFeedQuery, type FeedParameters } from "@/domain/feed-query";
import { matchFeedResponseSchema } from "@/domain/match-feed";
import { syntheticFeed, today } from "../../../tests/helpers/rendering/slips/app/stored";

/** Preview-only records; these never read providers, members, or the database. */
export function previewFeed(parameters: FeedParameters = {}) {
  const query = parseFeedQuery(parameters, { today });
  const stored = syntheticFeed(parameters);
  const teams = [
    ["Northbridge FC", "Riverside United"], ["Westhaven City", "Kingsport Athletic"],
    ["Eastfield Rovers", "Brookside Town"], ["Oakwell United", "Southbank FC"],
    ["Hillcrest City", "Seabrook Athletic"], ["Redwood Rovers", "Lakeside United"],
    ["Ashford Town", "Greenfield FC"],
  ];
  const records = stored.records.map((record, index) => ({
    ...record,
    homeTeam: { ...record.homeTeam, name: teams[index]?.[0] ?? record.homeTeam.name },
    awayTeam: { ...record.awayTeam, name: teams[index]?.[1] ?? record.awayTeam.name },
    competition: { ...record.competition, name: "Premier Division", country: "England" },
  }));
  const data = matchFeedResponseSchema.parse({ ...stored, records,
    access: { tier: "full", signedIn: true },
    leagues: [{ id: "synthetic-league", name: "Premier Division", country: "England", fixtures: records.length }],
  });
  return { query, today, result: { data, error: null } as const };
}
