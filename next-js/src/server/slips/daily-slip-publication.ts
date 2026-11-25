import "server-only";

import { setTimeout as sleep } from "node:timers/promises";
import { bestSlipOddsBands, dailyBestSlipBandLimit, type BestSlipOddsBand } from "../../domain/best-slip-odds-bands.ts";
import { bestSlipKickoffBufferMs, bestSlipPreferredKickoffWindowMs, bestSlipPublicationHour } from "../../domain/best-slip-publication-hour.ts";
import { bestSlipCombinationIdentity, buildHourlyBestSlips } from "../../domain/best-slips.ts";
import { getReportingDayBounds, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { feedQueryRules } from "../../domain/feed-query.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { provenTrue } from "../shared/authority-proof.ts";
import { createPublishedSlips } from "./published-slips.ts";
import { createStoredSlipCohort, type SlipCohortReader } from "./slip-cohort.ts";

export type DailySlipPublicationResult = Readonly<{ day: string; status:
  "published" | "already-published" | "odds-unavailable" | "no-qualifying" | "unavailable";
  eligibleSelections?: number; newBands?: number; newSlips?: number; dayComplete?: boolean;
}>;

/** Read one stored same-day cohort, and append only newly validated combination identities. */
export function createDailySlipPublisher({ database, competitionIds, verifyPublicOdds, providerOdds = true, now = Date.now, read,
  preferredKickoffWindowMs = bestSlipPreferredKickoffWindowMs,
  store = createPublishedSlips(database) }: Readonly<{
  database: DatabaseRuntime; competitionIds: readonly number[]; verifyPublicOdds: () => boolean;
  providerOdds?: boolean; now?: () => number; read?: SlipCohortReader; preferredKickoffWindowMs?: number;
  store?: Pick<ReturnType<typeof createPublishedSlips>, "hourlyState" | "append">;
}>) {
  if (!Number.isSafeInteger(preferredKickoffWindowMs) || preferredKickoffWindowMs < bestSlipKickoffBufferMs)
    throw new RangeError("Invalid automatic slip kickoff window.");
  const oddsEnabled = () => providerOdds && provenTrue(verifyPublicOdds);
  const storedRead = read ?? createStoredSlipCohort({ database: () => database, competitionIds: () => competitionIds, providerOdds });
  return Object.freeze({
    async publish(requestedHour?: number): Promise<DailySlipPublicationResult> {
      const asOf = utcInstantFromEpochMilliseconds(now()), { day, hourAt } = bestSlipPublicationHour(asOf);
      if (requestedHour !== undefined && requestedHour !== hourAt) return { day, status: "unavailable" };
      if (!oddsEnabled()) return { day, status: "odds-unavailable" };

      let stored = await store.hourlyState(day);
      let counts = new Map(stored.counts), fixtures = new Set(stored.fixtures), combinations = new Set(stored.combinations);
      const reload = async () => {
        stored = await store.hourlyState(day);
        counts = new Map(stored.counts); fixtures = new Set(stored.fixtures); combinations = new Set(stored.combinations);
      };
      const bandFull = (id: BestSlipOddsBand) => stored.closed.has(id) || (counts.get(id) ?? 0) >= dailyBestSlipBandLimit;
      const dayComplete = () => bestSlipOddsBands.every(({ id }) => bandFull(id));
      const openBands = bestSlipOddsBands.filter(({ id }) =>
        !bandFull(id) && !stored.publishedHours.get(id)?.has(hourAt));
      if (!openBands.length) return { day, status: "already-published", dayComplete: dayComplete() };

      const cohort = await storedRead(new URLSearchParams({ from: day, to: day, status: "scheduled", market: publicPolicy.markets.join(","),
        sort: "probability", dir: "desc", pageSize: String(feedQueryRules.maximumPageSize) }),
      { featured: true, includeAdditionalFeaturedGoals: true, minimumKickoffLeadMs: bestSlipKickoffBufferMs }, { now: () => asOf });
      if (cohort.today !== day || cohort.range.from !== day || cohort.range.to !== day || cohort.asOf !== asOf || !cohort.featuredSelections)
        return { day, status: "unavailable" };
      const { featuredSelections } = cohort;
      const available = (at: number) => featuredSelections.filter(({ fixtureId, kickoffAt }) => !fixtures.has(fixtureId)
        && kickoffAt - at >= bestSlipKickoffBufferMs);
      const eligibleSelections = new Set(available(now()).map(({ fixtureId }) => fixtureId)).size;
      if (!eligibleSelections) return { day, status: !featuredSelections.length && cohort.records.some(({ forecast }) => forecast !== null)
        ? "odds-unavailable" : "no-qualifying", eligibleSelections };

      let newBands = 0, newSlips = 0, alreadyPublished = false, unavailable = false;
      for (const { id } of openBands) {
        const current = now();
        if (bestSlipPublicationHour(current).hourAt !== hourAt || !oddsEnabled()) { unavailable = true; break; }
        const count = counts.get(id) ?? 0;
        if (bandFull(id) || stored.publishedHours.get(id)?.has(hourAt)) continue;

        const selections = available(current);
        if (!selections.some(({ kickoffAt }) => kickoffAt - current <= preferredKickoffWindowMs)) break;
        const result = buildHourlyBestSlips(day, id, dailyBestSlipBandLimit - count, current, { selections }, combinations, preferredKickoffWindowMs);
        if (!result.slips.length) continue;
        try {
          const appended = await store.append({ day, oddsBand: id, hourAt, slips: result.slips, verifyPublicOdds,
            searchLimited: cohort.searchLimited || result.searchLimited, partialCoverage: cohort.partialCoverage });
          if (appended.status === "published") {
            newBands++;
            newSlips += appended.appended;
            if (appended.appended !== result.slips.length) await reload();
            else {
              counts.set(id, count + appended.appended);
              for (const slip of result.slips) {
                combinations.add(bestSlipCombinationIdentity(slip.selections));
                slip.selections.forEach(({ fixtureId }) => fixtures.add(fixtureId));
              }
            }
          } else if (appended.status !== "no-qualifying") {
            alreadyPublished ||= appended.status === "already-published" || appended.status === "full";
            unavailable ||= appended.status === "stale";
            await reload();
          }
        } catch {
          // Other bands can still receive valid additions when this band encounters quote drift or a conflict.
          unavailable = true;
        }
      }
      return { day, status: newBands ? "published" : unavailable ? "unavailable" : alreadyPublished ? "already-published" : "no-qualifying",
        newBands, newSlips, eligibleSelections, dayComplete: dayComplete() };
    },
  });
}

type PublisherTiming = Readonly<{
  now?: () => number;
  wait?: (delay: number, signal: AbortSignal) => Promise<unknown>;
}>;

/** A supervised loop waits for Kampala half-hour boundaries. The one-shot command services the current slot. */
export async function runDailySlipPublisher(publisher: Pick<ReturnType<typeof createDailySlipPublisher>, "publish">,
  signal: AbortSignal, onResult: (result: DailySlipPublicationResult) => void, once = false,
  { now = Date.now, wait = (delay, stop) => sleep(delay, undefined, { signal: stop }) }: PublisherTiming = {}) {
  const startedAt = now(), first = bestSlipPublicationHour(startedAt);
  let dueAt = once || startedAt === first.hourAt ? first.hourAt : first.nextAt;
  while (!signal.aborted) {
    const delay = dueAt - now();
    if (!once && delay > 0) {
      try { await wait(delay, signal); }
      catch (error) { if (signal.aborted) return; throw error; }
      if (signal.aborted) return;
    }
    const slot = bestSlipPublicationHour(now());
    if (!once && slot.hourAt < dueAt) continue;
    if (!once && slot.hourAt > dueAt) { dueAt = slot.nextAt; continue; }

    let result: DailySlipPublicationResult;
    try { result = await publisher.publish(slot.hourAt); }
    catch { result = { day: slot.day, status: "unavailable" }; }
    onResult(result);
    if (once) return;
    dueAt = result.dayComplete && result.day === slot.day ? getReportingDayBounds(slot.day).endExclusive : slot.nextAt;
  }
}
