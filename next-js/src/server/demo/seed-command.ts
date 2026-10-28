import "server-only";

import { getDatabase, disconnectDatabase } from "../database/client.ts";
import { seedDemoDatabase, verifyDemoDatabase } from "./seed.ts";

const command = process.argv[2] ?? "bootstrap";
try {
  if (!["bootstrap", "full", "verify"].includes(command)) throw new Error("Use bootstrap, full, or verify.");
  const database = getDatabase();
  if (command !== "verify") await seedDemoDatabase(database, { enrich: command === "full" ? "all" : "default", onProgress: (message) => process.stdout.write(`${message}\n`) });
  process.stdout.write(`${JSON.stringify(await verifyDemoDatabase(database))}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Demo setup failed."}\n`);
  process.exitCode = 1;
} finally { await disconnectDatabase(); }
