import "server-only";

import { apiFootballEndpoints, type ApiFootballEndpoint } from "./api-football-contract.ts";

type AdapterCoverage = "diagnostic" | "normalized" | "normalized-and-reference" | "reference";
type EndpointInventory = Readonly<{
  parameters: readonly string[];
  scope: readonly string[];
  traversal: string;
  refresh: string;
  historical: string;
  adapter: AdapterCoverage;
  batch?: readonly Readonly<{ parameter: string; maximumIds: number; delimiter: "-" }>[];
  fields: Readonly<{ normalized: readonly string[]; raw: readonly string[]; rawReason: string }>;
}>;

const fields = (normalized: readonly string[], raw: readonly string[], rawReason: string) => ({ normalized, raw, rawReason });
const batch = (...parameters: string[]) => parameters.map(parameter => ({ parameter, maximumIds: 20, delimiter: "-" as const }));
const leagueSeason = ["league", "season"] as const;
const fixtureTeam = ["fixture", "team"] as const;
const personSelectors = ["player", "players", "coach", "coachs"] as const;
const directoryRefresh = "Several updates per week. Reuse the most recent verified catalog until its next scheduled refresh.";
const seasonCoverage = "Coverage is specific to league and season and may vary by fixture.";
const currentOnly = "Observed current state only. It does not establish membership at an earlier kickoff.";
const archived = "The existing reference path validates scope and identity and preserves the response row for future use.";
const unknownProviderTime = "When the provider supplies no update time, retain the retrieval time separately.";

const teamFields = ["id", "name", "code", "country", "national", "logo"] as const;
const leagueFields = ["id", "name", "country", "type", "season", "round", "logo", "flag"] as const;
const profileFields = ["id", "name", "firstname", "lastname", "age", "nationality", "photo"] as const;
const profileExtras = ["birth.date", "birth.place", "birth.country", "height", "weight", "injured", "number", "position"] as const;
const scoreFields = ["home", "away"] as const;
const metrics = ["games.lineups", "games.number", "games.position", "games.rating", "games.captain",
  "games.substitute", "substitutes.in", "substitutes.out", "substitutes.bench", "shots.total", "shots.on",
  "goals.conceded", "goals.saves", "passes.total", "passes.key", "passes.accuracy", "tackles.total", "tackles.blocks",
  "tackles.interceptions", "duels.total", "duels.won", "dribbles.attempts", "dribbles.success", "dribbles.past",
  "fouls.drawn", "fouls.committed", "cards.yellow", "cards.yellowred", "cards.red", "penalty.won",
  "penalty.commited", "penalty.scored", "penalty.missed", "penalty.saved"] as const;
const prefixed = (prefix: string, names: readonly string[]) => names.map(name => `${prefix}.${name}`);
const statValues = ["statistics.*.type", "statistics.*.value"] as const;
const eventFields = ["time.elapsed", "time.extra", "team.id", "player.name", "assist.name", "type", "detail", "comments"] as const;
const lineupFields = [...prefixed("team", teamFields), "formation",
  ...["startXI", "substitutes"].flatMap(group => prefixed(`${group}.*.player`, ["id", "name", "number", "pos", "grid"]))];
const fixtureFields = ["fixture.id", "fixture.date", "fixture.timestamp", "fixture.timezone", "fixture.status.short", "fixture.status.elapsed",
  "fixture.status.extra", ...prefixed("league", leagueFields), ...prefixed("teams.home", teamFields), ...prefixed("teams.away", teamFields),
  ...["goals", "score.halftime", "score.fulltime", "score.extratime", "score.penalty"].flatMap(prefix => prefixed(prefix, scoreFields))];
const fixtureDetailFields = ["fixture.referee", "fixture.venue.id", "fixture.venue.name", "fixture.venue.city"] as const;
const fixtureRawFields = ["fixture.periods.first",
  "fixture.periods.second", "fixture.status.long", "league.standings", "teams.home.winner", "teams.away.winner", "update"] as const;
const playerStatsRaw = [...prefixed("player", profileExtras), ...prefixed("statistics.*", metrics)];
const catalogFields = fields(["id", "name"], [], "Retain additional identifiers and definitions when the provider adds them.");
const countryFields = fields([], ["name", "code", "flag"], archived);
const personFields = (endpoint: "trophies" | "sidelined", names: readonly string[]) => fields([], [...names, "id", ...prefixed(`${endpoint}.*`, names)], archived);
const leaderboard = (ranking: string): EndpointInventory => ({
  parameters: leagueSeason, scope: ["league", "season", "player", "team"],
  traversal: `Fetch the ${ranking} leaderboard per covered league-season. It contains up to 20 players and does not represent the full population.`,
  refresh: directoryRefresh, historical: seasonCoverage, adapter: "reference",
  fields: fields([], [...prefixed("player", [...profileFields, ...profileExtras]), "statistics.*.team.id", "statistics.*.league.id",
    "statistics.*.league.season", ...prefixed("statistics.*", ["games.appearences", "games.minutes", "goals.total", "goals.assists", ...metrics])], archived),
});

const endpoints = {
  accountStatus: {
    parameters: [], scope: ["authorized-account", "observation"],
    traversal: "Fetch only from the authorized account diagnostic path. The v3 status envelope may omit regular paging metadata.",
    refresh: "Refresh when checking the subscription or reconciling usage, subject to the account policy.",
    historical: "A point-in-time subscription and usage report. Prior account state requires an earlier observation.", adapter: "diagnostic",
    fields: fields(["subscription.plan", "subscription.end", "subscription.active", "requests.current", "requests.limit_day"],
      ["account.firstname", "account.lastname", "account.email"], "Account details require administrator-only retention and are excluded from the current diagnostic projection."),
  },
  timezones: {
    parameters: [], scope: ["catalog"], traversal: "Fetch the provider's timezone identifier list.",
    refresh: "Static catalog in the documentation. Refresh only as needed.", historical: "Reference dictionary, independent of match dates.",
    adapter: "reference", fields: fields([], ["$"], archived),
  },
  countries: {
    parameters: ["name", "code", "search"], scope: ["league-country-catalog"],
    traversal: "Fetch the unfiltered country dictionary for competition discovery. Provider filters are lookup options.",
    refresh: "Changes when coverage expands to another country. Refresh the catalog daily when needed.", historical: currentOnly,
    adapter: "reference", fields: countryFields,
  },
  teamCountries: {
    parameters: [], scope: ["team-country-catalog"], traversal: "Fetch independently from the competition country catalog.",
    refresh: directoryRefresh, historical: currentOnly, adapter: "reference", fields: countryFields,
  },
  competitions: {
    parameters: ["id", "name", "country", "code", "season", "team", "type", "current", "search", "last"],
    scope: ["league", "season", "country"], traversal: "Start with the unfiltered catalog. Traverse all permitted leagues and seasons. Use id and season for selective refreshes.",
    refresh: "Several updates per day. Refresh coverage when season or competition eligibility may have changed.",
    historical: "Season start and end dates are distinct from fixture dates. Coverage describes the provider's current assessment of a league-season.",
    adapter: "normalized", fields: fields([...prefixed("league", leagueFields), "country.name", "country.flag", "seasons.*.year", "seasons.*.current",
      ...prefixed("seasons.*.coverage", ["fixtures.events", "fixtures.lineups", "fixtures.statistics_fixtures", "fixtures.statistics_players", "standings", "players",
        "top_scorers", "top_assists", "top_cards", "injuries", "predictions", "odds"])], ["country.code", "seasons.*.start", "seasons.*.end"],
    "Season boundaries and country code remain outside the current competition adapter projection."),
  },
  leagueSeasons: {
    parameters: [], scope: ["league-season-catalog"], traversal: "Use the published league-season years as a reference, then inspect each competition for exact coverage.",
    refresh: "Refresh on catalog change or at the daily reference interval.", historical: "A catalog year does not prove access or coverage for a particular league.",
    adapter: "reference", fields: fields([], ["$"], archived),
  },
  teams: {
    parameters: ["id", "name", "league", "season", "country", "code", "venue", "search"], scope: ["team", "league", "season", "country", "venue"],
    traversal: "Use league with season for membership, ID for a profile, or a documented country for catalog expansion. Lookup filters require at least one parameter.",
    refresh: directoryRefresh, historical: "League-season membership is distinct from current team profiles and current venue associations.",
    adapter: "normalized-and-reference", fields: fields(prefixed("team", teamFields), ["team.founded", "team.aliases", "venue.id", "venue.name",
      "venue.address", "venue.city", "venue.capacity", "venue.surface", "venue.image"], "The reference row retains venue and profile fields outside the team projection."),
  },
  teamSeasons: {
    parameters: ["team"], scope: ["team", "season"], traversal: "Fetch the available years for each relevant provider team ID.",
    refresh: directoryRefresh, historical: "Years alone do not establish participation in a particular competition or fixture.", adapter: "reference",
    fields: fields([], ["$"], archived),
  },
  teamStatistics: {
    parameters: [...leagueSeason, "team", "date"], scope: ["team", "league", "season", "as-of-date"],
    traversal: "Fetch with team, league and season. Set the optional date cutoff for a historical aggregate when the provider supports it for the selected season.",
    refresh: "Updated twice daily. Prefer daily refreshes on match days and less often for idle teams.",
    historical: "An undated aggregate describes observation-time form. It cannot serve as an earlier kickoff snapshot.", adapter: "reference",
    fields: fields([], ["league.id", "league.season", "team.id", "form", "fixtures.played", "fixtures.wins", "fixtures.draws", "fixtures.loses",
      "goals.for.total", "goals.for.average", "goals.for.minute", "goals.for.under_over", "goals.against.total", "goals.against.average",
      "goals.against.minute", "goals.against.under_over", "biggest.streak", "biggest.wins", "biggest.loses", "biggest.goals", "clean_sheet",
      "failed_to_score", "penalty", "lineups", "cards"], archived),
  },
  venues: {
    parameters: ["id", "name", "city", "country", "search"], scope: ["venue", "country", "city"],
    traversal: "Fetch venues referenced by fixture or team ID and use documented country lookups for discovery. The provider requires a selector.",
    refresh: directoryRefresh, historical: "Venue profiles are mutable. Use the fixture venue relationship at kickoff when available.", adapter: "reference",
    fields: fields([], ["id", "name", "address", "city", "country", "capacity", "surface", "image"], archived),
  },
  standings: {
    parameters: [...leagueSeason, "team"], scope: ["league", "season", "group", "team", "observation"],
    traversal: "Read each covered league-season and preserve every group and table section. Season is required and league or team scopes the query.",
    refresh: "Updated hourly. Refresh active competition tables more frequently than completed ones.",
    historical: "The latest table for a season is not a table as of an earlier kickoff. The provider does not expose a standings date selector.", adapter: "reference",
    fields: fields([], ["league.id", "league.season", ...prefixed("league.standings.*.*", ["rank", "team.id", "team.name", "team.logo", "points",
      "goalsDiff", "group", "form", "status", "description", "update", ...["all", "home", "away"].flatMap(period =>
        prefixed(period, ["played", "win", "draw", "lose", "goals.for", "goals.against"]))])], archived),
  },
  fixtureRounds: {
    parameters: [...leagueSeason, "current", "dates", "timezone"], scope: ["league", "season", "round", "timezone"],
    traversal: "Use league and season with dates=true. Reserve current=true for refreshing a known current round.",
    refresh: "Provider updates daily. Refresh during schedule reconciliation.", historical: "Round identifiers and dates may change with rescheduling.",
    adapter: "normalized-and-reference", fields: fields(["round", "dates.*"], [], "The dated round parser retains all additional properties."),
  },
  fixtures: {
    parameters: ["id", "ids", "live", "date", ...leagueSeason, "team", "last", "next", "from", "to", "round", "status", "venue", "timezone"],
    scope: ["fixture", "league", "season", "team", "round", "reporting-date", "live-cohort", "time-window"], batch: batch("ids"),
    traversal: "Discover by date and explicit timezone, league-season or bounded window. Recheck unresolved fixtures by ID. Use live=all or league IDs for live discovery. id and ids can embed four independent detail sections. Batching depends on trusted account evidence.",
    refresh: "Provider updates as often as every 15 seconds. Live, current-day, upcoming and finalized cohorts use different job cadences and keeper verification.",
    historical: "Historical schedules and scores are coverage- and subscription-dependent. A fresh observation of an old fixture may contain later corrections.", adapter: "normalized-and-reference",
    fields: fields([...fixtureFields, ...prefixed("events.*", eventFields), ...prefixed("statistics.*", [...prefixed("team", teamFields), ...statValues]),
      ...fixtureDetailFields], [...fixtureRawFields, "events", "statistics", "lineups", "players"],
    "Enriched reads validate and retain raw detail sections, while schedule normalization alone projects fixture fields. Preserve corrections and complete nested raw rows."),
  },
  fixtureHeadToHead: {
    parameters: ["h2h", "date", ...leagueSeason, "last", "next", "from", "to", "status", "venue", "timezone"],
    scope: ["team-pair", "fixture", "league", "season", "time-window"],
    traversal: "Prefer equivalent local fixture history. When reconciliation requires provider data, use the h2h team IDs separated by a dash and request the appropriate date scope.",
    refresh: "Shares the fixture status update cadence. Stored eligible historical fixtures are the first input.", historical: seasonCoverage,
    adapter: "normalized", fields: fields(fixtureFields, [...fixtureDetailFields, ...fixtureRawFields],
      "The adapter reuses the schedule normalization. Keep source-only fixture fields for reconciliation or future use."),
  },
  statistics: {
    parameters: [...fixtureTeam, "type", "half"], scope: ["fixture", "team", "period", "statistic-type"],
    traversal: "Use the unfiltered fixture series for both teams. Add half=true for independently reported period series and avoid assuming coverage from the full-match block.",
    refresh: "Provider updates every minute during play. Reconcile after completion.", historical: "Half-specific data begins with the 2024 season, subject to competition coverage.",
    adapter: "normalized-and-reference", fields: fields([...prefixed("team", teamFields), ...statValues],
      ["statistics_1h.*.type", "statistics_1h.*.value", "statistics_2h.*.type", "statistics_2h.*.value"],
    "The half-statistics reference route keeps both period series. Preserve original labels, units and nulls for all reported metrics. Use expected goals and chance metrics only when the response supplies them."),
  },
  events: {
    parameters: [...fixtureTeam, "player", "type"], scope: ["fixture", "team", "player", "observation"],
    traversal: "Read the whole fixture timeline and re-fetch it for late corrections. Use embedded events first if present and validated.",
    refresh: "Provider updates as often as every 15 seconds. The provider suggests live requests at one-minute intervals.",
    historical: "VAR coverage begins in the 2020–21 season, subject to competition coverage.", adapter: "normalized",
    fields: fields(eventFields, ["team.name", "team.logo", "player.id", "assist.id"], "The current event projection recognizes goals, cards, substitutions and VAR, and keeps unrecognized event types in raw form."),
  },
  lineups: {
    parameters: [...fixtureTeam, "player", "type"], scope: ["fixture", "team", "player"],
    traversal: "Read both teams' formations, starters and substitutes. Use available embedded lineup data first.",
    refresh: "Updates every 15 minutes. Lineups often appear 20–40 minutes before kickoff, sometimes only after the match.",
    historical: "Fixture lineups describe that match. Current squads cannot fill a missing lineup.", adapter: "normalized",
    fields: fields(lineupFields, ["coach.id", "coach.name", "coach.photo", "team.colors.player.primary", "team.colors.player.number", "team.colors.player.border",
      "team.colors.goalkeeper.primary", "team.colors.goalkeeper.number", "team.colors.goalkeeper.border"], "Enriched fixture reads retain the complete lineup payload. The availability projection does not include the coach or colors."),
  },
  fixturePlayerStatistics: {
    parameters: fixtureTeam, scope: ["fixture", "team", "player", "section"], traversal: "Read the entire fixture without a team filter to cover both squads, using the embedded players block first.",
    refresh: "Updated every minute in play. Reconcile after full time.", historical: seasonCoverage, adapter: "reference",
    fields: fields([], [...prefixed("team", teamFields), "team.update", ...prefixed("players.*.player", profileFields),
      ...prefixed("players.*.statistics.*", ["games.minutes", "goals.total", "goals.assists", ...metrics])],
    "Both embedded and dedicated paths validate fixture teams and player identity and retain all nested statistics."),
  },
  injuries: {
    parameters: ["fixture", "ids", ...leagueSeason, "team", "player", "date", "timezone"], batch: batch("ids"),
    scope: ["fixture", "team", "player", "league", "season", "reporting-date"],
    traversal: "Use fixture IDs in bounded batches for match coverage or use league-season. The provider also supports date, team-season and player-season lookup.",
    refresh: "Provider updates every four hours and recommends daily calls outside targeted refreshes.",
    historical: "Documented fixture absence data begins in April 2021 and depends on coverage. Missing and questionable are distinct report types.",
    adapter: "normalized-and-reference", fields: fields([...prefixed("team", teamFields), "fixture.id", "player.id", "player.name", "player.type", "player.reason"],
      ["player.photo", "fixture.date", "fixture.timestamp", "fixture.timezone", "league.id", "league.name", "league.season"], "Season reference rows retain all contextual fields. Absence reports are not medical or fitness determinations."),
  },
  predictions: {
    parameters: ["fixture"], scope: ["fixture", "observation"], traversal: "Fetch an eligible fixture by ID and retain the entire response with source timestamps.",
    refresh: "Provider updates hourly. Record each provider snapshot independently of GoalHint's published forecasts.",
    historical: "The endpoint supplies an observation, not a dated history of past revisions. Older versions require previously captured snapshots.", adapter: "normalized",
    fields: fields([...prefixed("teams.home", teamFields), ...prefixed("teams.away", teamFields),
      ...prefixed("predictions", ["winner.id", "winner.name", "winner.comment", "win_or_draw", "under_over", "goals.home", "goals.away", "advice", "percent.home", "percent.draw", "percent.away"])],
    ["league", "teams.home.last_5", "teams.away.last_5", "teams.home.league", "teams.away.league", "comparison", "h2h"],
    "Preserve all provider percentages, comparison groups, head-to-head and source inputs independently of the current fallback market projection."),
  },
  coaches: {
    parameters: ["id", "team", "search"], scope: ["coach", "team", "career-stint"],
    traversal: "Discover by provider team and refresh each known coach by ID. Preserve every dated career association.",
    refresh: directoryRefresh, historical: "Use start and end dates for career stints. Current team assignment cannot be applied to older fixtures.", adapter: "reference",
    fields: fields([], [...profileFields, ...profileExtras, "team.id", "team.name", "team.logo", "career.*.team.id", "career.*.team.name", "career.*.team.logo", "career.*.start", "career.*.end"], archived),
  },
  playerSeasons: {
    parameters: ["player"], scope: ["player-season-catalog", "player", "season"], traversal: "Fetch the global statistics years and the available years for each relevant player.",
    refresh: "Updated daily. Refresh the relevant dictionary as seasons change.", historical: "A listed year does not prove that player statistics are complete for any team or competition.", adapter: "reference",
    fields: fields([], ["$"], archived),
  },
  playerProfiles: {
    parameters: ["player", "search", "page"], scope: ["player-profile-catalog", "player", "page"],
    traversal: "Use the unfiltered catalog and traverse every provider page. Player ID and search are selective lookups.",
    refresh: directoryRefresh, historical: "Profile is a current observation. Reported age, measurements or injured flag are not reliable historical values.", adapter: "reference",
    fields: fields([], prefixed("player", [...profileFields, ...profileExtras]), archived),
  },
  playerStatistics: {
    parameters: ["id", "team", ...leagueSeason, "search", "page"], scope: ["league", "season", "team", "player", "page"],
    traversal: "Traverse all league-season pages as one coverage target. Keep each player-team-season stint, including transfers. Optionally scope by team, by player with season, or by league or team with search.",
    refresh: directoryRefresh, historical: "Season aggregates are observed cumulative data. Use a pre-kickoff capture or compute from preceding fixture facts for historical evidence. Published free access can stop at page three.", adapter: "normalized-and-reference",
    fields: fields([...prefixed("player", profileFields), ...prefixed("statistics.*.team", teamFields), ...prefixed("statistics.*.league", leagueFields),
      ...prefixed("statistics.*", ["games.appearences", "games.minutes", "goals.total", "goals.assists"])], playerStatsRaw,
    "Reference jobs retain the profile and all team stints. The compact evidence projection uses only appearance, minutes and goal aggregates."),
  },
  squads: {
    parameters: ["team", "player"], scope: ["team", "player", "observation"], traversal: "Read the current squad for each team. The provider also supports a player lookup; the current reference adapter uses team IDs.",
    refresh: directoryRefresh, historical: currentOnly, adapter: "reference",
    fields: fields([], ["team.id", "team.name", "team.logo", ...prefixed("players.*", ["id", "name", "age", "number", "position", "photo"])], archived),
  },
  playerTeams: {
    parameters: ["player"], scope: ["player", "team", "season"], traversal: "Fetch career teams for each relevant player and retain every returned season for each team.",
    refresh: directoryRefresh, historical: "Career years identify a season relationship without providing actual membership dates or appearance evidence.", adapter: "reference",
    fields: fields([], ["team.id", "team.name", "team.logo", "seasons.*"], archived),
  },
  topScorers: leaderboard("goals"),
  topAssists: leaderboard("assists"),
  topYellowCards: leaderboard("yellow cards"),
  topRedCards: leaderboard("red cards"),
  transfers: {
    parameters: ["player", "team"], scope: ["player", "from-team", "to-team", "transfer-date"], traversal: "Discover by team and fill each relevant player history by player ID. Preserve both team IDs and the full event set.",
    refresh: directoryRefresh, historical: "Dated events establish reported movements. A lookup by team can include off-team records from the player's career.", adapter: "reference",
    fields: fields([], ["player.id", "player.name", "update", "transfers.*.date", "transfers.*.type", ...prefixed("transfers.*.teams.in", ["id", "name", "logo"]),
      ...prefixed("transfers.*.teams.out", ["id", "name", "logo"])], archived),
  },
  trophies: {
    parameters: personSelectors, batch: batch("players", "coachs"), scope: ["person-kind", "person-id", "competition", "season", "placement"],
    traversal: "Use a player or coach selector for one subject and the documented homogeneous batch selectors for more. Validate every subject independently.",
    refresh: directoryRefresh, historical: "Retain supplied competition text, season and placement without guessing IDs or dates.", adapter: "reference",
    fields: personFields("trophies", ["league", "country", "season", "place"]),
  },
  sidelined: {
    parameters: personSelectors, batch: batch("players", "coachs"), scope: ["person-kind", "person-id", "absence-interval"],
    traversal: "Use a player or coach selector, or a homogeneous multi-person batch. Preserve reported absence intervals for each subject.",
    refresh: directoryRefresh, historical: "This is reported career absence history. Match-specific absence comes from injuries, and an open interval has no known end.", adapter: "reference",
    fields: personFields("sidelined", ["type", "reason", "start", "end"]),
  },
  oddsBookmakers: {
    parameters: ["id", "search"], scope: ["prematch-bookmaker-catalog", "bookmaker"], traversal: "Import the catalog without filters before using bookmaker IDs for selective pricing queries.",
    refresh: directoryRefresh, historical: "Current provider catalog. An absent bookmaker does not invalidate historical prices.", adapter: "normalized", fields: catalogFields,
  },
  oddsBets: {
    parameters: ["id", "search"], scope: ["prematch-market-catalog", "market"], traversal: "Import the complete pre-match bet catalog without filters. Resolve live IDs separately.",
    refresh: directoryRefresh, historical: "Version mappings when names or semantics change. A current name does not replace an older observed label.", adapter: "normalized", fields: catalogFields,
  },
  oddsMapping: {
    parameters: ["page"], scope: ["prematch-availability-catalog", "page", "fixture", "league", "season", "date"],
    traversal: "Resume from the first missing page and validate each reported fixture ID. A single page cannot qualify the catalog.",
    refresh: "Provider updates daily. Record retrieval time and cover all pages for each observation.",
    historical: "Shows current fixture-price availability. An old fixture missing from the current mapping may have had prices previously.", adapter: "normalized-and-reference",
    fields: fields(["fixture.id", "fixture.date", "fixture.timestamp", "league.id", "league.season", "update"], ["fixture.timezone", "league.name", "league.country", "league.logo", "league.flag"],
      "The mapping adapter validates fixture identity and scope. Context outside that projection is available for raw retention."),
  },
  odds: {
    parameters: ["fixture", ...leagueSeason, "date", "timezone", "page", "bookmaker", "bet"], scope: ["fixture", "league", "season", "reporting-date", "page", "bookmaker", "market", "outcome", "line", "observation"],
    traversal: "Use a fixture, league-season or date scope and walk all pages. Omit bookmaker and bet filters to collect all returned bookmakers and markets. Selected-bookmaker requests remain available for fixture and date lookups.",
    refresh: "Provider updates every three hours. Keep provider update time distinct from observation time.",
    historical: "Provider advertises pre-match availability 1–14 days ahead and seven-day history. Older odds require already stored observations and may be unavailable.", adapter: "normalized",
    fields: fields(["fixture.id", "fixture.date", "fixture.timestamp", "fixture.timezone", "league.id", "league.season", "update", "bookmakers.*.id", "bookmakers.*.name",
      ...prefixed("bookmakers.*.bets.*", ["id", "name", "values.*.value", "values.*.odd"])], ["bookmakers.*.bets.*.values.*.id", "bookmakers.*.bets.*.values.*.handicap"],
    "Keep raw selection labels and decimal odds. Derive lines only through verified mappings when fields do not identify them directly."),
  },
  inPlayOddsBets: {
    parameters: ["id", "search"], scope: ["in-play-market-catalog", "market"], traversal: "Fetch the unfiltered live market definitions, independent of pre-match IDs.",
    refresh: "Provider updates up to once per minute. Schedule catalog refreshes separately from in-play prices.",
    historical: "Live and pre-match identifiers belong to separate namespaces.", adapter: "normalized", fields: catalogFields,
  },
  inPlayOdds: {
    parameters: ["fixture", "league", "bet"], scope: ["live-cohort", "fixture", "league", "market", "outcome", "line", "observation"],
    traversal: "Read without filters for the available live cohort, or use a documented fixture, league or bet selector. No season selector is required for a league in this endpoint.",
    refresh: "Updates as often as every five seconds. Apply the permitted job cadence and shared quota limits.",
    historical: "No provider history. Fixtures often appear 5–15 minutes before kickoff and are removed 5–20 minutes after completion.", adapter: "normalized",
    fields: fields(["fixture.id", "league.id", "league.season", "teams.home.id", "teams.away.id", "status.stopped", "status.blocked", "status.finished", "update",
      ...prefixed("odds.*", ["id", "name", "values.*.value", "values.*.odd", "values.*.handicap", "values.*.main", "values.*.suspended"])],
    ["fixture.status", "fixture.date", "league.name", "teams.home.goals", "teams.away.goals", "odds.*.values.*.id"],
    "Current quote normalization projects status flags, prices and handicap. Capture the provider's complete live envelope without inferring bookmaker identity."),
  },
} as const satisfies Partial<Record<ApiFootballEndpoint, EndpointInventory>>;

// Each group is a selector used to satisfy a coverage target. Paging is handled by the transport rule.
const selectors = {
  accountStatus: [[]], timezones: [[]], countries: [[]], teamCountries: [[]], leagueSeasons: [[]],
  competitions: [[], ["id"], ["id", "season"]],
  teams: [leagueSeason, ["id"], ["country"]], teamSeasons: [["team"]],
  teamStatistics: [[...leagueSeason, "team"], [...leagueSeason, "team", "date"]],
  venues: [["id"], ["country"]], standings: [leagueSeason, ["team", "season"]],
  fixtureRounds: [[...leagueSeason, "dates", "timezone"], [...leagueSeason, "current", "dates", "timezone"]],
  fixtures: [["date", "timezone"], [...leagueSeason, "timezone"], [...leagueSeason, "from", "to", "timezone"],
    [...leagueSeason, "round", "timezone"], ["live", "timezone"], ["id", "timezone"], ["ids", "timezone"]],
  fixtureHeadToHead: [["h2h", "timezone"], ["h2h", "from", "to", "timezone"], ["h2h", ...leagueSeason, "timezone"]],
  statistics: [["fixture"], ["fixture", "half"]], events: [["fixture"]], lineups: [["fixture"]], fixturePlayerStatistics: [["fixture"]],
  injuries: [["fixture"], ["ids"], ["date", "timezone"], leagueSeason, ["team", "season"], ["player", "season"]],
  predictions: [["fixture"]], coaches: [["id"], ["team"]], playerSeasons: [[], ["player"]],
  playerProfiles: [[], ["player"]], playerStatistics: [leagueSeason, [...leagueSeason, "team"], ["id", "season"]],
  squads: [["team"], ["player"]], playerTeams: [["player"]], topScorers: [leagueSeason], topAssists: [leagueSeason],
  topYellowCards: [leagueSeason], topRedCards: [leagueSeason], transfers: [["team"], ["player"]],
  trophies: personSelectors.map(parameter => [parameter]), sidelined: personSelectors.map(parameter => [parameter]),
  oddsBookmakers: [[]], oddsBets: [[]], oddsMapping: [[]], inPlayOddsBets: [[]],
  odds: [["fixture"], ["date", "timezone"], leagueSeason, ["fixture", "bookmaker"], ["date", "timezone", "bookmaker"]],
  inPlayOdds: [[], ["fixture"], ["league"], ["bet"]],
} as const satisfies Record<keyof typeof endpoints, readonly (readonly string[])[]>;

/** Review metadata for ingestion. Transport paths and page sizes remain in the existing adapter contract. */
export const apiFootballInventory = {
  version: "1.1.0",
  documentationVersion: "3.9.3",
  reviewedOn: "2026-11-20",
  sources: {
    docs: "https://www.api-football.com/documentation-v3",
    quota: "https://www.api-football.com/news/post/how-to-optimize-api-sports-calls-and-quota-usage",
    coverage: "https://www.api-football.com/news/post/how-to-get-all-data-from-a-league-with-api-football",
    odds: "https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide",
    fixtureDetails: "https://www.api-football.com/news/post/how-to-get-all-fixtures-data-from-one-league",
    fixtureExamples: "https://www.api-football.com/news/post/fifa-world-cup-2026-group-stage-recap-and-complete-match-reports-with-api-football",
    players: "https://www.api-football.com/news/post/how-to-get-all-teams-and-players-from-a-league-id",
  },
  transport: apiFootballEndpoints,
  endpoints: {
    ...endpoints,
    teamsByCountry: { ...endpoints.teams, adapter: "reference", fields: fields([], [
      ...endpoints.teams.fields.normalized, ...endpoints.teams.fields.raw,
    ], archived) },
    venuesByCountry: endpoints.venues,
    coachProfiles: endpoints.coaches,
    fixtureHalfStatistics: { ...endpoints.statistics, adapter: "reference", fields: fields([], [
      ...endpoints.statistics.fields.normalized, ...endpoints.statistics.fields.raw,
    ], archived) },
    playerSeasonHistory: endpoints.playerSeasons,
    playerTransfers: endpoints.transfers,
  } satisfies Record<ApiFootballEndpoint, EndpointInventory>,
  coverageSelectors: {
    ...selectors,
    teamsByCountry: [["country"]], venuesByCountry: [["country"]], coachProfiles: [["id"]],
    fixtureHalfStatistics: [["fixture", "half"]], playerSeasonHistory: [["player"]], playerTransfers: [["player"]],
  } satisfies Record<ApiFootballEndpoint, readonly (readonly string[])[]>,
  paging: { parameter: "page", firstPage: 1, currentField: "paging.current", totalField: "paging.total",
    rule: "Validate selectors, API body errors, returned page number and total, then walk every page. An empty success alone does not establish coverage." },
  raw: {
    defaultDisposition: "retained-raw",
    access: "server-private",
    accountAccess: "administrator-only",
    exclude: ["request authentication headers", "credentials in any payload"],
    preserve: ["full successful provider response", "unknown nested properties", "explicit nulls", "absent fields", "original identifiers and labels"],
    detectSchemaChange: "Compare retained observations against an endpoint contract and record unexpected paths or incompatible types without rewriting source history.",
    fieldPaths: "Field patterns refer to one response row. An asterisk marks each nested array element and $ marks a scalar row. Listed raw container paths include all their children.",
    reason: "The full protected payload remains the source record for declared and unfamiliar fields. A field can be normalized without discarding its raw value.",
    status: "Existing archive receipts retain selected rows and enriched fixture detail blocks. Whole-response retention is an ingestion contract, not a claim about every existing adapter.",
  },
  commonEnvelopeFields: ["get", "parameters", "errors", "results", "paging.current", "paging.total", "response"],
  temporal: { retrievedAt: "Time the provider response was retrieved.", providerUpdatedAt: unknownProviderTime,
    identity: "Use provider IDs and their parent fixture, league, season or person scope. Derived statistics retain source, method and version." },
  derivedProvenance: ["source observations", "algorithm", "algorithm version", "as-of cutoff", "calculation time"],
  unavailable: {
    standardFootballFields: ["news", "weather", "tactical assessments", "manager ratings", "psychological states"],
    reason: "The standard API-Football schema does not supply these data categories. Use attributable timestamped sources only where authorized.",
  },
  notApplicable: {
    fields: ["standings for competitions without tables", "in-play bookmaker identity when no bookmaker is supplied", "current squad as fixture lineup"],
    reason: "These fields cannot be inferred where the resource or competition does not define them.",
  },
  accountEvidence: {
    channel: "direct API-SPORTS",
    evidence: "docs/deployment/how-to-deploy.md#vps-live-football-worker",
    coverage: "Existing production account and quota use are documented. This review made no authenticated requests and does not qualify access, rights or complete fields by competition-season.",
  },
} as const;
