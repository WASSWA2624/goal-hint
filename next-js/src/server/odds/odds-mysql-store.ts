import "server-only";

import { z } from "zod";
import { utcInstantFromEpochMilliseconds, type UtcInstant } from "../../domain/calendar.ts";
import { launchOddsGroup, launchOddsMapping } from "../../domain/odds-markets.ts";
import { total15MarketKey, total15OddsSchema, total15Selections, type Total15Odds } from "../../domain/extended-markets.ts";
import { parseDecimalOdds } from "../../domain/odds.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint, evidenceSerialize, freezeEvidence } from "../evidence/evidence-input.ts";
import type { NormalizedFixtureOdds } from "../football/api-football-normalize.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { assertHistorySeal, historyJson } from "../predictions/history-read.ts";
import { provenTrue } from "../shared/authority-proof.ts";
import { OddsError, oddsFail, preMatchOddsFreshMs, type OddsApplyResult, type OddsBatchBody, type OddsPolicy } from "./odds-contract.ts";

type Tx = Prisma.TransactionClient;
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const instant = z.number().int().min(0).max(253_402_300_799_999);
const provenanceSchema = z.strictObject({ provider: z.literal("api-football"), endpoint: z.enum(["odds", "oddsBets", "oddsBookmakers"]),
  requestParameters: z.record(z.string(), z.string().max(512)), contractVersion: z.string().max(64), retrievedAt: instant,
  providerUpdatedAt: instant.nullable(), fromCache: z.boolean(), currentPage: z.number().int().positive().nullable(),
  totalPages: z.number().int().positive().nullable() });
const quoteManifestSchema = z.strictObject({ bookmakerId: z.number().int().positive(), kickoffAt: instant.nullable(),
  bets: z.array(z.strictObject({ betId: z.number().int().positive(), betName: z.string().max(256).nullable(), valuesHash: hash })).max(1_000) });
const batchSchema = z.strictObject({
  id: hash, accountId: hash, kind: z.enum(["prices", "bets", "bookmakers"]), scopeKey: z.string().min(1).max(96), policyHash: hash,
  status: z.enum(["complete", "partial", "failed"]), requestsDispatched: z.number().int().nonnegative().max(4_294_967_295),
  receivedAt: instant, requestId: hash, slot: instant, date: z.iso.date().nullable(), contractVersion: z.string().min(1).max(64),
  reasons: z.array(z.string().regex(/^[a-z-]{1,64}$/u)).max(64), missingCoverage: z.array(z.string().max(128)).max(5_000),
  pages: z.array(provenanceSchema).max(1_000),
  fixtures: z.array(z.strictObject({ externalId: z.number().int().positive(), observationHash: hash,
    quoteManifest: quoteManifestSchema.optional(), additionalQuoteManifests: z.array(quoteManifestSchema).max(200).optional(),
    outcome: z.enum(["apply", "unknown-fixture", "after-kickoff", "kickoff-mismatch", "not-scheduled"]) }).refine(({ quoteManifest, additionalQuoteManifests }) =>
    !additionalQuoteManifests || !!quoteManifest && new Set([quoteManifest.bookmakerId, ...additionalQuoteManifests.map(({ bookmakerId }) => bookmakerId)]).size
      === additionalQuoteManifests.length + 1 && additionalQuoteManifests.every(({ kickoffAt }) => kickoffAt === quoteManifest.kickoffAt))).max(10_000),
  catalog: z.array(z.strictObject({ id: z.number().int().positive(), name: z.string().min(1).max(256) })).max(5_000),
});
export const storedOddsBatchSchema = batchSchema;
const snapshotValues = z.array(z.strictObject({ label: z.string().min(1).max(64), odd: z.string().min(1).max(12) })).min(1).max(1_000);
export const storedOddsSnapshotSchema = z.strictObject({ id: hash, fixtureId: z.uuid(), previousId: hash.nullable(), bookmakerId: z.number().int().positive(),
  bookmakerName: z.string().max(128).nullable(), betId: z.number().int().positive(), betName: z.string().max(256).nullable(), valuesHash: hash,
  retrievedAt: instant, providerUpdatedAt: instant.nullable(), retainUntil: instant, values: snapshotValues });
const snapshotSchema = storedOddsSnapshotSchema;
export type StoredOddsSnapshot = z.infer<typeof snapshotSchema>;

export type OddsFixtureTarget = Readonly<{ fixtureId: string; externalId: number; kickoff: UtcInstant | null; status: string }>;
type PriceRow = Readonly<{ marketKey: string; selection: string; basis: string; bookmakerExternalId: number | null; line: string | null;
  priceDecimal: string; displayHundredths: number; impliedProbability: string; overround: string; method: string; mappingVersion: string;
  snapshotId: string | null; retrievedAt: number; providerUpdatedAt: number | null; stale: boolean }>;
type ProjectionOffer = Readonly<{ betId: number; betName: string | null; values: readonly Readonly<{ label: string; odd: string }>[];
  id: string; retrievedAt: number; providerUpdatedAt: number | null }>;

/** A sealed receipt, verified once and indexed for per-fixture provenance checks. */
type VerifiedBatch = Readonly<{ batch: OddsBatchBody; fixtures: ReadonlyMap<number, OddsBatchBody["fixtures"][number]>; pages: ReadonlySet<number> }>;
/** Receipts are append-only (no UPDATE or DELETE grant, sealed integrity), so a verified body never changes. */
const MAX_VERIFIED_BATCHES = 16;
/** Multi-row snapshot statements stay far below MySQL's placeholder limit (15 values per row). */
const SNAPSHOT_CHUNK = 100;
const chunks = <Item>(items: readonly Item[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
const byCodePoint = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
/** Canonical values: label order, so a provider reordering never creates a new snapshot. */
export function canonicalOddsValues(values: readonly Readonly<{ label: string; odd: string }>[]) {
  return [...values].map(({ label, odd }) => ({ label, odd })).sort((left, right) => byCodePoint(left.label, right.label));
}
export const oddsValuesHash = (values: readonly Readonly<{ label: string; odd: string }>[]) => evidenceFingerprint({ values: canonicalOddsValues(values) });
/** The configured bookmaker's receipt keeps its legacy shape, including when that book has no odds. */
export function fixtureQuoteManifests(row: NormalizedFixtureOdds, primaryBookmakerId: number) {
  const manifest = (bookmakerId: number, bets: NormalizedFixtureOdds["bookmakers"][number]["bets"]) => ({
    bookmakerId, kickoffAt: row.kickoff, bets: bets.map(({ id, name, values }) => ({ betId: id, betName: name, valuesHash: oddsValuesHash(values) })),
  });
  const primary = row.bookmakers.find(({ id }) => id === primaryBookmakerId);
  const additionalQuoteManifests = row.bookmakers.filter(({ id }) => id !== primaryBookmakerId)
    .map(({ id, bets }) => manifest(id, bets));
  return { quoteManifest: manifest(primaryBookmakerId, primary?.bets ?? []),
    ...(additionalQuoteManifests.length ? { additionalQuoteManifests } : {}) };
}
const quoteKey = (bookmakerId: number, betId: number) => `${bookmakerId}:${betId}`;
const places = (text: string, count: number) => { const [whole, fraction = ""] = text.split("."); return `${whole}.${fraction.padEnd(count, "0")}`; };
const asNumber = (value: unknown) => typeof value === "bigint" ? Number(value) : Number(value);
const asBoolean = (value: unknown) => value === true || value === 1 || value === 1n || value === "1";
const time = (value: unknown) => value instanceof Date ? value.getTime() : oddsFail("invalid-state");
const sameRow = (left: PriceRow, right: PriceRow) => evidenceFingerprint(left) === evidenceFingerprint(right);
const totalGoalsBet = launchOddsMapping.find(({ family }) => family === "total-goals")!;

type SealedRow = Readonly<{ id: string; body: unknown; validIntegrity: unknown }>;

function sealedBody(row: SealedRow) {
  try { assertHistorySeal(row.validIntegrity); return historyJson(row.body); }
  catch { return oddsFail("invalid-state"); }
}

function parsedBatch(row: SealedRow) {
  const parsed = batchSchema.safeParse(sealedBody(row));
  return parsed.success && parsed.data.id === row.id ? freezeEvidence(parsed.data as unknown as OddsBatchBody) : oddsFail("invalid-state");
}

function parsedSnapshot(row: SealedRow) {
  const parsed = snapshotSchema.safeParse(sealedBody(row));
  return parsed.success && parsed.data.id === row.id ? freezeEvidence(parsed.data) : oddsFail("invalid-state");
}

type StoredBookmaker = Readonly<{
  bookmakerId: number; bookmakerName: string | null;
  offers: readonly Readonly<{ betId: number; betName: string; values: StoredOddsSnapshot["values"]; providerUpdatedAt: UtcInstant | null }>[];
}>;
export type StoredCurrentBookmakerQuotes = Readonly<{
  fixtureId: string; kickoffAt: number; checkedAt: UtcInstant; primaryBookmakerId: number; bookmakers: readonly StoredBookmaker[];
}>;
type BookmakerFixture = Readonly<{ fixtureId: string; kickoffAt: number | null }>;

/** Each group belongs to a bookmaker confirmed by this fixture's latest sealed import.
 * The same sealed snapshot may be reused when a new receipt reconfirms its exact values. */
async function storedBookmakerQuotes(tx: Tx, fixtures: readonly BookmakerFixture[], asOf: number,
  closing: boolean, betIds?: readonly number[]): Promise<ReadonlyMap<string, StoredCurrentBookmakerQuotes>> {
  const expectedKickoff = new Map(fixtures.flatMap(({ fixtureId, kickoffAt }) =>
    kickoffAt !== null && (closing ? kickoffAt <= asOf : kickoffAt > asOf) ? [[fixtureId, kickoffAt]] : []));
  const found = new Map<string, StoredCurrentBookmakerQuotes>();
  if (!expectedKickoff.size || betIds?.length === 0) return found;
  const at = new Date(asOf);
  const states = await tx.$queryRaw<{
    fixtureId: string; externalId: bigint; kickoff: Date; latestBatchId: string; policyHash: string;
    lastRetrievedAt: Date; lastProviderUpdatedAt: Date | null;
  }[]>(Prisma.sql`SELECT f.id AS fixtureId,f.externalId,f.kickoff,s.latestBatchId,s.policyHash,s.lastRetrievedAt,s.lastProviderUpdatedAt
    FROM FootballFixture f JOIN FixtureOddsState s ON s.fixtureId=f.id
    WHERE f.id IN (${Prisma.join([...expectedKickoff.keys()])}) AND f.provider='api-football' AND s.withdrawnAt IS NULL
      AND ${closing ? Prisma.sql`f.kickoff<=${at} AND f.status IN
        ('live','finished-regulation','finished-extra-time','finished-penalties','abandoned')`
        : Prisma.sql`f.kickoff>${at} AND f.status='scheduled'`}
      AND s.lastRetrievedAt < f.kickoff
      AND s.lastRetrievedAt BETWEEN DATE_SUB(LEAST(f.kickoff,${at}), INTERVAL ${preMatchOddsFreshMs * 1000} MICROSECOND) AND ${at}`);
  if (!states.length) return found;
  const [catalogRow] = await tx.$queryRaw<SealedRow[]>`SELECT id,body,integrity=SHA2(CAST(body AS CHAR),256) AS validIntegrity
    FROM OddsImportBatch WHERE scopeKey='bets' AND kind='bets' AND status='complete' AND receivedAt<=${at}
    ORDER BY receivedAt DESC,id DESC LIMIT 1`;
  if (!catalogRow) return found;
  const catalog = new Map(parsedBatch(catalogRow).catalog.map(({ id, name }) => [id, name]));
  const receipts = await tx.$queryRaw<SealedRow[]>(Prisma.sql`SELECT id,body,integrity=SHA2(CAST(body AS CHAR),256) AS validIntegrity
    FROM OddsImportBatch WHERE id IN (${Prisma.join([...new Set(states.map(({ latestBatchId }) => latestBatchId))])})`);
  const byReceipt = new Map(receipts.map((row) => {
    const batch = parsedBatch(row);
    return [row.id, { batch, fixtures: new Map(batch.fixtures.map((entry) => [entry.externalId, entry])),
      checkedTimes: new Set(batch.pages.flatMap((page) => page.endpoint === "odds" && !page.fromCache ? [page.retrievedAt] : [])) }];
  }));
  const wanted = new Set(betIds);
  const eligible = new Map(states.flatMap((state) => {
    const kickoffAt = state.kickoff.getTime(), checkedAt = utcInstantFromEpochMilliseconds(state.lastRetrievedAt.getTime());
    const providerUpdatedAt = state.lastProviderUpdatedAt ? utcInstantFromEpochMilliseconds(state.lastProviderUpdatedAt.getTime()) : null;
    const receipt = byReceipt.get(state.latestBatchId), entry = receipt?.fixtures.get(Number(state.externalId));
    const manifest = entry?.quoteManifest;
    if (expectedKickoff.get(state.fixtureId) !== kickoffAt || receipt?.batch.kind !== "prices" || receipt.batch.status === "failed" ||
      receipt.batch.policyHash !== state.policyHash || !receipt.checkedTimes.has(checkedAt) ||
      entry?.outcome !== "apply" || manifest?.kickoffAt !== kickoffAt || providerUpdatedAt !== null && providerUpdatedAt > checkedAt) return [];
    const books = new Map([manifest, ...(entry.additionalQuoteManifests ?? [])].flatMap((book) => {
      if (book.kickoffAt !== kickoffAt) return [];
      const bets = new Map(book.bets.flatMap((bet) => bet.betName && catalog.get(bet.betId) === bet.betName &&
        (betIds === undefined || wanted.has(bet.betId)) ? [[bet.betId, bet]] : []));
      return bets.size ? [[book.bookmakerId, bets]] : [];
    }));
    return books.size ? [[state.fixtureId, { kickoffAt, checkedAt, providerUpdatedAt, primaryBookmakerId: manifest.bookmakerId, books }]] : [];
  }));
  if (!eligible.size) return found;
  const heads = await tx.$queryRaw<(SealedRow & { fixtureId: string; bookmakerId: number; betId: number })[]>(Prisma.sql`
    SELECT s.id,s.fixtureId,s.bookmakerExternalId AS bookmakerId,s.betExternalId AS betId,s.body,
      s.integrity=SHA2(CAST(s.body AS CHAR),256) AS validIntegrity
    FROM ProviderOddsSnapshot s LEFT JOIN ProviderOddsSnapshot successor ON successor.previousId=s.id
    WHERE s.fixtureId IN (${Prisma.join([...eligible.keys()])})
      AND s.bookmakerExternalId IN (${Prisma.join([...new Set([...eligible.values()].flatMap(({ books }) => [...books.keys()]))])})
      AND s.betExternalId IN (${Prisma.join([...new Set([...eligible.values()].flatMap(({ books }) =>
        [...books.values()].flatMap((bets) => [...bets.keys()])))])})
      AND successor.id IS NULL`);
  const byFixture = new Map<string, Map<string, StoredOddsSnapshot | null>>();
  for (const row of heads) {
    const bookmakerId = Number(row.bookmakerId), scope = eligible.get(row.fixtureId), bet = scope?.books.get(bookmakerId)?.get(Number(row.betId));
    if (!scope || !bet) continue;
    const group = byFixture.get(row.fixtureId) ?? new Map<string, StoredOddsSnapshot | null>();
    byFixture.set(row.fixtureId, group);
    const key = quoteKey(bookmakerId, bet.betId);
    if (group.has(key)) { group.set(key, null); continue; }
    const snapshot = parsedSnapshot(row);
    group.set(key, snapshot.fixtureId === row.fixtureId && snapshot.bookmakerId === bookmakerId &&
      snapshot.betId === bet.betId && snapshot.betName === bet.betName && snapshot.valuesHash === bet.valuesHash &&
      snapshot.valuesHash === oddsValuesHash(snapshot.values) && snapshot.retrievedAt <= scope.checkedAt && snapshot.retainUntil >= asOf &&
      (snapshot.providerUpdatedAt === null || snapshot.providerUpdatedAt <= snapshot.retrievedAt) ? snapshot : null);
  }
  for (const [fixtureId, group] of byFixture) {
    const scope = eligible.get(fixtureId)!;
    const verified = [...group.values()].filter((snapshot): snapshot is StoredOddsSnapshot => snapshot !== null)
      .sort((left, right) => left.betId - right.betId);
    const grouped = new Map<number, StoredOddsSnapshot[]>();
    for (const snapshot of verified) {
      const book = grouped.get(snapshot.bookmakerId);
      if (book) book.push(snapshot);
      else grouped.set(snapshot.bookmakerId, [snapshot]);
    }
    const bookmakers = [...grouped.entries()].sort(([left], [right]) => left - right).map(([bookmakerId, snapshots]) => {
      const bookmakerName = snapshots.reduce<StoredOddsSnapshot | null>((latest, snapshot) => snapshot.bookmakerName !== null &&
        (latest === null || snapshot.retrievedAt > latest.retrievedAt) ? snapshot : latest, null)?.bookmakerName ?? null;
      return { bookmakerId, bookmakerName, offers: snapshots.map(({ betId, betName, values }) =>
        ({ betId, betName: betName!, values, providerUpdatedAt: scope.providerUpdatedAt })) };
    });
    if (bookmakers.length) found.set(fixtureId, { fixtureId, kickoffAt: scope.kickoffAt, checkedAt: scope.checkedAt,
      primaryBookmakerId: scope.primaryBookmakerId, bookmakers });
  }
  return found;
}

export function storedCurrentBookmakerQuotes(tx: Tx, fixtures: readonly BookmakerFixture[], asOf: number, betIds?: readonly number[]) {
  return storedBookmakerQuotes(tx, fixtures, asOf, false, betIds);
}

export async function storedClosingBookmakerQuotes(tx: Tx, fixture: BookmakerFixture, asOf: number) {
  return (await storedBookmakerQuotes(tx, [fixture], asOf, true)).get(fixture.fixtureId) ?? null;
}

export function exactTotal15Odds(values: StoredOddsSnapshot["values"], checkedAt: number): Total15Odds | null {
  const selections = total15Selections.map((selection, index) => {
    const label = index === 0 ? "Over 1.5" : "Under 1.5";
    const matched = values.filter((value) => value.label === label);
    return { selection, price: matched.length === 1 ? parseDecimalOdds(matched[0]!.odd)?.text : undefined };
  });
  const parsed = total15OddsSchema.safeParse({ marketKey: total15MarketKey, kind: "pre-match", checkedAt, selections });
  return parsed.success ? freezeEvidence(parsed.data) : null;
}

export function total15OddsForBookmaker(quotes: StoredCurrentBookmakerQuotes | null | undefined): Total15Odds | null {
  const totals = quotes?.bookmakers.find(({ bookmakerId }) => bookmakerId === quotes.primaryBookmakerId)
    ?.offers.find(({ betId, betName }) => betId === totalGoalsBet.betId && betName === totalGoalsBet.betName);
  return quotes && totals ? exactTotal15Odds(totals.values, quotes.checkedAt) : null;
}

/** Odds persistence. Short per-fixture ReadCommitted transactions serialize on FixtureOddsState only:
 * odds never take the global catalog lock, bump FootballFixture.dataVersion or write prediction change events. */
export function createMysqlOddsStore(database: DatabaseRuntime) {
  /** Short ReadCommitted transaction. Callbacks hold only transactional reads and writes (never provider I/O), so a
   * genuine deadlock or write conflict is retried twice; domain refusals are rethrown with their own reason. */
  async function write<Result>(operation: (tx: Tx) => Promise<Result>, timeout = 30_000): Promise<Result> {
    for (let attempt = 0; ; attempt++) {
      let domainError: OddsError | undefined;
      try {
        return await database.transaction(async (tx) => {
          try { return await operation(tx); } catch (error) { if (error instanceof OddsError) domainError = error; throw error; }
        }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout });
      } catch (error) {
        if (domainError) throw domainError;
        if (error instanceof OddsError) throw error;
        const conflict = error !== null && typeof error === "object" && "code" in error && error.code === "conflict";
        if (!conflict || attempt >= 2) return oddsFail("unavailable");
      }
    }
  }
  async function read<Result>(operation: (tx: Tx) => Promise<Result>): Promise<Result> {
    // The database boundary sanitizes every thrown error; keep a domain refusal's own reason.
    let domainError: OddsError | undefined;
    try {
      return await database.query(async (tx) => {
        try { return await operation(tx); } catch (error) { if (error instanceof OddsError) domainError = error; throw error; }
      });
    } catch (error) {
      if (domainError) throw domainError;
      if (error instanceof OddsError) throw error;
      return oddsFail("unavailable");
    }
  }
  async function now(tx: Tx): Promise<number> {
    return (await tx.$queryRaw<{ at: Date }[]>`SELECT UTC_TIMESTAMP(3) AS at`)[0]!.at.getTime();
  }
  async function sealedBatch(tx: Tx, id: string): Promise<OddsBatchBody | null> {
    const row = (await tx.$queryRaw<SealedRow[]>`SELECT id, body, integrity = SHA2(CAST(body AS CHAR), 256) AS validIntegrity
      FROM OddsImportBatch WHERE id = ${id}`)[0];
    return row ? parsedBatch(row) : null;
  }
  const verifiedBatches = new Map<string, VerifiedBatch>();
  /** Indexes and keeps a receipt that is known to be committed. Callers never remember a receipt read inside the
   * transaction that inserted it, since that transaction could still roll back. */
  function remember(batch: OddsBatchBody | null): VerifiedBatch | null {
    if (batch === null) return null;
    const verified = Object.freeze({ batch, fixtures: new Map(batch.fixtures.map((entry) => [entry.externalId, entry])),
      pages: new Set(batch.pages.map((page) => page.retrievedAt)) });
    verifiedBatches.delete(batch.id); verifiedBatches.set(batch.id, verified);
    while (verifiedBatches.size > MAX_VERIFIED_BATCHES) verifiedBatches.delete(verifiedBatches.keys().next().value!);
    return verified;
  }
  /** Sealed snapshots by id, read in bounded chunks; a broken seal or body is invalid state. */
  async function sealedSnapshots(tx: Tx, ids: readonly string[]): Promise<Map<string, StoredOddsSnapshot>> {
    const found = new Map<string, StoredOddsSnapshot>();
    for (const part of chunks([...new Set(ids)], 500)) {
      const rows = await tx.$queryRaw<SealedRow[]>(Prisma.sql`SELECT id, body,
        integrity = SHA2(CAST(body AS CHAR), 256) AS validIntegrity FROM ProviderOddsSnapshot WHERE id IN (${Prisma.join(part)})`);
      for (const row of rows) found.set(row.id, parsedSnapshot(row));
    }
    return found;
  }
  async function sealedSnapshot(tx: Tx, id: string): Promise<StoredOddsSnapshot | null> {
    return (await sealedSnapshots(tx, [id])).get(id) ?? null;
  }
  async function lockState(tx: Tx, fixtureId: string) {
    return (await tx.$queryRaw<{ latestBatchId: string; policyHash: string; lastRetrievedAt: Date; withdrawnAt: Date | null; publicVersion: unknown }[]>`
      SELECT latestBatchId, policyHash, lastRetrievedAt, withdrawnAt, publicVersion FROM FixtureOddsState WHERE fixtureId = ${fixtureId} FOR UPDATE`)[0];
  }
  async function prices(tx: Tx, fixtureId: string): Promise<Map<string, PriceRow>> {
    const rows = await tx.$queryRaw<Record<string, unknown>[]>`SELECT marketKey, selection, basis, bookmakerExternalId,
      CAST(line AS CHAR) AS line, CAST(priceDecimal AS CHAR) AS priceDecimal, displayHundredths, CAST(impliedProbability AS CHAR) AS impliedProbability,
      CAST(overround AS CHAR) AS overround, method, mappingVersion, snapshotId, retrievedAt, providerUpdatedAt, stale
      FROM FixtureOddsPrice WHERE fixtureId = ${fixtureId} FOR UPDATE`;
    return new Map(rows.map((row) => [`${row.marketKey}\u0000${row.selection}`, Object.freeze({ marketKey: String(row.marketKey), selection: String(row.selection),
      basis: String(row.basis), bookmakerExternalId: row.bookmakerExternalId === null ? null : asNumber(row.bookmakerExternalId),
      line: row.line === null ? null : String(row.line), priceDecimal: String(row.priceDecimal), displayHundredths: asNumber(row.displayHundredths),
      impliedProbability: String(row.impliedProbability), overround: String(row.overround), method: String(row.method),
      mappingVersion: String(row.mappingVersion), snapshotId: row.snapshotId === null ? null : String(row.snapshotId), retrievedAt: time(row.retrievedAt),
      providerUpdatedAt: row.providerUpdatedAt === null ? null : time(row.providerUpdatedAt), stale: asBoolean(row.stale) })]));
  }
  async function upsertPrice(tx: Tx, fixtureId: string, row: PriceRow) {
    await tx.$executeRaw`INSERT INTO FixtureOddsPrice (fixtureId, marketKey, selection, basis, bookmakerExternalId, line, priceDecimal,
      displayHundredths, impliedProbability, overround, method, mappingVersion, snapshotId, basisJson, retrievedAt, providerUpdatedAt, stale)
      VALUES (${fixtureId}, ${row.marketKey}, ${row.selection}, ${row.basis}, ${row.bookmakerExternalId},
        ${row.line === null ? null : row.line}, CAST(${row.priceDecimal} AS DECIMAL(10,4)), ${row.displayHundredths},
        CAST(${row.impliedProbability} AS DECIMAL(13,12)), CAST(${row.overround} AS DECIMAL(13,12)), ${row.method}, ${row.mappingVersion},
        ${row.snapshotId}, NULL, ${new Date(row.retrievedAt)}, ${row.providerUpdatedAt === null ? null : new Date(row.providerUpdatedAt)}, ${row.stale})
      ON DUPLICATE KEY UPDATE basis = VALUES(basis), bookmakerExternalId = VALUES(bookmakerExternalId), line = VALUES(line),
        priceDecimal = VALUES(priceDecimal), displayHundredths = VALUES(displayHundredths), impliedProbability = VALUES(impliedProbability),
        overround = VALUES(overround), method = VALUES(method), mappingVersion = VALUES(mappingVersion), snapshotId = VALUES(snapshotId),
        basisJson = VALUES(basisJson), retrievedAt = VALUES(retrievedAt), providerUpdatedAt = VALUES(providerUpdatedAt), stale = VALUES(stale)`;
  }
  /** Marks every public price of one fixture stale; returns how many rows changed. */
  async function staleAll(tx: Tx, fixtureId: string): Promise<number> {
    return tx.$executeRaw`UPDATE FixtureOddsPrice SET stale = TRUE WHERE fixtureId = ${fixtureId} AND stale = FALSE`;
  }
  async function projectPrices(tx: Tx, fixtureId: string, bookmakerId: number, catalog: ReadonlyMap<number, string> | null,
    offers: readonly ProjectionOffer[]): Promise<number> {
    const existing = await prices(tx, fixtureId), desired = new Map<string, PriceRow>();
    for (const mapping of launchOddsMapping) {
      const offer = offers.find(({ betId }) => betId === mapping.betId);
      const group = offer ? launchOddsGroup(mapping, offer, catalog?.get(mapping.betId)) : null;
      if (!group || !offer) continue;
      for (const selection of group.selections) desired.set(`${mapping.family}\u0000${selection.selection}`, Object.freeze({
        marketKey: mapping.family, selection: selection.selection, basis: "bookmaker", bookmakerExternalId: bookmakerId,
        line: group.line === null ? null : places(group.line, 2), priceDecimal: places(selection.price.text, 4),
        displayHundredths: selection.displayHundredths, impliedProbability: selection.impliedProbability, overround: group.overround,
        method: group.method, mappingVersion: group.mappingVersion, snapshotId: offer.id, retrievedAt: offer.retrievedAt,
        providerUpdatedAt: offer.providerUpdatedAt, stale: false,
      }));
    }
    let changed = 0;
    for (const [key, next] of desired) {
      const previous = existing.get(key);
      if (previous && sameRow(previous, next)) continue;
      await upsertPrice(tx, fixtureId, next); changed++;
    }
    // A family missing or incomplete in this observation keeps no fresh price; nothing is borrowed.
    for (const [key, previous] of existing) {
      if (desired.has(key) || previous.stale) continue;
      await upsertPrice(tx, fixtureId, { ...previous, stale: true }); changed++;
    }
    return changed;
  }
  async function bumpState(tx: Tx, fixtureId: string, fields: Readonly<{ latestBatchId?: string; withdrawnAt?: Date }>, publicChanged: boolean) {
    const state = await lockState(tx, fixtureId);
    if (!state) return oddsFail("invalid-state");
    const version = asNumber(state.publicVersion) + (publicChanged ? 1 : 0);
    await tx.$executeRaw`UPDATE FixtureOddsState SET latestBatchId = ${fields.latestBatchId ?? state.latestBatchId},
      withdrawnAt = ${fields.withdrawnAt ?? state.withdrawnAt}, publicVersion = ${version} WHERE fixtureId = ${fixtureId}`;
  }

  return Object.freeze({
    /** Maps provider fixture ids to stored fixtures. Unknown fixtures are reported, never created. */
    resolveFixtures(externalIds: readonly number[]): Promise<Map<number, OddsFixtureTarget>> {
      return read(async (tx) => {
        const unique = [...new Set(externalIds)];
        if (unique.length === 0) return new Map();
        const rows = await tx.footballFixture.findMany({ where: { provider: "api-football", externalId: { in: unique.map(BigInt) } },
          select: { id: true, externalId: true, kickoff: true, status: true } });
        return new Map(rows.map((row) => [Number(row.externalId), Object.freeze({ fixtureId: row.id, externalId: Number(row.externalId),
          kickoff: row.kickoff === null ? null : utcInstantFromEpochMilliseconds(row.kickoff.getTime()), status: row.status })]));
      });
    },
    /** Receipt first: insert-if-absent, then a sealed re-read must reproduce the exact body. */
    async saveBatch(input: OddsBatchBody): Promise<OddsBatchBody> {
      const parsed = batchSchema.safeParse(input);
      if (!parsed.success) return oddsFail("invalid-request");
      const { id, ...content } = parsed.data, body = evidenceSerialize(parsed.data);
      if (evidenceFingerprint(content) !== id) return oddsFail("invalid-request");
      const stored = await write(async (tx) => {
        await tx.$executeRaw`INSERT IGNORE INTO OddsImportBatch (id, accountId, kind, scopeKey, policyHash, status, requestsDispatched, receivedAt, integrity, body)
          VALUES (${id}, ${parsed.data.accountId}, ${parsed.data.kind}, ${parsed.data.scopeKey}, ${parsed.data.policyHash}, ${parsed.data.status},
            ${parsed.data.requestsDispatched}, ${new Date(parsed.data.receivedAt)}, SHA2(CAST(JSON_EXTRACT(${body}, '$') AS CHAR), 256), JSON_EXTRACT(${body}, '$'))`;
        const sealed = await sealedBatch(tx, id);
        if (!sealed || evidenceFingerprint(sealed) !== evidenceFingerprint(parsed.data)) return oddsFail("conflicting-request");
        return sealed;
      });
      // Committed: the import's per-fixture writes reuse this verified body instead of re-reading it each time.
      remember(stored);
      return stored;
    },
    batch(id: string) { return read((tx) => sealedBatch(tx, id)); },
    /** Every observed /odds/bets name is kept once; later renames add rows, never overwrite. */
    saveBetObservations(batchId: string, entries: readonly Readonly<{ id: number; name: string }>[]): Promise<number> {
      return write(async (tx) => {
        const batch = await sealedBatch(tx, batchId);
        if (!batch || batch.kind !== "bets") return oddsFail("invalid-request");
        const at = await now(tx);
        let inserted = 0;
        for (const entry of entries) {
          if (!batch.catalog.some((item) => item.id === entry.id && item.name === entry.name)) return oddsFail("invalid-request");
          const id = evidenceFingerprint({ provider: "api-football", betId: entry.id, name: entry.name });
          inserted += await tx.$executeRaw`INSERT IGNORE INTO OddsBetObservation (id, provider, betExternalId, name, batchId, firstSeenAt)
            VALUES (${id}, 'api-football', ${entry.id}, ${entry.name}, ${batchId}, ${new Date(at)})`;
          const stored = await tx.oddsBetObservation.findUnique({ where: { id } });
          if (!stored || stored.betExternalId !== entry.id || stored.name !== entry.name) return oddsFail("invalid-state");
        }
        return inserted;
      });
    },
    /** The latest complete /odds/bets catalog (id -> exact name), or null before any catalog import. */
    latestBetCatalog(): Promise<ReadonlyMap<number, string> | null> {
      return read(async (tx) => {
        const row = (await tx.$queryRaw<{ id: string }[]>`SELECT id FROM OddsImportBatch WHERE scopeKey = 'bets' AND kind = 'bets'
          AND status = 'complete' ORDER BY receivedAt DESC, id DESC LIMIT 1`)[0];
        if (!row) return null;
        const batch = await sealedBatch(tx, row.id);
        return batch ? new Map(batch.catalog.map((entry) => [entry.id, entry.name])) : null;
      });
    },
    async hasCompleteCatalog(kind: "bets" | "bookmakers", since: number): Promise<boolean> {
      return read(async (tx) => {
        const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM OddsImportBatch WHERE scopeKey = ${kind}
          AND kind = ${kind} AND status = 'complete' AND receivedAt >= ${new Date(since)} LIMIT 1`;
        return row !== undefined && await sealedBatch(tx, row.id) !== null;
      });
    },
    /** Current exact 1.5 quote from the stored bookmaker bet and current receipt.
     * Unchanged values may reuse an older sealed snapshot only if reconfirmed by the latest receipt. */
    async readCurrentTotal15(fixtureId: string, kickoffAt: number, asOf: number): Promise<Total15Odds | null> {
      return database.transaction(async (tx) => total15OddsForBookmaker(
        (await storedCurrentBookmakerQuotes(tx, [{ fixtureId, kickoffAt }], asOf, [totalGoalsBet.betId])).get(fixtureId)
      ), { isolationLevel: "RepeatableRead", maxWait: 2000, timeout: 5000 });
    },
    /** Recover the public projection after a catalog gap, using only still-current sealed quotes. */
    async projectRetainedPrices(input: Readonly<{ policy: OddsPolicy; policyHash: string; catalog: ReadonlyMap<number, string>;
      limit: number; verify(): boolean }>): Promise<Readonly<{ scanned: number; updated: number }>> {
      if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 1_000 || !provenTrue(input.verify)) return oddsFail("invalid-request");
      const { policy, policyHash, catalog } = input;
      const candidates = await read(async (tx) => {
        const at = await now(tx);
        return tx.$queryRaw<{ id: string }[]>`SELECT f.id FROM FootballFixture f JOIN FixtureOddsState s ON s.fixtureId = f.id
          WHERE f.provider = 'api-football' AND f.status = 'scheduled' AND f.kickoff > ${new Date(at)}
            AND s.policyHash = ${policyHash} AND s.withdrawnAt IS NULL AND s.lastRetrievedAt >= ${new Date(at - policy.freshnessMs)}
            AND NOT EXISTS (SELECT 1 FROM FixtureOddsPrice p WHERE p.fixtureId = f.id AND p.stale = FALSE)
          ORDER BY f.kickoff, f.id LIMIT ${input.limit}`;
      });
      let updated = 0;
      for (const candidate of candidates) {
        if (!provenTrue(input.verify)) return oddsFail("invalid-request");
        updated += await write(async (tx) => {
          const at = await now(tx), state = await lockState(tx, candidate.id);
          if (!state || state.policyHash !== policyHash || state.withdrawnAt !== null
            || state.lastRetrievedAt.getTime() < at - policy.freshnessMs) return 0;
          const [fixture] = await tx.$queryRaw<{ externalId: bigint; kickoff: Date | null; status: string }[]>`
            SELECT externalId, kickoff, status FROM FootballFixture WHERE id = ${candidate.id} AND provider = 'api-football'`;
          if (!fixture?.kickoff || fixture.kickoff.getTime() <= at || fixture.status !== "scheduled") return 0;
          const receipt = verifiedBatches.get(state.latestBatchId) ?? remember(await sealedBatch(tx, state.latestBatchId));
          const entry = receipt?.fixtures.get(Number(fixture.externalId)), manifest = entry?.quoteManifest;
          if (!receipt || receipt.batch.kind !== "prices" || receipt.batch.policyHash !== policyHash
            || !receipt.pages.has(state.lastRetrievedAt.getTime()) || entry?.outcome !== "apply"
            || !manifest || manifest.bookmakerId !== policy.bookmakerId || manifest.kickoffAt !== fixture.kickoff.getTime()) return 0;
          const heads = await tx.$queryRaw<{ id: string }[]>`
            SELECT s.id FROM ProviderOddsSnapshot s LEFT JOIN ProviderOddsSnapshot next ON next.previousId = s.id
            WHERE s.fixtureId = ${candidate.id} AND s.bookmakerExternalId = ${policy.bookmakerId}
              AND s.betExternalId IN (${Prisma.join(launchOddsMapping.map(({ betId }) => betId))}) AND next.id IS NULL`;
          const snapshots = [...(await sealedSnapshots(tx, heads.map(({ id }) => id))).values()];
          const offers = snapshots.filter((snapshot) => snapshot.fixtureId === candidate.id && snapshot.bookmakerId === policy.bookmakerId
            && snapshot.retainUntil >= at && snapshot.retrievedAt <= state.lastRetrievedAt.getTime()
            && (snapshot.providerUpdatedAt === null || snapshot.providerUpdatedAt <= snapshot.retrievedAt)
            && snapshot.valuesHash === oddsValuesHash(snapshot.values)
            && manifest.bets.some((bet) => bet.betId === snapshot.betId && bet.betName === snapshot.betName && bet.valuesHash === snapshot.valuesHash));
          if (!offers.length || !provenTrue(input.verify)) return 0;
          const changes = await projectPrices(tx, candidate.id, policy.bookmakerId, catalog, offers);
          if (changes > 0) await bumpState(tx, candidate.id, {}, true);
          return changes > 0 ? 1 : 0;
        });
      }
      return { scanned: candidates.length, updated };
    },
    /** Applies one validated fixture observation in one short transaction. New chained snapshots are written only for
     * changed values; the public projection is recomputed from this observation's complete launch groups. The receipt
     * named by `batchId` must have recorded exactly this observation: its fixture entry (outcome `apply`) carries the
     * row's observation hash and one of its pages carries the row's retrieval time, so every snapshot's `batchId`
     * points at a receipt that observed those values. */
    async applyFixture(input: Readonly<{ batchId: string; policy: OddsPolicy; policyHash: string; fixtureId: string; row: NormalizedFixtureOdds;
      publicDisplay: boolean; catalog: ReadonlyMap<number, string> | null }>): Promise<OddsApplyResult> {
      const { row, policy } = input, retrievedAt = row.source.retrievedAt, providerUpdatedAt = row.source.providerUpdatedAt;
      const bookmaker = row.bookmakers.find((entry) => entry.id === policy.bookmakerId);
      if (row.kickoff === null || policy.bookmakerScope !== "all" && row.bookmakers.some((entry) => entry.id !== policy.bookmakerId)) return oddsFail("invalid-request");
      const observationHash = evidenceFingerprint(row);
      return write(async (tx) => {
        // A receipt visible here is committed (this transaction never inserts receipts), so it may be remembered.
        const receipt = verifiedBatches.get(input.batchId) ?? remember(await sealedBatch(tx, input.batchId));
        const entry = receipt?.fixtures.get(row.fixtureId);
        if (!receipt || receipt.batch.kind !== "prices" || receipt.batch.policyHash !== input.policyHash || entry?.outcome !== "apply" ||
          entry.observationHash !== observationHash || !receipt.pages.has(retrievedAt)) return oddsFail("invalid-request");
        if (entry.quoteManifest || policy.bookmakerScope === "all") {
          const { quoteManifest, additionalQuoteManifests } = fixtureQuoteManifests(row, policy.bookmakerId);
          if (!entry.quoteManifest || evidenceFingerprint(entry.quoteManifest) !== evidenceFingerprint(quoteManifest) ||
            evidenceFingerprint(entry.additionalQuoteManifests ?? []) !== evidenceFingerprint(additionalQuoteManifests ?? [])) return oddsFail("invalid-request");
        }
        const at = await now(tx);
        const fixture = (await tx.$queryRaw<{ kickoff: Date | null; status: string }[]>`SELECT kickoff, status FROM FootballFixture
          WHERE id = ${input.fixtureId} AND provider = 'api-football' AND externalId = ${BigInt(row.fixtureId)}`)[0];
        // Pre-match only: after kickoff the last valid price is frozen as the closing price.
        if (!fixture || fixture.kickoff === null || fixture.kickoff.getTime() !== row.kickoff || fixture.status !== "scheduled" ||
          fixture.kickoff.getTime() <= Math.max(retrievedAt, at)) return "skipped";
        await tx.$executeRaw`INSERT INTO FixtureOddsState (fixtureId, latestBatchId, policyHash, lastRetrievedAt, lastProviderUpdatedAt, withdrawnAt, publicVersion)
          VALUES (${input.fixtureId}, ${input.batchId}, ${input.policyHash}, ${new Date(retrievedAt)},
            ${providerUpdatedAt === null ? null : new Date(providerUpdatedAt)}, NULL, 0)
          ON DUPLICATE KEY UPDATE publicVersion = publicVersion`;
        const state = await lockState(tx, input.fixtureId);
        if (!state) return oddsFail("invalid-state");
        // Out-of-order observations never move a fixture backwards.
        if (state.lastRetrievedAt.getTime() > retrievedAt) return "skipped";
        const heads = new Map((row.bookmakers.length === 0 ? [] : await tx.$queryRaw<{ id: string; betExternalId: unknown; bookmakerExternalId: unknown; valuesHash: string; bookmakerName: string | null;
          betName: string | null; retrievedAt: Date; providerUpdatedAt: Date | null }[]>`
          SELECT s.id, s.bookmakerExternalId, s.betExternalId, s.valuesHash, s.bookmakerName, s.betName, s.retrievedAt, s.providerUpdatedAt FROM ProviderOddsSnapshot s
          LEFT JOIN ProviderOddsSnapshot n ON n.previousId = s.id
          WHERE s.fixtureId = ${input.fixtureId} AND s.bookmakerExternalId IN (${Prisma.join(row.bookmakers.map(({ id }) => id))}) AND n.id IS NULL`)
          .map((head) => [quoteKey(asNumber(head.bookmakerExternalId), asNumber(head.betExternalId)), head]));
        const current = new Map<string, Readonly<{ id: string; retrievedAt: number; providerUpdatedAt: number | null }>>();
        const pending: StoredOddsSnapshot[] = [];
        for (const { id: bookmakerId, name: bookmakerName, bets } of row.bookmakers) for (const bet of bets) {
          const key = quoteKey(bookmakerId, bet.id);
          const values = canonicalOddsValues(bet.values), valuesHash = oddsValuesHash(values), head = heads.get(key);
          // Unchanged content (canonical values and the recorded names) adds no row; a renamed bet or bookmaker is recorded.
          if (head && head.valuesHash === valuesHash && head.betName === bet.name && head.bookmakerName === bookmakerName) {
            current.set(key, { id: head.id, retrievedAt: head.retrievedAt.getTime(), providerUpdatedAt: head.providerUpdatedAt?.getTime() ?? null });
            continue;
          }
          const previousId = head?.id ?? null, retainUntil = row.kickoff + policy.retainAfterKickoffMs;
          const id = evidenceFingerprint({ fixtureId: input.fixtureId, bookmakerId, bookmakerName, betId: bet.id,
            betName: bet.name, valuesHash, previousId });
          pending.push({ id, fixtureId: input.fixtureId, previousId, bookmakerId, bookmakerName,
            betId: bet.id, betName: bet.name, valuesHash, retrievedAt, providerUpdatedAt, retainUntil, values });
        }
        // Changed bets are written together: multi-row INSERT IGNORE statements, then one sealed re-read that must
        // reproduce every body exactly (a concurrent replica may have written the same content-addressed rows).
        for (const part of chunks(pending, SNAPSHOT_CHUNK)) {
          await tx.$executeRaw(Prisma.sql`INSERT IGNORE INTO ProviderOddsSnapshot (id, fixtureId, batchId, previousId, bookmakerExternalId, bookmakerName,
            betExternalId, betName, valuesHash, selectionCount, retrievedAt, providerUpdatedAt, retainUntil, integrity, body)
            VALUES ${Prisma.join(part.map((body) => {
              const json = evidenceSerialize(body);
              return Prisma.sql`(${body.id}, ${body.fixtureId}, ${input.batchId}, ${body.previousId}, ${body.bookmakerId}, ${body.bookmakerName}, ${body.betId},
                ${body.betName}, ${body.valuesHash}, ${body.values.length}, ${new Date(retrievedAt)},
                ${providerUpdatedAt === null ? null : new Date(providerUpdatedAt)}, ${new Date(body.retainUntil)},
                SHA2(CAST(JSON_EXTRACT(${json}, '$') AS CHAR), 256), JSON_EXTRACT(${json}, '$'))`;
            }))}`);
        }
        const sealed = pending.length === 0 ? new Map<string, StoredOddsSnapshot>() : await sealedSnapshots(tx, pending.map((body) => body.id));
        for (const body of pending) {
          const stored = sealed.get(body.id);
          if (!stored || evidenceFingerprint(stored) !== evidenceFingerprint(body)) return oddsFail("invalid-state");
          current.set(quoteKey(body.bookmakerId, body.betId), { id: body.id, retrievedAt, providerUpdatedAt });
        }
        const snapshots = pending.length;
        const offers = (bookmaker?.bets ?? []).flatMap((bet) => {
          const snapshot = current.get(quoteKey(policy.bookmakerId, bet.id));
          return snapshot ? [{ ...snapshot, betId: bet.id, betName: bet.name, values: bet.values }] : [];
        });
        const publicChanges = input.publicDisplay ? await projectPrices(tx, input.fixtureId, policy.bookmakerId, input.catalog, offers)
          : await staleAll(tx, input.fixtureId);
        const version = asNumber(state.publicVersion) + (publicChanges > 0 ? 1 : 0);
        await tx.$executeRaw`UPDATE FixtureOddsState SET latestBatchId = ${input.batchId}, policyHash = ${input.policyHash},
          lastRetrievedAt = ${new Date(retrievedAt)}, lastProviderUpdatedAt = ${providerUpdatedAt === null ? null : new Date(providerUpdatedAt)},
          withdrawnAt = NULL, publicVersion = ${version} WHERE fixtureId = ${input.fixtureId}`;
        return snapshots > 0 || publicChanges > 0 ? "changed" : "unchanged";
      });
    },
    /** Only after a COMPLETE sweep of one EAT date: pre-match fixtures absent from it are withdrawn and their prices go stale. */
    async markWithdrawn(input: Readonly<{ batchId: string; date: string; seenFixtureIds: readonly string[] }>): Promise<number> {
      // Candidate reads use the same transactional clock as the per-fixture re-check below.
      const { batch, candidates } = await write(async (tx) => {
        const batch = await sealedBatch(tx, input.batchId);
        if (!batch || batch.kind !== "prices" || batch.status !== "complete" || batch.date !== input.date) return oddsFail("invalid-request");
        return { batch, candidates: await tx.$queryRaw<{ fixtureId: string }[]>`SELECT s.fixtureId FROM FixtureOddsState s
          JOIN FootballFixture f ON f.id = s.fixtureId
          WHERE f.eatDate = ${input.date} AND s.withdrawnAt IS NULL AND f.kickoff > UTC_TIMESTAMP(3) ORDER BY s.fixtureId` };
      });
      const seen = new Set(input.seenFixtureIds);
      let withdrawn = 0;
      for (const { fixtureId } of candidates.filter((candidate) => !seen.has(candidate.fixtureId))) {
        withdrawn += await write(async (tx) => {
          const state = await lockState(tx, fixtureId), at = await now(tx);
          const fixture = (await tx.$queryRaw<{ kickoff: Date | null }[]>`SELECT kickoff FROM FootballFixture WHERE id = ${fixtureId}`)[0];
          // A later observation (another sweep) that reconfirmed the fixture wins over this sweep's absence.
          if (!state || state.withdrawnAt !== null || state.lastRetrievedAt.getTime() > batch.receivedAt ||
            !fixture?.kickoff || fixture.kickoff.getTime() <= at) return 0;
          await bumpState(tx, fixtureId, { latestBatchId: input.batchId, withdrawnAt: new Date(at) }, await staleAll(tx, fixtureId) > 0);
          return 1;
        });
      }
      return withdrawn;
    },
    /** Write-time staleness: prices not reconfirmed within the freshness window before kickoff (or now) go stale.
     * After kickoff the comparison point stays at kickoff, freezing the last valid closing price. */
    async expireStale(freshnessMs: number, limit: number): Promise<number> {
      if (!Number.isSafeInteger(freshnessMs) || freshnessMs <= 0 || !Number.isSafeInteger(limit) || limit <= 0 || limit > 10_000) oddsFail("invalid-request");
      const window = BigInt(freshnessMs) * 1000n;
      // Candidate reads use the same transactional clock as the per-fixture re-check below.
      const candidates = await write((tx) => tx.$queryRaw<{ fixtureId: string }[]>`SELECT DISTINCT p.fixtureId FROM FixtureOddsPrice p
        JOIN FixtureOddsState s ON s.fixtureId = p.fixtureId JOIN FootballFixture f ON f.id = p.fixtureId
        WHERE p.stale = FALSE AND s.lastRetrievedAt < DATE_SUB(LEAST(UTC_TIMESTAMP(3), COALESCE(f.kickoff, UTC_TIMESTAMP(3))), INTERVAL ${window} MICROSECOND)
        ORDER BY p.fixtureId LIMIT ${limit}`);
      let expired = 0;
      for (const { fixtureId } of candidates) {
        expired += await write(async (tx) => {
          const state = await lockState(tx, fixtureId);
          const due = (await tx.$queryRaw<{ due: unknown }[]>`SELECT s.lastRetrievedAt < DATE_SUB(LEAST(UTC_TIMESTAMP(3), COALESCE(f.kickoff, UTC_TIMESTAMP(3))),
            INTERVAL ${window} MICROSECOND) AS due FROM FixtureOddsState s JOIN FootballFixture f ON f.id = s.fixtureId WHERE s.fixtureId = ${fixtureId}`)[0];
          if (!state || !asBoolean(due?.due)) return 0;
          const changed = await staleAll(tx, fixtureId);
          if (changed > 0) await bumpState(tx, fixtureId, {}, true);
          return changed > 0 ? 1 : 0;
        });
      }
      return expired;
    },
    /** Used while odds display rights are not verified: every fresh public price goes stale, before or after kickoff
     * (closing prices included), with no provider call. Bounded per call; each changed fixture's `publicVersion`
     * rises once, so its cache tags invalidate. Returns how many fixtures changed. */
    async staleUnauthorized(limit: number): Promise<number> {
      if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 10_000) oddsFail("invalid-request");
      const candidates = await read((tx) => tx.$queryRaw<{ fixtureId: string }[]>`SELECT DISTINCT fixtureId FROM FixtureOddsPrice
        WHERE stale = FALSE ORDER BY fixtureId LIMIT ${limit}`);
      let hidden = 0;
      for (const { fixtureId } of candidates) {
        hidden += await write(async (tx) => {
          const state = await lockState(tx, fixtureId), changed = await staleAll(tx, fixtureId);
          // Prices are only ever written after their state row; without one there is no version to bump.
          if (changed > 0 && state) await bumpState(tx, fixtureId, {}, true);
          return changed > 0 ? 1 : 0;
        });
      }
      return hidden;
    },
    /** Sealed snapshot chain for one fixture, bookmaker and bet, newest first (audits and 053/054 inputs). The order
     * follows the previousId links from the single head; a fork, gap or foreign link is invalid state. */
    snapshotChain(fixtureId: string, bookmakerId: number, betId: number): Promise<readonly StoredOddsSnapshot[]> {
      return read(async (tx) => {
        const rows = await tx.$queryRaw<{ id: string; previousId: string | null }[]>`SELECT id, previousId FROM ProviderOddsSnapshot
          WHERE fixtureId = ${fixtureId} AND bookmakerExternalId = ${bookmakerId} AND betExternalId = ${betId} LIMIT 10001`;
        if (rows.length > 10_000) return oddsFail("invalid-state");
        const byId = new Map(rows.map((row) => [row.id, row])), linked = new Set(rows.flatMap((row) => row.previousId === null ? [] : [row.previousId]));
        const heads = rows.filter((row) => !linked.has(row.id));
        if (rows.length === 0) return freezeEvidence([]);
        if (heads.length !== 1) return oddsFail("invalid-state");
        const chain: StoredOddsSnapshot[] = [];
        for (let cursor: string | null = heads[0]!.id; cursor !== null;) {
          const snapshot = await sealedSnapshot(tx, cursor);
          if (!snapshot || snapshot.fixtureId !== fixtureId || snapshot.bookmakerId !== bookmakerId || snapshot.betId !== betId) return oddsFail("invalid-state");
          chain.push(snapshot); cursor = snapshot.previousId;
          if (cursor !== null && !byId.has(cursor)) return oddsFail("invalid-state");
        }
        return chain.length === rows.length ? freezeEvidence(chain) : oddsFail("invalid-state");
      });
    },
  });
}
export type MysqlOddsStore = ReturnType<typeof createMysqlOddsStore>;
