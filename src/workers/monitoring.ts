import "server-only";

import { runMonitoringCommand } from "../server/monitoring/monitoring-command.ts";

const controller = new AbortController(), stop = () => controller.abort();
process.once("SIGINT", stop); process.once("SIGTERM", stop);
try { console.log(JSON.stringify(await runMonitoringCommand(process.argv.slice(2), controller.signal))); }
catch { console.error("Monitoring refused or unavailable; private diagnostics are withheld."); process.exitCode = 1; }
finally { process.off("SIGINT", stop); process.off("SIGTERM", stop); }
