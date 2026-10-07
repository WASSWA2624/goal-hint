import { getRuntimePolicy } from "../src/server/config/runtime-policy.ts";
import { getDatabase, disconnectDatabase } from "../src/server/database/client.ts";

try {
  const policy = getRuntimePolicy();
  const status = policy.capabilities.database ? await getDatabase().readiness() : "disabled";
  console.log(`Database readiness: ${status}.`);
  if (status === "unavailable") process.exitCode = 1;
} catch {
  console.error("Database readiness: unavailable. Check private configuration and approved access.");
  process.exitCode = 1;
} finally {
  try { await disconnectDatabase(); }
  catch { console.error("Database shutdown failed; private diagnostics are withheld."); process.exitCode = 1; }
}
