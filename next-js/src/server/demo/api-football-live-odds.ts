import "server-only";

import type { ApiFootballDemoFixture } from "./api-football.ts";
import { demoHash } from "./api-football-catalog.ts";

/** Live market IDs belong to /odds/live/bets, independently of pre-match IDs.
 * Field names, labels and IDs follow the official v3 response examples:
 * https://api-sports.io/documentation/football/v3/index#tag/Odds-(In-Play) */
export const demoLiveOddsBets = Object.freeze([
  { id: 1, name: "Over/Under Extra Time" }, { id: 2, name: "1x2 Extra Time" },
  { id: 9, name: "Both Teams To Score (ET)" }, { id: 11, name: "Asian Handicap Extra Time" },
  { id: 20, name: "Match Corners" }, { id: 33, name: "Asian Handicap" }, { id: 36, name: "Over/Under Line" },
  { id: 39, name: "Away Team Goals" }, { id: 58, name: "Home Team Goals" }, { id: 59, name: "Fulltime Result" },
  { id: 68, name: "Correct Score" }, { id: 69, name: "Both Teams to Score" }, { id: 72, name: "Double Chance" },
].map((row) => Object.freeze(row)));

type GoalModel = Readonly<{ homeGoals: number; awayGoals: number }>;
type GoalProbabilities = Readonly<{ home: number; draw: number; away: number; btts: number;
  over(line: number): number; exact(home: number, away: number): number }>;
export type DemoScoreProbabilityFactory = (homeMean: number, awayMean: number, homeOffset?: number, awayOffset?: number) => GoalProbabilities;
type TeamStatistics = readonly Readonly<{ team: Readonly<{ id: number }>;
  statistics: readonly Readonly<{ type: string; value: number | string | null }>[] }>[];
type LiveValue = { value: string; odd: string; handicap: string | null; main: boolean | null; suspended: boolean };
type LiveBet = { id: number; name: string; values: LiveValue[] };
export type DemoLiveFixtureOdds = {
  fixture: { id: number; status: { long: string; elapsed: number; seconds: string } };
  league: { id: number; season: number };
  teams: { home: { id: number; goals: number }; away: { id: number; goals: number } };
  status: { stopped: boolean; blocked: boolean; finished: boolean };
  update: string; odds: LiveBet[];
};

const minuteMs = 60_000, updateMs = 5000;
const excluded = new Set(["TBD", "PST", "CANC", "ABD", "AWD", "WO"]);
const finished = new Set(["FT", "AET", "PEN"]);
const extraTime = new Set(["ET", "BT", "P", "AET", "PEN"]);

/** The upstream feed starts 5–15 minutes before kickoff, disappears 5–20
 * minutes after the final whistle, and has no historical archive. */
export function demoLiveOddsAvailable(fixture: ApiFootballDemoFixture, nowMs: number): boolean {
  if (!Number.isFinite(nowMs) || excluded.has(fixture.fixture.status.short)) return false;
  const kickoff = fixture.fixture.timestamp * 1000, id = fixture.fixture.id;
  if (nowMs < kickoff - (5 + demoHash(id, 991) % 11) * minuteMs) return false;
  // A stale caller snapshot cannot turn this finite synthetic match into history.
  if (nowMs >= kickoff + 175 * minuteMs) return false;
  if (!finished.has(fixture.fixture.status.short)) return true;
  const endMinute = fixture.fixture.status.short === "PEN" ? 155 : fixture.fixture.status.short === "AET" ? 145 : 110;
  return nowMs < kickoff + (endMinute + 5 + demoHash(id, 997) % 16) * minuteMs;
}

/** A provider-shaped live snapshot; source/model dependencies are passed by the
 * existing generator so this module has no runtime cycle or second goal model. */
export function demoLiveFixtureOdds(fixture: ApiFootballDemoFixture, model: GoalModel, nowMs: number,
  probabilities: DemoScoreProbabilityFactory, options: Readonly<{ betId?: number; statistics?: TeamStatistics }> = {}): DemoLiveFixtureOdds | null {
  if (!demoLiveOddsAvailable(fixture, nowMs) || !Number.isFinite(model.homeGoals) || !Number.isFinite(model.awayGoals)
    || model.homeGoals < 0 || model.awayGoals < 0) return null;
  const id = fixture.fixture.id, code = fixture.fixture.status.short, tick = Math.floor(nowMs / updateMs) * updateMs;
  const elapsed = fixture.fixture.status.elapsed ?? 0, beforeKickoff = nowMs < fixture.fixture.timestamp * 1000;
  const inactiveClock = beforeKickoff || finished.has(code) || ["HT", "BT", "P", "SUSP", "INT"].includes(code);
  const second = inactiveClock ? 0 : Math.floor(tick / 1000) % 60, fraction = elapsed + second / 60;
  const stopped = ["SUSP", "INT"].includes(code), hasFinished = beforeKickoff || finished.has(code);
  const blocked = hasFinished || stopped || code === "P" || demoHash(id, Math.floor(tick / updateMs)) % 29 === 0;
  const globalSuspended = blocked || stopped || hasFinished;
  const observedHome = fixture.goals.home ?? 0, observedAway = fixture.goals.away ?? 0;
  const regulationClosed = extraTime.has(code) || finished.has(code);
  const home = extraTime.has(code) ? fixture.score.fulltime.home ?? observedHome : observedHome;
  const away = extraTime.has(code) ? fixture.score.fulltime.away ?? observedAway : observedAway;
  const regulationMinutesLeft = code === "2H" && elapsed >= 90
    ? Math.max(0, 6 - (fixture.fixture.status.extra ?? 1) - second / 60)
    : Math.max(0, 90 - Math.min(90, fraction));
  const remaining = regulationClosed ? 0 : regulationMinutesLeft / 90;
  const full = probabilities(model.homeGoals * remaining, model.awayGoals * remaining, home, away);
  const odds: LiveBet[] = [], margin = 1.035 + demoHash(id, 89) % 4 * .005;
  const price = (probability: number, alternate = false) => Math.min(1000, Math.max(1.01,
    1 / Math.max(.0001, probability * (margin + (alternate ? .018 : 0))))).toFixed(3).replace(/0+$/u, "").replace(/\.$/u, "");
  const value = (label: string, chance: number, handicap: string | null = null, main: boolean | null = null,
    suspended = false, alternate = false): LiveValue => ({ value: label, odd: price(chance, alternate), handicap, main,
    suspended: globalSuspended || suspended });
  const add = (betId: number, values: LiveValue[]) => {
    if (options.betId === undefined || options.betId === betId) odds.push({ id: betId,
      name: demoLiveOddsBets.find((row) => row.id === betId)!.name, values });
  };
  const winner = (p: GoalProbabilities, suspended: boolean) => [value("Home", p.home, null, null, suspended),
    value("Draw", p.draw, null, null, suspended), value("Away", p.away, null, null, suspended)];
  const asian = (p: GoalProbabilities, suspended: boolean) => [
    value("Home", p.home, "-0.5", false, suspended), value("Away", p.draw + p.away, "0.5", false, suspended),
    value("Home", p.home + p.draw, "0.5", false, suspended), value("Away", p.away, "-0.5", false, suspended),
    value("Home", p.home / Math.max(.0001, p.home + p.away), "0", false, suspended),
    value("Away", p.away / Math.max(.0001, p.home + p.away), "0", false, suspended),
  ];
  const totals = (p: GoalProbabilities, current: number, expected: number, suspended: boolean, duplicate = false) => {
    const mainLine = current + Math.max(.5, Math.round(expected * 2) / 2);
    const lines = [...new Set([.5, 1.5, 2.5, 3.5, 4.5, current + .5, current + 1.5, mainLine])].sort((a, b) => a - b);
    return lines.flatMap((line) => {
      const over = p.over(line), under = 1 - p.over(Math.ceil(line) - 1), active = Math.max(.0001, over + under);
      const closed = suspended || over < 1e-12 || under < 1e-12, primary = duplicate && line === mainLine ? true : null;
      const rows = [value("Over", over / active, String(line), primary, closed), value("Under", under / active, String(line), primary, closed)];
      if (primary) rows.push(value("Over", over / active, String(line), false, closed, true),
        value("Under", under / active, String(line), false, closed, true));
      return rows;
    });
  };

  add(59, winner(full, regulationClosed));
  add(72, [value("Home or Draw", full.home + full.draw, null, null, regulationClosed),
    value("Away or Draw", full.away + full.draw, null, null, regulationClosed),
    value("Home or Away", full.home + full.away, null, null, regulationClosed)]);
  add(69, [value("Yes", full.btts, null, null, regulationClosed || home > 0 && away > 0),
    value("No", 1 - full.btts, null, null, regulationClosed || home > 0 && away > 0)]);
  add(36, totals(full, home + away, (model.homeGoals + model.awayGoals) * remaining, regulationClosed, true));
  add(33, asian(full, regulationClosed));
  add(58, totals(probabilities(model.homeGoals * remaining, 0, home, 0), home, model.homeGoals * remaining, regulationClosed));
  add(39, totals(probabilities(0, model.awayGoals * remaining, 0, away), away, model.awayGoals * remaining, regulationClosed));
  add(68, Array.from({ length: 25 }, (_, index) => {
    const h = Math.max(0, home - 1) + Math.floor(index / 5), a = Math.max(0, away - 1) + index % 5;
    return value(`${h}-${a}`, full.exact(h, a), null, null, regulationClosed || h < home || a < away);
  }));
  if (!extraTime.has(code)) {
    const corners = (options.statistics ?? []).reduce((total, row) => {
      const count = row.statistics.find((statistic) => statistic.type === "Corner Kicks")?.value;
      return total + (typeof count === "number" && Number.isSafeInteger(count) && count >= 0 ? count : 0);
    }, 0);
    const cornersModel = probabilities(9 * remaining, 0, corners, 0), line = corners + Math.max(1, Math.round(9 * remaining));
    const over = cornersModel.over(line), exact = cornersModel.exact(line, 0), under = 1 - over - exact;
    add(20, [value("Over", over, String(line), null, regulationClosed), value("Exactly", exact, String(line), null, regulationClosed),
      value("Under", Math.max(0, under), String(line), null, regulationClosed)]);
  }
  if (extraTime.has(code)) {
    const extraHome = Math.max(0, observedHome - home), extraAway = Math.max(0, observedAway - away);
    const extraRemaining = Math.max(0, 120 - Math.max(90, fraction)) / 90;
    const p = probabilities(model.homeGoals * extraRemaining, model.awayGoals * extraRemaining, extraHome, extraAway);
    const closed = elapsed >= 120;
    add(2, winner(p, closed));
    add(1, totals(p, extraHome + extraAway, (model.homeGoals + model.awayGoals) * extraRemaining, closed));
    add(9, [value("Yes", p.btts, null, null, closed || extraHome > 0 && extraAway > 0),
      value("No", 1 - p.btts, null, null, closed || extraHome > 0 && extraAway > 0)]);
    add(11, asian(p, closed));
  }
  if (!odds.length) return null;
  return { fixture: { id, status: { long: fixture.fixture.status.long, elapsed,
    seconds: `${String(elapsed).padStart(2, "0")}:${String(second).padStart(2, "0")}` } },
    league: { id: fixture.league.id, season: fixture.league.season },
    teams: { home: { id: fixture.teams.home.id, goals: observedHome }, away: { id: fixture.teams.away.id, goals: observedAway } },
    status: { stopped, blocked, finished: hasFinished }, update: new Date(tick).toISOString().replace(".000Z", "+00:00"), odds };
}
