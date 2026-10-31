import { isCompletedFixtureStatus } from "../../src/domain/market-settlement.ts";
import { reviewState } from "./catalog.mjs";

// Deliberately synthetic: these records are design fixtures, not sports reporting.
const home = { id: "ars", name: "Arsenal", code: "ARS", color: "#bd303b", city: "London" };
const away = { id: "liv", name: "Liverpool", code: "LIV", color: "#4165aa", city: "Liverpool" };
const player = (name, number, age, rating, position, x, y) => ({ name, number, age, rating, position, x, y, photo: null });
const squads = [
  { team: home, formation: "4–3–3", manager: "Alex Bennett", starters: [
    player("Daniel Mercer", 1, 28, 7.2, "Goalkeeper", 50, 88),
    player("Ethan Clarke", 4, 25, 7.4, "Right back", 16, 67), player("Isaac Mensah", 5, 26, 7.6, "Centre back", 39, 72),
    player("Leo Martin", 6, 24, 7.1, "Centre back", 62, 72), player("Noah Silva", 3, 27, 7.3, "Left back", 85, 67),
    player("Oliver James", 8, 25, 7.8, "Midfielder", 23, 46), player("Theo Laurent", 16, 26, 7.5, "Midfielder", 50, 52),
    player("Gabriel Costa", 10, 24, 8.1, "Midfielder", 77, 46),
    player("Samuel Okoro", 7, 23, 8.3, "Right winger", 19, 21), player("Lucas Moreau", 9, 26, 7.7, "Striker", 50, 16),
    player("Rafael Santos", 11, 22, 7.6, "Left winger", 81, 21),
  ], substitutes: [player("Adam Foster", 22, 25, 6.8, "Goalkeeper"), player("Nico Rossi", 18, 23, 7.0, "Defender"), player("Jude Ellis", 20, 21, 7.2, "Midfielder"), player("Ben Walker", 14, 24, 6.9, "Forward")] },
  { team: away, formation: "4–2–3–1", manager: "David Almeida", starters: [
    player("Marco Ferreira", 1, 29, 7.6, "Goalkeeper", 50, 88),
    player("Jack Hughes", 2, 24, 7.1, "Right back", 16, 69), player("David Nwosu", 5, 27, 7.4, "Centre back", 39, 73),
    player("Felix Andersen", 4, 26, 7.3, "Centre back", 62, 73), player("Mateo Vega", 3, 25, 7.2, "Left back", 85, 69),
    player("Hugo Bernard", 6, 26, 7.5, "Midfielder", 34, 53), player("Oscar Berg", 8, 24, 7.3, "Midfielder", 67, 53),
    player("Amir Hassan", 11, 25, 8.0, "Right winger", 19, 34), player("Luis Duarte", 10, 23, 7.8, "Attacking midfielder", 50, 36),
    player("Jamie Reid", 7, 24, 7.5, "Left winger", 81, 34), player("Enzo Romano", 9, 27, 7.9, "Striker", 50, 14),
  ], substitutes: [player("Max Turner", 13, 26, 6.7, "Goalkeeper"), player("Aaron Cole", 21, 22, 6.9, "Defender"), player("Tom Fischer", 17, 24, 7.1, "Midfielder"), player("Ivan Petrov", 19, 25, 7.0, "Forward")] },
];
const meetings = [
  ["2026-04-18", "Premier League", "home", 2, 1], ["2025-11-09", "Premier League", "away", 1, 1],
  ["2025-05-11", "Premier League", "away", 2, 2], ["2024-10-27", "Premier League", "home", 2, 2],
  ["2024-02-04", "Premier League", "home", 3, 1], ["2024-01-07", "FA Cup", "home", 0, 2],
  ["2023-12-23", "Premier League", "away", 1, 1], ["2023-04-09", "Premier League", "away", 2, 2],
  ["2022-10-09", "Premier League", "home", 3, 2], ["2022-03-16", "Premier League", "home", 0, 2],
  ["2022-01-20", "League Cup", "home", 0, 2], ["2022-01-13", "League Cup", "away", 0, 0],
].map(([date, competition, host, homeScore, awayScore]) => ({ date, competition, home: host === "home" ? home : away, away: host === "home" ? away : home, homeScore, awayScore }));
const form = [
  { team: home, points: 13, records: [
    ["2026-10-25", "Chelsea", "A", 2, 1], ["2026-10-18", "Brighton", "H", 3, 0], ["2026-10-04", "Everton", "A", 1, 1],
    ["2026-09-27", "Fulham", "H", 2, 0], ["2026-09-20", "Newcastle", "A", 1, 0],
  ] },
  { team: away, points: 10, records: [
    ["2026-10-25", "Tottenham", "H", 2, 0], ["2026-10-18", "Man City", "A", 1, 2], ["2026-10-04", "West Ham", "H", 3, 1],
    ["2026-09-27", "Aston Villa", "A", 1, 1], ["2026-09-20", "Wolves", "H", 2, 0],
  ] },
].map(group => ({ ...group, records: group.records.map(([date, opponent, venue, scored, conceded]) => ({ date, opponent, venue, scored, conceded })) }));
const table = [
  ["Man City", 10, 7, 2, 1, 16, 23], ["Arsenal", 10, 7, 2, 1, 14, 23], ["Liverpool", 10, 6, 3, 1, 12, 21],
  ["Chelsea", 10, 6, 1, 3, 9, 19], ["Aston Villa", 10, 5, 3, 2, 7, 18], ["Newcastle", 10, 5, 2, 3, 5, 17],
  ["Brighton", 10, 4, 4, 2, 4, 16], ["Tottenham", 10, 4, 3, 3, 3, 15], ["Fulham", 10, 4, 2, 4, 1, 14],
  ["Brentford", 10, 3, 4, 3, 0, 13], ["Bournemouth", 10, 3, 3, 4, -2, 12], ["West Ham", 10, 3, 2, 5, -3, 11],
  ["Everton", 10, 2, 4, 4, -5, 10], ["Crystal Palace", 10, 2, 4, 4, -6, 10], ["Nott'm Forest", 10, 2, 3, 5, -7, 9],
  ["Leicester", 10, 2, 2, 6, -8, 8], ["Southampton", 10, 1, 4, 5, -9, 7], ["Wolves", 10, 1, 4, 5, -10, 7],
  ["Ipswich", 10, 1, 3, 6, -11, 6], ["Leeds", 10, 1, 1, 8, -10, 4],
].map(([name, played, won, drawn, lost, gd, points], index) => ({ position: index + 1, name, played, won, drawn, lost, gd, points }));
const forecasts = {
  featured: { id: "btts-yes", market: "Both teams to score", selection: "Yes", probability: 74, odds: 1.62,
    explanation: "Both sides have created consistent chances in this sample. Their recent attacking output supports a goal for each team, although a low-tempo game remains a risk." },
  markets: [
    { id: "over-25", category: "Goals", market: "Total goals · 2.5", selection: "Over 2.5", probability: 68, odds: 1.78, explanation: "The recent scoring and chance-creation sample points toward three or more goals. A cautious opening would weaken this scenario." },
    { id: "home-draw", category: "Result", market: "Double chance", selection: "Arsenal or draw", probability: 72, odds: 1.42, explanation: "Home advantage and recent results favor the home side avoiding defeat. This remains an estimate, not a guarantee." },
    { id: "home-win", category: "Result", market: "Match result · 1X2", selection: "Arsenal", probability: 46, odds: 2.18, explanation: "The home side has a narrow estimated advantage; the draw and an away win remain plausible." },
    { id: "over-15", category: "Goals", market: "Total goals · 1.5", selection: "Over 1.5", probability: 83, odds: null, explanation: "Two goals are supported by the sample attacking profile. No licensed odds are available for this selection in the preview." },
  ],
  scenarios: [
    { title: "Home win", probability: 46, text: "The home side sustains pressure, wins the midfield second balls, and converts the stronger chances." },
    { title: "Draw", probability: 27, text: "The teams trade territory without either creating enough separation. Set pieces could decide the balance." },
    { title: "Away win", probability: 27, text: "The visitors break the first press and exploit space behind the advancing home fullbacks." },
  ],
};

export function fixtureForReview(parameters = new URLSearchParams()) {
  const requested = new URLSearchParams(parameters);
  if (!["subscriber", "guest", "member", "referral"].includes(requested.get("viewer"))) requested.set("viewer", "guest");
  const { viewer, status } = reviewState(requested);
  const completed = isCompletedFixtureStatus(status), entitled = viewer === "subscriber" || viewer === "referral";
  const canView = completed || entitled, played = status === "live" || completed;
  return {
    synthetic: true, viewer, status, canView, accessReason: completed ? "completed" : entitled ? viewer : "locked",
    home, away, competition: "Premier League", round: "Matchweek 11", kickoff: "2026-10-31T17:30:00Z",
    score: played ? { home: 2, away: 1 } : null,
    forecasts: canView ? structuredClone(forecasts) : null,
    comparisons: [
      { name: "Goals per match", home: 1.8, away: 1.8, max: 3 }, { name: "Goals conceded", home: 0.4, away: 0.8, max: 3, lowerBetter: true },
      { name: "Shots on target", home: 6.4, away: 5.8, max: 10 }, { name: "Possession", home: 59, away: 56, max: 100, suffix: "%" },
      { name: "Pass accuracy", home: 87, away: 85, max: 100, suffix: "%" }, { name: "Corners per match", home: 6.6, away: 5.2, max: 10 },
    ],
    liveStats: played ? [
      { name: "Possession", home: 56, away: 44, max: 100, suffix: "%" }, { name: "Total shots", home: 14, away: 10, max: 25 },
      { name: "Shots on target", home: 6, away: 4, max: 10 }, { name: "Corners", home: 7, away: 4, max: 12 },
      { name: "Fouls", home: 8, away: 11, max: 20, lowerBetter: true }, { name: "Yellow cards", home: 1, away: 2, max: 5, lowerBetter: true },
    ] : null,
    form, meetings, table, squads,
    events: played ? [
      { minute: 12, side: "home", type: "goal", title: "Samuel Okoro", detail: "Goal · assist Gabriel Costa" },
      { minute: 29, side: "away", type: "card", title: "Hugo Bernard", detail: "Yellow card · late challenge" },
      { minute: 38, side: "away", type: "goal", title: "Enzo Romano", detail: "Goal · assist Amir Hassan" },
      { minute: 45, side: "neutral", type: "clock", title: "Half-time", detail: "Interval" },
      { minute: 56, side: "home", type: "goal", title: "Lucas Moreau", detail: "Goal · assist Samuel Okoro" },
      { minute: 64, side: "away", type: "sub", title: "Tom Fischer → Oscar Berg", detail: "Substitution · midfield" },
      ...(completed ? [{ minute: 90, side: "neutral", type: "clock", title: "Full-time", detail: "Match completed" }] : []),
    ] : [],
    venue: { name: "Emirates Stadium", location: "London, England", capacity: "60,700", pitch: "105 × 68 m", surface: "Hybrid grass", weather: "14°", conditions: "Partly cloudy", referee: "Chris Morgan", assistant: "James Cooper · Ryan Bell", var: "Michael Taylor" },
    news: [
      { id: "squad", tag: "Team news", title: "Both squads complete their final training session", text: "This illustrative team update shows where a verified club report would appear. Selection and fitness details require confirmation.", source: "Club training report", time: "2 hours before kickoff" },
      { id: "tactics", tag: "Tactical briefing", title: "Wide overloads meet a compact midfield", text: "The home side’s overlapping fullbacks and the visitors’ central cover offer two different ways of controlling the game.", source: "Match analysis desk", time: "Matchday briefing" },
    ],
    sources: [
      { name: "Competition match centre", scope: "Fixture status, events and standings" },
      { name: "Official club team sheets", scope: "Confirmed lineups and availability" },
      { name: "Verified results provider", scope: "Previous meetings and team statistics" },
    ],
  };
}
