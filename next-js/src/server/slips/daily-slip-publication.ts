import "server-only";

import { setTimeout as sleep } from "node:timers/promises";
import { bestSlipOddsBands, type BestSlipOddsBand } from "../../domain/best-slip-odds-bands.ts";
import { bestSlipActivePublicationDays, bestSlipAppendBatchSize, bestSlipFixtureInterval, bestSlipFixtureWindow,
  bestSlipKickoffBufferMs, bestSlipPreferredKickoffWindowMs, bestSlipPublicationHour } from "../../domain/best-slip-publication-hour.ts";
import { bestSlipCombinationIdentity, buildHourlyBestSlips } from "../../domain/best-slips.ts";
import { utcInstantFromEpochMilliseconds, type ReportingDate, type UtcInstant } from "../../domain/calendar.ts";
import { feedQueryRules } from "../../domain/feed-query.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import type { SlipSelection } from "../../domain/slip-builder.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { SlipOddsRefreshStatus } from "../odds/slip-odds-refresh-slot.ts";
import { provenTrue } from "../shared/authority-proof.ts";
import { createPublishedSlips } from "./published-slips.ts";
import { createStoredSlipCohort, type FeaturedSlipCursor, type SlipCohortReader } from "./slip-cohort.ts";

export type DailySlipPublicationResult = Readonly<{ day: string; status:
  "published" | "already-published" | "odds-unavailable" | "no-qualifying" | "unavailable";
  eligibleSelections?: number; newBands?: number; newSlips?: number; dayComplete?: boolean; searchLimited?: boolean;
  oddsRefresh?: Readonly<{ publicationSlot: string; status: SlipOddsRefreshStatus }>;
}>;

const automaticCohortPagesPerSlot = 4;

async function readPublicationCohort(read: SlipCohortReader, day: ReportingDate, calendarDay: ReportingDate, asOf: UtcInstant) {
  const interval = bestSlipFixtureInterval(day), window = bestSlipFixtureWindow(day);
  const parameters = new URLSearchParams({ start: interval.from, end: interval.to, status: "scheduled",
    market: publicPolicy.markets.join(","), sort: "kickoff", dir: "asc", pageSize: String(feedQueryRules.maximumPageSize) });
  const selections: SlipSelection[] = [], seen = new Set<string>();
  let after: FeaturedSlipCursor | undefined, hasForecast = false, partialCoverage = false, searchLimited = false;
  for (let page = 0; page < automaticCohortPagesPerSlot; page++) {
    const cohort = await read(parameters, { featured: true, includeAdditionalFeaturedGoals: true,
      minimumKickoffLeadMs: bestSlipKickoffBufferMs, automaticPage: { day, ...(after ? { after } : {}) } }, { now: () => asOf });
    if (cohort.asOf !== asOf || cohort.today !== calendarDay || cohort.range.startInclusive !== window.startInclusive
      || cohort.range.endExclusive !== window.endExclusive || !cohort.featuredSelections) throw new Error("Invalid automatic slip cohort.");
    selections.push(...cohort.featuredSelections.filter(({ fixtureId, kickoffAt }) => !seen.has(fixtureId)
      && kickoffAt >= window.startInclusive && kickoffAt < window.endExclusive));
    for (const { fixtureId, forecast } of cohort.records) {
      seen.add(fixtureId);
      hasForecast ||= forecast !== null;
    }
    partialCoverage ||= cohort.partialCoverage;
    searchLimited = cohort.searchLimited;
    if (!searchLimited) break;
    const tail = cohort.records.at(-1);
    if (!tail || tail.kickoffAt === null || after && (tail.kickoffAt < after.kickoffAt
      || tail.kickoffAt === after.kickoffAt && tail.fixtureId <= after.fixtureId)) throw new Error("Invalid automatic slip cohort cursor.");
    after = { kickoffAt: tail.kickoffAt, fixtureId: tail.fixtureId };
  }
  return { selections, hasForecast, partialCoverage, searchLimited };
}

/** Check the current set and the closing set during the midnight handoff. */
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

  async function publishDay(day: ReportingDate, asOf: UtcInstant, slot: ReturnType<typeof bestSlipPublicationHour>): Promise<DailySlipPublicationResult> {
    if (asOf + bestSlipKickoffBufferMs >= bestSlipFixtureWindow(day).endExclusive) return { day, status: "no-qualifying" };
    let stored = await store.hourlyState(day);
    let fixtures = new Set(stored.fixtures), combinations = new Set(stored.combinations);
    const reload = async () => {
      stored = await store.hourlyState(day);
      fixtures = new Set(stored.fixtures);
      combinations = new Set(stored.combinations);
    };
    const canAppend = (id: BestSlipOddsBand) => !stored.closed.has(id) && !stored.publishedHours.get(id)?.has(slot.hourAt);
    const openBands = bestSlipOddsBands.filter(({ id }) => canAppend(id));
    if (!openBands.length) return { day, status: "already-published" };

    const cohort = await readPublicationCohort(storedRead, day, slot.day, asOf);
    const available = (at: number) => cohort.selections.filter(({ fixtureId, kickoffAt }) => !fixtures.has(fixtureId)
      && kickoffAt - at >= bestSlipKickoffBufferMs);
    const eligibleSelections = new Set(available(now()).map(({ fixtureId }) => fixtureId)).size;
    let searchLimited = cohort.searchLimited;
    if (!eligibleSelections) return { day, status: !cohort.selections.length && cohort.hasForecast ? "odds-unavailable" : "no-qualifying",
      eligibleSelections, searchLimited };

    let newBands = 0, newSlips = 0, alreadyPublished = false, unavailable = false;
    for (const { id } of openBands) {
      const current = now();
      if (bestSlipPublicationHour(current).hourAt !== slot.hourAt || !oddsEnabled()) { unavailable = true; break; }
      if (!canAppend(id)) continue;

      const selections = available(current);
      if (!selections.some(({ kickoffAt }) => kickoffAt - current <= preferredKickoffWindowMs)) break;
      const result = buildHourlyBestSlips(day, id, bestSlipAppendBatchSize, current, { selections }, combinations, preferredKickoffWindowMs);
      const limited = result.searchLimited || result.slips.length === bestSlipAppendBatchSize;
      searchLimited ||= limited;
      if (!result.slips.length) continue;
      try {
        const appended = await store.append({ day, oddsBand: id, hourAt: slot.hourAt, slips: result.slips, verifyPublicOdds,
          searchLimited: cohort.searchLimited || limited, partialCoverage: cohort.partialCoverage });
        if (appended.status === "published") {
          newBands++;
          newSlips += appended.appended;
          if (appended.appended !== result.slips.length) await reload();
          else {
            for (const slip of result.slips) {
              combinations.add(bestSlipCombinationIdentity(slip.selections));
              for (const { fixtureId } of slip.selections) fixtures.add(fixtureId);
            }
          }
        } else if (appended.status !== "no-qualifying") {
          alreadyPublished ||= appended.status === "already-published" || appended.status === "full";
          unavailable ||= appended.status === "stale";
          await reload();
        }
      } catch {
        // Drift or a concurrent append in this band need not block another band.
        unavailable = true;
      }
    }
    return { day, status: newBands ? "published" : unavailable ? "unavailable" : alreadyPublished ? "already-published" : "no-qualifying",
      newBands, newSlips, eligibleSelections, searchLimited };
  }

  return Object.freeze({
    async publish(requestedHour?: number): Promise<DailySlipPublicationResult> {
      const asOf = utcInstantFromEpochMilliseconds(now()), slot = bestSlipPublicationHour(asOf);
      if (requestedHour !== undefined && requestedHour !== slot.hourAt) return { day: slot.day, status: "unavailable" };
      if (!oddsEnabled()) return { day: slot.day, status: "odds-unavailable" };

      const results: DailySlipPublicationResult[] = [];
      for (const day of bestSlipActivePublicationDays(asOf)) {
        try { results.push(await publishDay(day, asOf, slot)); }
        catch { results.push({ day, status: "unavailable" }); }
      }
      const statusOrder = ["published", "unavailable", "already-published", "odds-unavailable", "no-qualifying"] as const;
      const status = statusOrder.find(value => results.some(result => result.status === value)) ?? "no-qualifying";
      return { day: slot.day, status, newBands: results.reduce((sum, result) => sum + (result.newBands ?? 0), 0),
        newSlips: results.reduce((sum, result) => sum + (result.newSlips ?? 0), 0),
        eligibleSelections: results.reduce((sum, result) => sum + (result.eligibleSelections ?? 0), 0),
        searchLimited: results.some(result => result.searchLimited), dayComplete: false };
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
    dueAt = slot.nextAt;
  }
}
