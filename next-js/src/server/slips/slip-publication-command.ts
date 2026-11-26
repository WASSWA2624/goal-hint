import "server-only";

import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { bestSlipPublicationHour } from "../../domain/best-slip-publication-hour.ts";
import { assertOperationAllowed, getRuntimePolicy, type EvidenceVerifier, type RuntimePolicy } from "../config/runtime-policy.ts";
import { createDatabase, type DatabaseRuntime } from "../database/client.ts";
import { loadOwnerApprovals, ownerEvidenceVerifier } from "../live/live-approvals.ts";
import { approvedOddsDisplay } from "../odds/public-odds-policy.ts";
import { waitForSlipOddsRefresh } from "../odds/slip-odds-refresh-slot.ts";
import { createDailySlipPublisher, runDailySlipPublisher } from "./daily-slip-publication.ts";
import { SlipPublicationError } from "./published-slips.ts";

export type SlipPublicationBinding = Readonly<{
  authorizeWorker(policy: RuntimePolicy): boolean | Promise<boolean>;
  verifyEvidence: EvidenceVerifier;
  createPublisher(database: DatabaseRuntime): Pick<ReturnType<typeof createDailySlipPublisher>, "publish">;
}>;

function storedSlipPublicationBinding(policy: RuntimePolicy): SlipPublicationBinding {
  const verifyEvidence: EvidenceVerifier = (reference, requirement) => ownerEvidenceVerifier(loadOwnerApprovals())(reference, requirement);
  return {
    authorizeWorker: runtime => Boolean(runtime.choices.competitionIds?.length),
    verifyEvidence,
    createPublisher: database => createDailySlipPublisher({ database, competitionIds: policy.choices.competitionIds ?? [],
      verifyPublicOdds: () => approvedOddsDisplay(policy.choices.odds.rightsRef, verifyEvidence) }),
  };
}

async function externalSlipPublicationBinding(path: string, policy: RuntimePolicy) {
  const bindingModule = await import(pathToFileURL(path).href) as {
    createSlipPublicationBinding?: (policy: RuntimePolicy) => SlipPublicationBinding | Promise<SlipPublicationBinding>;
  };
  return bindingModule.createSlipPublicationBinding?.(policy);
}

export async function runSlipPublicationCommand(args: readonly string[], signal: AbortSignal) {
  const once = args.at(-1) === "--once", options = once ? args.slice(0, -1) : args;
  const stored = options.length === 1 && options[0] === "--stored";
  const path = options.length === 2 && options[0] === "--binding" ? options[1] : undefined;
  if (!stored && (!path || !isAbsolute(path) || !/\.(?:mjs|ts)$/u.test(path))) throw new SlipPublicationError("invalid-input");

  const policy = getRuntimePolicy();
  const binding = stored ? storedSlipPublicationBinding(policy) : await externalSlipPublicationBinding(path!, policy);
  if (!binding || typeof binding.authorizeWorker !== "function" || typeof binding.verifyEvidence !== "function" ||
    typeof binding.createPublisher !== "function") throw new SlipPublicationError("unauthorized");
  const authorize = async () => {
    if (await binding.authorizeWorker(policy) !== true || !approvedOddsDisplay(policy.choices.odds.rightsRef, binding.verifyEvidence)) {
      throw new SlipPublicationError("unauthorized");
    }
    // Stored-only slip publication uses the approved database and odds receipts, with no provider calls.
    assertOperationAllowed(policy, "database", binding.verifyEvidence);
  };
  await authorize();
  const database = createDatabase(policy, binding.verifyEvidence);
  try {
    if (await database.readiness() !== "ready") throw new SlipPublicationError("unavailable");
    const publisher = binding.createPublisher(database);
    await runDailySlipPublisher({ publish: async (hourAt) => {
      await authorize();
      if (!stored || !policy.choices.odds.slipRefreshEnabled) return publisher.publish(hourAt);
      const slot = bestSlipPublicationHour(hourAt ?? Date.now());
      const status = await waitForSlipOddsRefresh(slot.hourAt, async (id) => {
        const job = await database.query(db => db.durableJob.findUnique({ where: { id }, select: { state: true } }));
        return job?.state ?? null;
      }, signal);
      const oddsRefresh = { publicationSlot: new Date(slot.hourAt).toISOString(), status };
      if (status !== "succeeded") return { day: slot.day, status: "unavailable", oddsRefresh };
      await authorize();
      return { ...await publisher.publish(slot.hourAt), oddsRefresh };
    } }, signal, (result) => process.stdout.write(JSON.stringify(result) + "\n"), once);
  } finally { await database.disconnect(); }
}
