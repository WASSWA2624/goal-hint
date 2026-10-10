import "server-only";

import { getRuntimePolicy } from "../server/config/runtime-policy.ts";
import { runLive } from "../server/live/live-runner.ts";
import { LiveConfigurationError } from "../server/live/live-runtime.ts";

const controller = new AbortController();
const stop = () => controller.abort();
process.once("SIGINT", stop); process.once("SIGTERM", stop);
try {
  await runLive(getRuntimePolicy(), controller.signal, (event) => console.log(JSON.stringify({ at: new Date().toISOString(), ...event })));
} catch (error) {
  // Configuration issues name fields and owner decisions only; provider and database diagnostics stay private.
  console.error(error instanceof LiveConfigurationError || error instanceof Error && error.name === "RuntimePolicyError"
    ? error.message : `Live runner stopped (${error instanceof Error && "reason" in error ? String(error.reason) : "unavailable"}).`);
  process.exitCode = 1;
} finally { process.off("SIGINT", stop); process.off("SIGTERM", stop); }
