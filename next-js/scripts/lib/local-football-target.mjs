import { readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { parseRuntimePolicy } from "../../src/server/config/runtime-policy.ts";
import { createDatabase } from "../../src/server/database/client.ts";

const schema = "goal_hint_football_202611";
const normalizePath = process.platform === "win32" ? (value) => value.toLowerCase() : (value) => value;

/** Opens only the owned development snapshot. Private credentials stay in this process. */
export async function openLocalFootballTarget({ root = process.cwd(), poolLimit = 2 } = {}) {
  const directory = join(root, ".goal-hint", "local-football-2026-11");
  let target, expected;
  try {
    const config = parseEnv(await readFile(join(directory, "target.env"), "utf8"));
    target = new URL(config.GOAL_HINT_LOCAL_FOOTBALL_DATABASE_URL);
    if (target.protocol !== "mysql:" || target.hostname !== "127.0.0.1" || !target.port ||
      target.pathname !== `/${schema}` || target.search || target.hash) throw new Error();
    expected = normalizePath(await realpath(join(directory, "mysql")));
    if (normalizePath(await realpath(config.GOAL_HINT_LOCAL_FOOTBALL_DATADIR)) !== expected) throw new Error();
  } catch {
    throw new Error("Start the owned local football database before using its worker or usage monitor.");
  }
  const database = createDatabase(parseRuntimePolicy({ NODE_ENV: "development", GOAL_HINT_DATABASE_ENABLED: "true",
    DATABASE_URL: target.href, GOAL_HINT_DATABASE_POOL_LIMIT: String(poolLimit), GOAL_HINT_DATABASE_TLS_MODE: "disabled" }));
  try {
    const [server] = await database.query((client) => client.$queryRaw`SELECT DATABASE() AS name, @@datadir AS directory`);
    if (server?.name !== schema || normalizePath(await realpath(server.directory)) !== expected) throw new Error();
    return { database, url: target.href, directory };
  } catch {
    await database.disconnect().catch(() => {});
    throw new Error("Could not verify the owned local football database.");
  }
}
