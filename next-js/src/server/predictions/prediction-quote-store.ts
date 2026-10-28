import "server-only";
import { z } from "zod";
import { marketFamilySchema } from "../../domain/fixture-snapshot.ts";
import { marketSelections, type MarketFamily } from "../../domain/markets.ts";
import { DE_MARGIN_METHOD, formatOddsHundredths, oddsDisplayHundredths, oddsRules, parseDecimalOdds } from "../../domain/odds.ts";
import { ODDS_MAPPING_VERSION } from "../../domain/odds-markets.ts";
import { evidenceFingerprint, evidenceSerialize, freezeEvidence } from "../evidence/evidence-input.ts";
import type { ResolvedForecastCandidate } from "../fallback/fallback-contract.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { storedQuoteSource, type StoredQuoteSource } from "../odds/odds-read.ts";
import { historyFail } from "./history-contract.ts";
import { historyHash, historyId, historyInstant } from "./history-input.ts";
import { assertHistorySeal, historyJson, historyTime, type HistoryRow } from "./history-read.ts";

type Tx = Prisma.TransactionClient;
const hash = /^[a-f0-9]{64}$/u;
export const predictionQuoteReasons = ["no-public-price", "price-state-expired", "unsupported-price-basis", "invalid-public-price"] as const;
const priceSchema = z.strictObject({ display: z.string().regex(/^[1-9]\d{0,3}\.\d{2}$/u),
  hundredths: z.number().int().min(oddsRules.minimumHundredths).max(oddsRules.maximumHundredths),
  decimal: z.string().regex(/^[1-9]\d{0,5}\.\d{4}$/u), basis: z.literal("bookmaker"), bookmakerId: z.number().int().positive().max(4_294_967_295),
  method: z.literal(DE_MARGIN_METHOD), mappingVersion: z.literal(ODDS_MAPPING_VERSION),
  line: z.string().regex(/^\d{1,4}\.\d{2}$/u).nullable(), snapshotId: historyHash, retrievedAt: historyInstant,
  providerUpdatedAt: historyInstant.nullable(), stateRetrievedAt: historyInstant }).refine((value) => {
    const parsed = parseDecimalOdds(value.decimal);
    return parsed !== null && oddsDisplayHundredths(parsed) === value.hundredths;
  });
const quoteSchema = z.strictObject({ version: z.literal(1), revisionId: historyId, cycleId: historyId, fixtureId: historyId,
  family: marketFamilySchema, selection: z.string().min(1).max(32), state: z.enum(["quoted", "unavailable"]),
  reason: z.enum(predictionQuoteReasons).nullable(), recordedAt: historyInstant, price: priceSchema.nullable(),
}).refine((v) => (marketSelections[v.family] as readonly string[]).includes(v.selection) &&
  (v.state === "quoted") === (v.reason === null) && (v.state === "quoted") === (v.price !== null) &&
  (v.price === null || v.price.display === formatOddsHundredths(v.price.hundredths) && v.price.line === (v.family === "total-goals" ? "2.50" : null) && v.price.retrievedAt <= v.recordedAt &&
    v.price.stateRetrievedAt <= v.recordedAt && (v.price.providerUpdatedAt === null || v.price.providerUpdatedAt <= v.price.retrievedAt)));
/** Sealed public price beside one published family prediction; `quoted` rows carry the price shown at publication. */
export type PredictionQuote = Readonly<z.infer<typeof quoteSchema>>;
const identitySchema = z.strictObject({ revisionId: historyId, cycleId: historyId, fixtureId: historyId, recordedAt: historyInstant,
  freshnessMs: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) });
type QuoteMarkets = ResolvedForecastCandidate["markets"];
type QuoteIdentity = Readonly<{ revisionId: string; cycleId: string; fixtureId: string; recordedAt: number; freshnessMs: number; markets: QuoteMarkets }>;

/** Pure: one row per available family, priced only from the fresh public row for exactly that family and selection
 * (no fallback or borrowed family). Odds-data problems never throw; they become explicit unavailable rows. */
export function preparePredictionQuotes(input: QuoteIdentity & Readonly<{ source: StoredQuoteSource }>): PredictionQuote[] {
  const identity = identitySchema.parse({ revisionId: input.revisionId, cycleId: input.cycleId, fixtureId: input.fixtureId,
    recordedAt: input.recordedAt, freshnessMs: input.freshnessMs });
  const { state, rows } = input.source, quotes: PredictionQuote[] = [];
  for (const family of Object.keys(marketSelections) as MarketFamily[]) {
    const item = input.markets[family];
    if (!item?.available) continue;
    const selection = item.market.selection, base = { version: 1 as const, revisionId: identity.revisionId, cycleId: identity.cycleId,
      fixtureId: identity.fixtureId, family, selection, recordedAt: identity.recordedAt };
    const row = rows.find((candidate) => candidate.marketKey === family && candidate.selection === selection);
    const lastRetrievedAt = state?.lastRetrievedAt.getTime() ?? null, hundredths = Number(row?.displayHundredths);
    const retrievedAt = row?.retrievedAt.getTime(), providerUpdatedAt = row?.providerUpdatedAt?.getTime() ?? null;
    let reason: typeof predictionQuoteReasons[number] | null = null;
    if (!state) reason = "no-public-price";
    else if (state.withdrawnAt !== null || lastRetrievedAt! > identity.recordedAt || identity.recordedAt - lastRetrievedAt! > identity.freshnessMs) reason = "price-state-expired";
    else if (!row) reason = "no-public-price";
    else if (row.basis !== "bookmaker") reason = "unsupported-price-basis";
    else if (row.snapshotId === null || !hash.test(row.snapshotId) || !Number.isInteger(row.bookmakerId) || row.bookmakerId! <= 0 ||
      !Number.isInteger(hundredths) || hundredths < oddsRules.minimumHundredths ||
      hundredths > oddsRules.maximumHundredths || !Number.isSafeInteger(retrievedAt) || retrievedAt! > identity.recordedAt ||
      identity.recordedAt - retrievedAt! > identity.freshnessMs ||
      providerUpdatedAt !== null && providerUpdatedAt > retrievedAt!) reason = "invalid-public-price";
    const price = reason === null ? { display: formatOddsHundredths(hundredths), hundredths, decimal: row!.priceDecimal, basis: "bookmaker" as const, bookmakerId: row!.bookmakerId!,
      method: row!.method, mappingVersion: row!.mappingVersion, line: row!.line, snapshotId: row!.snapshotId!, retrievedAt: retrievedAt!,
      providerUpdatedAt, stateRetrievedAt: lastRetrievedAt! } : null;
    const parsed = quoteSchema.safeParse({ ...base, state: price ? "quoted" : "unavailable", reason, price });
    // A stored row whose shape this reader cannot certify is not a public price.
    quotes.push(freezeEvidence(parsed.success ? parsed.data : { ...base, state: "unavailable" as const, reason: "invalid-public-price" as const, price: null }));
  }
  return quotes;
}

export function predictionQuoteFromRow(row: HistoryRow): PredictionQuote {
  assertHistorySeal(row.validIntegrity);
  const parsed = quoteSchema.safeParse(historyJson(row.body));
  if (!parsed.success) return historyFail("invalid-state");
  const value = parsed.data, price = value.price;
  const hundredths = row.displayHundredths === null ? null : Number(row.displayHundredths);
  if (row.revisionId !== value.revisionId || row.cycleId !== value.cycleId || row.fixtureId !== value.fixtureId || row.family !== value.family ||
      row.selection !== value.selection || row.state !== value.state || (row.reason ?? null) !== value.reason ||
      (row.snapshotId ?? null) !== (price?.snapshotId ?? null) || hundredths !== (price?.hundredths ?? null) ||
      (row.quotedAt === null ? null : historyTime(row.quotedAt)) !== (price?.retrievedAt ?? null) ||
      historyTime(row.recordedAt) !== value.recordedAt) return historyFail("invalid-state");
  return freezeEvidence(value);
}

/** Append-only persistence for already authorized, source-bound quote bodies.
 * Callers establish publication authority before this shared sealed writer runs. */
export async function writePreparedPredictionQuotes(tx: Tx, incoming: readonly PredictionQuote[]): Promise<void> {
  const quotes = incoming.map((quote) => quoteSchema.parse(quote)), identities = new Set<string>();
  for (const quote of quotes) {
    const key = `${quote.revisionId}:${quote.family}`;
    if (identities.has(key)) return historyFail("invalid-request");
    identities.add(key);
  }
  for (let offset = 0; offset < quotes.length; offset += 100) {
    await tx.$executeRaw(Prisma.sql`INSERT INTO PredictionQuote
      (revisionId, cycleId, fixtureId, family, selection, state, reason, snapshotId, displayHundredths, quotedAt, recordedAt, integrity, body)
      VALUES ${Prisma.join(quotes.slice(offset, offset + 100).map((quote) => {
        const body = evidenceSerialize(quote);
        return Prisma.sql`(${quote.revisionId}, ${quote.cycleId}, ${quote.fixtureId}, ${quote.family}, ${quote.selection}, ${quote.state},
          ${quote.reason}, ${quote.price?.snapshotId ?? null}, ${quote.price?.hundredths ?? null},
          ${quote.price ? new Date(quote.price.retrievedAt) : null}, ${new Date(quote.recordedAt)},
          SHA2(CAST(JSON_EXTRACT(${body}, '$') AS CHAR), 256), JSON_EXTRACT(${body}, '$'))`;
      }))}`);
  }
}

/** Same canonical publication transaction, after the revision and its extensions and before the cycle pointer moves.
 * No provider call, no retrospective attachment and no second capture for a revision. */
export async function appendPredictionQuotes(tx: Tx, input: QuoteIdentity): Promise<readonly PredictionQuote[]> {
  const identity = identitySchema.parse({ revisionId: input.revisionId, cycleId: input.cycleId, fixtureId: input.fixtureId,
    recordedAt: input.recordedAt, freshnessMs: input.freshnessMs });
  const revision = await tx.predictionSet.findUnique({ where: { id: identity.revisionId } });
  const cycle = await tx.predictionCycle.findUnique({ where: { id: identity.cycleId } });
  const stored = revision ? historyJson(revision.candidateJson) as { markets?: unknown } | null : null;
  if (!revision || !cycle || revision.cycleId !== cycle.id || revision.fixtureId !== identity.fixtureId || cycle.fixtureId !== identity.fixtureId ||
      cycle.state !== "open" || cycle.currentSetId === revision.id || revision.publishedAt.getTime() !== identity.recordedAt ||
      identity.recordedAt >= cycle.cutoffAt.getTime() || evidenceFingerprint(stored?.markets ?? null) !== evidenceFingerprint(input.markets) ||
      await tx.predictionRefreshResult.findFirst({ where: { revisionId: revision.id, outcome: "published" }, select: { id: true } }) ||
      await tx.predictionQuote.findFirst({ where: { revisionId: revision.id }, select: { family: true } })) return historyFail("invalid-request");
  const quotes = preparePredictionQuotes({ ...identity, markets: input.markets, source: await storedQuoteSource(tx, identity.fixtureId) });
  if (quotes.length === 0) return quotes;
  await writePreparedPredictionQuotes(tx, quotes);
  return quotes;
}
