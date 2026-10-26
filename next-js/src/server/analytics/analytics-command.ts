import "server-only";

import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { disconnectDatabase, getDatabase } from "../database/client.ts";
import { getAnalyticsConfig } from "./analytics-config.ts";
import { hashPassword } from "./analytics-password.ts";
import { createAnalyticsRetention } from "./analytics-retention.ts";

/** Read a password without echoing it on a terminal; piped input is read as the first line. */
async function readPassword(prompt: string): Promise<string> {
  let muted = false;
  const output = new Writable({ write(chunk, _encoding, done) { if (!muted) process.stdout.write(chunk); done(); } });
  const reader = createInterface({ input: process.stdin, output, terminal: process.stdin.isTTY === true });
  try {
    return await new Promise<string>((resolve, reject) => {
      reader.question(prompt, (answer) => { process.stdout.write("\n"); resolve(answer); });
      reader.once("close", () => reject(new Error("No password was entered.")));
      muted = true;
    });
  } finally { reader.close(); }
}

export async function runAnalyticsCommand(args: readonly string[]): Promise<void> {
  const [command] = args;
  if (command === "hash-password") {
    const password = await readPassword("New analytics admin password: ");
    if (password.length < 12) throw new RangeError("Use at least 12 characters for the analytics admin password.");
    if (process.stdin.isTTY && password !== await readPassword("Repeat the password: ")) throw new RangeError("The passwords do not match.");
    console.log(`GOAL_HINT_ANALYTICS_ADMIN_PASSWORD_HASH=${await hashPassword(password)}`);
    return;
  }
  if (command === "purge") {
    try {
      const config = await getAnalyticsConfig();
      const result = await createAnalyticsRetention(getDatabase(), { defaultDays: config.retentionDays }).purge();
      console.log(`Removed analytics records older than ${result.cutoff}: ${result.sessions} visits, ${result.pageviews} page views, `
        + `${result.events} events, ${result.visitors} visitors, ${result.adminSessions} expired sign-ins, ${result.loginThrottles} throttles.`);
    } finally { await disconnectDatabase().catch(() => {}); }
    return;
  }
  throw new RangeError("Use `hash-password` or `purge`.");
}
