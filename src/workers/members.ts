import "server-only";
import { disconnectDatabase, getDatabase } from "../server/database/client.ts";
import { createMembersPurge } from "../server/members/purge.ts";
try {
  if (process.argv.slice(2).join(" ") !== "purge") throw new RangeError("Use members:purge.");
  console.log(JSON.stringify(await createMembersPurge(getDatabase()).run()));
} catch (error) {
  console.error(error instanceof RangeError ? error.message : "Members purge failed; private database diagnostics are withheld.");
  process.exitCode = 1;
} finally { await disconnectDatabase().catch(() => {}); }
