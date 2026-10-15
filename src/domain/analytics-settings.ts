/** Lightweight shared settings; importing them never initializes validation schemas. */
export const analyticsRules = Object.freeze({
  schemaVersion: 1,
  collectPath: "/api/analytics/collect",
  dashboardPath: "/analytics",
  /** A visit ends after 30 minutes without activity in any tab. */
  sessionIdleMs: 30 * 60_000,
  /** Visible pages report engaged time this often, which also keeps live visitors current. */
  heartbeatMs: 30_000,
  /** Engaged time pauses after five minutes without pointer, key, scroll or touch input. */
  idleAfterMs: 5 * 60_000,
  liveWindowMs: 5 * 60_000,
  /** A visit is engaged (not a bounce) with 2+ page views, 10+ seconds engaged or a conversion. */
  engagedVisitMs: 10_000,
  maximumBodyBytes: 16_384,
  maximumEventsPerBatch: 25,
  maximumEngageDeltaMs: 120_000,
  maximumPageEngagedMs: 4 * 3_600_000,
  /** Consent choices are asked again after a year. */
  consentMaxAgeMs: 365 * 86_400_000,
  defaultRetentionDays: 395,
  retentionChoices: Object.freeze([30, 90, 180, 395, 730] as const),
  maximumRangeDays: 1_095,
  topRows: 100,
});

export const analyticsStorageKeys = Object.freeze({
  consent: "goal-hint-analytics-consent",
  visitor: "goal-hint-analytics-visitor",
  session: "goal-hint-analytics-session",
  /** Tab-scoped (session storage): the last page view, so an automatic reload within seconds is not counted twice. */
  lastPage: "goal-hint-analytics-last-page",
});

export type ConsentChoice = "granted" | "denied";

