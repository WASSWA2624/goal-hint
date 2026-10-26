import "server-only";

import { runSlipPublicationCommand } from "../server/slips/slip-publication-command.ts";

const controller = new AbortController(), stop = () => controller.abort();
process.once("SIGINT", stop); process.once("SIGTERM", stop);
try { await runSlipPublicationCommand(process.argv.slice(2), controller.signal); }
catch { console.error("Daily slip publication unavailable; private model and database diagnostics are withheld."); process.exitCode = 1; }
finally { process.off("SIGINT", stop); process.off("SIGTERM", stop); }
