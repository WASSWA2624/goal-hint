import "server-only";

import { isDevelopmentDemo } from "../../domain/development-demo.ts";

/** Public, synthetic local identity. It has no meaning outside the isolated demo database. */
export const demoMember = Object.freeze({
  accountId: "de000000-0000-4000-8000-000000000001",
  accessCodeId: "de000000-0000-4000-8000-000000000002",
  planId: "de000000-0000-4000-8000-000000000003",
  phone: "256700000001",
  password: "DemoGoalHint2026!",
  accessCode: "DEVS2026PASS",
  token: "goal_hint_demo_member_session_2026_dev_only",
});

/** Normal session validation still checks the seeded member, expiry and access period.
 * An explicit cookie always wins, including an invalid/empty signed-out cookie. */
export function developmentMemberToken(token: string | undefined,
  environment: Readonly<Record<string, string | undefined>> = process.env): string | undefined {
  return token === undefined && isDevelopmentDemo(environment) && environment.GOAL_HINT_DEMO_MEMBER !== "false"
    ? demoMember.token : token;
}

export function assertDemoDatabase(environment: Readonly<Record<string, string | undefined>> = process.env): void {
  if (!isDevelopmentDemo(environment)) throw new Error("Demo writes require development demo mode.");
  let url: URL;
  try { url = new URL(environment.DATABASE_URL ?? ""); }
  catch { throw new Error("Demo writes require the isolated local demo database."); }
  if (url.protocol !== "mysql:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    || !/^\/goal_hint_demo(?:_[a-z0-9_]+)?$/u.test(url.pathname)) {
    throw new Error("Demo writes require a loopback goal_hint_demo database.");
  }
}
