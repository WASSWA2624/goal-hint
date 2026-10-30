/** Display vocabulary only. An entry does not enable a market or define its settlement rules. */
export type BettingShortForm = Readonly<{ code: string; label: string; convention: "common" | "readable" }>;
const form = <Code extends string>(code: Code, label: string, convention: BettingShortForm["convention"] = "readable") =>
  Object.freeze({ code, label, convention });

export const marketShortForms = Object.freeze({
  "match-result": form("1X2", "Match result", "common"),
  "double-chance": form("DC", "Double chance", "common"),
  "total-goals": form("O/U", "Total goals over/under", "common"),
  totals: form("O/U", "Over/under the stated total", "common"),
  "both-teams-to-score": form("BTTS", "Both teams to score", "common"),
  "draw-no-bet": form("DNB", "Draw no bet", "common"),
  "asian-handicap": form("AH", "Asian handicap", "common"),
  "european-handicap": form("EH", "European three-way handicap", "common"),
  "handicap-result": form("EH", "Three-way handicap result", "common"),
  handicap: form("Hcap", "Handicap"),
  "asian-total": form("Asian O/U", "Asian total with the stated payout line"),
  "half-full-result": form("HT/FT", "Half-time/full-time result", "common"),
  "exact-score": form("Score", "Correct score"),
  "correct-score": form("Score", "Correct score"),
  "exact-count": form("Exact", "Exact event count"),
  "odd-even": form("Odd/Even", "Odd/even total", "common"),
  "clean-sheet": form("CS", "Team clean sheet", "common"),
  "win-to-nil": form("WTN", "Team to win without conceding", "common"),
  "team-total": form("Team O/U", "Team total over/under"),
  "winning-margin": form("Margin", "Winning margin"),
  "to-qualify": form("Qualify", "Team to qualify"),
  "to-lift-trophy": form("Trophy", "Team to lift the trophy"),
  outright: form("Winner", "Competition or tournament winner"),
  "top-scorer": form("Top scorer", "Competition top goalscorer"),
  "group-winner": form("Group win", "Group winner"),
  "top-finish": form("Top N", "Finish in the stated top positions"),
  relegation: form("Releg.", "Team to be relegated"),
  promotion: form("Prom.", "Team to be promoted"),
  "first-goalscorer": form("FGS", "First goalscorer", "common"),
  "last-goalscorer": form("LGS", "Last goalscorer", "common"),
  "anytime-goalscorer": form("AGS", "Anytime goalscorer", "common"),
  "player-goals": form("P Goals", "Player goals"),
  "player-assists": form("P Ast", "Player assists"),
  "player-shots": form("P Shots", "Player shots"),
  "player-shots-on-target": form("P SOT", "Player shots on target"),
  "player-card": form("P Card", "Player to receive a card"),
  "player-red-card": form("P RC", "Player to receive a red card"),
  "player-tackles": form("P Tkl", "Player tackles"),
  "player-saves": form("P Saves", "Player goalkeeper saves"),
  "player-passes": form("P Pass", "Player passes"),
  "player-fouls": form("P Fouls", "Player fouls"),
  "player-offside": form("P Offs", "Player offsides"),
  "event-any": form("Any", "Whether the specified event occurs"),
  "event-first": form("First", "Whether the specified first event occurs"),
  "event-last": form("Last", "Whether the specified last event occurs"),
  "first-event-team": form("First", "Team responsible for the first specified event"),
  "last-event-team": form("Last", "Team responsible for the last specified event"),
  "next-event-team": form("Next", "Team responsible for the next specified event"),
  "race-to": form("Race to", "First team to the stated event count"),
  "time-of-event": form("Time", "Time of the specified event"),
  "highest-scoring-half": form("High half", "Highest-scoring half"),
  "win-both-halves": form("Win both", "Team to win both halves"),
  "win-either-half": form("Win half", "Team to win either half"),
  "score-both-halves": form("Score both", "Team to score in both halves"),
  "result-btts": form("1X2+BTTS", "Match result and both teams to score"),
  "result-total": form("1X2+O/U", "Match result and the stated total"),
  "btts-total": form("BTTS+O/U", "Both teams to score and the stated total"),
  combination: form("Combo", "Explicitly defined combination of selections"),
});

/** Metrics stay distinct: card counts, booking points and shots on/off target are never interchangeable. */
export const metricShortForms = Object.freeze({
  goals: form("Goals", "Goals"), assists: form("Ast", "Assists"),
  corners: form("Corn.", "Corners"), cards: form("Cards", "Total cards"),
  "yellow-cards": form("YC", "Yellow cards", "common"), "red-cards": form("RC", "Red cards", "common"),
  "booking-points": form("BP", "Booking points", "common"),
  "shots-on-goal": form("SOT", "Shots on target", "common"),
  "shots-on-target": form("SOT", "Shots on target", "common"),
  "shots-off-goal": form("Sh. off", "Shots off target"), "total-shots": form("Shots", "Total shots"),
  "blocked-shots": form("Blk sh.", "Blocked shots"), "shots-inside-box": form("Sh. in box", "Shots inside the penalty area"),
  "shots-outside-box": form("Sh. out box", "Shots outside the penalty area"),
  fouls: form("Fouls", "Fouls"), offsides: form("Offs.", "Offsides"),
  "goalkeeper-saves": form("Saves", "Goalkeeper saves"), "total-passes": form("Passes", "Total passes"),
  "accurate-passes": form("Acc. pass", "Accurate passes"), "throw-ins": form("Throw-ins", "Throw-ins"),
  "goal-kicks": form("GKicks", "Goal kicks"), penalties: form("Pens", "Penalties"),
  "free-kicks": form("FK", "Free kicks", "common"), tackles: form("Tkl", "Tackles"),
  interceptions: form("Int.", "Interceptions"), clearances: form("Clr", "Clearances"),
  possession: form("Poss.%", "Possession percentage"), attacks: form("Att.", "Attacks"),
  "dangerous-attacks": form("Danger att.", "Dangerous attacks"), substitutions: form("Subs", "Substitutions"),
  woodwork: form("Woodwork", "Shots hitting the woodwork"), "own-goals": form("OG", "Own goals", "common"),
  "goal-kick-distance": form("GK dist.", "Goal-kick distance"),
});

export const periodShortForms = Object.freeze({
  "full-time": form("FT", "Regulation time, including added time", "common"),
  "half-time": form("1H", "First-half betting period", "common"),
  "first-half": form("1H", "First half", "common"), "second-half": form("2H", "Second half", "common"),
  "extra-time": form("ET", "Extra time", "common"), "including-extra-time": form("Incl. ET", "Including extra time"),
  "extra-time-first-half": form("ET 1H", "First half of extra time"),
  "extra-time-second-half": form("ET 2H", "Second half of extra time"),
  penalties: form("Pens", "Penalty shootout"), "rest-of-match": form("Rest", "Remainder of the match"),
});

export const participantShortForms = Object.freeze({
  home: form("H", "Home team", "common"), away: form("A", "Away team", "common"),
  total: form("Total", "Both teams combined"), player: form("P", "Named player"),
  goalkeeper: form("GK", "Named goalkeeper", "common"), either: form("Either", "Either team"), both: form("Both", "Both teams"),
});

export const fieldShortForms = Object.freeze({
  odds: form("Odds", "Decimal odds"), probability: form("Prob.", "Estimated probability"),
  market: form("Mkt", "Market"), prediction: form("Pick", "Prediction"), number: form("No.", "Match number"),
});

/** Templates retain every supplied score, line, sign and participant; no team names are inferred. */
export const predictionShortForms = Object.freeze({
  "home-win": form("1", "Home win", "common"), draw: form("X", "Draw", "common"), "away-win": form("2", "Away win", "common"),
  "home-or-draw": form("1X", "Home win or draw", "common"), "away-or-draw": form("X2", "Draw or away win", "common"),
  "home-or-away": form("12", "Either team wins", "common"),
  over: form("O {line}", "Over the stated line", "common"), under: form("U {line}", "Under the stated line", "common"),
  "home-handicap": form("1 {line}", "Home selection with its signed handicap", "common"),
  "away-handicap": form("2 {line}", "Away selection with its signed handicap", "common"),
  yes: form("Yes", "The market's specified event occurs", "common"), no: form("No", "The market's specified event does not occur", "common"),
  odd: form("Odd", "Odd total", "common"), even: form("Even", "Even total", "common"),
  "exact-score": form("{home}:{away}", "Exact home and away score", "common"),
  "exact-count": form("= {count}", "Exactly the stated count"),
  "at-least": form("{count}+", "At least the stated count", "common"),
  "half-full": form("{half} / {full}", "First-half selection followed by full-time selection", "common"),
  and: form(" & ", "All explicitly combined selections", "common"),
  other: form("Other", "The explicitly defined remaining selections"),
  "home-team": form("1", "Home team for the stated event", "common"),
  "away-team": form("2", "Away team for the stated event", "common"),
  "no-event": form("None", "No specified event"),
});

export const predictionSelectionAliases: Readonly<Record<string, string>> = Object.freeze({
  "1": "home-win", x: "draw", "2": "away-win", "1x": "home-or-draw", x1: "home-or-draw",
  x2: "away-or-draw", "2x": "away-or-draw", "12": "home-or-away", "21": "home-or-away",
  home: "home-win", away: "away-win", "home-draw": "home-or-draw", "draw-home": "home-or-draw",
  "draw-away": "away-or-draw", "away-draw": "away-or-draw", "home-away": "home-or-away", "away-home": "home-or-away",
});

const marketAliases: Readonly<Record<string, string>> = Object.freeze({
  "1x2": "match-result", result: "match-result", h2h: "match-result", "h2h-3-way": "match-result",
  dc: "double-chance", btts: "both-teams-to-score", "draw-no-bet": "draw-no-bet", dnb: "draw-no-bet",
  spreads: "handicap", "correct-score": "exact-score", "halftime-fulltime": "half-full-result", outrights: "outright",
});
const normalise = (value: string) => value.trim().toLowerCase().replace(/[\s_]+/gu, "-");

/** Unknown terminology stays readable instead of receiving a guessed code. */
export function bettingShortForm(dictionary: Readonly<Record<string, BettingShortForm>>, key: string): BettingShortForm | undefined {
  const value = normalise(key);
  return Object.hasOwn(dictionary, value) ? dictionary[value] : undefined;
}

export function marketShortCode(key: string, fallback = key): string {
  const value = normalise(key), canonical = Object.hasOwn(marketAliases, value) ? marketAliases[value]! : value;
  return bettingShortForm(marketShortForms, canonical)?.code ?? fallback;
}

/** Composes future market labels from explicit identity fields; does not parse labels or enable trading/forecast support. */
export function formatMarketShortLabel({ market, metric, period, scope, line, fallback }: Readonly<{
  market: string; metric?: string; period?: string; scope?: string; line?: number; fallback?: string;
}>): string {
  const code = marketShortCode(market, fallback ?? market);
  const part = (dictionary: Readonly<Record<string, BettingShortForm>>, value?: string) => value ? bettingShortForm(dictionary, value)?.code ?? value : undefined;
  return [part(periodShortForms, period), scope && scope !== "total" ? part(participantShortForms, scope) : undefined,
    metric && metric !== "goals" ? part(metricShortForms, metric) : undefined, code,
    line !== undefined && Number.isFinite(line) ? String(line) : undefined].filter(Boolean).join(" ");
}

export const bettingShortForms = Object.freeze({ markets: marketShortForms, metrics: metricShortForms,
  periods: periodShortForms, participants: participantShortForms, predictions: predictionShortForms, fields: fieldShortForms });
