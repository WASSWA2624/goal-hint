import "server-only";
import { disconnectDatabase, getDatabase } from "../server/database/client.ts";
import { createReferrals } from "../server/members/referrals.ts";

try {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.length === 1 && args[0] !== "--apply") throw new RangeError("Use no arguments to preview or --apply to assign missing member referral codes.");
  console.log(JSON.stringify(await createReferrals({ database: getDatabase() }).provisionCodes(args[0] === "--apply")));
} catch (error) {
  console.error(error instanceof RangeError ? error.message : "Referral code provisioning failed; private diagnostics are withheld.");
  process.exitCode = 1;
} finally { await disconnectDatabase().catch(() => {}); }
