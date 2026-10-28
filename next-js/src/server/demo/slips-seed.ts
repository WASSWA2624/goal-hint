import "server-only";

import { createHash } from "node:crypto";
import { getPublicationDeadline, getReportingDate, parseReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { bestSlipCriteria, bestSlipsRules } from "../../domain/best-slips.ts";
import { selectedCardPrediction, selectedCardPrice } from "../../domain/match-card.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import { serializeSlipCriteria, type BuiltSlip, type SlipSelection } from "../../domain/slip-builder.ts";
import { savedSlipSnapshotSchema } from "../../domain/saved-slips.ts";
import { parseDecimalOdds, formatOddsHundredths } from "../../domain/odds.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { createMatchFeedService } from "../matches/feed-service.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { historyJson } from "../predictions/history-read.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { demoFootballCatalog, DEMO_START_DATE, DEMO_END_DATE } from "./api-football.ts";
import { demoId } from "./forecast.ts";
import { assertDemoDatabase, demoMember } from "./member.ts";
import { ensureDemoDates } from "./seed.ts";
import type { SettlementOutcomeStatus } from "../../domain/market-settlement.ts";
import type { StoredMatchFeedResponse } from "../../domain/match-feed.ts";
import { DEMO_MATCHES_PER_DAY } from "./api-football.ts";

export const demoSlipRules = Object.freeze({ count: bestSlipsRules.count, minimumSelections: 4, maximumSelections: 8, minimumProbability: 0.65,
  minimumTotalHundredths: 450, maximumTotalHundredths: 550, minimumLeadMs: 30 * 60_000 });
export type DemoSlipCandidate = Readonly<{ selection: SlipSelection; outcome: SettlementOutcomeStatus }>;
class IncompleteDemoPublication extends Error {}

/** Test eligibility against the exact decimal product; round only the displayed quote. */
export function demoSlipQuote(selections: readonly Pick<SlipSelection, "odds">[]) {
  const denominator = 10_000n ** BigInt(selections.length);
  const product = selections.reduce((value, selection) => {
    const odds = parseDecimalOdds(selection.odds);
    if (!odds) throw new Error("Invalid synthetic slip price.");
    return value * odds.scaled;
  }, 1n);
  return { totalOdds: formatOddsHundredths(Number((product * 200n + denominator) / (2n * denominator))),
    belowMinimum: product * 100n < BigInt(demoSlipRules.minimumTotalHundredths) * denominator,
    aboveMaximum: product * 100n > BigInt(demoSlipRules.maximumTotalHundredths) * denominator };
}

/** Curated examples use only their original forecast choices and prices. Today's
 * synthetic editorial set belongs to the opening of the reporting day, so a first
 * startup after kickoff still presents the same ordinary settled/pending slips.
 * Selecting examples never changes a match result or reassigns a saved forecast. */
export function buildDemoSlipSnapshots(date: string, candidates: readonly DemoSlipCandidate[], nowMs: number) {
  parseReportingDate(date);
  const today = getReportingDate(utcInstantFromEpochMilliseconds(nowMs)), historical = date < today;
  const dayStart = Date.parse(`${date}T00:00:00+03:00`);
  if (date > today) throw new Error("Synthetic editorial publications cannot precede their reporting date.");
  const publicationClock = historical ? nowMs : dayStart;
  const eligible = candidates.filter(({ selection, outcome }) => {
    const cutoff = getPublicationDeadline(utcInstantFromEpochMilliseconds(selection.kickoffAt));
    return Number.isFinite(selection.probability) && selection.probability >= demoSlipRules.minimumProbability && selection.probability <= 1
      && parseDecimalOdds(selection.odds) !== null && selection.forecast !== undefined
      && selection.forecast.publishedAt <= publicationClock && selection.forecast.publishedAt < cutoff && cutoff > dayStart
      && getReportingDate(utcInstantFromEpochMilliseconds(selection.kickoffAt)) === date
      && (historical ? outcome === "correct" || outcome === "incorrect" || outcome === "void" :
        selection.kickoffAt >= dayStart + demoSlipRules.minimumLeadMs
          && (outcome === "pending" || outcome === "correct" || outcome === "incorrect"));
  }).sort((left, right) => Number(right.selection.odds) - Number(left.selection.odds) ||
    left.selection.fixtureId.localeCompare(right.selection.fixtureId) || left.selection.family.localeCompare(right.selection.family));
  const used = new Set<string>(), slips: BuiltSlip[] = [];
  const accept = (selected: readonly SlipSelection[]) => {
    const quote = demoSlipQuote(selected);
    if (selected.length < demoSlipRules.minimumSelections || quote.belowMinimum || quote.aboveMaximum) return false;
    const selections = [...selected].sort((left, right) => right.probability - left.probability || left.fixtureId.localeCompare(right.fixtureId));
    const slip = savedSlipSnapshotSchema.parse({ id: `development-demo:${date}:${slips.length + 1}`, selections,
      totalOdds: quote.totalOdds, oddsBasis: selections.every((selection) => selection.oddsBasis === "bookmaker") ? "bookmaker" : "median",
      averageProbability: selections.reduce((sum, selection) => sum + selection.probability, 0) / selections.length }) as BuiltSlip;
    slips.push(slip); selections.forEach((selection) => used.add(selection.fixtureId));
    return true;
  };
  const find = (pool: readonly DemoSlipCandidate[], required?: DemoSlipCandidate) => {
    for (let start = 0; start < pool.length; start += 1) {
      const selected: SlipSelection[] = required ? [required.selection] : [], ids = new Set(selected.map((item) => item.fixtureId));
      if (required && used.has(required.selection.fixtureId)) return false;
      for (let index = start; index < pool.length && selected.length < demoSlipRules.maximumSelections; index += 1) {
        const item = pool[index]!.selection;
        if (used.has(item.fixtureId) || ids.has(item.fixtureId)) continue;
        if (demoSlipQuote([...selected, item]).aboveMaximum) continue;
        selected.push(item); ids.add(item.fixtureId);
        if (accept(selected)) return true;
      }
    }
    return false;
  };
  if (historical) {
    // The showcase contains a real winning accumulator and a real losing one when
    // those examples exist. Both remain ordinary sealed snapshots of original picks.
    if (!find(eligible.filter((candidate) => candidate.outcome === "correct"))) throw new IncompleteDemoPublication("No complete winning synthetic editorial example is available.");
    const settled = eligible.filter((candidate) => candidate.outcome === "correct" || candidate.outcome === "incorrect");
    if (!settled.some((candidate) => candidate.outcome === "incorrect" && find(settled, candidate))) {
      throw new IncompleteDemoPublication("No complete losing synthetic editorial example is available.");
    }
  }
  while (slips.length < demoSlipRules.count && find(eligible)) { /* One disjoint snapshot is accepted per pass. */ }
  if (slips.length === 0) throw new IncompleteDemoPublication("No complete qualifying synthetic editorial slip is available.");
  const selections = slips.flatMap((slip) => slip.selections);
  const latestForecast = Math.max(...selections.map((item) => item.forecast!.publishedAt));
  const publicationAt = Math.max(dayStart, latestForecast,
    Math.min(publicationClock - 1_000, ...selections.map((item) => item.kickoffAt - 600_000)));
  if (publicationAt > nowMs || getReportingDate(utcInstantFromEpochMilliseconds(publicationAt)) !== date ||
    selections.some((item) => publicationAt >= getPublicationDeadline(utcInstantFromEpochMilliseconds(item.kickoffAt)))) {
    throw new Error("Synthetic editorial publication has an invalid forecast/cutoff chronology.");
  }
  return { slips, publicationAt };
}

function storedSlipCandidates(records: StoredMatchFeedResponse["records"]): DemoSlipCandidate[] {
  const candidates: DemoSlipCandidate[] = [];
  for (const record of records) {
    if (!record.forecast || !record.cycleId || record.kickoffAt === null) continue;
    for (const family of publicPolicy.markets) {
      const prediction = selectedCardPrediction(record, family), price = selectedCardPrice(record, family);
      if (!prediction || !price || prediction.probability === null) continue;
      const probability = prediction.item.market.selectedProbability;
      if (typeof probability !== "number" || probability < demoSlipRules.minimumProbability) continue;
      candidates.push({ outcome: prediction.status, selection: { fixtureId: record.fixtureId, kickoffAt: record.kickoffAt, homeTeam: record.homeTeam,
        awayTeam: record.awayTeam, competition: record.competition, family, selection: prediction.item.market.selection,
        probability, odds: price.price, oddsBasis: price.basis, forecast: { cycleId: record.cycleId,
          revisionId: record.forecast.revisionId, publishedAt: record.forecast.publishedAt } } });
    }
  }
  return candidates;
}

/** Historical synthetic editorial snapshots retain the same sealed bodies and original
 * forecast membership as a live publication. No production publication authority is granted. */
export async function ensureDemoSlipDates(database: DatabaseRuntime, dates: readonly string[], nowMs = Date.now()): Promise<void> {
  assertDemoDatabase();
  const today = getReportingDate(utcInstantFromEpochMilliseconds(nowMs));
  for (const date of [...new Set(dates)].filter((day) => day >= DEMO_START_DATE && day <= DEMO_END_DATE && day <= today)) {
    // Existing sealed snapshots still need their referenced match observations to
    // advance, so direct Best/Saved reads settle without first visiting the feed.
    await ensureDemoDates(database, [date], nowMs);
    const exists = await database.query((tx) => tx.dailySlipPublication.findUnique({ where: { eatDate: new Date(`${date}T00:00:00Z`) }, select: { id: true, bodyJson: true } }));
    if (exists) {
      if (!exists.bodyJson || typeof exists.bodyJson !== "object" || Array.isArray(exists.bodyJson)
        || !Number.isSafeInteger(exists.bodyJson.count) || Number(exists.bodyJson.count) < 1 || Number(exists.bodyJson.count) > demoSlipRules.count) {
        throw new Error("An older incomplete synthetic publication requires regeneration of the isolated demo database.");
      }
      continue;
    }
    const service = createMatchFeedService({ database, competitionIds: demoFootballCatalog.leagues.map((league) => league.id),
      providerOdds: true, clock: { now: () => utcInstantFromEpochMilliseconds(nowMs) } });
    const records: StoredMatchFeedResponse["records"] = [], seen = new Set<string>();
    let first: StoredMatchFeedResponse | null = null, nextPage: number | null = 1;
    let prepared: ReturnType<typeof buildDemoSlipSnapshots> | undefined;
    while (nextPage !== null) {
      if (nextPage > Math.ceil(DEMO_MATCHES_PER_DAY / 100)) throw new Error("Synthetic editorial feed exceeded its daily coverage bound.");
      const feed = await service.query({ date, pageSize: "100", page: String(nextPage), picks: "all" });
      if (feed.asOf !== nowMs || feed.range.from !== date || feed.range.to !== date || feed.state === "data-unavailable" || feed.paginationVersion === null ||
        first && (first.paginationVersion !== feed.paginationVersion || first.total !== feed.total)) throw new Error("Synthetic editorial feed changed during pagination.");
      first ??= feed;
      for (const record of feed.records) {
        if (seen.has(record.fixtureId)) throw new Error("Duplicate synthetic editorial fixture.");
        records.push(record); seen.add(record.fixtureId);
      }
      nextPage = feed.nextPage;
      // Keep collecting qualifying fixtures until capacity or the end of the daily cohort.
      try {
        prepared = buildDemoSlipSnapshots(date, storedSlipCandidates(records), nowMs);
        if (prepared.slips.length >= demoSlipRules.count || nextPage === null) break;
      } catch (error) {
        if (!(error instanceof IncompleteDemoPublication)) throw error;
        if (nextPage === null) throw error;
      }
    }
    if (!prepared) throw new IncompleteDemoPublication("Synthetic editorial fixtures are unavailable.");
    const { slips, publicationAt } = prepared;
    const model = { calibrationReference: "synthetic-development-only", correlationReference: "synthetic-independent-examples",
      validFrom: Date.parse("2025-01-01T00:00:00Z"), validUntil: Date.parse("2030-01-01T00:00:00Z") };
    const modelId = evidenceFingerprint(model), publicationId = evidenceFingerprint({ kind: "daily-best-slips", version: 1, day: date });
    const body = JSON.stringify({ version: 1, day: date, publishedAt: publicationAt, model: { id: modelId, ...model },
      criteria: serializeSlipCriteria(bestSlipCriteria(date)).toString(),
      count: slips.length, searchLimited: nextPage !== null, partialCoverage: false });
    await database.transaction(async (tx) => {
      const inserted = await tx.$executeRaw`INSERT IGNORE INTO DailySlipPublication(id,eatDate,publishedAt,modelId,bodyJson,integrity)
        VALUES(${publicationId},${new Date(`${date}T00:00:00Z`)},${new Date(publicationAt)},${modelId},
          JSON_EXTRACT(${body},'$'),SHA2(CAST(JSON_EXTRACT(${body},'$') AS CHAR),256))`;
      if (!inserted) {
        if (!await tx.dailySlipPublication.findUnique({ where: { id: publicationId }, select: { id: true } })) {
          throw new Error("The synthetic editorial publication failed its database constraints.");
        }
        return;
      }
      for (const [index, slip] of slips.entries()) {
        const snapshot = { slip, estimatedProbability: slip.selections.reduce((value, selection) => value * selection.probability, 1) };
        const snapshotJson = JSON.stringify(snapshot), rank = index + 1;
        // MySQL's JSON renderer can normalize a binary64 value by one ULP.
        // Bind the identity to the exact value the ordinary reader receives.
        const [stored] = await tx.$queryRaw<{ snapshot: unknown }[]>`SELECT JSON_EXTRACT(${snapshotJson},'$') AS snapshot`;
        if (!stored) throw new Error("The synthetic slip snapshot could not be normalized.");
        const id = evidenceFingerprint({ publicationId, rank, snapshot: historyJson(stored.snapshot) });
        await tx.$executeRaw`INSERT INTO PublishedSlip(id,publicationId,\`rank\`,snapshotJson,integrity)
          VALUES(${id},${publicationId},${rank},JSON_EXTRACT(${snapshotJson},'$'),SHA2(CAST(JSON_EXTRACT(${snapshotJson},'$') AS CHAR),256))`;
        await tx.publishedSlipLeg.createMany({ data: slip.selections.map((selection) => ({ slipId: id, fixtureId: selection.fixtureId,
          cycleId: selection.forecast!.cycleId, revisionId: selection.forecast!.revisionId })) });
        if (index < 3) {
          const savedId = demoId("saved-slip", `${date}:${index}`);
          if (await tx.savedSlip.findUnique({ where: { id: savedId }, select: { id: true } })) continue;
          const fingerprint = createHash("sha256").update(JSON.stringify(slip)).digest("hex");
          await tx.savedSlip.upsert({ where: { accountId_fingerprint: { accountId: demoMember.accountId, fingerprint } }, update: {},
            create: { id: savedId, accountId: demoMember.accountId, fingerprint,
              createdAt: new Date(publicationAt), snapshotJson: slip as unknown as Prisma.InputJsonValue,
              selections: { create: slip.selections.map((selection) => ({ fixtureId: selection.fixtureId })) } } });
        }
      }
    }, { timeout: 30_000 });
  }
}
