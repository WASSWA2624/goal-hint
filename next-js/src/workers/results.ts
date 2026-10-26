import "server-only";

import { runResultSyncCommand } from "../server/results/result-sync-command.ts";

const controller = new AbortController();
const stop = () => controller.abort();
process.once("SIGINT", stop); process.once("SIGTERM", stop);
try { await runResultSyncCommand(process.argv.slice(2), controller.signal); }
catch {
  console.error("Result poller unavailable; private binding and provider diagnostics are withheld.");
  process.exitCode = 1;
} finally { process.off("SIGINT", stop); process.off("SIGTERM", stop); }
