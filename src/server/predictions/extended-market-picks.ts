import "server-only";

import { z } from "zod";
import { publicExtendedPickSchema, type PublicExtendedPick } from "../../domain/extended-markets.ts";
import { evidenceFingerprint, evidenceSerialize, freezeEvidence } from "../evidence/evidence-input.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { readGoalMarketExtension, type StoredGoalMarketExtension } from "./goal-market-store.ts";
import { readImpliedMarketExtension } from "./implied-market-store.ts";
import type { StoredImpliedMarketExtension } from "./implied-market-contract.ts";
import { historyFail } from "./history-contract.ts";
import { historyHash, historyId, historyInstant } from "./history-input.ts";
import { assertHistorySeal, historyJson, type HistoryRow } from "./history-read.ts";

type Tx = Prisma.TransactionClient;
const identity = z.strictObject({ revisionId: historyId, fixtureId: historyId, cycleId: historyId, extensionHash: historyHash,
  sortOrder: z.number().int().min(0).max(255) });
const publishedShape = publicExtendedPickSchema.shape;
const fields = Object.fromEntries(Object.entries(publishedShape).filter(([key]) => key !== "result")) as Omit<typeof publishedShape, "result">;
export const publishedExtendedPickSchema = z.strictObject({ version: z.literal(1), ...identity.shape, ...fields });
export type PublishedExtendedPick = Readonly<z.infer<typeof publishedExtendedPickSchema>>;
export const extendedPickLimits = Object.freeze({ bodyBytes: 2048, fixtures: 30, marketKeys: 256, picksPerRevision: 512 });

/** Derive the compact projection only at publication; page reads never run every score rule again. */
export function preparePublishedExtendedPicks(goal: StoredGoalMarketExtension | null, implied: StoredImpliedMarketExtension | null): readonly PublishedExtendedPick[] {
  const picks: PublishedExtendedPick[] = [];
  const add = (extension: StoredGoalMarketExtension | StoredImpliedMarketExtension, sortOrder: number,
    input: Omit<PublicExtendedPick, "result">) => {
    publicExtendedPickSchema.parse({ ...input, result: { status: "pending", reason: "awaiting-final-result", correctedAt: null } });
    const value = publishedExtendedPickSchema.parse({ version: 1, revisionId: extension.revisionId, fixtureId: extension.fixtureId,
      cycleId: extension.cycleId, extensionHash: extension.contentHash, sortOrder, ...input });
    if (Buffer.byteLength(evidenceSerialize(value)) > extendedPickLimits.bodyBytes) return historyFail("invalid-request");
    picks.push(value);
  };
  goal?.markets.forEach(({ definition, derivation }, sortOrder) => {
    if (!derivation.available) return;
    const market = derivation.market, selected = market.selections.find(({ key }) => key === market.selection)!;
    add(goal, sortOrder, { key: definition.key, label: definition.label, code: definition.code, period: definition.period,
      ruleVersion: market.ruleVersion, source: market.source, sourceLabel: "AI score distribution",
      probabilityBasis: definition.group === "payout" ? "model-positive-payout" : "model-event",
      selection: selected.key, selectionLabel: selected.label, selectedProbability: selected.winProbability });
  });
  implied?.markets.forEach(({ definition, derivation }, sortOrder) => {
    if (!derivation.available) return;
    const market = derivation.market, selected = market.selections.find(({ key }) => key === market.selection)!;
    add(implied, sortOrder, { key: definition.key, label: definition.label, code: definition.code, period: definition.period,
      ruleVersion: market.ruleVersion, source: market.source, sourceLabel: "Market-implied", probabilityBasis: market.probabilityBasis,
      selection: selected.key, selectionLabel: selected.label, selectedProbability: Number(selected.normalizedProbability) });
  });
  if (picks.length > extendedPickLimits.picksPerRevision || new Set(picks.map(({ key }) => key)).size !== picks.length ||
      picks.some((pick) => pick.revisionId !== picks[0]!.revisionId || pick.cycleId !== picks[0]!.cycleId || pick.fixtureId !== picks[0]!.fixtureId))
    return historyFail("invalid-request");
  return freezeEvidence(picks);
}

export function publishedExtendedPickFromRow(row: HistoryRow): PublishedExtendedPick {
  assertHistorySeal(row.validIntegrity);
  const parsed = publishedExtendedPickSchema.safeParse(historyJson(row.body));
  if (!parsed.success || Buffer.byteLength(evidenceSerialize(parsed.data)) > extendedPickLimits.bodyBytes) return historyFail("invalid-state");
  const pick = parsed.data;
  if (pick.revisionId !== row.revisionId || pick.fixtureId !== row.fixtureId || pick.cycleId !== row.cycleId || pick.key !== row.marketKey ||
      pick.source !== row.source || pick.ruleVersion !== row.ruleVersion || pick.period !== row.period || pick.selection !== row.selection ||
      pick.selectedProbability !== row.selectedProbability || pick.sortOrder !== Number(row.sortOrder)) return historyFail("invalid-state");
  try { publicExtendedPickSchema.parse({ key: pick.key, label: pick.label, code: pick.code, period: pick.period, source: pick.source,
    sourceLabel: pick.sourceLabel, ruleVersion: pick.ruleVersion, probabilityBasis: pick.probabilityBasis,
    selection: pick.selection, selectionLabel: pick.selectionLabel, selectedProbability: pick.selectedProbability,
    result: { status: "pending", reason: "awaiting-final-result", correctedAt: null } }); }
  catch { return historyFail("invalid-state"); }
  return freezeEvidence(pick);
}

/** Same publication transaction, after sealed extension inserts and before canonical pointer advancement. */
export async function appendPublishedExtendedPicks(tx: Tx, revisionId: string, recordedAt: number): Promise<readonly PublishedExtendedPick[]> {
  historyId.parse(revisionId); historyInstant.parse(recordedAt);
  const revision = await tx.predictionSet.findUniqueOrThrow({ where: { id: revisionId } });
  const cycle = await tx.predictionCycle.findUniqueOrThrow({ where: { id: revision.cycleId } });
  if (cycle.state !== "open" || cycle.currentSetId === revisionId || recordedAt < revision.publishedAt.getTime() || recordedAt >= cycle.cutoffAt.getTime() ||
      await tx.predictionRefreshResult.findFirst({ where: { revisionId, outcome: "published" }, select: { id: true } })) return historyFail("invalid-request");
  const [goal, implied] = await Promise.all([readGoalMarketExtension(tx, revisionId), readImpliedMarketExtension(tx, revisionId)]);
  const picks = preparePublishedExtendedPicks(goal, implied);
  if (picks.some((pick) => pick.cycleId !== cycle.id || pick.fixtureId !== revision.fixtureId)) return historyFail("invalid-state");
  const known = await tx.$queryRaw<HistoryRow[]>`SELECT *, integrity = SHA2(CAST(body AS CHAR), 256) AS validIntegrity
    FROM ExtendedMarketPublishedPick WHERE revisionId = ${revisionId} ORDER BY source, sortOrder, marketKey`;
  const order = (values: readonly PublishedExtendedPick[]) => [...values].sort((a, b) => a.key.localeCompare(b.key, "en"));
  if (known.length) {
    if (evidenceFingerprint(order(known.map(publishedExtendedPickFromRow))) !== evidenceFingerprint(order(picks))) return historyFail("conflicting-request");
    return picks;
  }
  if (!picks.length) return picks;
  const values = picks.map((pick) => { const body = evidenceSerialize(pick); return Prisma.sql`(${pick.revisionId}, ${pick.cycleId}, ${pick.fixtureId},
    ${pick.key}, ${pick.source}, ${pick.ruleVersion}, ${pick.period}, ${pick.selection}, ${pick.selectedProbability}, ${pick.sortOrder},
    SHA2(CAST(CAST(${body} AS JSON) AS CHAR), 256), CAST(${body} AS JSON))`; });
  await tx.$executeRaw(Prisma.sql`INSERT INTO ExtendedMarketPublishedPick
    (revisionId, cycleId, fixtureId, marketKey, source, ruleVersion, period, selection, selectedProbability, sortOrder, integrity, body)
    VALUES ${Prisma.join(values)}`);
  return picks;
}
