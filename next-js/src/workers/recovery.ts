import "server-only";

import { runRecoveryCommand } from "../server/recovery/recovery-command.ts";

const controller = new AbortController();
const stop = () => controller.abort();
process.once("SIGINT", stop); process.once("SIGTERM", stop);
try { console.log(JSON.stringify(await runRecoveryCommand(process.argv.slice(2), controller.signal))); }
catch { console.error("Recovery refused or unavailable; private diagnostics are withheld."); process.exitCode = 1; }
finally { process.off("SIGINT", stop); process.off("SIGTERM", stop); }
