import "server-only";

import { setTimeout as sleep } from "node:timers/promises";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { qualifiedJointModel, type JointSlipModel } from "../../domain/best-slips.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { provenTrue } from "../shared/authority-proof.ts";
import { createBestSlipsService } from "./best-slips.ts";
import { createPublishedSlips } from "./published-slips.ts";
import { createStoredSlipBuild, type readPublicSlipBuild } from "./public-slips.ts";

export type DailySlipPublicationResult = Readonly<{ day: string; status:
  "published" | "already-published" | "model-unavailable" | "odds-unavailable" | "no-qualifying" | "unavailable" }>;
/** The private worker alone owns generation/publication. Visitors read the first committed daily snapshot. */
export function createDailySlipPublisher({ database, competitionIds, model, verifyModel, verifyPublicOdds,
  providerOdds = publicPolicy.features.providerOdds, now = Date.now, read,
  store = createPublishedSlips(database) }: Readonly<{
  database: DatabaseRuntime; competitionIds: readonly number[]; model: JointSlipModel | null;
  verifyModel: (model: JointSlipModel) => boolean; verifyPublicOdds: () => boolean;
  providerOdds?: boolean; now?: () => number; read?: typeof readPublicSlipBuild;
  store?: Pick<ReturnType<typeof createPublishedSlips>, "day" | "publish">;
}>) {
  const generate = createBestSlipsService({ model, providerOdds, now, read: read ?? createStoredSlipBuild({
    database: () => database, competitionIds: () => competitionIds,
    // One private bounded cohort per minute; public visitor search quotas do not authorize or govern a worker.
    consume: async () => {},
  }) });
  return Object.freeze({
    async publish(): Promise<DailySlipPublicationResult> {
      const day = getReportingDate(utcInstantFromEpochMilliseconds(now()));
      if (!providerOdds || !provenTrue(verifyPublicOdds)) return { day, status: "odds-unavailable" };
      if (!qualifiedJointModel(model, now()) || !provenTrue(() => verifyModel(model))) return { day, status: "model-unavailable" };
      if (await store.day(day)) return { day, status: "already-published" };
      const result = await generate({ tier: "full", signedIn: false, mode: "free" });
      const slips = result.slips.flatMap((view) => view.slip ? [view.slip] : []);
      if (!slips.length) return { day, status: result.state === "no-qualifying" || result.state === "no-combinations" ? "no-qualifying" : "unavailable" };
      if (result.day !== day || slips.length !== result.slips.length) return { day, status: "unavailable" };
      return { day, status: await store.publish({ day, slips, model, verifyModel, verifyPublicOdds,
        searchLimited: result.searchLimited, partialCoverage: result.partialCoverage }) };
    },
  });
}

/** Retry current EAT day until it has a feasible, qualified cohort. Durable uniqueness survives restarts. */
export async function runDailySlipPublisher(publisher: Pick<ReturnType<typeof createDailySlipPublisher>, "publish">,
  signal: AbortSignal, onResult: (result: DailySlipPublicationResult) => void, once = false) {
  let previous = "";
  do {
    if (signal.aborted) return;
    let result: DailySlipPublicationResult;
    try { result = await publisher.publish(); }
    catch { result = { day: getReportingDate(utcInstantFromEpochMilliseconds(Date.now())), status: "unavailable" }; }
    const key = `${result.day}:${result.status}`;
    if (key !== previous) { onResult(result); previous = key; }
    if (once || signal.aborted) return;
    await sleep(60_000, undefined, { signal }).catch(() => {});
  } while (!signal.aborted);
}
