import "server-only";

import { disconnectDatabase, getDatabase } from "../server/database/client.ts";
import { createPaymentOutboxWorker } from "../server/members/payment-notification-outbox.ts";

try {
  const [command = "status", argument, ...extra] = process.argv.slice(2);
  if (extra.length || !["status", "run"].includes(command) || command === "status" && argument !== undefined) {
    throw new RangeError("Use payments:notifications status or payments:notifications run [1–100].");
  }
  const limit = argument === undefined ? undefined : /^\d{1,3}$/u.test(argument) ? Number(argument) : NaN;
  const worker = createPaymentOutboxWorker({ database: getDatabase() });
  console.log(JSON.stringify(command === "status" ? await worker.status() : await worker.run(limit)));
} catch (error) {
  console.error(error instanceof RangeError ? error.message : "Payment SMS worker failed; private diagnostics are withheld.");
  process.exitCode = 1;
} finally { await disconnectDatabase().catch(() => {}); }
