import { isDevelopmentDemo, isLocalFootballDevelopment } from "./development-demo.ts";

/** Source-owned, nonsecret product settings. Safe for browser imports. */
export const publicPolicy = Object.freeze({
  name: "Goal Hint",
  origin: "https://goalhint.com",
  access: "free-with-subscriber-predictions",
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
    /** Development prices are available in the synthetic or loopback snapshot app.
     * Hosted odds remain subject to their display policy. */
    providerOdds: isDevelopmentDemo() || isLocalFootballDevelopment(),
    /** Stored match statistics/events use the existing verified football public-display rights. */
    liveMatchDetails: true,
  }),
} as const);
