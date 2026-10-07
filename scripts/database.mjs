import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import { promisify } from "node:util";
import { assertOperationAllowed, getRuntimePolicy } from "../src/server/config/runtime-policy.ts";
import { migrationConnectionUrl } from "../src/server/database/connection.ts";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const commands = {
  generate: ["generate", "--no-hints"],
  validate: ["validate"],
  migrate: ["migrate", "diff", "--from-schema", "prisma/schema.snapshot.prisma", "--to-schema", "prisma/schema.prisma", "--script"],
  deploy: ["migrate", "deploy"],
  status: ["migrate", "status"],
  verify: ["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"],
};

async function main() {
  if (process.env.NODE_ENV !== "test") {
    try { loadEnvFile(".env.local"); }
    catch (error) {
      if (error.code !== "ENOENT") throw new Error("Unable to load local database configuration.");
    }
  }
  const [command, ...additional] = process.argv.slice(2);
  if (!Object.hasOwn(commands, command ?? "")) throw new Error("Use generate, validate, migrate, deploy, status or verify.");
  if (additional.length > 0 && !(command === "migrate" && additional.length === 2
    && additional[0] === "--name" && /^[a-z][a-z0-9_]{0,63}$/.test(additional[1]))) {
    throw new Error("Only migrate accepts additional arguments: --name <lowercase_identifier>.");
  }
  if (command === "migrate" && additional.length === 0) throw new Error("Migration generation requires --name <lowercase_identifier>.");
  const policy = getRuntimePolicy();
  const needsTarget = ["deploy", "status", "verify"].includes(command);
  if (needsTarget) {
    const migrationUrl = policy.secrets.migrationDatabaseUrl;
    if (migrationUrl === null) throw new Error("MIGRATION_DATABASE_URL is required; application credentials are never substituted.");
    // The operator-facing command cannot invent verification of production budgets.
    assertOperationAllowed(policy, "database-migration");
  }
  const env = { ...process.env };
  if (needsTarget) env.MIGRATION_DATABASE_URL = migrationConnectionUrl(policy);
  else delete env.MIGRATION_DATABASE_URL;
  let output;
  try {
    const run = (args) => execFileAsync(process.execPath, ["--conditions=react-server", require.resolve("prisma/build/index.js"), ...args], {
      cwd: process.cwd(), env, windowsHide: true, timeout: 120_000, maxBuffer: 2 * 1024 * 1024,
    });
    if (command === "verify") await run(commands.status);
    output = await run(commands[command]);
  } catch (error) {
    const reason = command === "verify" && error.code === 2 ? "Schema drift detected." : "Prisma command failed.";
    const diagnostic = /\bP\d{4}\b/.exec(error.stderr ?? "")?.[0];
    // CLI/engine output can contain connection details, SQL or supplied values.
    throw new Error(`${reason}${diagnostic ? ` (${diagnostic})` : ""} Check approved target access and migration state; raw diagnostics are withheld.`);
  }
  if (command === "migrate") {
    const sql = output.stdout;
    if (/^\s*-- This is an empty migration\.?\s*$/u.test(sql) || sql.trim() === "") {
      console.log("No schema changes; no migration created.");
      return;
    }
    const name = `${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}_${additional[1]}`;
    const directory = join("prisma", "migrations", name);
    const schema = await readFile("prisma/schema.prisma", "utf8");
    await mkdir(directory);
    await writeFile(join(directory, "migration.sql"), sql);
    await writeFile("prisma/schema.snapshot.prisma", schema);
    console.log(`Migration ${name} generated; review SQL before deployment.`);
    return;
  }
  if (command === "generate") {
    // Guard direct imports as well as our reusable wrapper; generation is repeatable.
    const guard = async (directory) => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const target = join(directory, entry.name);
        if (entry.isDirectory()) await guard(target);
        else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
          const source = await readFile(target, "utf8");
          const marker = 'import "server-only";\n';
          // Keep generated @ts-nocheck and licensing comments before any statement.
          const guarded = /^(import|export)\s/m.test(source)
            ? source.replace(/^(?=(?:import|export)\s)/m, marker) : `${source}\n${marker}`;
          await writeFile(target, guarded);
        }
      }
    };
    await guard("src/server/generated/prisma");
  }
  console.log(`Database ${command} completed.`);
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
