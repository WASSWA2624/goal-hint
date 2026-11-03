import "server-only";

import { setTimeout as sleep } from "node:timers/promises";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { qualifiedJointModel, type JointSlipModel } from "../../domain/best-slips.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { provenTrue } from "../shared/authority-proof.ts";
import { bestSlipOddsBands } from "../../domain/best-slip-odds-bands.ts";
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
  store?: Pick<ReturnType<typeof createPublishedSlips>, "publishedBands" | "publish">;
}>) {
  const storedRead = read ?? createStoredSlipBuild({ database: () => database, competitionIds: () => competitionIds, consume: async () => {} });
  return Object.freeze({
    async publish(): Promise<DailySlipPublicationResult> {
      const day = getReportingDate(utcInstantFromEpochMilliseconds(now()));
      if (!providerOdds || !provenTrue(verifyPublicOdds)) return { day, status: "odds-unavailable" };
      if (!qualifiedJointModel(model, now()) || !provenTrue(() => verifyModel(model))) return { day, status: "model-unavailable" };
      const existing = await store.publishedBands(day);
      if (existing.includes("legacy") || bestSlipOddsBands.every(band => existing.includes(band.id))) return { day, status: "already-published" };
      let published = false, alreadyPublished = false;
      let unavailable: DailySlipPublicationResult["status"] | null = null;
      for (const band of bestSlipOddsBands) {
        if (existing.includes(band.id)) continue;
        const generate = createBestSlipsService({ model, providerOdds, now, read: storedRead, oddsBand: band.id });
        const result = await generate({ tier: "full", signedIn: false, mode: "free" });
        const slips = result.slips.flatMap(view => view.slip ? [view.slip] : []);
        if (result.day !== day) return { day, status: published ? "published" : "unavailable" };
        if (!slips.length) {
          if (result.state === "model-unavailable" || result.state === "odds-unavailable") unavailable = result.state;
          else if (result.state === "data-unavailable") unavailable = "unavailable";
          continue;
        }
        if (slips.length !== result.slips.length) return { day, status: "unavailable" };
        const status = await store.publish({ day, oddsBand: band.id, slips, model, verifyModel, verifyPublicOdds,
          searchLimited: result.searchLimited, partialCoverage: result.partialCoverage });
        published ||= status === "published";
        alreadyPublished ||= status === "already-published";
      }
      return { day, status: published ? "published" : unavailable ?? (alreadyPublished ? "already-published" : "no-qualifying") };
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
