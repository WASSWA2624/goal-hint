import "server-only";
import { disconnectDatabase, getDatabase } from "../server/database/client.ts";
import { createAutoRenew } from "../server/members/auto-renew.ts";
import { createPaymentNotifications } from "../server/members/payment-notifications.ts";
import { createMembersPurge } from "../server/members/purge.ts";
const command = process.argv.slice(2).join(" ");
try {
  if (command !== "purge" && command !== "renew" && command !== "notify") throw new RangeError("Use members:purge, members:renew or members:notify.");
  // Each result holds counts only: no phone number or message text.
  console.log(JSON.stringify(command === "purge" ? await createMembersPurge(getDatabase()).run() : command === "renew" ? await createAutoRenew(getDatabase()).run()
    : await createPaymentNotifications({ database: getDatabase() }).run()));
} catch (error) {
  console.error(error instanceof RangeError ? error.message : command === "notify" ? "Payment notices failed; private database diagnostics are withheld."
    : `Members ${command === "renew" ? "auto-renewal" : "purge"} failed; private database diagnostics are withheld.`);
  process.exitCode = 1;
} finally { await disconnectDatabase().catch(() => {}); }
