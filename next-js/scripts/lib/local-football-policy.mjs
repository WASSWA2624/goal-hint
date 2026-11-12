import { isLocalFootballDevelopment } from "../../src/domain/development-demo.ts";
import { utcInstantFromEpochMilliseconds } from "../../src/domain/calendar.ts";
import { parseRuntimePolicy } from "../../src/server/config/runtime-policy.ts";
import { normalizeHistoryCompetition } from "../../src/server/football/history-backfill.ts";
import { createFootballHistorySource } from "../../src/server/football/history-source.ts";
import { liveReadiness } from "../../src/server/live/live-runtime.ts";
import { openLocalFootballTarget } from "./local-football-target.mjs";

export async function loadLocalFootballPolicy({ aiEnabled, includeArchiveCatalog = false } = {}) {
  if (!isLocalFootballDevelopment()) throw new Error("Start live football through the owned development launcher.");
  const { database, url } = await openLocalFootballTarget();
  let stored;
  const discovered = [];
  try {
    stored = await database.query((client) => client.footballCompetitionProvider.findMany({
      where: { provider: "api-football" }, select: { externalId: true },
    }));
    if (includeArchiveCatalog) {
      const page = await createFootballHistorySource(database).latestPage({ endpoint: "competitions", parameters: {} });
      if (page) {
        const context = { endpoint: "/leagues", retrievedAt: utcInstantFromEpochMilliseconds(page.retrievedAt.getTime()) };
        for (const row of page.rows) {
          const competition = normalizeHistoryCompetition(row, context);
          if (competition) discovered.push(String(competition.id));
        }
      }
    }
  } finally {
    await database.disconnect();
  }
  const configured = (process.env.GOAL_HINT_COMPETITION_IDS ?? "").split(",").filter(Boolean);
  const competitionIds = [...new Set([...configured, ...stored.map((row) => String(row.externalId)), ...discovered])];
  const policy = parseRuntimePolicy({
    ...process.env,
    DATABASE_URL: url, MIGRATION_DATABASE_URL: url, GOAL_HINT_DATABASE_ENABLED: "true",
    GOAL_HINT_DATABASE_CONNECTION_MODE: "direct", GOAL_HINT_DATABASE_TLS_MODE: "disabled",
    GOAL_HINT_DATABASE_POOL_LIMIT: "8", GOAL_HINT_DEPLOYMENT_ENVIRONMENT: "development",
    GOAL_HINT_AI_ENABLED: aiEnabled ?? process.env.GOAL_HINT_AI_ENABLED ?? "false", GOAL_HINT_RESEARCH_ENABLED: "false",
    GOAL_HINT_LIVE_DETAILS_ENABLED: "true", GOAL_HINT_ODDS_IMPORT_ENABLED: "true",
    GOAL_HINT_ODDS_BOOKMAKER_ID: process.env.GOAL_HINT_ODDS_BOOKMAKER_ID || "8",
    GOAL_HINT_COMPETITION_IDS: competitionIds.join(","),
  });
  liveReadiness(policy);
  return policy;
}
