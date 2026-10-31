import "server-only";
import { disconnectDatabase, getDatabase } from "../server/database/client.ts";
import { createAutoRenew } from "../server/members/auto-renew.ts";
import { createMembersPurge } from "../server/members/purge.ts";
import { createAccountNotifications } from "../server/members/account-notifications.ts";
const command = process.argv.slice(2).join(" ");
try {
  if (!["purge", "renew", "notifications"].includes(command)) throw new RangeError("Use members:purge, members:renew or members:notifications.");
  const database = getDatabase();
  const result = command === "purge" ? await createMembersPurge(database).run() : command === "notifications"
    ? await createAccountNotifications({ database }).run() : { ...await createAutoRenew(database).run(), notifications: await createAccountNotifications({ database }).run() };
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(error instanceof RangeError ? error.message : "Member maintenance failed; private database diagnostics are withheld.");
  process.exitCode = 1;
} finally { await disconnectDatabase().catch(() => {}); }
