import "server-only";

import { setTimeout as sleep } from "node:timers/promises";
import { bestSlipOddsBands, type BestSlipOddsBand } from "../../domain/best-slip-odds-bands.ts";
import { bestSlipActivePublicationDays, bestSlipAppendBatchSize, bestSlipFixtureInterval, bestSlipFixtureWindow,
  bestSlipKickoffBufferMs, bestSlipPreferredKickoffWindowMs, bestSlipPublicationHour,
  bestSlipPublicationIntervalMs } from "../../domain/best-slip-publication-hour.ts";
import { automaticBestSlipPriority, bestSlipCombinationIdentity, buildHourlyBestSlips,
  compareAutomaticBestSlipPriority } from "../../domain/best-slips.ts";
import { utcInstantFromEpochMilliseconds, type ReportingDate, type UtcInstant } from "../../domain/calendar.ts";
import { feedQueryRules } from "../../domain/feed-query.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import type { BuiltSlip, SlipSelection } from "../../domain/slip-builder.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { SlipOddsRefreshStatus } from "../odds/slip-odds-refresh-slot.ts";
import { provenTrue } from "../shared/authority-proof.ts";
import { createPublishedSlips } from "./published-slips.ts";
import { createStoredSlipCohort, type FeaturedSlipCursor, type SlipCohortReader } from "./slip-cohort.ts";

type BandSearch = ReturnType<typeof buildHourlyBestSlips>;
type BandPublicationResult = Readonly<{
  day: ReportingDate; band: BestSlipOddsBand; eligibleFixtures: number; exactOffers: number;
  fixturesWithoutForecast: number; forecastFixturesWithoutQualifiedOffer: number; priorFixtureConflicts: number;
  feasibleBeforeAllocation: number; selected: number; published: number; fixtureConflicts: number;
  searchLimited: boolean; search?: BandSearch["searchDiagnostics"];
  reason: "published" | "partially-published" | "already-published" | "no-eligible-fixtures" | "no-eligible-prices" |
    "release-window" | "no-eligible-slip" | "search-limited" | "fixture-conflict" | "eligibility-recheck" | "unavailable";
}>;

export type DailySlipPublicationResult = Readonly<{ day: string; status:
  "published" | "already-published" | "odds-unavailable" | "no-qualifying" | "unavailable";
  eligibleSelections?: number; newBands?: number; newSlips?: number; dayComplete?: boolean; searchLimited?: boolean;
  bandResults?: readonly BandPublicationResult[];
  oddsRefresh?: Readonly<{ publicationSlot: string; status: SlipOddsRefreshStatus }>;
}>;

const automaticCohortPagesPerSlot = 4;

type BandPlan = Readonly<{ band: BestSlipOddsBand; search: BandSearch; candidates: readonly BuiltSlip[] }>;

function usesFixtures(slip: BuiltSlip, fixtures: ReadonlySet<string>) {
  return slip.selections.some(({ fixtureId }) => fixtures.has(fixtureId));
}

/** Every band has been searched independently. Shared fixtures go to stronger slips first. */
function allocateBandSlips(plans: readonly BandPlan[], hourAt: number) {
  const rotation = Math.floor(hourAt / bestSlipPublicationIntervalMs) % bestSlipOddsBands.length;
  const bandOrder = (band: BestSlipOddsBand) => (bestSlipOddsBands.findIndex(({ id }) => id === band)
    + bestSlipOddsBands.length - rotation) % bestSlipOddsBands.length;
  const ranked = plans.flatMap(({ band, candidates }) => {
    const order = bandOrder(band);
    return candidates.map(slip => ({ band, order, slip, priority: automaticBestSlipPriority(slip) }));
  }).sort((a, b) => compareAutomaticBestSlipPriority(a.priority, b.priority) || a.order - b.order);
  const selected = new Map(plans.map(({ band }) => [band, new Set<BuiltSlip>()])), fixtures = new Set<string>();
  for (const { band, slip } of ranked) {
    const picks = selected.get(band)!;
    if (picks.size >= bestSlipAppendBatchSize || usesFixtures(slip, fixtures)) continue;
    picks.add(slip);
    for (const { fixtureId } of slip.selections) fixtures.add(fixtureId);
  }
  return { selected, fixtures };
}

async function readPublicationCohort(read: SlipCohortReader, day: ReportingDate, calendarDay: ReportingDate, asOf: UtcInstant) {
  const interval = bestSlipFixtureInterval(day), window = bestSlipFixtureWindow(day);
  const parameters = new URLSearchParams({ start: interval.from, end: interval.to, status: "scheduled",
    market: publicPolicy.markets.join(","), sort: "kickoff", dir: "asc", pageSize: String(feedQueryRules.maximumPageSize) });
  const selections: SlipSelection[] = [], seen = new Set<string>();
  let after: FeaturedSlipCursor | undefined, forecastFixtures = 0, partialCoverage = false, searchLimited = false;
  for (let page = 0; page < automaticCohortPagesPerSlot; page++) {
    const cohort = await read(parameters, { featured: true, includeAdditionalFeaturedGoals: true,
      minimumKickoffLeadMs: bestSlipKickoffBufferMs, automaticPage: { day, ...(after ? { after } : {}) } }, { now: () => asOf });
    if (cohort.asOf !== asOf || cohort.today !== calendarDay || cohort.range.startInclusive !== window.startInclusive
      || cohort.range.endExclusive !== window.endExclusive || !cohort.featuredSelections) throw new Error("Invalid automatic slip cohort.");
    selections.push(...cohort.featuredSelections.filter(({ fixtureId, kickoffAt }) => !seen.has(fixtureId)
      && kickoffAt >= window.startInclusive && kickoffAt < window.endExclusive));
    for (const { fixtureId, forecast } of cohort.records) {
      if (seen.has(fixtureId)) continue;
      seen.add(fixtureId);
      if (forecast !== null) forecastFixtures++;
    }
    partialCoverage ||= cohort.partialCoverage;
    searchLimited = cohort.searchLimited;
    if (!searchLimited) break;
    const tail = cohort.records.at(-1);
    if (!tail || tail.kickoffAt === null || after && (tail.kickoffAt < after.kickoffAt
      || tail.kickoffAt === after.kickoffAt && tail.fixtureId <= after.fixtureId)) throw new Error("Invalid automatic slip cohort cursor.");
    after = { kickoffAt: tail.kickoffAt, fixtureId: tail.fixtureId };
  }
  return { selections, fixtures: seen.size, forecastFixtures, partialCoverage, searchLimited };
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
    const bandResults = new Map<BestSlipOddsBand, BandPublicationResult>();
    const empty = { eligibleFixtures: 0, exactOffers: 0, fixturesWithoutForecast: 0, forecastFixturesWithoutQualifiedOffer: 0,
      priorFixtureConflicts: 0, feasibleBeforeAllocation: 0, selected: 0, published: 0, fixtureConflicts: 0, searchLimited: false };
    const report = (band: BestSlipOddsBand, reason: BandPublicationResult["reason"], values: Partial<BandPublicationResult> = {}) =>
      bandResults.set(band, { ...empty, ...values, day, band, reason });
    const summarize = () => bestSlipOddsBands.map(({ id }) => bandResults.get(id)!);
    if (asOf + bestSlipKickoffBufferMs >= bestSlipFixtureWindow(day).endExclusive) {
      for (const { id } of bestSlipOddsBands) report(id, "no-eligible-fixtures");
      return { day, status: "no-qualifying", bandResults: summarize() };
    }
    let stored = await store.hourlyState(day);
    let fixtures = new Set(stored.fixtures), combinations = new Set(stored.combinations);
    const reload = async () => {
      stored = await store.hourlyState(day);
      fixtures = new Set(stored.fixtures);
      combinations = new Set(stored.combinations);
    };
    const canAppend = (id: BestSlipOddsBand) => !stored.closed.has(id) && !stored.publishedHours.get(id)?.has(slot.hourAt);
    const openBands = bestSlipOddsBands.filter(({ id }) => canAppend(id));
    for (const { id } of bestSlipOddsBands) if (!canAppend(id)) report(id, "already-published");
    if (!openBands.length) return { day, status: "already-published", bandResults: summarize() };

    const cohort = await readPublicationCohort(storedRead, day, slot.day, asOf);
    const evaluatedAt = now();
    const selections = cohort.selections.filter(({ fixtureId, kickoffAt }) => !fixtures.has(fixtureId)
      && kickoffAt - evaluatedAt >= bestSlipKickoffBufferMs);
    const eligibleSelections = new Set(selections.map(({ fixtureId }) => fixtureId)).size;
    const pricedFixtures = new Set(cohort.selections.map(({ fixtureId }) => fixtureId));
    const observed = { eligibleFixtures: eligibleSelections, exactOffers: selections.length,
      fixturesWithoutForecast: cohort.fixtures - cohort.forecastFixtures,
      forecastFixturesWithoutQualifiedOffer: Math.max(0, cohort.forecastFixtures - pricedFixtures.size),
      priorFixtureConflicts: [...pricedFixtures].filter(id => fixtures.has(id)).length, searchLimited: cohort.searchLimited };
    const earlyReason = bestSlipPublicationHour(evaluatedAt).hourAt !== slot.hourAt || !oddsEnabled() ? "unavailable"
      : !eligibleSelections ? cohort.forecastFixtures && !pricedFixtures.size ? "no-eligible-prices" : "no-eligible-fixtures"
      : !selections.some(({ kickoffAt }) => kickoffAt - evaluatedAt <= preferredKickoffWindowMs) ? "release-window" : null;
    if (earlyReason) {
      for (const { id } of openBands) report(id, earlyReason, observed);
      const status = earlyReason === "unavailable" ? "unavailable" : earlyReason === "no-eligible-prices" ? "odds-unavailable" : "no-qualifying";
      return { day, status, eligibleSelections, searchLimited: cohort.searchLimited, bandResults: summarize() };
    }

    // Evaluate every open band at the same clock against the same unallocated pool.
    const plans = openBands.map(({ id: band }): BandPlan => {
      const search = buildHourlyBestSlips(day, band, bestSlipAppendBatchSize, evaluatedAt, { selections }, combinations,
        preferredKickoffWindowMs, { includeAlternatives: true });
      return { band, search, candidates: search.alternatives ?? search.slips };
    });
    const allocation = allocateBandSlips(plans, slot.hourAt);
    let searchLimited = cohort.searchLimited;

    let newBands = 0, newSlips = 0, alreadyPublished = false, unavailable = false;
    for (const { band, search, candidates } of plans) {
      const picks = allocation.selected.get(band);
      const chosen = candidates.filter(slip => picks?.has(slip));
      const limited = search.searchLimited || search.slips.length === bestSlipAppendBatchSize;
      searchLimited ||= limited;
      const details = { ...observed, feasibleBeforeAllocation: candidates.length, selected: chosen.length,
        fixtureConflicts: candidates.filter(slip => !picks?.has(slip) && usesFixtures(slip, allocation.fixtures)).length,
        searchLimited: cohort.searchLimited || limited, search: search.searchDiagnostics };
      if (!chosen.length) {
        report(band, candidates.length ? "fixture-conflict" : details.searchLimited ? "search-limited" : "no-eligible-slip", details);
        continue;
      }
      const current = now();
      if (bestSlipPublicationHour(current).hourAt !== slot.hourAt || !oddsEnabled()) {
        unavailable = true;
        report(band, "unavailable", details);
        continue;
      }
      if (!canAppend(band)) { alreadyPublished = true; report(band, "already-published", details); continue; }
      const slips = chosen.filter(slip => !usesFixtures(slip, fixtures) && !combinations.has(bestSlipCombinationIdentity(slip.selections))
        && slip.selections.every(({ kickoffAt }) => kickoffAt - current >= bestSlipKickoffBufferMs));
      if (!slips.length) { report(band, "eligibility-recheck", details); continue; }
      try {
        const appended = await store.append({ day, oddsBand: band, hourAt: slot.hourAt, slips, verifyPublicOdds,
          searchLimited: details.searchLimited, partialCoverage: cohort.partialCoverage });
        if (appended.status === "published") {
          newBands++;
          newSlips += appended.appended;
          report(band, appended.appended === chosen.length ? "published" : "partially-published", { ...details, published: appended.appended });
          if (appended.appended !== slips.length) await reload();
          else {
            for (const slip of slips) {
              combinations.add(bestSlipCombinationIdentity(slip.selections));
              for (const { fixtureId } of slip.selections) fixtures.add(fixtureId);
            }
          }
        } else if (appended.status !== "no-qualifying") {
          alreadyPublished ||= appended.status === "already-published" || appended.status === "full";
          unavailable ||= appended.status === "stale";
          report(band, appended.status === "stale" ? "unavailable" : "already-published", details);
          await reload();
        } else report(band, "eligibility-recheck", details);
      } catch {
        // Drift or a concurrent append in this band need not block another band.
        unavailable = true;
        if (!bandResults.has(band)) report(band, "unavailable", details);
      }
    }
    return { day, status: newBands ? "published" : unavailable ? "unavailable" : alreadyPublished ? "already-published" : "no-qualifying",
      newBands, newSlips, eligibleSelections, searchLimited, bandResults: summarize() };
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
        searchLimited: results.some(result => result.searchLimited), dayComplete: false,
        bandResults: results.flatMap(result => result.bandResults ?? []) };
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
