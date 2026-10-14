import "server-only";

import { createHmac } from "node:crypto";
import { analyticsRules } from "../../domain/analytics.ts";
import { getRuntimePolicy, type RuntimePolicy } from "../config/runtime-policy.ts";
import { hashPassword, verifyPassword } from "./analytics-password.ts";

/** Development only: production refuses these values, so they can never protect a deployed dashboard. */
const developmentDefaults = Object.freeze({
  username: "admin",
  password: "admin",
  secret: "goal-hint-development-analytics-secret-do-not-deploy",
});

export type AdminProblem = "not-configured" | "insecure-default" | "missing-secret";

export type AnalyticsConfig = Readonly<{
  production: boolean;
  /** Tracking accepted only when enabled, the database is available and a keying secret exists. */
  collecting: boolean;
  admin: Readonly<{ username: string; passwordHash: string }> | null;
  adminProblem: AdminProblem | null;
  usingDevelopmentCredentials: boolean;
  retentionDays: number;
  geoSource: "timezone" | "cloudflare" | "vercel";
  cookies: Readonly<{ session: string; exclude: string; secure: boolean }>;
  /** HMAC-SHA256 under the analytics secret; used for visitor keys and sign-in throttle keys. */
  key(purpose: string, value: string): string;
}>;

export async function createAnalyticsConfig(policy: RuntimePolicy): Promise<AnalyticsConfig> {
  const production = policy.mode === "production";
  const settings = policy.choices.analytics;
  const secret = policy.secrets.analyticsSecret?.read() ?? (production ? null : developmentDefaults.secret);
  let admin: AnalyticsConfig["admin"] = null;
  let adminProblem: AdminProblem | null = null;
  let usingDevelopmentCredentials = false;
  const configuredHash = policy.secrets.analyticsPasswordHash?.read() ?? null;
  if (secret === null) adminProblem = "missing-secret";
  else if (settings.adminUsername !== null && configuredHash !== null) {
    admin = { username: settings.adminUsername, passwordHash: configuredHash };
    // A production hash of the development password is rejected outright.
    if (production && (await verifyPassword(developmentDefaults.password, configuredHash))) { admin = null; adminProblem = "insecure-default"; }
  } else if (!production) {
    admin = { username: settings.adminUsername ?? developmentDefaults.username, passwordHash: configuredHash ?? await hashPassword(developmentDefaults.password) };
    usingDevelopmentCredentials = configuredHash === null;
  } else adminProblem = "not-configured";
  const prefix = production ? "__Host-" : "";
  return Object.freeze({
    production,
    collecting: settings.enabled && policy.capabilities.database && secret !== null,
    admin, adminProblem, usingDevelopmentCredentials,
    retentionDays: settings.retentionDays ?? analyticsRules.defaultRetentionDays,
    geoSource: settings.geoSource,
    cookies: Object.freeze({ session: `${prefix}goal-hint-analytics`, exclude: `${prefix}goal-hint-analytics-exclude`, secure: production }),
    key(purpose: string, value: string) {
      if (secret === null) throw new Error("Analytics keying is unavailable without GOAL_HINT_ANALYTICS_SECRET.");
      return createHmac("sha256", secret).update(`${purpose}\0${value}`).digest("hex");
    },
  });
}

const processState = globalThis as typeof globalThis & { goalHintAnalyticsConfig?: Promise<AnalyticsConfig> };

/** Resolved once per process, like the runtime policy; restart after changing configuration. */
export function getAnalyticsConfig(): Promise<AnalyticsConfig> {
  processState.goalHintAnalyticsConfig ??= createAnalyticsConfig(getRuntimePolicy());
  return processState.goalHintAnalyticsConfig;
}
