/* Illustrative sample shared by the ten desktop designs: one live Premier League fixture carrying every field the
 * page can show — the Goal Hint revision (picks, reasons, history) and everything API-Football returns for a
 * fixture: /fixtures (status, score, venue, referee), /fixtures/events, /fixtures/statistics, /fixtures/lineups,
 * /fixtures/players, /injuries, /fixtures/headtohead, /standings, /teams/statistics, /predictions (comparison and
 * advice), /players (season), /venues and /odds. */
window.M = {
  league: { name: "Premier League", country: "England", round: "Round 8", season: "2025/26",
    logo: "https://media.api-sports.io/football/leagues/39.png" },
  kickoff: { day: "Sat 18 Oct", date: "Saturday 18 October 2025", time: "19:30", tz: "EAT" },
  status: { state: "live", minute: "67'", elapsed: 67, ht: "1–1", long: "Second half" },
  venue: { name: "Emirates Stadium", city: "London", address: "Hornsey Road", capacity: "60,704", surface: "Grass" },
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
    { id: "mr", code: "1X2", name: "Match result", pick: "1", pickLabel: "Arsenal win", short: "Arsenal win", prob: 54, odds: "1.85",
      live: { ok: false, text: "Level at 1–1", need: "Arsenal need 1 goal" }, status: "Pending",
      outcomes: [
        { k: "1", label: "Arsenal", p: 54, odds: "1.85", open: "1.95", best: "1.90", implied: 52 },
        { k: "X", label: "Draw", p: 24, odds: "3.60", open: "3.40", best: "3.75", implied: 27 },
        { k: "2", label: "Chelsea", p: 22, odds: "4.33", open: "4.00", best: "4.50", implied: 21 }] },
    { id: "dc", code: "DC", name: "Double chance", pick: "1X", pickLabel: "Arsenal or draw", short: "ARS or draw", prob: 78, odds: "1.25", top: true,
      live: { ok: true, text: "On track", need: "Holds unless Chelsea score" }, status: "Pending",
      outcomes: [
        { k: "1X", label: "Arsenal or draw", p: 78, odds: "1.25", open: "1.28", best: "1.28", implied: 77 },
        { k: "12", label: "Either team wins", p: 76, odds: "1.30", open: "1.30", best: "1.33", implied: 74 },
        { k: "X2", label: "Draw or Chelsea", p: 46, odds: "1.95", open: "1.90", best: "2.00", implied: 49 }] },
    { id: "tg", code: "O/U 2.5", name: "Total goals 2.5", pick: "Over", pickLabel: "Over 2.5 goals", short: "Over 2.5", prob: 61, odds: "1.72",
      live: { ok: false, text: "Needs 1 more goal", need: "1 more goal in 23'" }, status: "Pending",
      outcomes: [
        { k: "Over", label: "Over 2.5", p: 61, odds: "1.72", open: "1.80", best: "1.77", implied: 56 },
        { k: "Under", label: "Under 2.5", p: 39, odds: "2.10", open: "2.00", best: "2.15", implied: 44 }] },
    { id: "bt", code: "BTTS", name: "Both teams to score", pick: "Yes", pickLabel: "Both teams score", short: "Both score", prob: 58, odds: "1.80",
      live: { ok: true, text: "Both have scored", need: "Already won on the pitch" }, status: "Pending",
      outcomes: [
        { k: "Yes", label: "Yes", p: 58, odds: "1.80", open: "1.85", best: "1.85", implied: 53 },
        { k: "No", label: "No", p: 42, odds: "1.95", open: "1.90", best: "2.00", implied: 47 }] },
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

  /* `m` is the match minute for timeline placement. */
  events: [
    { m: 12, min: "12'", side: "home", type: "goal", player: "B. Saka", sub: "Assist: M. Ødegaard", score: "1–0" },
    { m: 29, min: "29'", side: "away", type: "yellow", player: "M. Caicedo", sub: "Foul" },
    { m: 34, min: "34'", side: "away", type: "goal", player: "C. Palmer", sub: "Penalty", score: "1–1" },
    { m: 41, min: "41'", side: "home", type: "yellow", player: "D. Rice", sub: "Foul" },
    { m: 45, min: "HT", type: "break", text: "Half-time 1–1" },
    { m: 58, min: "58'", side: "home", type: "var", player: "K. Havertz", sub: "Goal cancelled · offside" },
    { m: 63, min: "63'", side: "home", type: "sub", player: "L. Trossard", sub: "Off: G. Martinelli" },
    { m: 66, min: "66'", side: "away", type: "sub", player: "C. Nkunku", sub: "Off: P. Neto" },
  ],

  /* All 17 API-Football fixture statistics: label, home text, away text, home value, away value. */
  stats: [
    ["Possession", "58%", "42%", 58, 42],
    ["Expected goals (xG)", "1.62", "0.88", 1.62, 0.88],
    ["Total shots", "13", "7", 13, 7],
    ["Shots on target", "4", "3", 4, 3],
    ["Shots off target", "6", "3", 6, 3],
    ["Blocked shots", "3", "1", 3, 1],
    ["Shots inside the box", "9", "4", 9, 4],
    ["Shots outside the box", "4", "3", 4, 3],
    ["Corners", "7", "2", 7, 2],
    ["Fouls", "9", "12", 9, 12],
    ["Offsides", "3", "1", 3, 1],
    ["Yellow cards", "1", "1", 1, 1],
    ["Red cards", "0", "0", 0, 0],
    ["Goalkeeper saves", "2", "3", 2, 3],
    ["Passes", "431", "308", 431, 308],
    ["Accurate passes", "375", "246", 375, 246],
    ["Pass accuracy", "87%", "80%", 87, 80],
  ],

  /* API-Football grid "row:col"; rows run from the goalkeeper forward. Marks: goal, yellow, off (subbed off). */
  lineups: {
    home: { formation: "4-3-3", coach: "Mikel Arteta", captain: "Ødegaard", xi: [
      [22, "Raya", "1:1"], [4, "White", "2:4"], [2, "Saliba", "2:3"], [6, "Gabriel", "2:2"], [33, "Calafiori", "2:1"],
      [8, "Ødegaard", "3:3"], [5, "Partey", "3:2"], [41, "Rice", "3:1", "yellow"],
      [7, "Saka", "4:3", "goal"], [29, "Havertz", "4:2"], [11, "Martinelli", "4:1", "off"]],
      bench: [[19, "Trossard", "on", "63'"], [1, "Kepa"], [23, "Merino"], [15, "Kiwior"], [17, "Zinchenko"], [53, "Nwaneri"], [20, "Jorginho"]],
      ratings: { Raya: 6.8, White: 7.0, Saliba: 7.3, Gabriel: 7.1, Calafiori: 6.9, "Ødegaard": 7.4, Partey: 6.8, Rice: 6.9, Saka: 7.9, Havertz: 7.0, Martinelli: 6.5, Trossard: 6.6 } },
    away: { formation: "4-2-3-1", coach: "Enzo Maresca", captain: "Fernández", xi: [
      [1, "Sánchez", "1:1"], [27, "Gusto", "2:4"], [4, "Tosin", "2:3"], [6, "Colwill", "2:2"], [3, "Cucurella", "2:1"],
      [25, "Caicedo", "3:2", "yellow"], [8, "Fernández", "3:1"],
      [11, "Madueke", "4:3"], [20, "Palmer", "4:2", "goal"], [7, "Neto", "4:1", "off"], [15, "Jackson", "5:1"]],
      bench: [[18, "Nkunku", "on", "66'"], [12, "Jørgensen"], [10, "Mudryk"], [22, "Dewsbury-Hall"], [24, "James"], [29, "Veiga"], [14, "Chalobah"]],
      ratings: { "Sánchez": 7.0, Gusto: 6.6, Tosin: 6.7, Colwill: 6.8, Cucurella: 6.7, Caicedo: 7.1, "Fernández": 6.9, Madueke: 6.6, Palmer: 7.6, Neto: 6.4, Jackson: 6.7, Nkunku: 6.5 } },
  },

  /* /fixtures/players: no, name, pos, minutes, rating, goals, assists, shots (on/total), key passes,
   * passes (accurate/total), tackles, duels (won/total), fouls, card. */
  playerStats: {
    home: [
      [22, "Raya", "G", 67, 6.8, 0, 0, "0/0", 0, "22/26", 0, "1/1", 0, ""],
      [4, "White", "D", 67, 7.0, 0, 0, "0/1", 1, "38/42", 2, "4/6", 1, ""],
      [2, "Saliba", "D", 67, 7.3, 0, 0, "0/0", 0, "52/55", 3, "5/6", 0, ""],
      [6, "Gabriel", "D", 67, 7.1, 0, 0, "1/1", 0, "47/51", 2, "6/8", 1, ""],
      [33, "Calafiori", "D", 67, 6.9, 0, 0, "0/0", 1, "35/40", 1, "3/6", 1, ""],
      [8, "Ødegaard", "M", 67, 7.4, 0, 1, "0/2", 3, "41/46", 1, "3/7", 0, ""],
      [5, "Partey", "M", 67, 6.8, 0, 0, "0/1", 0, "44/48", 2, "4/7", 2, ""],
      [41, "Rice", "M", 67, 6.9, 0, 0, "0/1", 1, "39/44", 3, "5/9", 2, "Y"],
      [7, "Saka", "F", 67, 7.9, 1, 0, "2/4", 2, "21/27", 1, "6/11", 1, ""],
      [29, "Havertz", "F", 67, 7.0, 0, 0, "1/3", 1, "17/22", 0, "4/10", 1, ""],
      [11, "Martinelli", "F", 63, 6.5, 0, 0, "0/0", 0, "16/22", 0, "2/7", 0, ""],
      [19, "Trossard", "F", 4, 6.6, 0, 0, "0/0", 0, "3/3", 0, "0/1", 0, ""]],
    away: [
      [1, "Sánchez", "G", 67, 7.0, 0, 0, "0/0", 0, "24/31", 0, "0/0", 0, ""],
      [27, "Gusto", "D", 67, 6.6, 0, 0, "0/0", 0, "27/33", 1, "3/7", 2, ""],
      [4, "Tosin", "D", 67, 6.7, 0, 0, "0/1", 0, "33/36", 2, "4/6", 1, ""],
      [6, "Colwill", "D", 67, 6.8, 0, 0, "0/0", 0, "31/35", 2, "4/5", 1, ""],
      [3, "Cucurella", "D", 67, 6.7, 0, 0, "0/0", 1, "26/32", 3, "5/9", 2, ""],
      [25, "Caicedo", "M", 67, 7.1, 0, 0, "0/1", 0, "34/38", 4, "7/11", 3, "Y"],
      [8, "Fernández", "M", 67, 6.9, 0, 0, "1/2", 2, "36/43", 1, "3/7", 1, ""],
      [11, "Madueke", "F", 67, 6.6, 0, 0, "0/1", 0, "12/17", 0, "3/9", 1, ""],
      [20, "Palmer", "M", 67, 7.6, 1, 0, "2/2", 2, "22/27", 0, "3/8", 0, ""],
      [7, "Neto", "F", 66, 6.4, 0, 0, "0/0", 1, "11/15", 0, "2/8", 1, ""],
      [15, "Jackson", "F", 67, 6.7, 0, 0, "0/1", 0, "9/14", 0, "3/10", 0, ""],
      [18, "Nkunku", "F", 1, 6.5, 0, 0, "0/0", 0, "1/1", 0, "0/0", 0, ""]],
  },

  injuries: {
    home: [["T. Tomiyasu", "Out", "Knee injury"], ["G. Jesus", "Doubtful", "Hamstring"]],
    away: [["W. Fofana", "Out", "Hamstring"], ["R. Lavia", "Out", "Thigh"], ["B. Badiashile", "Doubtful", "Illness"]],
  },

  /* Newest first: result, score, opponent, venue, competition. */
  form: {
    home: [["W", "3–1", "Southampton", "H", "PL"], ["W", "2–0", "West Ham", "A", "PL"], ["D", "2–2", "Man City", "A", "PL"], ["W", "1–0", "PSG", "H", "UCL"], ["W", "4–2", "Leicester", "H", "PL"]],
    away: [["W", "4–2", "Brighton", "H", "PL"], ["D", "1–1", "Nottm Forest", "H", "PL"], ["W", "3–0", "West Ham", "A", "PL"], ["L", "1–2", "Liverpool", "A", "PL"], ["W", "2–1", "Bournemouth", "A", "PL"]],
  },

  h2h: {
    summary: { home: 3, draw: 2, away: 0, goals: "2.6", btts: "3/5", over: "3/5" },
    meetings: [
      ["Apr 2025", "Arsenal", "1–0", "Chelsea", "H", "PL"], ["Nov 2024", "Chelsea", "1–1", "Arsenal", "D", "PL"],
      ["Apr 2024", "Arsenal", "5–0", "Chelsea", "H", "PL"], ["Oct 2023", "Chelsea", "2–2", "Arsenal", "D", "PL"],
      ["May 2023", "Arsenal", "3–1", "Chelsea", "H", "PL"]],
  },

  /* /standings: rank, team, P, W, D, L, GF, GA, GD, Pts, form (oldest → newest), zone. */
  zones: { ucl: "Champions League", uel: "Europa League", uecl: "Conference League qualification", rel: "Relegation" },
  table: [
    [1, "Liverpool", 7, 6, 0, 1, 16, 7, "+9", 18, "WWLWW", "ucl"], [2, "Arsenal", 7, 5, 2, 0, 15, 5, "+10", 17, "WDWWW", "ucl"],
    [3, "Man City", 7, 5, 1, 1, 17, 9, "+8", 16, "WWDLW", "ucl"], [4, "Chelsea", 7, 4, 2, 1, 13, 7, "+6", 14, "WLWDW", "ucl"],
    [5, "Aston Villa", 7, 4, 2, 1, 11, 8, "+3", 14, "DWWLW", "uel"], [6, "Brighton", 7, 3, 3, 1, 12, 10, "+2", 12, "LWDWD", "uecl"],
    [7, "Newcastle", 7, 3, 3, 1, 9, 7, "+2", 12, "DDWWL", ""], [8, "Tottenham", 7, 3, 2, 2, 13, 9, "+4", 11, "WLDWL", ""],
    [9, "Fulham", 7, 3, 2, 2, 10, 9, "+1", 11, "WDLWD", ""], [10, "Brentford", 7, 3, 1, 3, 12, 12, "0", 10, "LWWLD", ""],
    [11, "Nottm Forest", 7, 2, 4, 1, 7, 6, "+1", 10, "DDWDL", ""], [12, "Bournemouth", 7, 2, 3, 2, 9, 10, "−1", 9, "LDWDD", ""],
    [13, "West Ham", 7, 2, 2, 3, 10, 13, "−3", 8, "WLDLL", ""], [14, "Man United", 7, 2, 2, 3, 6, 9, "−3", 8, "LDWLD", ""],
    [15, "Crystal Palace", 7, 1, 4, 2, 7, 9, "−2", 7, "DDLDW", ""], [16, "Everton", 7, 1, 3, 3, 8, 13, "−5", 6, "LDDLW", ""],
    [17, "Wolves", 7, 1, 2, 4, 9, 15, "−6", 5, "LLDWL", ""], [18, "Leeds", 7, 1, 1, 5, 6, 14, "−8", 4, "LWLLD", "rel"],
    [19, "Sunderland", 7, 0, 3, 4, 5, 13, "−8", 3, "DLDLL", "rel"], [20, "Burnley", 7, 0, 2, 5, 4, 15, "−11", 2, "LLDLL", "rel"]],

  /* /teams/statistics for this league season: label, home, away. */
  season: [
    ["Record", "W5 D2 L0", "W4 D2 L1"], ["Home / away record", "W3 D1 L0 at home", "W2 D1 L1 away"],
    ["Goals scored / game", "2.1", "1.9"], ["Goals conceded / game", "0.7", "1.0"], ["Clean sheets", "3 (43%)", "2 (29%)"],
    ["Failed to score", "0", "1 (14%)"], ["Both teams scored", "43%", "57%"], ["Over 2.5 goals", "57%", "71%"],
    ["Longest win run", "3", "2"], ["Penalties scored", "2 of 2", "3 of 4"], ["Cards / game", "1.6", "2.3"]],
  /* Goals by 15-minute period this season: scored and conceded. */
  goalMinutes: { bands: ["0–15", "16–30", "31–45", "46–60", "61–75", "76–90"],
    home: { for: [2, 3, 1, 3, 4, 2], against: [0, 1, 1, 1, 1, 1] }, away: { for: [1, 2, 2, 3, 2, 3], against: [1, 1, 2, 1, 2, 0] } },

  /* API-Football /predictions comparison, home share of 100, and its own one-line advice. */
  compare: [["Form", 64], ["Attack", 55], ["Defence", 62], ["Poisson", 57], ["Head-to-head", 71], ["Goals", 54], ["Overall", 61]],
  apiAdvice: "Double chance: Arsenal or draw",

  /* Season players: name, position, apps, goals, assists, rating. */
  players: {
    home: [["B. Saka", "RW", 7, 4, 5, "7.81"], ["K. Havertz", "CF", 7, 4, 1, "7.12"], ["M. Ødegaard", "AM", 6, 1, 3, "7.40"]],
    away: [["C. Palmer", "AM", 7, 6, 4, "7.92"], ["N. Jackson", "CF", 7, 5, 1, "7.05"], ["N. Madueke", "RW", 7, 2, 2, "7.10"]],
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

  oddsMeta: "Pre-match · median of 12 bookmakers · closed 19:30",

  history: [
    { rev: 3, when: "Today 09:12", note: "1X2 Arsenal 51% → 54%", current: true },
    { rev: 2, when: "Today 06:05", note: "O/U Over 58% → 61%" },
    { rev: 1, when: "Fri 21:40", note: "First publication" },
  ],

  disclaimer: "Probabilities are Goal Hint estimates, not guarantees. Odds are for information only. 18+.",
};
