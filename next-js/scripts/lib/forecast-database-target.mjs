import { parseRuntimePolicy } from "../../src/server/config/runtime-policy.ts";
import { createDatabase } from "../../src/server/database/client.ts";
import { createDatabaseEvidenceVerifier } from "../../src/server/database/operator-evidence.ts";
import { openLocalFootballTarget } from "./local-football-target.mjs";

const schemas = { staging: "ghstage_localcopy", production: "ghprod_prod" };

/** Forecast commands accept only the owned development target or the exact hosted profile. */
export async function openForecastDatabase(environment) {
  if (environment === "development") return (await openLocalFootballTarget()).database;
  if (!Object.hasOwn(schemas, environment) || environment !== process.env.GOAL_HINT_DEPLOYMENT_ENVIRONMENT) {
    throw new Error("Choose the environment of the supplied database profile.");
  }
  const target = new URL(process.env.DATABASE_URL);
  if (target.protocol !== "mysql:" || target.hostname !== "127.0.0.1" || target.pathname !== `/${schemas[environment]}` ||
    target.port && target.port !== "3306") throw new Error("The configured database does not match the selected environment.");
  return createDatabase(parseRuntimePolicy(process.env), createDatabaseEvidenceVerifier());
}
