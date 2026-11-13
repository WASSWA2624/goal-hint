import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const [action, ...args] = process.argv.slice(2);
if (action !== "build" && action !== "start") {
  console.error("Use local-production.mjs build or start.");
  process.exit(1);
}

function run(path, ...parameters) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(path, import.meta.url)), ...parameters], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (action === "start") {
  const app = new URL(process.env.DATABASE_URL);
  const migration = new URL(process.env.MIGRATION_DATABASE_URL);
  if (process.env.GOAL_HINT_DEPLOYMENT_ENVIRONMENT !== "development" ||
      app.protocol !== "mysql:" || !["127.0.0.1", "localhost", "[::1]"].includes(app.hostname) ||
      app.host !== migration.host || app.pathname !== migration.pathname) {
    throw new Error("Use matching private loopback database settings for the local preview.");
  }
  run("../node_modules/prisma/build/index.js", "migrate", "deploy");
  run("../node_modules/prisma/build/index.js", "migrate", "status");
}
run("../node_modules/next/dist/bin/next", action, ...args);
if (action === "build") run("./build-offline-manifest.mjs");
