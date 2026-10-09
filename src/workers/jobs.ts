import "server-only";

import { runJobWorkerCommand } from "../server/jobs/job-command.ts";

const controller = new AbortController();
const stop = () => controller.abort();
process.once("SIGINT", stop); process.once("SIGTERM", stop);
try {
  await runJobWorkerCommand(process.argv.slice(2), { signal: controller.signal,
    onReady: () => console.log("Durable job worker ready."), onEvent: (event) => console.log(JSON.stringify(event)) });
} catch {
  console.error("Durable job worker unavailable; private configuration and handler diagnostics are withheld.");
  process.exitCode = 1;
} finally { process.off("SIGINT", stop); process.off("SIGTERM", stop); }
