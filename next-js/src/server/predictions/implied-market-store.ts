import "server-only";
import { z } from "zod";
import { deriveMappedImpliedMarket } from "../../domain/market-implied-markets.ts";
import { NON_GOAL_MARKET_RULE_VERSION } from "../../domain/non-goal-market-definitions.ts";
import { predictionRuleLabel } from "../../domain/prediction-label.ts";
import { evidenceFingerprint, evidenceSerialize, freezeEvidence } from "../evidence/evidence-input.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { oddsValuesHash, storedOddsSnapshotSchema } from "../odds/odds-mysql-store.ts";
import { historyFail } from "./history-contract.ts";
import { historyId, historyInstant } from "./history-input.ts";
import { assertHistorySeal, historyJson, historyTime, type HistoryRow } from "./history-read.ts";
import { impliedMarketStorageLimits, parseImpliedMarketExtensionInput, type ImpliedMarketExtensionInput,
  type PreparedImpliedMarketExtension, type StoredImpliedMarketExtension } from "./implied-market-contract.ts";

type Tx = Prisma.TransactionClient;
const catalogSchema = z.array(z.strictObject({ id: z.number().int().positive().max(4_294_967_295), name: z.string().min(1).max(256) })).max(5000)
  .refine((rows) => new Set(rows.map(({ id }) => id)).size === rows.length);
const identitySchema = z.strictObject({ revisionId: historyId, cycleId: historyId, fixtureId: historyId, recordedAt: historyInstant });

export function prepareImpliedMarketExtension(input: unknown, catalogInput: unknown, snapshotsInput: unknown, confirmedAt: number): PreparedImpliedMarketExtension {
  const checked = parseImpliedMarketExtensionInput(input), catalog = catalogSchema.parse(catalogInput);
  const snapshots = z.array(storedOddsSnapshotSchema).max(impliedMarketStorageLimits.snapshots).parse(snapshotsInput);
  historyInstant.parse(confirmedAt);
  if (snapshots.length !== checked.snapshotIds.length || snapshots.some((snapshot) => snapshot.bookmakerId !== checked.bookmakerId ||
      !checked.snapshotIds.includes(snapshot.id)) || new Set(snapshots.map(({ betId }) => betId)).size !== snapshots.length) return historyFail("invalid-request");
  const names = new Map(catalog.map(({ id, name }) => [id, name]));
  const prepared: PreparedImpliedMarketExtension = freezeEvidence({ version: 1 as const, source: "market-implied" as const,
    ruleVersion: NON_GOAL_MARKET_RULE_VERSION, bookmakerId: checked.bookmakerId, freshnessMs: checked.freshnessMs,
    confirmedAt, mappings: checked.mappings, catalog, snapshots, markets: checked.mappings.map((mapping) => {
      const snapshot = snapshots.find(({ betId }) => betId === mapping.betId);
      return { definition: mapping.definition, snapshotId: snapshot?.id ?? null, derivation: deriveMappedImpliedMarket(mapping, names,
        snapshot ? { betId: snapshot.betId, betName: snapshot.betName, values: snapshot.values } : undefined) };
    }) });
  if (Buffer.byteLength(evidenceSerialize(prepared)) > impliedMarketStorageLimits.bytes) return historyFail("invalid-request");
  return prepared;
}

export function impliedMarketExtensionFromRow(row: HistoryRow): StoredImpliedMarketExtension {
  assertHistorySeal(row.validIntegrity);
  const body = historyJson(row.body) as Record<string, unknown>;
  const identity = identitySchema.safeParse({ revisionId: body?.revisionId, cycleId: body?.cycleId, fixtureId: body?.fixtureId, recordedAt: body?.recordedAt });
  if (!identity.success || !Array.isArray(body.snapshots)) return historyFail("invalid-state");
  let prepared: PreparedImpliedMarketExtension;
  try { prepared = prepareImpliedMarketExtension({ bookmakerId: body.bookmakerId, freshnessMs: body.freshnessMs,
    snapshotIds: body.snapshots.map((snapshot) => (snapshot as { id?: unknown })?.id), mappings: body.mappings }, body.catalog, body.snapshots, body.confirmedAt as number); }
  catch { return historyFail("invalid-state"); }
  const contentHash = evidenceFingerprint(prepared), expected = { ...prepared, ...identity.data, contentHash };
  if (body.contentHash !== contentHash || row.contentHash !== contentHash || row.ruleVersion !== prepared.ruleVersion ||
      row.revisionId !== expected.revisionId || row.cycleId !== expected.cycleId || row.fixtureId !== expected.fixtureId ||
      historyTime(row.recordedAt) !== expected.recordedAt || evidenceFingerprint(body) !== evidenceFingerprint(expected) ||
      prepared.snapshots.some((snapshot) => snapshot.fixtureId !== expected.fixtureId || snapshot.valuesHash !== oddsValuesHash(snapshot.values) ||
        snapshot.retrievedAt > prepared.confirmedAt || expected.recordedAt - snapshot.retrievedAt > prepared.freshnessMs ||
        snapshot.providerUpdatedAt !== null && snapshot.providerUpdatedAt > expected.recordedAt || snapshot.retainUntil <= expected.recordedAt) ||
      prepared.confirmedAt > expected.recordedAt || expected.recordedAt - prepared.confirmedAt > prepared.freshnessMs) return historyFail("invalid-state");
  return freezeEvidence(expected);
}
export async function readImpliedMarketExtension(tx: Tx, revisionId: string): Promise<StoredImpliedMarketExtension | null> {
  historyId.parse(revisionId);
  const [row] = await tx.$queryRaw<HistoryRow[]>`SELECT *, integrity = SHA2(CAST(body AS CHAR), 256) AS validIntegrity
    FROM ImpliedMarketExtension WHERE revisionId = ${revisionId}`;
  return row ? impliedMarketExtensionFromRow(row) : null;
}
async function storedCatalog(tx: Tx, at: number) {
  const rows = await tx.$queryRaw<HistoryRow[]>`SELECT *, integrity = SHA2(CAST(body AS CHAR), 256) AS validIntegrity FROM OddsImportBatch
    WHERE kind='bets' AND status='complete' AND receivedAt<=${new Date(at)} ORDER BY receivedAt DESC, id DESC LIMIT 2`;
  if (!rows[0]) return [];
  const read = (row: HistoryRow) => {
    assertHistorySeal(row.validIntegrity);
    const body = historyJson(row.body) as Record<string, unknown>;
    if (body.id !== row.id || body.kind !== "bets" || body.status !== "complete" || body.receivedAt !== historyTime(row.receivedAt)) return historyFail("invalid-state");
    return catalogSchema.parse(body.catalog);
  };
  const catalog = read(rows[0]);
  if (rows[1] && historyTime(rows[1].receivedAt) === historyTime(rows[0].receivedAt) && evidenceFingerprint(read(rows[1])) !== evidenceFingerprint(catalog)) return historyFail("invalid-state");
  return catalog;
}

/** Same canonical publication transaction, before its pointer moves. No provider call or retrospective attachment. */
export async function appendImpliedMarketExtension(tx: Tx, input: ImpliedMarketExtensionInput & Readonly<{
  revisionId: string; cycleId: string; fixtureId: string; recordedAt: number;
}>): Promise<StoredImpliedMarketExtension> {
  const identity = identitySchema.parse({ revisionId: input.revisionId, cycleId: input.cycleId, fixtureId: input.fixtureId, recordedAt: input.recordedAt });
  const checked = parseImpliedMarketExtensionInput({ bookmakerId: input.bookmakerId, freshnessMs: input.freshnessMs, snapshotIds: input.snapshotIds, mappings: input.mappings });
  const known = await readImpliedMarketExtension(tx, identity.revisionId);
  if (known) {
    if (known.fixtureId !== identity.fixtureId || known.cycleId !== identity.cycleId || known.bookmakerId !== checked.bookmakerId ||
        evidenceFingerprint(known.mappings) !== evidenceFingerprint(checked.mappings) ||
        known.snapshots.map(({ id }) => id).sort().join() !== [...checked.snapshotIds].sort().join() || known.freshnessMs !== checked.freshnessMs) return historyFail("conflicting-request");
    return known;
  }
  const revision = await tx.predictionSet.findUnique({ where: { id: identity.revisionId } });
  const cycle = await tx.predictionCycle.findUnique({ where: { id: identity.cycleId } });
  const fixture = await tx.footballFixture.findUnique({ where: { id: identity.fixtureId } });
  const state = await tx.fixtureOddsState.findUnique({ where: { fixtureId: identity.fixtureId } });
  if (!revision || !cycle || !fixture || !state || revision.cycleId !== cycle.id || revision.fixtureId !== fixture.id || cycle.fixtureId !== fixture.id ||
      cycle.state !== "open" || fixture.status !== "scheduled" || cycle.currentSetId === revision.id || state.withdrawnAt !== null ||
      state.lastRetrievedAt === null || state.lastRetrievedAt.getTime() > identity.recordedAt || identity.recordedAt - state.lastRetrievedAt.getTime() > checked.freshnessMs ||
      identity.recordedAt < revision.publishedAt.getTime() || identity.recordedAt >= cycle.cutoffAt.getTime() ||
      await tx.predictionRefreshResult.findFirst({ where: { revisionId: revision.id, outcome: "published" }, select: { id: true } })) return historyFail("invalid-request");
  const rows = await tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT s.*, s.integrity = SHA2(CAST(s.body AS CHAR), 256) AS validIntegrity,
    EXISTS (SELECT 1 FROM ProviderOddsSnapshot successor WHERE successor.previousId=s.id) AS replaced
    FROM ProviderOddsSnapshot s WHERE s.id IN (${Prisma.join(checked.snapshotIds)})`);
  if (rows.length !== checked.snapshotIds.length) return historyFail("invalid-state");
  const snapshots = rows.map((row) => {
    assertHistorySeal(row.validIntegrity);
    const snapshot = storedOddsSnapshotSchema.parse(historyJson(row.body));
    if (snapshot.id !== row.id || snapshot.fixtureId !== identity.fixtureId || snapshot.fixtureId !== row.fixtureId || snapshot.bookmakerId !== checked.bookmakerId ||
        snapshot.bookmakerId !== Number(row.bookmakerExternalId) || snapshot.betId !== Number(row.betExternalId) ||
        [true, 1, 1n, "1"].includes(row.replaced as never) || row.batchId !== state.latestBatchId ||
        snapshot.valuesHash !== oddsValuesHash(snapshot.values) || identity.recordedAt - snapshot.retrievedAt > checked.freshnessMs ||
        snapshot.retrievedAt > state.lastRetrievedAt!.getTime() || snapshot.providerUpdatedAt !== null && snapshot.providerUpdatedAt > identity.recordedAt ||
        snapshot.retainUntil <= identity.recordedAt) return historyFail("invalid-state");
    return snapshot;
  });
  const prepared = prepareImpliedMarketExtension(checked, await storedCatalog(tx, identity.recordedAt), snapshots, state.lastRetrievedAt.getTime());
  if (!prepared.markets.some(({ derivation }) => derivation.available)) return historyFail("invalid-request");
  const contentHash = evidenceFingerprint(prepared), value = freezeEvidence({ ...prepared, ...identity, contentHash }), body = evidenceSerialize(value);
  await tx.$executeRaw`INSERT INTO ImpliedMarketExtension (revisionId, cycleId, fixtureId, ruleVersion, contentHash, integrity, recordedAt, body)
    VALUES (${identity.revisionId}, ${identity.cycleId}, ${identity.fixtureId}, ${prepared.ruleVersion}, ${contentHash},
      SHA2(CAST(JSON_EXTRACT(${body}, '$') AS CHAR), 256), ${new Date(identity.recordedAt)}, JSON_EXTRACT(${body}, '$'))`;
  return value;
}

/** Public envelope is separate from AI groups/headline statistics and carries no bookmaker identity or raw snapshot. */
export function publicImpliedMarketExtension(extension: StoredImpliedMarketExtension, at: number) {
  historyInstant.parse(at);
  return extension.markets.flatMap(({ definition, snapshotId, derivation }) => {
    if (!derivation.available) return [];
    const snapshot = extension.snapshots.find(({ id }) => id === snapshotId)!;
    const labels = new Map(definition.selections.map(({ key, rule }) => [key, predictionRuleLabel(rule)]));
    return [{ key: definition.key, label: definition.label, code: definition.code, period: definition.period,
      source: "market-implied" as const, method: derivation.market.method, probabilityBasis: derivation.market.probabilityBasis,
      selection: derivation.market.selection, selectedProbability: derivation.market.selectedProbability,
      selections: derivation.market.selections.map(({ key, normalizedProbability, displayHundredths }) => ({ key, label: labels.get(key) ?? historyFail("invalid-state"),
        probability: normalizedProbability, capturedPrice: snapshot.retainUntil > at ? `${Math.floor(displayHundredths / 100)}.${String(displayHundredths % 100).padStart(2, "0")}` : null })),
      retrievedAt: snapshot.retrievedAt, providerUpdatedAt: snapshot.providerUpdatedAt, confirmedAt: extension.confirmedAt }];
  });
}
