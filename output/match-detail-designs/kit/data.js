/* Illustrative sample for every design: one live Premier League fixture carrying every field
 * the page can show (Goal Hint revision + API-Football fixture, events, statistics, lineups,
 * injuries, standings, team statistics, predictions comparison, players, venue, odds). */
window.M = {
  league: { name: "Premier League", country: "England", round: "Round 8", season: "2025/26",
    logo: "https://media.api-sports.io/football/leagues/39.png" },
  kickoff: { day: "Sat 18 Oct", time: "19:30", tz: "EAT" },
  status: { state: "live", minute: "67'", ht: "1–1", long: "Second half" },
  venue: { name: "Emirates Stadium", city: "London", capacity: "60,704", surface: "Grass" },
  referee: { name: "Michael Oliver", country: "England" },
  home: { short: "ARS", name: "Arsenal", color: "#DB0007", goals: 1, coach: "Mikel Arteta", formation: "4-3-3",
    logo: "https://media.api-sports.io/football/teams/42.png" },
  away: { short: "CHE", name: "Chelsea", color: "#034694", goals: 1, coach: "Enzo Maresca", formation: "4-2-3-1",
    logo: "https://media.api-sports.io/football/teams/49.png" },
  scorers: { home: [{ name: "Saka", min: "12'" }], away: [{ name: "Palmer", min: "34'", note: "pen" }] },

  publication: { published: "09:12", day: "Sat 18 Oct", revision: 3, cutoff: "08:45", source: "AI + API-Football",
    settles: "Settles at full time (90' + stoppage)", locks: "Locked at kick-off" },

  /* Picks in policy order; `top` is the highest-probability pick. `live` is the as-it-stands reading. */
  markets: [
    { id: "mr", code: "1X2", name: "Match result", pick: "1", pickLabel: "Arsenal win", short: "Arsenal win", rail: "Arsenal win", prob: 54, odds: "1.85",
      live: { ok: false, text: "Level at 1–1" }, status: "Pending",
      outcomes: [
        { k: "1", label: "Arsenal", p: 54, odds: "1.85", implied: 52 },
        { k: "X", label: "Draw", p: 24, odds: "3.60", implied: 27 },
        { k: "2", label: "Chelsea", p: 22, odds: "4.33", implied: 21 }] },
    { id: "dc", code: "DC", name: "Double chance", pick: "1X", pickLabel: "Arsenal or draw", short: "Arsenal or draw", rail: "ARS or draw", prob: 78, odds: "1.25", top: true,
      live: { ok: true, text: "On track" }, status: "Pending",
      outcomes: [
        { k: "1X", label: "Arsenal or draw", p: 78, odds: "1.25", implied: 77 },
        { k: "12", label: "Either team wins", p: 76, odds: "1.30", implied: 74 },
        { k: "X2", label: "Draw or Chelsea", p: 46, odds: "1.95", implied: 49 }] },
    { id: "tg", code: "O/U 2.5", name: "Total goals 2.5", pick: "Over", pickLabel: "Over 2.5 goals", short: "Over 2.5", rail: "Over 2.5", prob: 61, odds: "1.72",
      live: { ok: false, text: "Needs 1 more goal" }, status: "Pending",
      outcomes: [
        { k: "Over", label: "Over 2.5", p: 61, odds: "1.72", implied: 56 },
        { k: "Under", label: "Under 2.5", p: 39, odds: "2.10", implied: 44 }] },
    { id: "bt", code: "BTTS", name: "Both teams to score", pick: "Yes", pickLabel: "Both teams score", short: "Yes", rail: "Both score", prob: 58, odds: "1.80",
      live: { ok: true, text: "Both have scored" }, status: "Pending",
      outcomes: [
        { k: "Yes", label: "Yes", p: 58, odds: "1.80", implied: 53 },
        { k: "No", label: "No", p: 42, odds: "1.95", implied: 47 }] },
  ],

  analysis: {
    reasons: [
      "Arsenal are unbeaten in 9 home league games (7 wins), scoring 2.3 a game.",
      "Chelsea have scored in every away game but kept 1 clean sheet in 8.",
      "Chelsea are without Fofana and Lavia; Arsenal's back four is unchanged.",
    ],
    uncertainty: "Palmer has scored in 4 straight away games, and 2 of the last 5 meetings were draws.",
    sources: ["BBC Sport", "Sky Sports", "The Athletic", "API-Football"],
  },

  events: [
    { min: "12'", side: "home", type: "goal", player: "B. Saka", sub: "Assist: M. Ødegaard", score: "1–0" },
    { min: "29'", side: "away", type: "yellow", player: "M. Caicedo", sub: "Foul" },
    { min: "34'", side: "away", type: "goal", player: "C. Palmer", sub: "Penalty", score: "1–1" },
    { min: "41'", side: "home", type: "yellow", player: "D. Rice", sub: "Foul" },
    { min: "HT", type: "break", text: "Half-time 1–1" },
    { min: "58'", side: "home", type: "var", player: "K. Havertz", sub: "Goal cancelled · offside" },
    { min: "63'", side: "home", type: "sub", player: "L. Trossard", sub: "Off: G. Martinelli" },
    { min: "66'", side: "away", type: "sub", player: "C. Nkunku", sub: "Off: P. Neto" },
  ],

  stats: [
    ["Possession", "58%", "42%", 58, 42],
    ["Expected goals (xG)", "1.62", "0.88", 1.62, 0.88],
    ["Shots", "13", "7", 13, 7],
    ["Shots on target", "4", "3", 4, 3],
    ["Corners", "7", "2", 7, 2],
    ["Fouls", "9", "12", 9, 12],
    ["Offsides", "3", "1", 3, 1],
    ["Yellow cards", "1", "1", 1, 1],
    ["Red cards", "0", "0", 0, 0],
    ["Goalkeeper saves", "2", "3", 2, 3],
    ["Passes", "431", "308", 431, 308],
    ["Pass accuracy", "87%", "80%", 87, 80],
  ],

  /* API-Football grid "row:col"; rows run from the goalkeeper forward. */
  lineups: {
    home: { formation: "4-3-3", coach: "Mikel Arteta", xi: [
      [22, "Raya", "1:1"], [4, "White", "2:4"], [2, "Saliba", "2:3"], [6, "Gabriel", "2:2"], [33, "Calafiori", "2:1"],
      [8, "Ødegaard", "3:3"], [5, "Partey", "3:2"], [41, "Rice", "3:1", "yellow"],
      [7, "Saka", "4:3", "goal"], [29, "Havertz", "4:2"], [11, "Martinelli", "4:1", "off"]],
      bench: [[19, "Trossard", "on"], [1, "Kepa"], [23, "Merino"], [15, "Kiwior"], [17, "Zinchenko"], [53, "Nwaneri"], [20, "Jorginho"]],
      ratings: { Saka: 7.9, "Ødegaard": 7.4, Saliba: 7.3, Rice: 6.9 } },
    away: { formation: "4-2-3-1", coach: "Enzo Maresca", xi: [
      [1, "Sánchez", "1:1"], [27, "Gusto", "2:4"], [4, "Tosin", "2:3"], [6, "Colwill", "2:2"], [3, "Cucurella", "2:1"],
      [25, "Caicedo", "3:2", "yellow"], [8, "Fernández", "3:1"],
      [11, "Madueke", "4:3"], [20, "Palmer", "4:2", "goal"], [7, "Neto", "4:1", "off"], [15, "Jackson", "5:1"]],
      bench: [[18, "Nkunku", "on"], [12, "Jørgensen"], [10, "Mudryk"], [22, "Dewsbury-Hall"], [24, "James"], [29, "Veiga"], [14, "Chalobah"]],
      ratings: { Palmer: 7.6, Caicedo: 7.1, "Sánchez": 7.0 } },
  },

  injuries: {
    home: [["T. Tomiyasu", "Out", "Knee injury"], ["G. Jesus", "Doubtful", "Hamstring"]],
    away: [["W. Fofana", "Out", "Hamstring"], ["R. Lavia", "Out", "Thigh"], ["B. Badiashile", "Doubtful", "Illness"]],
  },

  /* Newest first. */
  form: {
    home: [["W", "3–1", "Southampton", "H"], ["W", "2–0", "West Ham", "A"], ["D", "2–2", "Man City", "A"], ["W", "1–0", "PSG", "H"], ["W", "4–2", "Leicester", "H"]],
    away: [["W", "4–2", "Brighton", "H"], ["D", "1–1", "Nottm Forest", "H"], ["W", "3–0", "West Ham", "A"], ["L", "1–2", "Liverpool", "A"], ["W", "2–1", "Bournemouth", "A"]],
  },

  h2h: {
    summary: { home: 3, draw: 2, away: 0, goals: "2.6", btts: "3/5", over: "3/5" },
    meetings: [
      ["Apr 2025", "Arsenal", "1–0", "Chelsea", "H"], ["Nov 2024", "Chelsea", "1–1", "Arsenal", "D"],
      ["Apr 2024", "Arsenal", "5–0", "Chelsea", "H"], ["Oct 2023", "Chelsea", "2–2", "Arsenal", "D"],
      ["May 2023", "Arsenal", "3–1", "Chelsea", "H"]],
  },

  table: [
    [1, "Liverpool", 7, "+9", 18, "WWLWW"], [2, "Arsenal", 7, "+10", 17, "WDWWW"], [3, "Man City", 7, "+8", 16, "WWDLW"],
    [4, "Chelsea", 7, "+6", 14, "WLWDW"], [5, "Aston Villa", 7, "+3", 14, "DWWLW"], [6, "Brighton", 7, "+2", 12, "LWDWD"]],

  /* League team statistics this season. */
  season: [
    ["Goals scored / game", "2.1", "1.9"], ["Goals conceded / game", "0.7", "1.0"], ["Clean sheets", "43%", "29%"],
    ["Failed to score", "0%", "14%"], ["Both teams scored", "43%", "57%"], ["Over 2.5 goals", "57%", "71%"],
    ["Home / away record", "W3 D1 L0", "W2 D1 L1"]],

  /* API-Football predictions comparison, home share of 100. */
  compare: [["Form", 64], ["Attack", 55], ["Defence", 62], ["Poisson", 57], ["Head-to-head", 71], ["Goals", 54], ["Overall", 61]],

  players: {
    home: [["B. Saka", "RW", 4, 5, "7.81"], ["K. Havertz", "CF", 4, 1, "7.12"]],
    away: [["C. Palmer", "AM", 6, 4, "7.92"], ["N. Jackson", "CF", 5, 1, "7.05"]],
  },

  schedule: {
    rest: { home: "3 days", away: "4 days" },
    last: { home: "W 3–1 Southampton", away: "W 4–2 Brighton" },
    next: { home: "Inter (A) · UCL · Wed 22 Oct", away: "Panathinaikos (A) · UECL · Thu 23 Oct" },
  },

  news: [
    { title: "Arteta: Saliba fit to face Chelsea", publisher: "BBC Sport", ago: "6 h", kind: "Report" },
    { title: "Fofana out for several weeks, Maresca confirms", publisher: "Sky Sports", ago: "1 d", kind: "Report" },
    { title: "Why Palmer decides Chelsea's big away games", publisher: "The Athletic", ago: "1 d", kind: "Analysis" },
  ],

  oddsMeta: "Bookmaker median · updated 19:20",

  history: [
    { rev: 3, when: "Today 09:12", note: "1X2 Arsenal 51% → 54%", current: true },
    { rev: 2, when: "Today 06:05", note: "O/U Over 58% → 61%" },
    { rev: 1, when: "Fri 21:40", note: "First publication" },
  ],

  disclaimer: "Probabilities are Goal Hint estimates, not guarantees. Odds are for information only. 18+.",
};
