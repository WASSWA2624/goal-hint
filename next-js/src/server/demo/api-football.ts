import "server-only";

import { demoLiveFixtureOdds, demoLiveOddsAvailable, demoLiveOddsBets } from "./api-football-live-odds.ts";

import { DEMO_START_DATE, DEMO_END_DATE, DEMO_MATCHES_PER_DAY, DEMO_DAY_MS, DEMO_START_MS, DEMO_DAYS,
  DEMO_FIXTURE_ID_BASE, demoFootballCatalog, demoLeagueById, demoTeamById, demoCountryFlag,
  demoRawTeam, demoRawLeague, demoDateIndex, demoDateAt, demoFixtureCoordinates, demoFixtureTeams, demoHash,
  type DemoTeam, type DemoLeague } from "./api-football-catalog.ts";
export { DEMO_START_DATE, DEMO_END_DATE, DEMO_MATCHES_PER_DAY, DEMO_DAYS, demoFootballCatalog,
  demoDateIndex, demoDateAt, demoFixtureCoordinates, demoFixtureTeams, demoLeagueById, demoTeamById };

type Parameters = Readonly<Record<string, string>>;
type Pair = { home: number | null; away: number | null };
export type ApiFootballDemoFixture = {
  fixture: { id: number; referee: string | null; timezone: string; date: string; timestamp: number;
    periods: { first: number | null; second: number | null };
    venue: { id: number; name: string; city: string };
    status: { long: string; short: string; elapsed: number | null; extra: number | null } };
  league: ReturnType<typeof demoRawLeague> & { round: string; standings: boolean };
  teams: { home: ReturnType<typeof demoRawTeam> & { winner: boolean | null };
    away: ReturnType<typeof demoRawTeam> & { winner: boolean | null } };
  goals: Pair; score: { halftime: Pair; fulltime: Pair; extratime: Pair; penalty: Pair };
};
export type ApiFootballDemoEnvelope = { get: string; parameters: Parameters | readonly []; errors: readonly unknown[] | Record<string, string>;
  results: number; paging?: { current: number; total: number }; response: unknown };
type DemoPlayer = ReturnType<typeof demoPlayer>;
const nullPair = (): Pair => ({ home: null, away: null });
const finishedCodes = new Set(["FT", "AET", "PEN", "AWD", "WO"]);
const liveCodes = new Set(["1H", "HT", "2H", "ET", "BT", "P", "INT", "SUSP", "LIVE"]);
const playedCodes = new Set([...finishedCodes, ...liveCodes, "ABD"]);
const longStatuses: Record<string, string> = { TBD: "Time to be defined", NS: "Not Started", "1H": "First Half",
  HT: "Halftime", "2H": "Second Half", ET: "Extra Time", BT: "Break Time", P: "Penalty In Progress", SUSP: "Match Suspended",
  INT: "Match Interrupted", FT: "Match Finished", AET: "Match Finished After Extra Time", PEN: "Match Finished After Penalty",
  PST: "Match Postponed", CANC: "Match Cancelled", ABD: "Match Abandoned", AWD: "Technical Loss", WO: "WalkOver", LIVE: "In Progress" };
const firstNames = ["James", "Samuel", "Daniel", "David", "Gabriel", "Lucas", "Mateo", "Diego", "Rafael", "Joao",
  "Luca", "Marco", "Hugo", "Louis", "Noah", "Adam", "Yusuf", "Omar", "Ali", "Ibrahim", "Ahmed", "Karim", "Kwame",
  "Kofi", "Tunde", "Chidi", "Musa", "Emmanuel", "Isaac", "Brian", "Dennis", "Patrick", "Joseph", "Allan", "Peter",
  "Kenji", "Haruto", "Minjun", "Jisoo", "Wei", "Jun", "Arjun", "Rohan", "Somchai", "Tariq", "Ethan", "Oliver", "Leo"];
const familyNames = ["Wilson", "Brown", "Taylor", "Silva", "Santos", "Costa", "Garcia", "Martinez", "Lopez", "Fernandez",
  "Rossi", "Romano", "Bianchi", "Martin", "Bernard", "Dubois", "Muller", "Schmidt", "Weber", "Jensen", "Hansen",
  "Andersson", "Kowalski", "Novak", "Petrovic", "Ionescu", "Kovacs", "Demir", "Yilmaz", "Hassan", "Mohamed", "Diallo",
  "Mensah", "Owusu", "Okafor", "Adeyemi", "Dlamini", "Ndlovu", "Otieno", "Kamau", "Kato", "Mugisha", "Okello",
  "Sato", "Suzuki", "Kim", "Park", "Wang", "Zhang", "Singh", "Patel", "Nguyen", "Smith", "Murphy"];
const positions = ["G", "D", "D", "D", "D", "M", "M", "M", "F", "F", "F", "G", "D", "D", "M", "M", "F", "F", "D", "M", "F", "G", "D", "M"];
const formations = ["4-3-3", "4-2-3-1", "4-4-2", "3-5-2", "3-4-3", "4-1-4-1"];
const cupRounds = ["Group Stage - 1", "Round of 32", "Round of 16", "Quarter-finals", "Semi-finals", "Final"];
const fixtureRound = (league: DemoLeague, day: number) => league.type === "Cup"
  ? cupRounds[Math.floor(day / 3) % cupRounds.length]! : `Regular Season - ${Math.floor(day / 3) + 1}`;
const bookmakerRows = [{ id: 8, name: "Bet365" }, { id: 6, name: "Bwin" }, { id: 11, name: "1xBet" },
  { id: 4, name: "Pinnacle" }, { id: 16, name: "Unibet" }];
const fullPosition = (position: string) => ({ G: "Goalkeeper", D: "Defender", M: "Midfielder", F: "Attacker" } as Record<string, string>)[position] ?? "Midfielder";
export const demoOddsBets = Object.freeze([{ id: 1, name: "Match Winner" }, { id: 2, name: "Home/Away" },
  { id: 3, name: "Second Half Winner" }, { id: 4, name: "Asian Handicap" }, { id: 5, name: "Goals Over/Under" },
  { id: 6, name: "Goals Over/Under First Half" }, { id: 7, name: "HT/FT Double" }, { id: 8, name: "Both Teams Score" },
  { id: 9, name: "Handicap Result" }, { id: 10, name: "Exact Score" }, { id: 11, name: "Highest Scoring Half" },
  { id: 12, name: "Double Chance" }, { id: 13, name: "First Half Winner" }, { id: 14, name: "Team To Score First" },
  { id: 15, name: "Team To Score Last" }, { id: 16, name: "Total - Home" }, { id: 17, name: "Total - Away" }]);
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
function zonedDate(timestamp: number, timezone: string): string {
  if (timezone === "UTC") return new Date(timestamp).toISOString().replace(".000Z", "+00:00");
  if (timezone === "Africa/Kampala") return new Date(timestamp + 10_800_000).toISOString().replace(".000Z", "+03:00");
  let formatter = dateFormatters.get(timezone);
  if (!formatter) { formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }); dateFormatters.set(timezone, formatter); }
  const p = Object.fromEntries(formatter.formatToParts(timestamp).map(({ type, value }) => [type, value]));
  const local = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
  const offset = Math.round((Date.parse(`${local}Z`) - timestamp) / 60_000), sign = offset < 0 ? "-" : "+";
  return `${local}${sign}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0")}:${String(Math.abs(offset) % 60).padStart(2, "0")}`;
}
export function demoReportingDate(nowMs = Date.now()): string {
  return new Date(nowMs + 10_800_000).toISOString().slice(0, 10);
}
export function demoPlayer(team: DemoTeam, index: number) {
  const global = (team.id - 800_000) * 32 + index, seed = demoHash(global, 7919);
  const firstname = firstNames[seed % firstNames.length]!, lastname = familyNames[demoHash(global, 1543) % familyNames.length]!;
  const birthYear = 1989 + seed % 19;
  return { id: 100_000_000 + global, name: `${firstname} ${lastname}`, firstname, lastname, age: 2026 - birthYear,
    birth: { date: `${birthYear}-${String(1 + seed % 12).padStart(2, "0")}-${String(1 + seed % 28).padStart(2, "0")}`,
      place: team.venue.city, country: team.country }, nationality: team.country, height: `${168 + seed % 31} cm`,
    weight: `${62 + seed % 29} kg`, injured: index === 23 && team.index % 7 === 0,
    photo: team.logo, number: index + 1, position: positions[index] ?? "M" };
}
function playerIdentity(player: DemoPlayer) { return { id: player.id, name: player.name }; }
function playerProfile(player: DemoPlayer) {
  return { id: player.id, name: player.name, firstname: player.firstname, lastname: player.lastname, age: player.age,
    birth: player.birth, nationality: player.nationality, height: player.height, weight: player.weight, injured: player.injured, photo: player.photo };
}
export function demoFixtureKickoff(id: number): number | null {
  const coordinates = demoFixtureCoordinates(id);
  if (!coordinates) return null;
  const quarter = (coordinates.slot * 37 + coordinates.day * 7) % 96;
  return DEMO_START_MS + coordinates.day * DEMO_DAY_MS - 10_800_000 + (quarter * 15 + 5) * 60_000;
}
export function demoFixtureModel(id: number) {
  const c = demoFixtureCoordinates(id);
  if (!c) return null;
  const { home, away } = demoFixtureTeams(c.day, c.slot);
  const strength = (team: DemoTeam) => (demoHash(team.id, 771) % 101) / 100;
  const homeGoals = 0.55 + strength(home) * 2.15, awayGoals = 0.4 + strength(away) * 1.9;
  return { homeGoals, awayGoals };
}
function poissonCount(mean: number, seed: number): number {
  const u = (demoHash(seed, 37) + 0.5) / 4_294_967_296;
  let term = Math.exp(-mean), sum = term;
  for (let goals = 0; goals < 7; goals += 1) {
    if (u <= sum) return goals;
    term *= mean / (goals + 1); sum += term;
  }
  return 7;
}
function matchPlan(id: number) {
  const c = demoFixtureCoordinates(id)!;
  const { league, home, away } = demoFixtureTeams(c.day, c.slot), model = demoFixtureModel(id)!;
  const homeGoals = poissonCount(model.homeGoals, id);
  let awayGoals = poissonCount(model.awayGoals, id + 1);
  const extended = league.type === "Cup" && demoHash(id, 89) % 4 === 0;
  if (extended) awayGoals = homeGoals;
  const penalties = extended && demoHash(id, 229) % 3 === 0;
  const extraWinnerHome = demoHash(id, 91) % 2 === 0;
  const finalHome = homeGoals + (extended && !penalties && extraWinnerHome ? 1 : 0);
  const finalAway = awayGoals + (extended && !penalties && !extraWinnerHome ? 1 : 0);
  return { ...c, league, home, away, homeGoals, awayGoals, finalHome, finalAway, extended, penalties, extraWinnerHome,
    penaltyHome: penalties ? 4 + (extraWinnerHome ? 1 : 0) : null, penaltyAway: penalties ? 4 + (extraWinnerHome ? 0 : 1) : null };
}
function plannedGoals(id: number) {
  const p = matchPlan(id);
  const events: { side: "home" | "away"; minute: number; index: number; penalty: boolean; ownGoal: boolean }[] = [];
  for (const side of ["home", "away"] as const) {
    const goals = side === "home" ? p.homeGoals : p.awayGoals;
    for (let index = 0; index < goals; index += 1) {
      const seed = demoHash(id, index * 19 + (side === "home" ? 11 : 31));
      events.push({ side, minute: 1 + seed % 90, index, penalty: seed % 11 === 0, ownGoal: seed % 37 === 0 });
    }
  }
  if (p.extended && !p.penalties) events.push({ side: p.extraWinnerHome ? "home" : "away", minute: 96 + demoHash(id, 901) % 24,
    index: 0, penalty: false, ownGoal: false });
  return events.sort((a, b) => a.minute - b.minute);
}
function scoreAt(id: number, elapsed: number): Pair {
  const goals = plannedGoals(id).filter((goal) => goal.minute <= elapsed);
  return { home: goals.filter((goal) => goal.side === "home").length, away: goals.filter((goal) => goal.side === "away").length };
}
function matchStatus(id: number, nowMs: number) {
  const kickoff = demoFixtureKickoff(id)!, minutes = (nowMs - kickoff) / 60_000, hash = demoHash(id, 17), plan = matchPlan(id);
  let short = "NS", elapsed: number | null = null, extra: number | null = null;
  if (hash % 503 === 0) short = "TBD";
  else if (hash % 251 === 0) short = "PST";
  else if (hash % 401 === 0) short = "CANC";
  else if (minutes >= 0) {
    if (minutes < 45) { short = "1H"; elapsed = Math.floor(minutes); }
    else if (minutes < 60) { short = "HT"; elapsed = 45; }
    else if (minutes < 105) { short = "2H"; elapsed = Math.floor(minutes - 15); }
    else if (minutes < 110 && !plan.extended) { short = "2H"; elapsed = 90; extra = Math.floor(minutes - 105) + 1; }
    else if (plan.extended && minutes < 125) { short = "ET"; elapsed = Math.min(105, Math.floor(minutes - 15)); }
    else if (plan.extended && minutes < 130) { short = "BT"; elapsed = 105; }
    else if (plan.extended && minutes < 145) { short = "ET"; elapsed = Math.min(120, Math.floor(minutes - 25)); }
    else if (plan.penalties && minutes < 155) { short = "P"; elapsed = 120; }
    else { short = plan.penalties ? "PEN" : plan.extended ? "AET" : "FT"; elapsed = plan.extended ? 120 : 90; }
    if (minutes >= 65 && hash % 331 === 0) { short = "ABD"; elapsed = 50; }
    else if (minutes >= 110 && hash % 617 === 0) { short = hash % 2 === 0 ? "AWD" : "WO"; elapsed = null; }
    else if (minutes >= 62 && minutes < 72 && hash % 23 === 0) { short = "SUSP"; elapsed = 47; }
    else if (minutes >= 75 && minutes < 80 && hash % 29 === 0) { short = "INT"; elapsed = 60; }
  }
  return { short, long: longStatuses[short]!, elapsed, extra };
}
/** Base list rows use the official /fixtures shape; details are supplied only for id/ids requests. */
export function demoFixtureById(id: number, nowMs = Date.now(), timezone = "Africa/Kampala"): ApiFootballDemoFixture | null {
  const coordinates = demoFixtureCoordinates(id);
  if (!coordinates) return null;
  const plan = matchPlan(id), kickoff = demoFixtureKickoff(id)!, status = matchStatus(id, nowMs);
  const played = playedCodes.has(status.short) && !["AWD", "WO"].includes(status.short), finished = finishedCodes.has(status.short);
  const score = played ? scoreAt(id, status.elapsed ?? 90) : nullPair();
  if (["AWD", "WO"].includes(status.short)) { score.home = 3; score.away = 0; }
  const halftime = played && (status.elapsed ?? 0) >= 45 ? scoreAt(id, 45) : nullPair();
  const fulltime = (finished || ["ET", "BT", "P"].includes(status.short)) && !["AWD", "WO"].includes(status.short)
    ? { home: plan.homeGoals, away: plan.awayGoals } : nullPair();
  const decidedHome = status.short === "PEN" ? plan.penaltyHome! > plan.penaltyAway! : Number(score.home) > Number(score.away);
  const draw = status.short !== "PEN" && score.home === score.away;
  const referee = `${firstNames[demoHash(id, 7) % firstNames.length]} ${familyNames[demoHash(id, 9) % familyNames.length]}, ${plan.league.country}`;
  return { fixture: { id, referee, timezone, date: zonedDate(kickoff, timezone), timestamp: kickoff / 1_000,
    periods: { first: played ? kickoff / 1_000 : null, second: played && (status.elapsed ?? 0) > 45 ? kickoff / 1_000 + 3_600 : null },
    venue: { id: plan.home.venue.id, name: plan.home.venue.name, city: plan.home.venue.city }, status },
    league: { ...demoRawLeague(plan.league), round: fixtureRound(plan.league, coordinates.day), standings: plan.league.type === "League" },
    teams: { home: { ...demoRawTeam(plan.home), winner: finished && !draw ? decidedHome : null },
      away: { ...demoRawTeam(plan.away), winner: finished && !draw ? !decidedHome : null } },
    goals: score, score: { halftime, fulltime, extratime: finished && plan.extended ? { home: plan.finalHome, away: plan.finalAway } : nullPair(),
      penalty: status.short === "PEN" ? { home: plan.penaltyHome, away: plan.penaltyAway } : nullPair() } };
}
export function demoFixturesForDate(date: string, nowMs = Date.now()): ApiFootballDemoFixture[] {
  const day = demoDateIndex(date);
  return day === null ? [] : Array.from({ length: DEMO_MATCHES_PER_DAY }, (_, slot) => demoFixtureById(DEMO_FIXTURE_ID_BASE + day * 1_000 + slot, nowMs)!);
}

export function demoFixtureEvents(id: number, nowMs = Date.now()) {
  const fixture = demoFixtureById(id, nowMs);
  if (!fixture || !playedCodes.has(fixture.fixture.status.short) || ["AWD", "WO"].includes(fixture.fixture.status.short)) return [];
  const p = matchPlan(id), elapsed = fixture.fixture.status.elapsed ?? 0;
  const events: { time: { elapsed: number; extra: number | null }; team: ReturnType<typeof demoRawTeam>;
    player: { id: number; name: string }; assist: { id: number | null; name: string | null };
    type: string; detail: string; comments: string | null }[] = [];
  for (const goal of plannedGoals(id).filter((goal) => goal.minute <= elapsed)) {
    const team = p[goal.side], scorer = demoPlayer(goal.ownGoal ? p[goal.side === "home" ? "away" : "home"] : team, 8 + goal.index % 3);
    events.push({ time: { elapsed: goal.minute, extra: null }, team: demoRawTeam(team), player: playerIdentity(scorer),
      assist: goal.penalty || goal.ownGoal ? { id: null, name: null } : playerIdentity(demoPlayer(team, 5 + goal.index % 3)),
      type: "Goal", detail: goal.ownGoal ? "Own Goal" : goal.penalty ? "Penalty" : "Normal Goal", comments: null });
  }
  for (const side of ["home", "away"] as const) {
    const team = p[side], count = 1 + demoHash(id, team.id) % 5;
    for (let index = 0; index < count; index += 1) {
      const minute = 8 + demoHash(id, team.id + index) % 82;
      if (minute <= elapsed) events.push({ time: { elapsed: minute, extra: null }, team: demoRawTeam(team),
        player: playerIdentity(demoPlayer(team, 1 + index)), assist: { id: null, name: null }, type: "Card",
        detail: index === 4 && demoHash(id, 67) % 3 === 0 ? "Red Card" : "Yellow Card", comments: "Foul" });
    }
    for (let index = 0; index < 3; index += 1) {
      const minute = 56 + index * 11 + demoHash(id, team.id + index * 5) % 5;
      if (minute <= elapsed) events.push({ time: { elapsed: minute, extra: null }, team: demoRawTeam(team),
        player: playerIdentity(demoPlayer(team, 5 + index)), assist: playerIdentity(demoPlayer(team, 14 + index)),
        type: "subst", detail: `Substitution ${index + 1}`, comments: null });
    }
  }
  const minute = 22 + demoHash(id, 73) % 62;
  if (demoHash(id, 197) % 4 === 0 && minute <= elapsed) events.push({ time: { elapsed: minute, extra: null },
    team: demoRawTeam(p.home), player: playerIdentity(demoPlayer(p.home, 9)), assist: { id: null, name: null },
    type: "Var", detail: demoHash(id, 97) % 2 === 0 ? "Goal cancelled" : "Penalty confirmed", comments: "VAR decision" });
  return events.sort((a, b) => a.time.elapsed - b.time.elapsed);
}

function formationGrid(formation: string): { pos: string; grid: string }[] {
  const lines = [1, ...formation.split("-").map(Number)];
  return lines.flatMap((count, row) => Array.from({ length: count }, (_, column) => ({
    pos: row === 0 ? "G" : row === 1 ? "D" : row === lines.length - 1 ? "F" : "M", grid: `${row + 1}:${column + 1}` })));
}
export function demoFixtureLineups(id: number, nowMs = Date.now()) {
  const fixture = demoFixtureById(id, nowMs);
  if (!fixture || ["PST", "CANC", "TBD", "AWD", "WO"].includes(fixture.fixture.status.short)) return [];
  if (nowMs < fixture.fixture.timestamp * 1_000 - 40 * 60_000) return [];
  const p = matchPlan(id);
  return ([p.home, p.away]).map((team) => {
    const formation = formations[demoHash(id, team.id) % formations.length]!, grid = formationGrid(formation);
    const color = demoHash(team.id, 67).toString(16).padStart(8, "0").slice(0, 6);
    const dress = (primary: string) => ({ primary, number: "ffffff", border: "111111" });
    return { team: { ...demoRawTeam(team), colors: { player: dress(color), goalkeeper: dress("fbbf24") } },
      coach: { id: 50_000_000 + team.id, name: `${firstNames[team.index % firstNames.length]} ${familyNames[(team.index + 7) % familyNames.length]}`, photo: team.logo },
      formation, startXI: grid.map((position, index) => ({ player: { ...playerIdentity(demoPlayer(team, index)),
        number: index + 1, pos: position.pos, grid: position.grid } })),
      substitutes: Array.from({ length: 9 }, (_, n) => ({ player: { ...playerIdentity(demoPlayer(team, n + 11)),
        number: n + 12, pos: positions[n + 11]!, grid: null } })) };
  });
}
export function demoFixtureStatistics(id: number, nowMs = Date.now()) {
  const fixture = demoFixtureById(id, nowMs);
  if (!fixture || !playedCodes.has(fixture.fixture.status.short) || ["AWD", "WO"].includes(fixture.fixture.status.short)) return [];
  const p = matchPlan(id), events = demoFixtureEvents(id, nowMs), possession = 35 + demoHash(id, 311) % 31;
  const elapsed = fixture.fixture.status.elapsed ?? 90, fraction = Math.min(1, elapsed / 90);
  const targets = { home: Number(fixture.goals.home) + Math.floor((2 + demoHash(id, 101) % 7) * fraction),
    away: Number(fixture.goals.away) + Math.floor((1 + demoHash(id, 102) % 7) * fraction) };
  return (["home", "away"] as const).map((side) => {
    const team = p[side], other = side === "home" ? "away" : "home", hash = demoHash(id, team.id);
    const on = targets[side], off = Math.floor((3 + hash % 9) * fraction), blocked = Math.floor((1 + hash % 5) * fraction), total = on + off + blocked;
    const inside = Math.floor(total * 0.7), passes = Math.floor((320 + hash % 320) * fraction), accurate = Math.floor(passes * (0.72 + hash % 20 / 100));
    const teamEvents = events.filter((event) => event.team.id === team.id);
    const values: [string, number | string | null][] = [["Shots on Goal", on], ["Shots off Goal", off], ["Total Shots", total],
      ["Blocked Shots", blocked], ["Shots insidebox", inside], ["Shots outsidebox", total - inside],
      ["Fouls", Math.floor((8 + hash % 14) * fraction)], ["Corner Kicks", Math.floor((2 + hash % 9) * fraction)],
      ["Offsides", Math.floor((hash % 5) * fraction)], ["Ball Possession", `${side === "home" ? possession : 100 - possession}%`],
      ["Yellow Cards", teamEvents.filter((e) => e.detail === "Yellow Card").length], ["Red Cards", teamEvents.filter((e) => e.detail === "Red Card").length],
      ["Goalkeeper Saves", Math.max(0, targets[other] - Number(fixture.goals[other]))], ["Total passes", passes], ["Passes accurate", accurate],
      ["Passes %", `${passes ? Math.round(accurate / passes * 100) : 0}%`], ["expected_goals", ((side === "home" ? p.homeGoals : p.awayGoals) * fraction + total * 0.04).toFixed(2)],
      ["goals_prevented", (demoHash(id, team.id + 17) % 160 / 100 - 0.5).toFixed(2)]];
    return { team: demoRawTeam(team), statistics: values.map(([type, value]) => ({ type, value })) };
  });
}

/** Cumulative observations give the regulation halves the same event timeline as
 * the ordinary match statistics. The first half freezes at its interval; extra
 * time never gets assigned to the second regulation half. */
export function demoFixtureStatisticsPeriods(id: number, nowMs = Date.now()) {
  const all = demoFixtureStatistics(id, nowMs), kickoff = demoFixtureKickoff(id);
  if (!all.length || kickoff === null) return [];
  const first = demoFixtureStatistics(id, Math.min(nowMs, kickoff + 45 * 60_000));
  const regulation = demoFixtureStatistics(id, Math.min(nowMs, kickoff + 105 * 60_000));
  const secondStarted = nowMs >= kickoff + 60 * 60_000;
  return all.map((row, index) => {
    const firstHalf = first[index]!.statistics, observed = regulation[index]!.statistics;
    const firstValues = new Map(firstHalf.map((statistic) => [statistic.type, statistic.value]));
    const difference = (type: string) => Number(observed.find((statistic) => statistic.type === type)?.value ?? 0)
      - Number(firstValues.get(type) ?? 0);
    const secondHalf = !secondStarted ? null : observed.map(({ type, value }) => {
      const earlier = firstValues.get(type);
      if (value === null || earlier === null || earlier === undefined) return { type, value: null };
      if (type === "Ball Possession") return { type, value };
      if (type === "Passes %") {
        const passes = difference("Total passes"), accurate = difference("Passes accurate");
        return { type, value: `${passes ? Math.round(accurate / passes * 100) : 0}%` };
      }
      if (typeof value === "number" && typeof earlier === "number") return { type, value: value - earlier };
      // Decimal source values remain decimal strings, including signed prevented goals.
      const hundredths = Math.round(Number(value) * 100) - Math.round(Number(earlier) * 100);
      return { type, value: (hundredths / 100).toFixed(2) };
    });
    return { team: row.team, statistics: row.statistics, firstHalf, secondHalf };
  });
}

export function demoFixturePlayers(id: number, nowMs = Date.now()) {
  const fixture = demoFixtureById(id, nowMs);
  if (!fixture || !playedCodes.has(fixture.fixture.status.short) || ["AWD", "WO"].includes(fixture.fixture.status.short)) return [];
  const p = matchPlan(id), events = demoFixtureEvents(id, nowMs), elapsed = fixture.fixture.status.elapsed ?? 90;
  return (["home", "away"] as const).map((side) => {
    const team = p[side], other = side === "home" ? "away" : "home";
    return { team: { ...demoRawTeam(team), update: new Date(Math.min(nowMs, fixture.fixture.timestamp * 1_000 + 155 * 60_000)).toISOString() },
      players: Array.from({ length: 20 }, (_, index) => {
        const player = demoPlayer(team, index), hash = demoHash(id, player.id), ownEvents = events.filter((event) => event.player.id === player.id);
        const outgoing = events.find((event) => event.type === "subst" && event.player.id === player.id), incoming = events.find((event) => event.type === "subst" && event.assist.id === player.id);
        const minutes = index < 11 ? Math.min(elapsed, outgoing?.time.elapsed ?? elapsed) : incoming ? elapsed - incoming.time.elapsed : null;
        const goals = ownEvents.filter((event) => event.type === "Goal" && event.detail !== "Own Goal").length;
        const assists = events.filter((event) => event.type === "Goal" && event.assist.id === player.id).length;
        const played = minutes !== null && minutes > 0, on = played ? goals + hash % 3 : 0;
        return { player: { ...playerIdentity(player), photo: player.photo }, statistics: [{
          games: { minutes, number: player.number, position: player.position, rating: played ? (6 + hash % 36 / 10).toFixed(1) : null,
            captain: index === 4, substitute: index >= 11 }, offsides: played ? hash % 3 : null,
          shots: { total: played ? on + hash % 3 : null, on: played ? on : null },
          goals: { total: played ? goals : null, conceded: index === 0 ? fixture.goals[other] : 0,
            assists: played ? assists : null, saves: index === 0 ? 2 + hash % 6 : null },
          passes: { total: played ? 18 + hash % 65 : null, key: played ? hash % 5 : null, accuracy: played ? `${65 + hash % 33}%` : null },
          tackles: { total: played ? hash % 6 : null, blocks: played ? hash % 3 : null, interceptions: played ? hash % 4 : null },
          duels: { total: played ? 5 + hash % 10 : null, won: played ? Math.min(5 + hash % 10, 3 + hash % 6) : null },
          dribbles: { attempts: played ? hash % 6 : null, success: played ? Math.min(hash % 6, hash % 4) : null, past: played ? hash % 3 : null },
          fouls: { drawn: played ? hash % 4 : null, committed: played ? hash % 3 : null },
          cards: { yellow: ownEvents.filter((event) => event.detail === "Yellow Card").length, red: ownEvents.filter((event) => event.detail === "Red Card").length },
          penalty: { won: null, commited: null, scored: ownEvents.filter((event) => event.type === "Goal" && event.detail === "Penalty").length,
            missed: 0, saved: index === 0 ? 0 : null } }] };
      }) };
  });
}

/** Historical aggregates are built from the same fixture outcomes, never unrelated random totals. */
function teamHistory(team: DemoTeam, nowMs: number, beforeFixture?: number, limit = Number.POSITIVE_INFINITY) {
  const end = Math.min(DEMO_DAYS - 1, Math.floor((nowMs + 10_800_000 - DEMO_START_MS) / DEMO_DAY_MS));
  const history: ApiFootballDemoFixture[] = [];
  for (let day = Math.min(end, Math.floor((nowMs + 10_800_000 - DEMO_START_MS) / DEMO_DAY_MS)); day >= 0; day -= 1) {
    if (day % 3 !== Math.floor(team.index / 20)) continue;
    // Invert the circle method directly; generating a whole 560-match day for one
    // club's history would multiply standings/player-statistics work needlessly.
    const round = Math.floor(day / 3) % 19, local = team.index % 20;
    const difference = (local - round + 19) % 19;
    const pair = local === 19 || local === round ? 0 : Math.min(difference, 19 - difference);
    const id = DEMO_FIXTURE_ID_BASE + day * 1_000 + (team.leagueId - 700_001) * 10 + pair;
    const row = demoFixtureById(id, nowMs);
    if (!row || row.fixture.id === beforeFixture || !finishedCodes.has(row.fixture.status.short)) continue;
    history.push(row);
    if (history.length >= limit) break;
  }
  return history;
}
/** The forecast's short form sample does not need a full season aggregate. */
export function demoTeamForm(teamId: number, nowMs = Date.now(), limit = 5): string {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 40) throw new RangeError("Invalid demo form window.");
  const team = demoTeamById(teamId);
  return team ? teamHistory(team, nowMs, undefined, limit).reverse().map((fixture) => fixtureOutcome(fixture, teamId).result).join("") : "";
}
function fixtureOutcome(fixture: ApiFootballDemoFixture, teamId: number) {
  const home = fixture.teams.home.id === teamId, scored = Number(fixture.goals[home ? "home" : "away"]), conceded = Number(fixture.goals[home ? "away" : "home"]);
  return { home, scored, conceded, result: scored > conceded ? "W" : scored === conceded ? "D" : "L" };
}
function splitTotals(home: number, away: number) { return { home, away, total: home + away }; }
function minuteBins(total: number) {
  const weights = [0.12, 0.15, 0.18, 0.16, 0.18, 0.21], labels = ["0-15", "16-30", "31-45", "46-60", "61-75", "76-90"];
  let remaining = total;
  return Object.fromEntries(labels.map((label, index) => {
    const count = index === labels.length - 1 ? remaining : Math.floor(total * weights[index]!); remaining -= count;
    return [label, { total: count, percentage: total ? `${(count / total * 100).toFixed(2)}%` : null }];
  }).concat([["91-105", { total: 0, percentage: null }], ["106-120", { total: 0, percentage: null }]]));
}
function buildDemoTeamStatistics(teamId: number, nowMs: number) {
  const team = demoTeamById(teamId);
  if (!team) return null;
  const league = demoLeagueById(team.leagueId)!, history = teamHistory(team, nowMs), outcomes = history.map((fixture) => fixtureOutcome(fixture, team.id));
  const count = (condition: (r: ReturnType<typeof fixtureOutcome>) => boolean) => splitTotals(outcomes.filter((r) => r.home && condition(r)).length, outcomes.filter((r) => !r.home && condition(r)).length);
  const played = count(() => true), wins = count((r) => r.result === "W"), draws = count((r) => r.result === "D"), loses = count((r) => r.result === "L");
  const goalStats = (key: "scored" | "conceded") => {
    const home = outcomes.filter((r) => r.home).reduce((n, r) => n + r[key], 0), away = outcomes.filter((r) => !r.home).reduce((n, r) => n + r[key], 0);
    return { total: splitTotals(home, away), average: { home: played.home ? (home / played.home).toFixed(1) : "0.0",
      away: played.away ? (away / played.away).toFixed(1) : "0.0", total: played.total ? ((home + away) / played.total).toFixed(1) : "0.0" },
      minute: minuteBins(home + away), under_over: Object.fromEntries([0.5, 1.5, 2.5, 3.5, 4.5].map((line) => [String(line), {
        over: outcomes.filter((r) => r[key] > line).length, under: outcomes.filter((r) => r[key] < line).length }])) };
  };
  const longest = (result: string) => {
    let best = 0, run = 0; for (const row of [...outcomes].reverse()) { run = row.result === result ? run + 1 : 0; best = Math.max(best, run); } return best;
  };
  const biggest = (home: boolean, win: boolean) => {
    const row = outcomes.filter((r) => r.home === home && (win ? r.result === "W" : r.result === "L"))
      .sort((a, b) => (win ? b.scored - b.conceded - (a.scored - a.conceded) : b.conceded - b.scored - (a.conceded - a.scored)))[0];
    return row ? `${row.home ? row.scored : row.conceded}-${row.home ? row.conceded : row.scored}` : null;
  };
  const penalties = Math.floor(played.total / 8), scoredPenalties = Math.max(0, penalties - Math.floor(penalties / 5));
  return { league: demoRawLeague(league), team: demoRawTeam(team), form: [...outcomes].reverse().map((r) => r.result).join(""),
    fixtures: { played, wins, draws, loses }, goals: { for: goalStats("scored"), against: goalStats("conceded") },
    biggest: { streak: { wins: longest("W"), draws: longest("D"), loses: longest("L") },
      wins: { home: biggest(true, true), away: biggest(false, true) }, loses: { home: biggest(true, false), away: biggest(false, false) },
      goals: { for: { home: Math.max(0, ...outcomes.filter((r) => r.home).map((r) => r.scored)), away: Math.max(0, ...outcomes.filter((r) => !r.home).map((r) => r.scored)) },
        against: { home: Math.max(0, ...outcomes.filter((r) => r.home).map((r) => r.conceded)), away: Math.max(0, ...outcomes.filter((r) => !r.home).map((r) => r.conceded)) } } },
    clean_sheet: count((r) => r.conceded === 0), failed_to_score: count((r) => r.scored === 0),
    penalty: { scored: { total: scoredPenalties, percentage: penalties ? `${(scoredPenalties / penalties * 100).toFixed(2)}%` : "0%" },
      missed: { total: penalties - scoredPenalties, percentage: penalties ? `${((penalties - scoredPenalties) / penalties * 100).toFixed(2)}%` : "0%" }, total: penalties },
    lineups: formations.map((formation, index) => ({ formation, played: Math.floor(played.total / formations.length) + (index < played.total % formations.length ? 1 : 0) })).filter((r) => r.played > 0),
    cards: { yellow: minuteBins(played.total * 2), red: minuteBins(Math.floor(played.total / 12)) } };
}
const teamStatisticsCache = new Map<string, ReturnType<typeof buildDemoTeamStatistics>>();
export function demoTeamStatistics(teamId: number, nowMs = Date.now()) {
  const key = `${teamId}:${Math.floor(nowMs / 60_000)}`;
  if (teamStatisticsCache.has(key)) return teamStatisticsCache.get(key)!;
  const value = buildDemoTeamStatistics(teamId, nowMs);
  teamStatisticsCache.set(key, value);
  if (teamStatisticsCache.size > 128) teamStatisticsCache.delete(teamStatisticsCache.keys().next().value!);
  return value;
}

function leagueEnvelope(league: DemoLeague) {
  const coverage = { fixtures: { events: true, lineups: true, statistics_fixtures: true, statistics_players: true }, standings: league.type === "League",
    players: true, top_scorers: true, top_assists: true, top_cards: true, injuries: true, predictions: true, odds: true };
  return { league: { id: league.id, name: league.name, type: league.type, logo: demoCountryFlag(league) },
    country: { name: league.country, code: league.countryCode.toUpperCase(), flag: demoCountryFlag(league) },
    seasons: [{ year: 2026, start: DEMO_START_DATE, end: DEMO_END_DATE, current: true, coverage }] };
}
function standings(league: DemoLeague, nowMs: number) {
  const groups = Array.from({ length: 3 }, (_, group) => league.teams.slice(group * 20, group * 20 + 20).map((team) => {
    const stats = demoTeamStatistics(team.id, nowMs)!, played = stats.fixtures.played;
    const section = (key: "total" | "home" | "away") => ({ played: played[key], win: stats.fixtures.wins[key],
      draw: stats.fixtures.draws[key], lose: stats.fixtures.loses[key], goals: { for: stats.goals.for.total[key], against: stats.goals.against.total[key] } });
    return { rank: 0, team: demoRawTeam(team), points: stats.fixtures.wins.total * 3 + stats.fixtures.draws.total,
      goalsDiff: stats.goals.for.total.total - stats.goals.against.total.total, group: `${league.name} - Group ${String.fromCharCode(65 + group)}`,
      form: stats.form.slice(-5), status: "same", description: null as string | null,
      all: section("total"), home: section("home"), away: section("away"), update: new Date(nowMs).toISOString() };
  }).sort((a, b) => b.points - a.points || b.goalsDiff - a.goalsDiff || b.all.goals.for - a.all.goals.for || a.team.id - b.team.id)
    .map((row, index) => ({ ...row, rank: index + 1, description: index < 3 ? "Promotion" : index >= 18 ? "Relegation" : null })));
  return { league: { ...demoRawLeague(league), standings: groups } };
}

function probabilities(homeGoals: number, awayGoals: number, homeOffset = 0, awayOffset = 0) {
  const home: number[] = [], away: number[] = [];
  home[0] = Math.exp(-homeGoals); away[0] = Math.exp(-awayGoals);
  for (let n = 1; n <= 14; n += 1) { home[n] = home[n - 1]! * homeGoals / n; away[n] = away[n - 1]! * awayGoals / n; }
  let h = 0, d = 0, a = 0, btts = 0;
  const totals = new Map<number, number>();
  for (let i = 0; i < home.length; i += 1) for (let j = 0; j < away.length; j += 1) {
    const value = home[i]! * away[j]!;
    const homeScore = i + homeOffset, awayScore = j + awayOffset, total = homeScore + awayScore;
    if (homeScore > awayScore) h += value; else if (homeScore === awayScore) d += value; else a += value;
    if (homeScore > 0 && awayScore > 0) btts += value;
    totals.set(total, (totals.get(total) ?? 0) + value);
  }
  const sum = h + d + a;
  return { home: h / sum, draw: d / sum, away: a / sum, btts: btts / sum, over: (line: number) => [...totals].reduce((n, [goals, p]) => n + (goals > line ? p : 0), 0) / sum,
    exact: (h: number, a: number) => (home[h - homeOffset] ?? 0) * (away[a - awayOffset] ?? 0) / sum };
}
export { probabilities as demoScoreProbabilities };
export function demoFixtureProbabilities(id: number) {
  const model = demoFixtureModel(id); return model ? probabilities(model.homeGoals, model.awayGoals) : null;
}
export function demoFixtureOdds(id: number, nowMs = Date.now(), bookmakerId?: number, betId?: number, timezone = "Africa/Kampala") {
  const fixture = demoFixtureById(id, nowMs, timezone);
  if (!fixture) return null;
  const model = demoFixtureModel(id)!, p = probabilities(model.homeGoals, model.awayGoals), first = probabilities(model.homeGoals * 0.45, model.awayGoals * 0.45);
  const second = probabilities(model.homeGoals * 0.55, model.awayGoals * 0.55);
  const bet = (id: number, outcomes: [string, number][], margin: number) => ({ id, name: demoOddsBets.find((row) => row.id === id)!.name,
    values: outcomes.map(([value, probability]) => ({ value, odd: Math.min(1_000, Math.max(1.01, 1 / Math.max(0.001, probability * margin))).toFixed(2) })) });
  const totals = (probs: ReturnType<typeof probabilities>) => [0.5, 1.5, 2.5, 3.5, 4.5, 5.5].flatMap((line): [string, number][] => [[`Over ${line}`, probs.over(line)], [`Under ${line}`, 1 - probs.over(line)]]);
  const teamTotals = (mean: number) => [0.5, 1.5, 2.5, 3.5].flatMap((line): [string, number][] => {
    let term = Math.exp(-mean), under = term;
    for (let n = 1; n <= Math.floor(line); n += 1) { term *= mean / n; under += term; }
    return [[`Over ${line}`, 1 - under], [`Under ${line}`, under]];
  });
  return { league: demoRawLeague(matchPlan(id).league), fixture: { id, timezone: fixture.fixture.timezone, date: fixture.fixture.date, timestamp: fixture.fixture.timestamp },
    update: new Date(Math.min(nowMs, fixture.fixture.timestamp * 1_000 - 60_000)).toISOString(),
    bookmakers: bookmakerRows.filter((row) => bookmakerId === undefined || row.id === bookmakerId).map((bookmaker) => {
      const margin = 1.035 + bookmaker.id % 4 * 0.008;
      const bets = [bet(1, [["Home", p.home], ["Draw", p.draw], ["Away", p.away]], margin),
        bet(2, [["Home", p.home / (p.home + p.away)], ["Away", p.away / (p.home + p.away)]], margin),
        bet(3, [["Home", second.home], ["Draw", second.draw], ["Away", second.away]], margin),
        bet(4, [["Home -0.5", p.home], ["Away +0.5", p.draw + p.away], ["Home +0.5", p.home + p.draw], ["Away -0.5", p.away]], margin),
        bet(5, totals(p), margin), bet(6, totals(first), margin),
        bet(7, [["Home/Home", first.home * p.home], ["Home/Draw", first.home * p.draw], ["Home/Away", first.home * p.away],
          ["Draw/Home", first.draw * p.home], ["Draw/Draw", first.draw * p.draw], ["Draw/Away", first.draw * p.away],
          ["Away/Home", first.away * p.home], ["Away/Draw", first.away * p.draw], ["Away/Away", first.away * p.away]], margin),
        bet(8, [["Yes", p.btts], ["No", 1 - p.btts]], margin),
        bet(10, Array.from({ length: 25 }, (_, n): [string, number] => [`${Math.floor(n / 5)}:${n % 5}`, p.exact(Math.floor(n / 5), n % 5)]), margin),
        bet(11, [["1st Half", 0.32], ["2nd Half", 0.45], ["Equal", 0.23]], margin),
        bet(12, [["Home/Draw", p.home + p.draw], ["Home/Away", p.home + p.away], ["Draw/Away", p.draw + p.away]], margin),
        bet(13, [["Home", first.home], ["Draw", first.draw], ["Away", first.away]], margin),
        bet(14, [["Home", model.homeGoals / (model.homeGoals + model.awayGoals) * (1 - p.exact(0, 0))],
          ["Away", model.awayGoals / (model.homeGoals + model.awayGoals) * (1 - p.exact(0, 0))], ["No Goal", p.exact(0, 0)]], margin),
        bet(15, [["Home", model.homeGoals / (model.homeGoals + model.awayGoals) * (1 - p.exact(0, 0))],
          ["Away", model.awayGoals / (model.homeGoals + model.awayGoals) * (1 - p.exact(0, 0))], ["No Goal", p.exact(0, 0)]], margin),
        bet(16, teamTotals(model.homeGoals), margin), bet(17, teamTotals(model.awayGoals), margin)];
      return { ...bookmaker, bets: bets.filter((row) => betId === undefined || row.id === betId) };
    }) };
}

function injuries(fixture: ApiFootballDemoFixture) {
  const p = matchPlan(fixture.fixture.id);
  return [p.home, p.away].flatMap((team) => {
    if (demoHash(team.id, 811) % 3 === 0) return [];
    const player = demoPlayer(team, 21 + demoHash(team.id, 91) % 3);
    return [{ player: { ...playerIdentity(player), photo: player.photo, type: team.index % 4 === 0 ? "Questionable" : "Missing Fixture",
      reason: ["Knee Injury", "Hamstring Injury", "Ankle Injury", "Muscle Injury", "Suspended", "Illness"][team.index % 6]! },
      team: demoRawTeam(team), fixture: { id: fixture.fixture.id, timezone: fixture.fixture.timezone, date: fixture.fixture.date, timestamp: fixture.fixture.timestamp },
      league: demoRawLeague(p.league) }];
  });
}
function predictions(fixture: ApiFootballDemoFixture, nowMs: number) {
  const id = fixture.fixture.id, plan = matchPlan(id), p = demoFixtureProbabilities(id)!, homePercent = Math.round(p.home * 100), drawPercent = Math.round(p.draw * 100);
  const winner = p.home >= p.away ? plan.home : plan.away;
  const contextTeam = (team: DemoTeam) => {
    const stats = demoTeamStatistics(team.id, Math.min(nowMs, fixture.fixture.timestamp * 1_000 - 1))!;
    const last = teamHistory(team, Math.min(nowMs, fixture.fixture.timestamp * 1_000 - 1), id).slice(0, 5).map((row) => fixtureOutcome(row, team.id));
    const scored = last.reduce((n, r) => n + r.scored, 0), conceded = last.reduce((n, r) => n + r.conceded, 0);
    return { ...demoRawTeam(team), last_5: { form: `${last.length ? Math.round(last.reduce((n, r) => n + (r.result === "W" ? 3 : r.result === "D" ? 1 : 0), 0) / (last.length * 3) * 100) : 0}%`,
      att: `${Math.min(100, Math.round(scored / 10 * 100))}%`, def: `${Math.max(0, 100 - Math.round(conceded / 10 * 100))}%`,
      goals: { for: { total: scored, average: last.length ? scored / last.length : 0 }, against: { total: conceded, average: last.length ? conceded / last.length : 0 } } },
      league: { form: stats.form, fixtures: stats.fixtures,
        goals: { for: { total: stats.goals.for.total, average: stats.goals.for.average },
          against: { total: stats.goals.against.total, average: stats.goals.against.average } },
        biggest: stats.biggest, clean_sheet: stats.clean_sheet, failed_to_score: stats.failed_to_score } };
  };
  return { predictions: { winner: { id: winner.id, name: winner.name, comment: "Win or draw" }, win_or_draw: true,
    under_over: p.over(2.5) > 0.5 ? "+2.5" : "-3.5", goals: { home: `-${Math.ceil(demoFixtureModel(id)!.homeGoals + 0.5)}.5`, away: `-${Math.ceil(demoFixtureModel(id)!.awayGoals + 0.5)}.5` },
    advice: `Double chance : ${winner.name} or draw`, percent: { home: `${homePercent}%`, draw: `${drawPercent}%`, away: `${100 - homePercent - drawPercent}%` } },
    league: demoRawLeague(plan.league), teams: { home: contextTeam(plan.home), away: contextTeam(plan.away) },
    comparison: Object.fromEntries(["form", "att", "def", "poisson_distribution", "h2h", "goals", "total"].map((key) => [key, {
      home: `${Math.round(p.home / (p.home + p.away) * 100)}%`, away: `${100 - Math.round(p.home / (p.home + p.away) * 100)}%` }])),
    h2h: teamHistory(plan.home, Math.min(nowMs, fixture.fixture.timestamp * 1_000 - 1), id)
      .filter((row) => row.teams.home.id === plan.away.id || row.teams.away.id === plan.away.id).slice(0, 10) };
}

type PlayerTotals = { appearances: number; starts: number; minutes: number; bench: number; in: number; out: number;
  goals: number; assists: number; conceded: number; saves: number; shots: number; on: number; yellow: number; red: number;
  penalties: number; rating: number; passes: number; key: number; tackles: number; blocks: number; interceptions: number;
  duels: number; duelsWon: number; dribbles: number; dribblesWon: number; dribblesPast: number; foulsDrawn: number; foulsCommitted: number };
const seasonPlayerCache = new Map<string, readonly PlayerTotals[]>();
function seasonPlayers(team: DemoTeam, nowMs: number) {
  const key = `${team.id}:${Math.floor(nowMs / 60_000)}`, cached = seasonPlayerCache.get(key);
  if (cached) return cached;
  const totals = Array.from({ length: 24 }, (): PlayerTotals => ({ appearances: 0, starts: 0, minutes: 0, bench: 0, in: 0, out: 0,
    goals: 0, assists: 0, conceded: 0, saves: 0, shots: 0, on: 0, yellow: 0, red: 0, penalties: 0, rating: 0, passes: 0, key: 0,
    tackles: 0, blocks: 0, interceptions: 0, duels: 0, duelsWon: 0, dribbles: 0, dribblesWon: 0, dribblesPast: 0, foulsDrawn: 0, foulsCommitted: 0 }));
  for (const fixture of teamHistory(team, nowMs)) {
    if (["AWD", "WO"].includes(fixture.fixture.status.short)) continue;
    const id = fixture.fixture.id, events = demoFixtureEvents(id, nowMs), elapsed = fixture.fixture.status.elapsed ?? 90;
    for (let index = 0; index < totals.length; index += 1) {
      const player = demoPlayer(team, index), aggregate = totals[index]!, hash = demoHash(id, player.id);
      const outgoing = events.find((event) => event.type === "subst" && event.player.id === player.id);
      const incoming = events.find((event) => event.type === "subst" && event.assist.id === player.id);
      const minutes = index < 11 ? Math.min(elapsed, outgoing?.time.elapsed ?? elapsed) : incoming ? elapsed - incoming.time.elapsed : 0;
      if (index >= 11 && index < 20) aggregate.bench += 1;
      if (minutes <= 0) continue;
      aggregate.appearances += 1; aggregate.starts += index < 11 ? 1 : 0; aggregate.minutes += minutes;
      aggregate.in += incoming ? 1 : 0; aggregate.out += outgoing ? 1 : 0;
      const own = events.filter((event) => event.player.id === player.id), goals = own.filter((event) => event.type === "Goal" && event.detail !== "Own Goal").length;
      aggregate.goals += goals; aggregate.assists += events.filter((event) => event.type === "Goal" && event.assist.id === player.id).length;
      aggregate.conceded += index === 0 ? Number(fixture.goals[fixture.teams.home.id === team.id ? "away" : "home"]) : 0;
      aggregate.saves += index === 0 ? 2 + hash % 6 : 0; aggregate.on += goals + hash % 3; aggregate.shots += goals + 2 * (hash % 3);
      aggregate.yellow += own.filter((event) => event.detail === "Yellow Card").length; aggregate.red += own.filter((event) => event.detail === "Red Card").length;
      aggregate.penalties += own.filter((event) => event.type === "Goal" && event.detail === "Penalty").length;
      aggregate.rating += 6 + hash % 36 / 10; aggregate.passes += 18 + hash % 65; aggregate.key += hash % 5;
      aggregate.tackles += hash % 6; aggregate.blocks += hash % 3; aggregate.interceptions += hash % 4;
      aggregate.duels += 5 + hash % 10; aggregate.duelsWon += Math.min(5 + hash % 10, 3 + hash % 6);
      aggregate.dribbles += hash % 6; aggregate.dribblesWon += Math.min(hash % 6, hash % 4); aggregate.dribblesPast += hash % 3;
      aggregate.foulsDrawn += hash % 4; aggregate.foulsCommitted += hash % 3;
    }
  }
  seasonPlayerCache.set(key, totals);
  if (seasonPlayerCache.size > 128) seasonPlayerCache.delete(seasonPlayerCache.keys().next().value!);
  return totals;
}
function playerSeasonStatistics(team: DemoTeam, playerIndex: number, nowMs: number) {
  const player = demoPlayer(team, playerIndex), total = seasonPlayers(team, nowMs)[playerIndex]!;
  return { player: playerProfile(player), statistics: [{ team: demoRawTeam(team), league: demoRawLeague(demoLeagueById(team.leagueId)!),
    games: { appearences: total.appearances, lineups: total.starts, minutes: total.minutes,
      number: null, position: fullPosition(player.position), rating: total.appearances ? (total.rating / total.appearances).toFixed(6) : null, captain: playerIndex === 4 },
    substitutes: { in: total.in, out: total.out, bench: total.bench }, shots: { total: total.shots, on: total.on },
    goals: { total: total.goals, conceded: total.conceded, assists: total.assists, saves: playerIndex === 0 ? total.saves : null },
    passes: { total: total.passes, key: total.key, accuracy: total.appearances ? 82 : null },
    tackles: { total: total.tackles, blocks: total.blocks, interceptions: total.interceptions },
    duels: { total: total.duels, won: total.duelsWon }, dribbles: { attempts: total.dribbles, success: total.dribblesWon, past: total.dribblesPast },
    fouls: { drawn: total.foulsDrawn, committed: total.foulsCommitted }, cards: { yellow: total.yellow, yellowred: 0, red: total.red },
    penalty: { won: null, commited: null, scored: total.penalties, missed: 0, saved: playerIndex === 0 ? 0 : null } }] };
}

function fixtureRows(params: Parameters, nowMs: number) {
  const fixtureIds = params.id ? [Number(params.id)] : params.ids?.split("-").map(Number);
  let rows: ApiFootballDemoFixture[];
  if (fixtureIds) rows = fixtureIds.flatMap((id) => { const row = demoFixtureById(id, nowMs, params.timezone ?? "UTC"); return row ? [row] : []; });
  else {
    const timezone = params.timezone ?? "UTC", today = zonedDate(nowMs, timezone).slice(0, 10), from = params.date ?? params.from ?? (params.live ? today : DEMO_START_DATE);
    const to = params.date ?? params.to ?? (params.live ? today : DEMO_END_DATE);
    const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/u.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
      new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
    if (!validDate(from) || !validDate(to) || from > to) return [];
    // Dates are interpreted in the requested timezone, while fixture identities
    // belong to Kampala reporting days. Neighbouring reporting days can contain
    // fixtures within the requested UTC/local day, including midnight boundaries.
    const start = Math.max(0, Math.floor((Date.parse(`${from}T00:00:00Z`) - DEMO_START_MS) / DEMO_DAY_MS) - 1);
    const end = Math.min(DEMO_DAYS - 1, Math.floor((Date.parse(`${to}T00:00:00Z`) - DEMO_START_MS) / DEMO_DAY_MS) + 1);
    rows = [];
    for (let day = start; day <= end; day += 1) for (let slot = 0; slot < DEMO_MATCHES_PER_DAY; slot += 1) {
      const teams = demoFixtureTeams(day, slot);
      if (params.league && teams.league.id !== Number(params.league) || params.team && teams.home.id !== Number(params.team) && teams.away.id !== Number(params.team)) continue;
      const fixture = demoFixtureById(DEMO_FIXTURE_ID_BASE + day * 1_000 + slot, nowMs, timezone)!;
      if ((params.date || params.from || params.to) && (fixture.fixture.date.slice(0, 10) < from || fixture.fixture.date.slice(0, 10) > to)) continue;
      rows.push(fixture);
    }
  }
  rows = rows.filter((row) => (!params.league || row.league.id === Number(params.league)) && (!params.season || params.season === "2026") &&
    (!params.team || row.teams.home.id === Number(params.team) || row.teams.away.id === Number(params.team)) &&
    (!params.status || params.status.split("-").includes(row.fixture.status.short)) && (!params.round || row.league.round === params.round) &&
    (!params.venue || row.fixture.venue.id === Number(params.venue)) && (!params.live || liveCodes.has(row.fixture.status.short) &&
      (params.live === "all" || params.live.split("-").includes(String(row.league.id)))));
  rows.sort((a, b) => a.fixture.timestamp - b.fixture.timestamp || a.fixture.id - b.fixture.id);
  if (params.last) rows = rows.filter((row) => finishedCodes.has(row.fixture.status.short)).slice(-Math.max(0, Number(params.last)));
  if (params.next) rows = rows.filter((row) => row.fixture.timestamp * 1_000 >= nowMs && ["NS", "TBD"].includes(row.fixture.status.short)).slice(0, Math.max(0, Number(params.next)));
  return rows;
}
function withDetails(fixture: ApiFootballDemoFixture, nowMs: number) {
  const id = fixture.fixture.id;
  return { ...fixture, events: demoFixtureEvents(id, nowMs), lineups: demoFixtureLineups(id, nowMs),
    statistics: demoFixtureStatistics(id, nowMs), players: demoFixturePlayers(id, nowMs) };
}

/** API-Football v3 protocol-compatible local transport. No credentials or external requests are used.
 * Official schema reference: https://www.api-football.com/documentation-v3 (v3.9.3).
 * Data availability follows match time: future scores/events/statistics remain null or empty. */
export function demoApiFootballResponse(endpoint: string, params: Parameters = {}, nowMs = Date.now()): ApiFootballDemoEnvelope {
  const get = endpoint.replace(/^\/+|\/+$/gu, ""), parameters = Object.keys(params).length ? { ...params } : [] as const, page = Math.max(1, Number(params.page) || 1);
  const envelope = (response: unknown, pageSize?: number): ApiFootballDemoEnvelope => {
    const rows = Array.isArray(response) ? response : null;
    const total = rows && pageSize ? Math.max(1, Math.ceil(rows.length / pageSize)) : 1;
    const value = rows && pageSize ? rows.slice((page - 1) * pageSize, page * pageSize) : response;
    return { get, parameters, errors: [], results: Array.isArray(value) ? value.length : value ? 1 : 0,
      paging: { current: pageSize ? page : 1, total }, response: value };
  };
  const error = (field: string, message: string): ApiFootballDemoEnvelope => ({ ...envelope([]), errors: { [field]: message } });
  if (!Number.isFinite(nowMs)) return error("time", "Invalid local demo observation time.");
  if (get === "odds/live" || get === "odds/live/bets") {
    const catalog = get === "odds/live/bets", allowed = catalog ? ["id", "search"] : ["fixture", "league", "bet"];
    for (const field of Object.keys(params)) {
      if (!allowed.includes(field)) return error(field, `The ${field} field is not supported by this endpoint.`);
      if (field !== "search" && (!/^[1-9]\d*$/u.test(params[field]!) || !Number.isSafeInteger(Number(params[field])))) {
        return error(field, `The ${field} field must be a positive integer.`);
      }
    }
    if (catalog) {
      if (params.search !== undefined && params.search.length < 3) return error("search", "The Search field must contain at least 3 characters.");
      return envelope(demoLiveOddsBets.filter((row) => (!params.id || row.id === Number(params.id))
        && (!params.search || row.name.toLowerCase().includes(params.search.toLowerCase()))));
    }
    const selected = params.fixture ? demoFixtureById(Number(params.fixture), nowMs) : null;
    if (params.fixture && !selected) return envelope([]);
    // Include adjacent reporting dates so midnight does not drop late matches or
    // fixtures entering the live feed shortly before the first covered day.
    const reportingDay = Math.floor((nowMs + 10_800_000) / DEMO_DAY_MS) * DEMO_DAY_MS;
    const candidates = selected ? [selected] : [-1, 0, 1].flatMap((offset) =>
      demoFixturesForDate(new Date(reportingDay + offset * DEMO_DAY_MS).toISOString().slice(0, 10), nowMs));
    return envelope(candidates.filter((row) => (!params.league || row.league.id === Number(params.league)) && demoLiveOddsAvailable(row, nowMs))
      .map((row) => demoLiveFixtureOdds(row, demoFixtureModel(row.fixture.id)!, nowMs, probabilities, {
        ...(params.bet ? { betId: Number(params.bet) } : {}), statistics: demoFixtureStatistics(row.fixture.id, nowMs),
      })).filter((row) => row !== null));
  }
  if (params.timezone) { try { new Intl.DateTimeFormat("en", { timeZone: params.timezone }); } catch { return error("timezone", "The Timezone field is invalid."); } }
  if (params.page && (!/^\d+$/u.test(params.page) || Number(params.page) < 1)) return error("page", "The Page field must be a positive integer.");
  if (params.season && params.season !== "2026") return envelope([]);
  if (get === "status") return { get, parameters, errors: [], results: 1,
    response: { account: { firstname: "Local", lastname: "Demo", email: "demo@example.invalid" },
      subscription: { plan: "Local development demo", end: "2026-11-30T23:59:59+03:00", active: true }, requests: { current: 0, limit_day: 1_000_000 } } };
  if (get === "timezone") return envelope(["UTC", "Africa/Kampala", "Europe/London", "Europe/Paris", "America/New_York", "America/Sao_Paulo", "Asia/Tokyo", "Australia/Sydney"]);
  if (get === "countries" || get === "teams/countries") return envelope(demoFootballCatalog.leagues.filter((l) => !params.name || l.country.toLowerCase() === params.name.toLowerCase())
    .filter((l) => !params.code || l.countryCode.toLowerCase() === params.code.toLowerCase()).map((l) => ({ name: l.country, code: l.countryCode.toUpperCase(), flag: demoCountryFlag(l) })));
  if (get === "leagues/seasons") return envelope([2026]);
  if (get === "leagues") return envelope(demoFootballCatalog.leagues.filter((league) => (!params.id || league.id === Number(params.id)) &&
    (!params.country || league.country.toLowerCase() === params.country.toLowerCase()) && (!params.code || league.countryCode.toLowerCase() === params.code.toLowerCase()) &&
    (!params.name || league.name.toLowerCase() === params.name.toLowerCase()) && (!params.type || league.type.toLowerCase() === params.type.toLowerCase()) &&
    (!params.season || params.season === "2026") && (!params.team || league.teams.some((team) => team.id === Number(params.team))) &&
    (!params.search || `${league.name} ${league.country}`.toLowerCase().includes(params.search.toLowerCase()))).map(leagueEnvelope));
  if (get === "teams") return envelope(demoFootballCatalog.teams.filter((team) => (!params.id || team.id === Number(params.id)) &&
    (!params.league || team.leagueId === Number(params.league)) && (!params.country || team.country.toLowerCase() === params.country.toLowerCase()) &&
    (!params.name || team.name.toLowerCase() === params.name.toLowerCase()) && (!params.code || team.code === params.code) &&
    (!params.venue || team.venue.id === Number(params.venue)) && (!params.search || team.name.toLowerCase().includes(params.search.toLowerCase())))
    .map((team) => ({ team: { ...demoRawTeam(team), code: team.code, country: team.country, founded: team.founded, national: team.national }, venue: { ...team.venue } })));
  if (get === "venues") return envelope(demoFootballCatalog.teams.filter((team) => (!params.id || team.venue.id === Number(params.id)) &&
    (!params.city || team.venue.city.toLowerCase() === params.city.toLowerCase()) && (!params.country || team.country.toLowerCase() === params.country.toLowerCase()))
    .map((team) => ({ ...team.venue, country: team.country })));
  if (get === "teams/seasons") return envelope(demoTeamById(Number(params.team)) ? [2026] : []);
  if (get === "teams/statistics") {
    if (!params.team) return error("team", "The Team field is required.");
    const team = demoTeamById(Number(params.team));
    if (!team || params.league && team.leagueId !== Number(params.league)) return envelope([]);
    let observedAt = nowMs;
    if (params.date) {
      const cutoff = Date.parse(`${params.date}T23:59:59+03:00`);
      if (!/^\d{4}-\d{2}-\d{2}$/u.test(params.date) || !Number.isFinite(cutoff)
        || zonedDate(cutoff, "Africa/Kampala").slice(0, 10) !== params.date) return error("date", "The Date field is invalid.");
      observedAt = Math.min(nowMs, cutoff);
    }
    const statistics = demoTeamStatistics(team.id, observedAt)!;
    // This endpoint's documented object response counts its eleven sections;
    // unlike array endpoints, `results` is not the number of teams.
    return { ...envelope(statistics), results: Object.keys(statistics).length };
  }
  if (get === "standings") {
    const leagues = params.league ? [demoLeagueById(Number(params.league))].filter((league): league is DemoLeague => Boolean(league))
      : params.team ? demoFootballCatalog.leagues.filter((league) => league.teams.some((team) => team.id === Number(params.team))) : [];
    return envelope(leagues.filter((league) => league.type === "League" && (!params.team || league.teams.some((team) => team.id === Number(params.team))))
      .map((league) => {
        const result = standings(league, nowMs);
        return params.team ? { league: { ...result.league, standings: result.league.standings
          .map((group) => group.filter((row) => row.team.id === Number(params.team))).filter((group) => group.length > 0) } } : result;
      }));
  }
  if (get === "fixtures/rounds") {
    const league = demoLeagueById(Number(params.league));
    if (!league) return envelope([]);
    if (params.current === "true") {
      const day = demoDateIndex(demoReportingDate(nowMs));
      return envelope(day === null ? [] : [fixtureRound(league, day)]);
    }
    return envelope(league.type === "Cup" ? cupRounds : Array.from({ length: Math.ceil(DEMO_DAYS / 3) }, (_, index) => fixtureRound(league, index * 3)));
  }
  if (get === "fixtures/headtohead") {
    const [home, away] = (params.h2h ?? "").split("-").map(Number);
    if (!home || !away) return error("h2h", "The H2h field is required.");
    const filters = { ...params }; delete filters.last; delete filters.next;
    let rows = fixtureRows({ ...filters, team: String(home) }, nowMs).filter((fixture) => fixture.teams.home.id === away || fixture.teams.away.id === away);
    if (params.last) rows = rows.filter((row) => finishedCodes.has(row.fixture.status.short)).slice(-Math.max(0, Number(params.last)));
    if (params.next) rows = rows.filter((row) => row.fixture.timestamp * 1_000 >= nowMs && ["NS", "TBD"].includes(row.fixture.status.short)).slice(0, Math.max(0, Number(params.next)));
    return envelope(rows);
  }
  if (get === "fixtures") {
    const rows = fixtureRows(params, nowMs);
    return envelope(params.id || params.ids ? rows.map((row) => withDetails(row, nowMs)) : params.live ? rows.map((row) => ({ ...row, events: demoFixtureEvents(row.fixture.id, nowMs) })) : rows);
  }
  if (get === "fixtures/statistics" && params.half !== undefined && !["true", "false"].includes(params.half)) {
    return error("half", "The Half field must be true or false.");
  }
  const fixture = params.fixture ? demoFixtureById(Number(params.fixture), nowMs, params.timezone ?? "UTC") : null;
  if (params.fixture && !fixture) return envelope([]);
  if (["fixtures/events", "fixtures/lineups", "fixtures/statistics", "fixtures/players", "predictions"].includes(get)) {
    if (!params.fixture) return error("fixture", "The Fixture field is required.");
    if (!fixture) return envelope([]);
    const id = fixture.fixture.id;
    if (get === "predictions") return envelope([predictions(fixture, nowMs)]);
    if (get === "fixtures/events") return envelope(demoFixtureEvents(id, nowMs).filter((event) => (!params.team || event.team.id === Number(params.team)) &&
      (!params.player || event.player.id === Number(params.player)) && (!params.type || event.type.toLowerCase() === params.type.toLowerCase())));
    if (get === "fixtures/lineups") return envelope(demoFixtureLineups(id, nowMs).filter((row) => (!params.team || row.team.id === Number(params.team)) &&
      (!params.player || [...row.startXI, ...row.substitutes].some((player) => player.player.id === Number(params.player)))));
    if (get === "fixtures/statistics") {
      const matchesTeam = (row: { team: { id: number } }) => !params.team || row.team.id === Number(params.team);
      const matchesType = (statistic: { type: string }) => !params.type || statistic.type === params.type;
      if (params.half === "true") {
        // The provider's half variant represents goals_prevented as a number.
        // Preserve the existing default response for ordinary production consumers.
        const select = (statistics: ReturnType<typeof demoFixtureStatistics>[number]["statistics"]) => statistics.filter(matchesType)
          .map((statistic) => statistic.type === "goals_prevented" && statistic.value !== null
            ? { ...statistic, value: Number(statistic.value) } : statistic);
        // API-Football v3.9.3's "With half parameter" example adds these two
        // arrays beside the full-match statistics, using the same entry shape.
        // Source: https://api-sports.io/public/documentations/football-v3.yaml
        return envelope(demoFixtureStatisticsPeriods(id, nowMs).filter(matchesTeam).map((row) => ({
          team: row.team, statistics: select(row.statistics), statistics_1h: select(row.firstHalf),
          statistics_2h: select(row.secondHalf ?? []),
        })));
      }
      return envelope(demoFixtureStatistics(id, nowMs).filter(matchesTeam)
        .map((row) => ({ ...row, statistics: row.statistics.filter(matchesType) })));
    }
    return envelope(demoFixturePlayers(id, nowMs).filter((row) => !params.team || row.team.id === Number(params.team)));
  }
  if (get === "injuries") {
    const rows = fixture ? [fixture] : params.ids ? params.ids.split("-").flatMap((id) => { const row = demoFixtureById(Number(id), nowMs); return row ? [row] : []; })
      : fixtureRows({ ...params, date: params.date ?? demoReportingDate(nowMs) }, nowMs);
    return envelope(rows.flatMap(injuries).filter((row) => (!params.team || row.team.id === Number(params.team)) && (!params.player || row.player.id === Number(params.player))));
  }
  if (get === "odds/bookmakers" || get === "odds/bets") return envelope((get === "odds/bookmakers" ? bookmakerRows : demoOddsBets)
    .filter((row) => (!params.id || row.id === Number(params.id)) && (!params.search || row.name.toLowerCase().includes(params.search.toLowerCase()))));
  if (get === "odds") {
    const rows = fixture ? [fixture] : fixtureRows({ ...params, date: params.date ?? demoReportingDate(nowMs) }, nowMs);
    return envelope(rows.map((row) => demoFixtureOdds(row.fixture.id, nowMs, params.bookmaker ? Number(params.bookmaker) : undefined,
      params.bet ? Number(params.bet) : undefined, params.timezone ?? "UTC")).filter(Boolean), 10);
  }
  if (get === "players/squads") {
    const team = params.team ? demoTeamById(Number(params.team)) : params.player ? demoFootballCatalog.teams[Math.floor((Number(params.player) - 100_000_000) / 32)] : null;
    return envelope(team ? [{ team: demoRawTeam(team), players: Array.from({ length: 24 }, (_, i) => {
      const player = demoPlayer(team, i); return { id: player.id, name: player.name, age: player.age, number: player.number, position: fullPosition(player.position), photo: player.photo };
    }) }] : []);
  }
  if (["players", "players/topscorers", "players/topassists", "players/topyellowcards", "players/topredcards"].includes(get)) {
    const teams = params.team ? [demoTeamById(Number(params.team))].filter((row): row is DemoTeam => Boolean(row))
      : params.id ? [demoFootballCatalog.teams[Math.floor((Number(params.id) - 100_000_000) / 32)]].filter((row): row is DemoTeam => Boolean(row))
      : demoFootballCatalog.teams.filter((team) => params.league && team.leagueId === Number(params.league));
    let players = teams.flatMap((team) => Array.from({ length: 24 }, (_, index) => ({ team, index, player: demoPlayer(team, index) })))
      .filter((row) => (!params.id || row.player.id === Number(params.id)) && (!params.search || row.player.name.toLowerCase().includes(params.search.toLowerCase())));
    if (get !== "players") {
      const metric = get === "players/topassists" ? "assists" : get === "players/topyellowcards" ? "yellow" : get === "players/topredcards" ? "red" : "goals";
      players = players.sort((a, b) => seasonPlayers(b.team, nowMs)[b.index]![metric] - seasonPlayers(a.team, nowMs)[a.index]![metric] || a.player.id - b.player.id).slice(0, 20);
    }
    // Only materialize the current official 20-player page; aggregate generation is otherwise needlessly expensive.
    const total = Math.max(1, Math.ceil(players.length / 20)), selected = players.slice((page - 1) * 20, page * 20).map((row) => playerSeasonStatistics(row.team, row.index, nowMs));
    return { ...envelope(selected), paging: { current: page, total } };
  }
  if (get === "players/seasons") return envelope([2026]);
  return error("endpoint", `The ${get} endpoint is not supported by the local development demo.`);
}

export function createDemoApiFootballFetch(options: Readonly<{ now?: () => number }> = {}): typeof fetch {
  return async (input, init) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request?.url ?? (input instanceof URL ? input.href : String(input)));
    if ((init?.signal ?? request?.signal)?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    if ((init?.method ?? request?.method ?? "GET").toUpperCase() !== "GET") return new Response(null, { status: 405, headers: { Allow: "GET" } });
    const result = demoApiFootballResponse(url.pathname, Object.fromEntries(url.searchParams), options.now?.() ?? Date.now());
    return new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json",
      "x-ratelimit-requests-limit": "1000000", "x-ratelimit-requests-remaining": "999999" } });
  };
}
