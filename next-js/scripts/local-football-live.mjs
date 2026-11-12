import { runLive } from "../src/server/live/live-runner.ts";
import { createLiveRuntime, LiveConfigurationError } from "../src/server/live/live-runtime.ts";
import { loadLocalFootballPolicy } from "./lib/local-football-policy.mjs";

const controller = new AbortController(), stop = () => controller.abort();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
try {
  const policy = await loadLocalFootballPolicy();
  if (process.argv.includes("--check")) {
    console.log(JSON.stringify({ competitions: policy.choices.competitionIds, bookmakerId: policy.choices.odds.bookmakerId }));
  } else if (process.argv.includes("--qualify-odds")) {
    const runtime = await createLiveRuntime(policy, { localFootball: true });
    try {
      const result = await runtime.odds.requalifyLocal();
      console.log(JSON.stringify(result));
      if (result.status !== "complete") process.exitCode = 1;
    } finally { await runtime.close(); }
  } else {
    await runLive(policy, controller.signal, (event) => console.log(JSON.stringify({ at: new Date().toISOString(), ...event })),
      { localFootball: true });
  }
} catch (error) {
  const safe = error instanceof LiveConfigurationError || error instanceof Error && error.name === "RuntimePolicyError";
  console.error(safe ? error.message : "Local football worker stopped. Check the owned database and provider configuration.");
  process.exitCode = 1;
} finally {
  process.off("SIGINT", stop);
  process.off("SIGTERM", stop);
}
