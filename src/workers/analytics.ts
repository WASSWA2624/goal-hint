import "server-only";

import { runAnalyticsCommand } from "../server/analytics/analytics-command.ts";

try { await runAnalyticsCommand(process.argv.slice(2)); }
catch (error) {
  console.error(error instanceof RangeError ? error.message : "Analytics command failed; private database diagnostics are withheld.");
  process.exitCode = 1;
}
