import "server-only";

import { z } from "zod";
import { nonGoalResultEvidenceSchema } from "../../domain/non-goal-market-settlement.ts";
import { evidenceFingerprint, evidenceSerialize, freezeEvidence } from "../evidence/evidence-input.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { historyFail } from "../predictions/history-contract.ts";
import { historyHash, historyId, historyInstant } from "../predictions/history-input.ts";
import { assertHistorySeal, historyInteger, historyJson, historyTime, type HistoryRow } from "../predictions/history-read.ts";
import { fixtureResultMatchesCanonical, storedFixtureResult } from "../results/result-read.ts";

type Tx = Prisma.TransactionClient;
export const impliedResultEvidenceInputSchema = z.strictObject({
  fixtureId: historyId, resultId: historyHash,
  provider: z.literal("api-football"), externalFixtureId: z.string().regex(/^[1-9][0-9]{0,19}$/u),
  homeTeamId: historyId, awayTeamId: historyId,
  contractVersion: z.literal("verified-non-goal-result-v1"),
  sources: z.array(z.strictObject({
    endpoint: z.enum(["fixtures/statistics", "fixtures/events", "fixtures/ids"]),
    sourceRef: historyHash, retrievedAt: historyInstant, providerUpdatedAt: historyInstant.nullable(),
  })).min(1).max(16),
  evidence: nonGoalResultEvidenceSchema,
}).superRefine(({ sources, evidence }, context) => {
  if (new Set(sources.map(({ sourceRef }) => sourceRef)).size !== sources.length ||
      !evidence.counts.length && !evidence.events.length ||
      evidence.counts.length && !sources.some(({ endpoint }) => endpoint !== "fixtures/events") ||
      evidence.events.length && !sources.some(({ endpoint }) => endpoint !== "fixtures/statistics")) {
    context.addIssue({ code: "custom", message: "Each fact requires a reviewed result source with an unambiguous identity." });
  }
});
export type ImpliedResultEvidenceInput = Readonly<z.infer<typeof impliedResultEvidenceInputSchema>>;
const storedSchema = impliedResultEvidenceInputSchema.safeExtend({ id: historyHash, recordedAt: historyInstant, contentHash: historyHash });
export type StoredImpliedResultEvidence = Readonly<z.infer<typeof storedSchema>> & Readonly<{ sequence: bigint }>;
export type ImpliedResultEvidenceAuthority = Readonly<{
  /** A private importer verifies exact stored response hashes, fixture/team identity, period and counting rules.
   * It must reject pre-match averages, incomplete timelines and unreviewed provider semantics. */
  verify(tx: Tx, input: ImpliedResultEvidenceInput): Promise<boolean>;
}>;
function parseInput(input: unknown): ImpliedResultEvidenceInput {
  const parsed = impliedResultEvidenceInputSchema.safeParse(input);
  if (!parsed.success || Buffer.byteLength(evidenceSerialize(parsed.data)) > 4 * 1024 * 1024) return historyFail("invalid-request");
  return freezeEvidence(parsed.data);
}
export function impliedResultEvidenceFromRow(row: HistoryRow): StoredImpliedResultEvidence {
  assertHistorySeal(row.validIntegrity);
  const parsed = storedSchema.safeParse(historyJson(row.body));
  if (!parsed.success) return historyFail("invalid-state");
  const value = parsed.data, input = parseInput(Object.fromEntries(Object.keys(impliedResultEvidenceInputSchema.shape)
    .map((key) => [key, value[key as keyof typeof value]])));
  if (evidenceFingerprint(input) !== value.contentHash ||
      evidenceFingerprint({ input, recordedAt: value.recordedAt }) !== value.id || row.id !== value.id ||
      row.fixtureId !== value.fixtureId || row.resultId !== value.resultId || row.contentHash !== value.contentHash ||
      historyTime(row.recordedAt) !== value.recordedAt || value.sources.some((source) => source.retrievedAt > value.recordedAt ||
        source.providerUpdatedAt !== null && source.providerUpdatedAt > source.retrievedAt)) return historyFail("invalid-state");
  return freezeEvidence({ ...value, sequence: historyInteger(row.sequence) });
}
export async function readImpliedResultEvidence(tx: Tx, fixtureId: string, resultId: string): Promise<StoredImpliedResultEvidence | null> {
  historyId.parse(fixtureId); historyHash.parse(resultId);
  const [row] = await tx.$queryRaw<HistoryRow[]>`SELECT *, integrity = SHA2(CAST(body AS CHAR), 256) AS validIntegrity
    FROM ImpliedMarketResultEvidence WHERE fixtureId = ${fixtureId} AND resultId = ${resultId} ORDER BY sequence DESC LIMIT 1`;
  return row ? impliedResultEvidenceFromRow(row) : null;
}

/** Caller owns the fixture lock. Evidence is append-only and cannot rewrite a final result or an accepted pick.
 * The opt-in settlement reconciler discovers new sequences, including statistic-only corrections. */
export async function appendImpliedResultEvidence(tx: Tx, input: unknown, recordedAt: number,
  authority: ImpliedResultEvidenceAuthority): Promise<StoredImpliedResultEvidence> {
  const value = parseInput(input); historyInstant.parse(recordedAt);
  const fixture = await tx.footballFixture.findUniqueOrThrow({ where: { id: value.fixtureId } });
  const state = await tx.fixtureResultState.findUnique({ where: { fixtureId: value.fixtureId } });
  const issue = (await tx.fixtureLifecycleState.findUnique({ where: { fixtureId: value.fixtureId } }))?.issue ?? null;
  const result = state?.resultId === value.resultId ? await storedFixtureResult(tx, value.fixtureId, value.resultId) : null;
  if (fixture.provider !== value.provider || fixture.externalId.toString() !== value.externalFixtureId ||
      fixture.homeTeamId !== value.homeTeamId || fixture.awayTeamId !== value.awayTeamId || !fixture.kickoff ||
      !fixtureResultMatchesCanonical(fixture, result, issue) || result!.observedAt > recordedAt ||
      value.sources.some((source) => source.retrievedAt < fixture.kickoff!.getTime() || source.retrievedAt > recordedAt ||
        source.providerUpdatedAt !== null && source.providerUpdatedAt > source.retrievedAt) || !await authority.verify(tx, value))
    return historyFail("invalid-request");
  const current = await readImpliedResultEvidence(tx, value.fixtureId, value.resultId), contentHash = evidenceFingerprint(value);
  if (current?.contentHash === contentHash) return current;
  if (current && recordedAt < current.recordedAt) return historyFail("invalid-request");
  const id = evidenceFingerprint({ input: value, recordedAt }), body = evidenceSerialize({ ...value, id, recordedAt, contentHash });
  await tx.$executeRaw`INSERT INTO ImpliedMarketResultEvidence (id, fixtureId, resultId, recordedAt, contentHash, integrity, body)
    VALUES (${id}, ${value.fixtureId}, ${value.resultId}, ${new Date(recordedAt)}, ${contentHash},
      SHA2(CAST(CAST(${body} AS JSON) AS CHAR), 256), CAST(${body} AS JSON))`;
  const appended = await readImpliedResultEvidence(tx, value.fixtureId, value.resultId);
  if (!appended || appended.id !== id) return historyFail("invalid-state");
  return appended;
}
