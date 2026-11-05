import { getDatabase, disconnectDatabase } from "../src/server/database/client.ts";
import { resetDemoSubscriptions } from "../src/server/demo/subscription-reset.ts";

try {
  const args = process.argv.slice(2);
  let apply = false, expectedDatadir, mode;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (["--dry-run", "--apply"].includes(argument) && !mode) { mode = argument; apply = argument === "--apply"; }
    else if (argument === "--expected-datadir" && !expectedDatadir && args[index + 1] && !args[index + 1].startsWith("--")) {
      expectedDatadir = args[++index];
    } else throw new Error("Use node --conditions=react-server scripts/reset-demo-subscriptions.mjs [--dry-run|--apply] [--expected-datadir <verified-owned-path>].");
  }
  const result = await resetDemoSubscriptions(getDatabase(), { apply, expectedDatadir });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status === "blocked") process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Demo subscription reset failed; private diagnostics are withheld."}\n`);
  process.exitCode = 1;
} finally { await disconnectDatabase(); }
