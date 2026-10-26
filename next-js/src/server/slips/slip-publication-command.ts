import "server-only";

import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { assertOperationAllowed, getRuntimePolicy, type EvidenceVerifier, type RuntimePolicy } from "../config/runtime-policy.ts";
import { createDatabase, type DatabaseRuntime } from "../database/client.ts";
import { runDailySlipPublisher, type createDailySlipPublisher } from "./daily-slip-publication.ts";
import { SlipPublicationError } from "./published-slips.ts";

export type SlipPublicationBinding = Readonly<{
  authorizeWorker(policy: RuntimePolicy): boolean | Promise<boolean>;
  verifyEvidence: EvidenceVerifier;
  createPublisher(database: DatabaseRuntime): Pick<ReturnType<typeof createDailySlipPublisher>, "publish">;
}>;
export async function runSlipPublicationCommand(args: readonly string[], signal: AbortSignal) {
  const once = args.length === 3 && args[2] === "--once";
  if ((args.length !== 2 && !once) || args[0] !== "--binding" || !args[1] || !isAbsolute(args[1]) || !/\.(?:mjs|ts)$/u.test(args[1])) {
    throw new SlipPublicationError("invalid-input");
  }
  const policy = getRuntimePolicy();
  const bindingModule = await import(pathToFileURL(args[1]).href) as {
    createSlipPublicationBinding?: (policy: RuntimePolicy) => SlipPublicationBinding | Promise<SlipPublicationBinding>;
  };
  const binding = await bindingModule.createSlipPublicationBinding?.(policy);
  if (!binding || typeof binding.authorizeWorker !== "function" || await binding.authorizeWorker(policy) !== true ||
    typeof binding.verifyEvidence !== "function" || typeof binding.createPublisher !== "function") throw new SlipPublicationError("unauthorized");
  assertOperationAllowed(policy, "publication", binding.verifyEvidence);
  const database = createDatabase(policy, binding.verifyEvidence);
  try {
    if (await database.readiness() !== "ready") throw new SlipPublicationError("unavailable");
    const publisher = binding.createPublisher(database);
    await runDailySlipPublisher({ publish: async () => {
      assertOperationAllowed(policy, "publication", binding.verifyEvidence);
      return publisher.publish();
    } }, signal, (result) => process.stdout.write(JSON.stringify(result) + "\n"), once);
  } finally { await database.disconnect(); }
}
