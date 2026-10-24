import "server-only";
import { disconnectDatabase, getDatabase } from "../server/database/client.ts";
import { createAutoRenew } from "../server/members/auto-renew.ts";
import { createMembersPurge } from "../server/members/purge.ts";
const command = process.argv.slice(2).join(" ");
try {
  if (command !== "purge" && command !== "renew") throw new RangeError("Use members:purge or members:renew.");
  console.log(JSON.stringify(command === "purge" ? await createMembersPurge(getDatabase()).run() : await createAutoRenew(getDatabase()).run()));
} catch (error) {
  console.error(error instanceof RangeError ? error.message : `Members ${command === "renew" ? "auto-renewal" : "purge"} failed; private database diagnostics are withheld.`);
  process.exitCode = 1;
} finally { await disconnectDatabase().catch(() => {}); }
