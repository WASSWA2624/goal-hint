import { isLocalFootballDevelopment } from "../src/domain/development-demo.ts";
import { parseRuntimePolicy } from "../src/server/config/runtime-policy.ts";
import { runLive } from "../src/server/live/live-runner.ts";
import { createLiveRuntime, LiveConfigurationError, liveReadiness } from "../src/server/live/live-runtime.ts";
import { openLocalFootballTarget } from "./lib/local-football-target.mjs";

async function localPolicy() {
  if (!isLocalFootballDevelopment()) throw new Error("Start live football through the loopback development launcher.");
  const { database, url } = await openLocalFootballTarget();
  let stored;
  try {
    stored = await database.query((client) => client.footballCompetitionProvider.findMany({
      where: { provider: "api-football" }, select: { externalId: true },
    }));
  } finally {
    await database.disconnect();
  }
  const configured = (process.env.GOAL_HINT_COMPETITION_IDS ?? "").split(",").filter(Boolean);
  const competitionIds = [...new Set([...configured, ...stored.map((row) => String(row.externalId))])];
  const policy = parseRuntimePolicy({
    ...process.env,
    DATABASE_URL: url, MIGRATION_DATABASE_URL: url, GOAL_HINT_DATABASE_ENABLED: "true",
    GOAL_HINT_DATABASE_CONNECTION_MODE: "direct", GOAL_HINT_DATABASE_TLS_MODE: "disabled",
    GOAL_HINT_DATABASE_POOL_LIMIT: "8", GOAL_HINT_DEPLOYMENT_ENVIRONMENT: "development",
    GOAL_HINT_AI_ENABLED: process.env.GOAL_HINT_AI_ENABLED ?? "false", GOAL_HINT_RESEARCH_ENABLED: "false",
    GOAL_HINT_LIVE_DETAILS_ENABLED: "true", GOAL_HINT_ODDS_IMPORT_ENABLED: "true",
    GOAL_HINT_ODDS_BOOKMAKER_ID: process.env.GOAL_HINT_ODDS_BOOKMAKER_ID || "8",
    GOAL_HINT_COMPETITION_IDS: competitionIds.join(","),
  });
  liveReadiness(policy);
  return policy;
}

const controller = new AbortController(), stop = () => controller.abort();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
try {
  const policy = await localPolicy();
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
