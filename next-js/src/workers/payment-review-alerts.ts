import "server-only";
import { getAnalyticsConfig } from "../server/analytics/analytics-config.ts";
import { disconnectDatabase, getDatabase } from "../server/database/client.ts";
import { createReviewAlertWorker } from "../server/admin/payment-alert-worker.ts";

let stopped = false;
process.on("SIGTERM", () => { stopped = true; });
process.on("SIGINT", () => { stopped = true; });
try {
  const [command = "run"] = process.argv.slice(2);
  if (!["run", "watch"].includes(command) || process.argv.length > 3) throw new RangeError("Use payments:alerts run or watch.");
  const worker = createReviewAlertWorker({ database: getDatabase(), config: await getAnalyticsConfig() });
  do {
    try { const result = await worker.run(); if (Object.values(result).some(Boolean) || command === "run") console.log(JSON.stringify(result)); }
    catch { console.error("Payment alert dispatch failed; private diagnostics withheld."); if (command === "run") process.exitCode = 1; }
    if (command === "watch" && !stopped) await new Promise(resolve => setTimeout(resolve, 5_000));
  } while (command === "watch" && !stopped);
} catch (error) { console.error(error instanceof RangeError ? error.message : "Payment alert worker unavailable."); process.exitCode = 1; }
finally { await disconnectDatabase().catch(() => {}); }
