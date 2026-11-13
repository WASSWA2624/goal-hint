import "server-only";

import { disconnectDatabase, getDatabase } from "../database/client.ts";
import { getAnalyticsConfig } from "./analytics-config.ts";
import { createAnalyticsRetention } from "./analytics-retention.ts";

export async function runAnalyticsCommand(args: readonly string[]): Promise<void> {
  const [command] = args;
  if (command !== "purge") throw new RangeError("Use `purge`.");
  try {
    const config = await getAnalyticsConfig();
    const result = await createAnalyticsRetention(getDatabase(), { defaultDays: config.retentionDays }).purge();
    console.log(`Removed analytics records older than ${result.cutoff}: ${result.sessions} visits, ${result.pageviews} page views, `
      + `${result.events} events, ${result.visitors} visitors, ${result.adminSessions} expired sign-ins, ${result.loginThrottles} throttles.`);
  } finally { await disconnectDatabase().catch(() => {}); }
}
