/** Source-owned, nonsecret product settings. Safe for browser imports. */
export const publicPolicy = Object.freeze({
  name: "Goal Hint",
  origin: "https://goalhint.com",
  access: "free-and-account-free",
  locales: Object.freeze(["en"] as const),
  defaultLocale: "en",
  theme: "light",
  reportingTimeZone: "Africa/Kampala",
  predictionWindowDays: 7,
  markets: Object.freeze([
    "match-result",
    "double-chance",
    "total-goals",
    "both-teams-to-score",
  ] as const),
  matchPeriod: "regulation-including-stoppage-time",
  totalGoalsLine: 2.5,
  features: Object.freeze({
    advertising: false,
    additionalLocales: false,
    darkMode: false,
    exactScores: false,
    /** Bookmaker prices beside picks and the `odds=` filter. Off until the owner records odds display
     * rights (OP-36); while off, `odds=` is an unknown feed key and the odds controls stay disabled. */
    providerOdds: false,
  }),
} as const);
