import "server-only";
import { isSafeRemoteImageUrl } from "../../domain/remote-image.ts";

import { z } from "zod";
import { parseUtcInstant, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import type { UtcInstant } from "../../domain/calendar.ts";
import type { SettlementStatus } from "../../domain/market-settlement.ts";

export type RegulationScoreCandidate = Readonly<{
  fixtureId: number;
  providerStatus: "FT" | "AET" | "PEN";
  sourceField: "score.fulltime";
  period: "regulation-including-stoppage-time";
  home: number;
  away: number;
}>;
export type NormalizationContext = Readonly<{
  retrievedAt: UtcInstant;
  endpoint: string;
  verifyLogo?: (url: string) => boolean;
  verifyRegulationScore?: (candidate: RegulationScoreCandidate) => boolean;
}>;
export type SourceTimestamps = Readonly<{
  provider: "api-football";
  endpoint: string;
  retrievedAt: UtcInstant;
  providerUpdatedAt: UtcInstant | null;
}>;
export type NormalizationResult<Data> =
  | Readonly<{ valid: true; data: Data; missingCoverage: readonly string[] }>
  | Readonly<{ valid: false; reason: "schema-error" }>;
export type ProviderLogo = Readonly<{
  url: string | null;
  rights: "approved" | "review-required" | "unavailable";
}>;
export type NormalizedTeam = Readonly<{
  id: number;
  name: string | null;
  code: string | null;
  country: string | null;
  national: boolean | null;
  logo: ProviderLogo;
  source: SourceTimestamps;
}>;
export type CompetitionSeason = Readonly<{
  year: number;
  current: boolean | null;
  coverage: Readonly<Record<string, boolean | null>>;
}>;
export type NormalizedCompetition = Readonly<{
  id: number;
  name: string | null;
  country: string | null;
  type: string | null;
  season: number | null;
  round: string | null;
  seasons: readonly CompetitionSeason[];
  logo: ProviderLogo;
  source: SourceTimestamps;
}>;
export type ScorePair = Readonly<{ home: number | null; away: number | null }>;
export type NormalizedFixture = Readonly<{
  id: number;
  homeTeam: NormalizedTeam;
  awayTeam: NormalizedTeam;
  competition: NormalizedCompetition;
  kickoff: UtcInstant | null;
  status: SettlementStatus;
  providerStatus: string | null;
  elapsedMinutes: number | null;
  regulationScore: (RegulationScoreCandidate & Readonly<{ verified: boolean }>) | null;
  reportedGoals: ScorePair;
  extraTimeScore: ScorePair;
  penaltyScore: ScorePair;
  source: SourceTimestamps;
}>;
export type NormalizedStatistic = Readonly<{
  providerType: string;
  metric: string | null;
  value: number | string | null;
  unit: "count" | "percent" | null;
  supported: boolean;
}>;
export type NormalizedStatistics = Readonly<{
  team: NormalizedTeam;
  statistics: readonly NormalizedStatistic[];
  source: SourceTimestamps;
}>;
export type NormalizedPlayerStatistics = Readonly<{
  player: Readonly<{
    id: number;
    name: string | null;
    firstName: string | null;
    lastName: string | null;
    nationality: string | null;
    age: number | null;
    photo: ProviderLogo;
  }>;
  /** Reported team/competition/season aggregates; never a fixture result. */
  statistics: readonly Readonly<{
    team: NormalizedTeam;
    competition: NormalizedCompetition;
    games: Readonly<{ appearances: number | null; minutes: number | null }>;
    goals: Readonly<{ total: number | null; assists: number | null }>;
  }>[];
  source: SourceTimestamps;
}>;
export type LineupPlayer = Readonly<{
  id: number;
  name: string | null;
  number: number | null;
  position: string | null;
  grid: string | null;
}>;
export type NormalizedAvailability = Readonly<{
  kind: "lineups" | "injuries";
  team: NormalizedTeam;
  fixtureId: number | null;
  formation: string | null;
  startingPlayers: readonly LineupPlayer[];
  substitutes: readonly LineupPlayer[];
  reportedInjury: Readonly<{ playerId: number; name: string | null; type: string | null; reason: string | null }> | null;
  /** An observation never asserts that absent players are healthy or available. */
  fitnessConclusion: "unknown";
  source: SourceTimestamps;
}>;
export type NormalizedFallbackPrediction = Readonly<{
  purpose: "fallback-only";
  homeTeam: NormalizedTeam;
  awayTeam: NormalizedTeam;
  winner: Readonly<{ teamId: number | null; name: string | null; comment: string | null }>;
  winOrDraw: boolean | null;
  underOver: string | null;
  goals: Readonly<{ home: string | null; away: string | null }>;
  advice: string | null;
  /** Provider percentages, in 0..100 units; not validated market probabilities. */
  reportedPercentages: Readonly<{ home: number | null; draw: number | null; away: number | null }>;
  source: SourceTimestamps;
}>;
/** Internal diagnostics only; account holder names, email and credentials are discarded. */
export type NormalizedAccountStatus = Readonly<{
  subscription: Readonly<{ plan: string | null; expiresAt: UtcInstant | null; active: boolean | null }>;
  requests: Readonly<{ current: number | null; dailyLimit: number | null }>;
  source: SourceTimestamps;
}>;

const identity = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const text = z.string().max(512).nullable().optional();
const longText = z.string().max(2_048).nullable().optional();
const optionalBoolean = z.boolean().nullable().optional();
const goal = z.number().int().nonnegative().max(1_000).nullable().optional();
const seasonYear = z.number().int().min(1).max(9_999);
const pairSchema = z.object({ home: goal, away: goal });
const teamSchema = z.object({
  id: identity, name: text, code: text, country: text, national: optionalBoolean, logo: longText,
});
const leagueSchema = z.object({
  id: identity, name: text, country: text, type: text, season: seasonYear.nullable().optional(),
  round: text, logo: longText,
});
const coverageSchema = z.object({
  fixtures: z.object({ events: optionalBoolean, lineups: optionalBoolean,
    statistics_fixtures: optionalBoolean, statistics_players: optionalBoolean }).nullable().optional(),
  standings: optionalBoolean, players: optionalBoolean, top_scorers: optionalBoolean,
  top_assists: optionalBoolean, top_cards: optionalBoolean, injuries: optionalBoolean,
  predictions: optionalBoolean, odds: optionalBoolean,
});
const seasonSchema = z.object({
  year: seasonYear, current: optionalBoolean, coverage: coverageSchema.nullable().optional(),
});
const teamEnvelopeSchema = z.object({ team: teamSchema });
const competitionEnvelopeSchema = z.object({
  league: leagueSchema, country: z.object({ name: text }).nullable().optional(),
  seasons: z.array(seasonSchema).max(200).nullable().optional(),
});
const fixtureSchema = z.object({
  fixture: z.object({
    id: identity, date: text, timestamp: z.number().int().nonnegative().max(253_402_300_799).nullable().optional(),
    timezone: text, status: z.object({ short: text, elapsed: goal }).nullable().optional(),
  }),
  league: leagueSchema,
  teams: z.object({ home: teamSchema, away: teamSchema }),
  goals: pairSchema.nullable().optional(),
  score: z.object({ fulltime: pairSchema.nullable().optional(), extratime: pairSchema.nullable().optional(),
    penalty: pairSchema.nullable().optional() }).nullable().optional(),
});
const playerSchema = z.object({ player: z.object({
  id: identity, name: text, number: goal, pos: text, grid: text,
}) });
const lineupSchema = z.object({
  team: teamSchema, formation: text, startXI: z.array(playerSchema).max(100).nullable().optional(),
  substitutes: z.array(playerSchema).max(100).nullable().optional(),
});
const injurySchema = z.object({
  team: teamSchema, player: z.object({ id: identity, name: text, type: text, reason: longText }),
  fixture: z.object({ id: identity }),
});
const statisticsSchema = z.object({
  team: teamSchema,
  statistics: z.array(z.object({ type: z.string().min(1).max(128),
    value: z.union([z.number().finite(), z.string().max(128), z.null()]) })).max(100),
});
const aggregateCount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().optional();
const accountStatusSchema = z.object({
  subscription: z.object({ plan: text, end: text, active: optionalBoolean }).nullable().optional(),
  requests: z.object({ current: aggregateCount, limit_day: aggregateCount }).nullable().optional(),
});
const playerStatisticsSchema = z.object({
  player: z.object({
    id: identity, name: text, firstname: text, lastname: text, nationality: text,
    age: z.number().int().nonnegative().max(150).nullable().optional(), photo: longText,
  }),
  statistics: z.array(z.object({
    team: teamSchema, league: leagueSchema,
    games: z.object({ appearences: aggregateCount, minutes: aggregateCount }).nullable().optional(),
    goals: z.object({ total: aggregateCount, assists: aggregateCount }).nullable().optional(),
  })).max(100),
});
const predictionsSchema = z.object({
  teams: z.object({ home: teamSchema, away: teamSchema }),
  predictions: z.object({
    winner: z.object({ id: identity.nullable().optional(), name: text, comment: text }).nullable().optional(),
    win_or_draw: optionalBoolean, under_over: text,
    goals: z.object({ home: text, away: text }).nullable().optional(), advice: longText,
    percent: z.object({ home: text, draw: text, away: text }).nullable().optional(),
  }),
});
const statusMap: Readonly<Record<string, SettlementStatus>> = Object.freeze({
  TBD: "scheduled", NS: "scheduled", "1H": "live", HT: "live", "2H": "live", ET: "live",
  BT: "live", P: "live", INT: "live", SUSP: "live", LIVE: "live", FT: "finished-regulation",
  AET: "finished-extra-time", PEN: "finished-penalties", PST: "postponed", CANC: "canceled",
  ABD: "abandoned", AWD: "awarded", WO: "awarded",
});
const countStatistics: Readonly<Record<string, string>> = Object.freeze({
  "Shots on Goal": "shots-on-goal", "Shots off Goal": "shots-off-goal", "Total Shots": "total-shots",
  "Blocked Shots": "blocked-shots", "Shots insidebox": "shots-inside-box", "Shots outsidebox": "shots-outside-box",
  Fouls: "fouls", "Corner Kicks": "corners", Offsides: "offsides", "Yellow Cards": "yellow-cards",
  "Red Cards": "red-cards", "Goalkeeper Saves": "goalkeeper-saves", "Total passes": "total-passes",
  "Passes accurate": "accurate-passes",
});
const percentageStatistics: Readonly<Record<string, string>> = Object.freeze({
  "Ball Possession": "possession", "Passes %": "pass-accuracy",
});

function freeze<Data>(value: Data): Data {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
const invalid = (): NormalizationResult<never> => Object.freeze({ valid: false, reason: "schema-error" });
function valid<Data>(data: Data, missing: string[]): NormalizationResult<Data> {
  return freeze({ valid: true as const, data, missingCoverage: [...new Set(missing)].sort() });
}
function contextValid(context: NormalizationContext): boolean {
  return Number.isSafeInteger(context?.retrievedAt) && context.retrievedAt >= 0 &&
    context.retrievedAt <= 253_402_300_799_999 && typeof context.endpoint === "string" &&
    /^\/[a-z]+(?:\/[a-z]+)?$/.test(context.endpoint);
}
function source(context: NormalizationContext, missing: string[]): SourceTimestamps {
  // The direct v3 contracts do not identify an entity update time. Kickoff timestamps
  // and cache retrieval times must never substitute for that absent field.
  missing.push("provider-update-time");
  return { provider: "api-football", endpoint: context.endpoint, retrievedAt: context.retrievedAt, providerUpdatedAt: null };
}
function nullableText(value: string | null | undefined, field: string, missing: string[]): string | null {
  if (value === null || value === undefined || value.trim() === "") { missing.push(field); return null; }
  return value;
}
function approvedLogo(raw: string | null | undefined, context: NormalizationContext, field: string, missing: string[]): ProviderLogo {
  if (!raw) { missing.push(field); return { url: null, rights: "unavailable" }; }
  let approved = false;
  try {
    approved = isSafeRemoteImageUrl(raw) && context.verifyLogo?.(raw) === true;
  } catch { /* Invalid URLs and rights verifier failures retain no URL. */ }
  if (!approved) missing.push(`${field}-rights-review`);
  return { url: approved ? raw : null, rights: approved ? "approved" : "review-required" };
}
function team(raw: z.infer<typeof teamSchema>, context: NormalizationContext, missing: string[], prefix = "team"): NormalizedTeam {
  if (raw.code == null) missing.push(`${prefix}-code`);
  if (raw.country == null) missing.push(`${prefix}-country`);
  if (raw.national == null) missing.push(`${prefix}-national`);
  return { id: raw.id, name: nullableText(raw.name, `${prefix}-name`, missing),
    code: raw.code ?? null, country: raw.country ?? null, national: raw.national ?? null,
    logo: approvedLogo(raw.logo, context, `${prefix}-logo`, missing), source: source(context, missing) };
}
function competition(raw: z.infer<typeof leagueSchema>, context: NormalizationContext, missing: string[]): NormalizedCompetition {
  if (raw.season === null || raw.season === undefined) missing.push("competition-season");
  if (raw.type == null) missing.push("competition-type");
  if (raw.round == null) missing.push("competition-round");
  return { id: raw.id, name: nullableText(raw.name, "competition-name", missing),
    country: nullableText(raw.country, "competition-country", missing), type: raw.type ?? null,
    season: raw.season ?? null, round: raw.round ?? null, seasons: [],
    logo: approvedLogo(raw.logo, context, "competition-logo", missing), source: source(context, missing) };
}
function pair(raw: z.infer<typeof pairSchema> | null | undefined): ScorePair {
  return { home: raw?.home ?? null, away: raw?.away ?? null };
}

/** Strict offset timestamps use the shared calendar parser without Date.parse normalization. */
function subscriptionExpiry(value: string): UtcInstant | false {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;
  const hours = Number(match[4] ?? 0), minutes = Number(match[5] ?? 0);
  if (hours > 14 || minutes > 59 || hours === 14 && minutes !== 0) return false;
  try {
    const wallTime = parseUtcInstant(`${match[1]}Z`);
    const offset = (hours * 60 + minutes) * 60_000 * (match[3] === "-" ? -1 : 1);
    return utcInstantFromEpochMilliseconds(wallTime - offset);
  } catch { return false; }
}

export function normalizeAccountStatus(raw: unknown, context: NormalizationContext): NormalizationResult<NormalizedAccountStatus> {
  if (!contextValid(context)) return invalid();
  const parsed = accountStatusSchema.safeParse(raw);
  if (!parsed.success) return invalid();
  const input = parsed.data, missing: string[] = [];
  const expiry = input.subscription?.end;
  const expiresAt = expiry == null || expiry.trim() === "" ? null : subscriptionExpiry(expiry);
  if (expiresAt === false) return invalid();
  if (expiresAt === null) missing.push("subscription-expiry");
  if (input.subscription?.active == null) missing.push("subscription-active");
  if (input.requests?.current == null) missing.push("account-request-current");
  if (input.requests?.limit_day == null) missing.push("account-request-daily-limit");
  return valid({ subscription: { plan: nullableText(input.subscription?.plan, "subscription-plan", missing),
    expiresAt, active: input.subscription?.active ?? null },
    requests: { current: input.requests?.current ?? null, dailyLimit: input.requests?.limit_day ?? null },
    source: source(context, missing) }, missing);
}

/** Validates both the ISO calendar and its reported IANA timezone wall time. */
function kickoff(raw: z.infer<typeof fixtureSchema>["fixture"], missing: string[]): UtcInstant | null | false {
  if (!raw.date) { missing.push("kickoff-date"); return null; }
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(raw.date);
  if (!parts) return false;
  const wall = [Number(parts[1]), Number(parts[2]), Number(parts[3]), Number(parts[4]), Number(parts[5]), Number(parts[6])];
  const [year = 0, month = 0, day = 0, hour = 0, minute = 0, second = 0] = wall;
  if (year < 1 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return false;
  const checked = new Date(0);
  checked.setUTCFullYear(year, month - 1, day);
  checked.setUTCHours(hour, minute, second, 0);
  if (checked.getUTCMonth() !== month - 1 || checked.getUTCDate() !== day) return false;
  const suffix = parts[8] ?? "";
  if (suffix !== "Z" && (Number(suffix.slice(1, 3)) > 14 || Number(suffix.slice(4, 6)) > 59 ||
      (Number(suffix.slice(1, 3)) === 14 && Number(suffix.slice(4, 6)) !== 0))) return false;
  const value = Date.parse(raw.date);
  if (!Number.isSafeInteger(value) || value < 0) return false;
  if (raw.timestamp === undefined || raw.timestamp === null) missing.push("kickoff-timestamp");
  else if (raw.timestamp !== Math.floor(value / 1_000)) return false;
  if (!raw.timezone) { missing.push("kickoff-timezone"); }
  else {
    try {
      const reported = new Intl.DateTimeFormat("en-GB", { timeZone: raw.timezone, year: "numeric", month: "2-digit",
        day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(value);
      const names = ["year", "month", "day", "hour", "minute", "second"];
      if (names.some((name, index) => Number(reported.find((part) => part.type === name)?.value) !== wall[index])) return false;
    } catch { return false; }
  }
  return utcInstantFromEpochMilliseconds(value);
}

export function normalizeFixture(raw: unknown, context: NormalizationContext): NormalizationResult<NormalizedFixture> {
  if (!contextValid(context)) return invalid();
  const parsed = fixtureSchema.safeParse(raw);
  if (!parsed.success) return invalid();
  const input = parsed.data;
  if (input.teams.home.id === input.teams.away.id) return invalid();
  const missing: string[] = [];
  const instant = kickoff(input.fixture, missing);
  if (instant === false) return invalid();
  const providerStatus = input.fixture.status?.short ?? null;
  const status = providerStatus === null ? "unknown" : statusMap[providerStatus] ?? "unknown";
  if (status === "unknown") missing.push("fixture-status");
  if (input.fixture.status?.elapsed == null) missing.push("fixture-elapsed-minutes");
  const fulltime = pair(input.score?.fulltime);
  let regulationScore: NormalizedFixture["regulationScore"] = null;
  if ((providerStatus === "FT" || providerStatus === "AET" || providerStatus === "PEN") &&
      fulltime.home !== null && fulltime.away !== null) {
    if (providerStatus === "FT" && ((input.goals?.home != null && input.goals.home !== fulltime.home) ||
        (input.goals?.away != null && input.goals.away !== fulltime.away))) return invalid();
    const candidate: RegulationScoreCandidate = freeze({ fixtureId: input.fixture.id, providerStatus,
      sourceField: "score.fulltime", period: "regulation-including-stoppage-time", home: fulltime.home, away: fulltime.away });
    let verified = false;
    try { verified = context.verifyRegulationScore?.(candidate) === true; } catch { /* Unverified is safe. */ }
    regulationScore = { ...candidate, verified };
    if (!verified) missing.push("regulation-score-verification");
  } else missing.push("regulation-score");
  return valid({ id: input.fixture.id, homeTeam: team(input.teams.home, context, missing, "home-team"),
    awayTeam: team(input.teams.away, context, missing, "away-team"), competition: competition(input.league, context, missing),
    kickoff: instant, status, providerStatus, elapsedMinutes: input.fixture.status?.elapsed ?? null,
    regulationScore, reportedGoals: pair(input.goals), extraTimeScore: pair(input.score?.extratime),
    penaltyScore: pair(input.score?.penalty), source: source(context, missing) }, missing);
}

export function normalizeTeam(raw: unknown, context: NormalizationContext): NormalizationResult<NormalizedTeam> {
  if (!contextValid(context)) return invalid();
  const wrapped = raw !== null && typeof raw === "object" && Object.hasOwn(raw, "team");
  const parsed = wrapped ? teamEnvelopeSchema.safeParse(raw) : teamSchema.safeParse(raw);
  if (!parsed.success) return invalid();
  const input = "team" in parsed.data ? parsed.data.team : parsed.data;
  const missing: string[] = [];
  return valid(team(input, context, missing), missing);
}

export function normalizeCompetition(raw: unknown, context: NormalizationContext): NormalizationResult<NormalizedCompetition> {
  if (!contextValid(context)) return invalid();
  const parsed = competitionEnvelopeSchema.safeParse(raw);
  if (!parsed.success) return invalid();
  const missing: string[] = [];
  const input = parsed.data;
  const data = competition({ ...input.league, country: input.country?.name ?? input.league.country ?? null }, context, missing);
  const seasons = (input.seasons ?? []).map((entry) => {
    const coverage = entry.coverage;
    if (!coverage) missing.push(`competition-${entry.year}-coverage`);
    const flattened: Record<string, boolean | null> = {};
    for (const key of ["events", "lineups", "statistics_fixtures", "statistics_players"] as const) {
      flattened[`fixtures.${key}`] = coverage?.fixtures?.[key] ?? null;
    }
    for (const key of ["standings", "players", "top_scorers", "top_assists", "top_cards", "injuries", "predictions", "odds"] as const) {
      flattened[key] = coverage?.[key] ?? null;
    }
    for (const [key, value] of Object.entries(flattened)) if (value === null) missing.push(`competition-${entry.year}-${key}-coverage`);
    return { year: entry.year, current: entry.current ?? null, coverage: flattened };
  });
  if (seasons.length === 0) missing.push("competition-seasons");
  if (new Set(seasons.map((entry) => entry.year)).size !== seasons.length) return invalid();
  return valid({ ...data, seasons }, missing);
}

function percent(value: string | null | undefined): number | null | false {
  if (value === undefined || value === null) return null;
  if (!/^(?:\d{1,3})(?:\.\d{1,6})?%$/.test(value)) return false;
  const number = Number(value.slice(0, -1));
  return number >= 0 && number <= 100 ? number : false;
}
export function normalizeStatistics(raw: unknown, context: NormalizationContext): NormalizationResult<NormalizedStatistics> {
  if (!contextValid(context)) return invalid();
  const parsed = statisticsSchema.safeParse(raw);
  if (!parsed.success) return invalid();
  const missing: string[] = [];
  const statistics: NormalizedStatistic[] = [];
  const names = new Set<string>();
  for (const statistic of parsed.data.statistics) {
    if (names.has(statistic.type)) return invalid();
    names.add(statistic.type);
    const count = countStatistics[statistic.type];
    const percentage = percentageStatistics[statistic.type];
    if (count) {
      if (statistic.value !== null && (typeof statistic.value !== "number" || !Number.isSafeInteger(statistic.value) || statistic.value < 0)) return invalid();
      statistics.push({ providerType: statistic.type, metric: count, value: statistic.value, unit: "count", supported: true });
    } else if (percentage) {
      const number = statistic.value === null ? null : typeof statistic.value === "string" ? percent(statistic.value) : false;
      if (number === false) return invalid();
      statistics.push({ providerType: statistic.type, metric: percentage, value: number, unit: "percent", supported: true });
    } else {
      missing.push(`unsupported-statistic:${statistic.type}`);
      statistics.push({ providerType: statistic.type, metric: null, value: statistic.value, unit: null, supported: false });
    }
    if (statistic.value === null) missing.push(`statistic-value:${statistic.type}`);
  }
  if (statistics.length === 0) missing.push("fixture-statistics");
  return valid({ team: team(parsed.data.team, context, missing), statistics, source: source(context, missing) }, missing);
}

export function normalizePlayerStatistics(raw: unknown, context: NormalizationContext): NormalizationResult<NormalizedPlayerStatistics> {
  if (!contextValid(context)) return invalid();
  const parsed = playerStatisticsSchema.safeParse(raw);
  if (!parsed.success) return invalid();
  const input = parsed.data;
  const missing: string[] = [];
  if (input.player.age == null) missing.push("player-age");
  if (input.statistics.length === 0) missing.push("player-statistics");
  const statistics = input.statistics.map((entry) => {
    const prefix = `player-statistics-${entry.team.id}-${entry.league.id}-${entry.league.season ?? "unknown-season"}`;
    if (entry.games?.appearences == null) missing.push(`${prefix}-appearances`);
    if (entry.games?.minutes == null) missing.push(`${prefix}-minutes`);
    if (entry.goals?.total == null) missing.push(`${prefix}-goals`);
    if (entry.goals?.assists == null) missing.push(`${prefix}-assists`);
    return { team: team(entry.team, context, missing), competition: competition(entry.league, context, missing),
      games: { appearances: entry.games?.appearences ?? null, minutes: entry.games?.minutes ?? null },
      goals: { total: entry.goals?.total ?? null, assists: entry.goals?.assists ?? null } };
  });
  return valid({ player: { id: input.player.id, name: nullableText(input.player.name, "player-name", missing),
    firstName: nullableText(input.player.firstname, "player-first-name", missing),
    lastName: nullableText(input.player.lastname, "player-last-name", missing),
    nationality: nullableText(input.player.nationality, "player-nationality", missing), age: input.player.age ?? null,
    photo: approvedLogo(input.player.photo, context, "player-photo", missing) },
    statistics, source: source(context, missing) }, missing);
}

function players(raw: z.infer<typeof playerSchema>[] | null | undefined): LineupPlayer[] {
  return (raw ?? []).map(({ player }) => ({ id: player.id, name: player.name ?? null,
    number: player.number ?? null, position: player.pos ?? null, grid: player.grid ?? null }));
}
export function normalizeAvailability(raw: unknown, kind: "lineups" | "injuries", context: NormalizationContext): NormalizationResult<NormalizedAvailability> {
  if (!contextValid(context)) return invalid();
  const missing: string[] = [];
  if (kind === "lineups") {
    const parsed = lineupSchema.safeParse(raw);
    if (!parsed.success) return invalid();
    const input = parsed.data;
    const startingPlayers = players(input.startXI);
    const substitutes = players(input.substitutes);
    if (new Set([...startingPlayers, ...substitutes].map((entry) => entry.id)).size !== startingPlayers.length + substitutes.length) return invalid();
    if (startingPlayers.length === 0) missing.push("starting-lineup");
    else if (startingPlayers.length < 11) missing.push("starting-lineup-incomplete");
    if (!input.substitutes) missing.push("substitutes");
    if (input.formation == null) missing.push("lineup-formation");
    for (const player of [...startingPlayers, ...substitutes]) {
      if (player.name == null) missing.push(`lineup-player-${player.id}-name`);
      if (player.position == null) missing.push(`lineup-player-${player.id}-position`);
    }
    return valid({ kind, team: team(input.team, context, missing), fixtureId: null,
      formation: input.formation ?? null, startingPlayers, substitutes, reportedInjury: null,
      fitnessConclusion: "unknown", source: source(context, missing) }, missing);
  }
  if (kind !== "injuries") return invalid();
  const parsed = injurySchema.safeParse(raw);
  if (!parsed.success) return invalid();
  const input = parsed.data;
  return valid({ kind, team: team(input.team, context, missing), fixtureId: input.fixture.id,
    formation: null, startingPlayers: [], substitutes: [], reportedInjury: { playerId: input.player.id,
      name: nullableText(input.player.name, "injured-player-name", missing),
      type: nullableText(input.player.type, "injury-type", missing), reason: nullableText(input.player.reason, "injury-reason", missing) },
    fitnessConclusion: "unknown", source: source(context, missing) }, missing);
}

export function normalizeFallbackPrediction(raw: unknown, context: NormalizationContext): NormalizationResult<NormalizedFallbackPrediction> {
  if (!contextValid(context)) return invalid();
  const parsed = predictionsSchema.safeParse(raw);
  if (!parsed.success || parsed.data.teams.home.id === parsed.data.teams.away.id) return invalid();
  const missing: string[] = ["market-probabilities-unverified", "prediction-field-coverage-unverified"];
  const input = parsed.data;
  const prediction = input.predictions;
  const home = percent(prediction.percent?.home);
  const draw = percent(prediction.percent?.draw);
  const away = percent(prediction.percent?.away);
  if (home === false || draw === false || away === false) return invalid();
  if (home === null || draw === null || away === null) missing.push("prediction-percentages");
  if (prediction.winner?.id != null && prediction.winner.id !== input.teams.home.id && prediction.winner.id !== input.teams.away.id) return invalid();
  return valid({ purpose: "fallback-only", homeTeam: team(input.teams.home, context, missing, "home-team"),
    awayTeam: team(input.teams.away, context, missing, "away-team"),
    winner: { teamId: prediction.winner?.id ?? null, name: prediction.winner?.name ?? null, comment: prediction.winner?.comment ?? null },
    winOrDraw: prediction.win_or_draw ?? null, underOver: prediction.under_over ?? null,
    goals: { home: prediction.goals?.home ?? null, away: prediction.goals?.away ?? null }, advice: prediction.advice ?? null,
    reportedPercentages: { home, draw, away }, source: source(context, missing) }, missing);
}
