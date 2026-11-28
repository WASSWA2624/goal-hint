import "server-only";

import { Prisma } from "../generated/prisma/client.ts";
import { historyFail, type StoredRevision } from "../predictions/history-contract.ts";
import { assertHistorySeal, revisionFromRows, type HistoryRow } from "../predictions/history-read.ts";

type VerifiedRevision = Readonly<{ revision: StoredRevision; header: HistoryRow; markets: ReadonlyMap<string, HistoryRow>; bytes: number }>;
const verified = new Map<string, VerifiedRevision>();
const maximumEntries = 1024;
const maximumBytes = 12 * 1024 * 1024;
let retainedBytes = 0;

const seal = (value: unknown) => typeof value === "string" && /^[0-9a-f]{64}$/iu.test(value) ? value : historyFail("invalid-state");
const jsonBytes = (value: unknown) => Buffer.byteLength(typeof value === "string" ? value : JSON.stringify(value));

function header(row: HistoryRow, json: "candidateJson" | "payloadJson"): HistoryRow {
  return Object.fromEntries(Object.entries(row).filter(([key]) => key !== json && key !== "validIntegrity")
    .map(([key, value]) => [key, value instanceof Date ? value.getTime() : value]));
}

function matchesHeader(current: HistoryRow, cached: HistoryRow) {
  // Only the raw JSON and the per-read seal result are excluded from the saved header.
  return Object.keys(current).length === Object.keys(cached).length + 2 && Object.entries(cached).every(([key, value]) => {
    const field = current[key];
    return Object.is(value, field instanceof Date ? field.getTime() : field);
  });
}

function remember(row: HistoryRow, markets: readonly HistoryRow[], revision: StoredRevision) {
  const bytes = 1024 + jsonBytes(row.candidateJson) + markets.reduce((sum, market) => sum + 512 + jsonBytes(market.payloadJson), 0);
  if (bytes > maximumBytes) return;
  const prior = verified.get(revision.id);
  if (prior) retainedBytes -= prior.bytes;
  verified.delete(revision.id);
  verified.set(revision.id, { revision, bytes, header: header(row, "candidateJson"),
    markets: new Map(markets.map(market => [String(market.family), header(market, "payloadJson")])) });
  retainedBytes += bytes;
  for (const [id, entry] of verified) {
    if (retainedBytes <= maximumBytes && verified.size <= maximumEntries) break;
    verified.delete(id);
    retainedBytes -= entry.bytes;
  }
}

/** The caller passes bounded batches. Full bytes are sent for cold or changed seals. */
async function readRows(tx: Prisma.TransactionClient, ids: readonly string[], known: ReadonlyMap<string, VerifiedRevision>) {
  const candidate = known.size ? Prisma.sql`CASE WHEN (p.id, BINARY p.integrity) IN (
    ${Prisma.join([...known].map(([id, entry]) => Prisma.sql`(${id}, BINARY ${seal(entry.header.integrity)})`))})
    THEN NULL ELSE p.candidateJson END` : Prisma.sql`p.candidateJson`;
  const payload = known.size ? Prisma.sql`CASE WHEN (m.setId, m.family, BINARY m.integrity) IN (
    ${Prisma.join([...known].flatMap(([id, entry]) => [...entry.markets].map(([family, market]) =>
      Prisma.sql`(${id}, ${family}, BINARY ${seal(market.integrity)})`)))})
    THEN NULL ELSE m.payloadJson END` : Prisma.sql`m.payloadJson`;
  const rows = await tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT p.id, p.fixtureId, p.fixtureVersion, p.cycleId,
    p.runId, p.runSequence, p.jobId, p.fixtureRevision, p.cycleRevision, p.predecessorId, p.scheduleVersion, p.modelVersionId,
    p.evidenceSnapshotId, p.evidenceHash, p.evidenceCutoffAt, p.generationCompletedAt, p.publishedAt, p.recordedAt,
    p.ruleVersion, p.requestHash, p.integrity, ${candidate} AS candidateJson,
    p.integrity=SHA2(CONCAT(p.id, ':', p.requestHash, ':', CAST(p.candidateJson AS CHAR)),256) AS validIntegrity
    FROM PredictionSet p WHERE p.id IN (${Prisma.join(ids)})`);
  const markets = await tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT m.setId, m.family, m.available, m.source, m.selection,
    m.selectedProbability, m.probability1, m.probability2, m.probability3, m.unavailableReason, m.generatedAt, m.retrievedAt,
    m.providerUpdatedAt, m.integrity, ${payload} AS payloadJson,
    m.integrity=SHA2(CAST(m.payloadJson AS CHAR),256) AS validIntegrity
    FROM MarketPrediction m WHERE m.setId IN (${Prisma.join(ids)})`);
  const requested = new Set(ids), groups = new Map<string, HistoryRow[]>(), revisions = new Map<string, HistoryRow>();
  for (const market of markets) {
    if (typeof market.setId !== "string" || !requested.has(market.setId)) return historyFail("invalid-state");
    const group = groups.get(market.setId) ?? [];
    group.push(market);
    groups.set(market.setId, group);
  }
  for (const row of rows) {
    if (typeof row.id !== "string" || !requested.has(row.id) || revisions.has(row.id)) return historyFail("invalid-state");
    revisions.set(row.id, row);
  }
  return { revisions, groups };
}

function bodyMatches(row: HistoryRow, marketRows: readonly HistoryRow[], entry: VerifiedRevision) {
  if (row.candidateJson !== null || !matchesHeader(row, entry.header)) return false;
  const families = new Set<unknown>();
  for (const market of marketRows) {
    const cached = typeof market.family === "string" ? entry.markets.get(market.family) : undefined;
    if (market.payloadJson !== null || !cached || families.has(market.family) || !matchesHeader(market, cached)) return false;
    families.add(market.family);
  }
  return true;
}

/** Reuse only after the current transaction proves both raw body seals and every binding
 * column that was audited. Live cycle, schedule and result reads stay in the caller. */
export async function readArchivedSlipRevisions(tx: Prisma.TransactionClient, ids: readonly string[]) {
  const result = new Map<string, StoredRevision>();
  if (!ids.length) return result;
  const known = new Map(ids.flatMap(id => {
    const entry = verified.get(id);
    return entry ? [[id, entry] as const] : [];
  }));
  const { revisions, groups } = await readRows(tx, ids, known);
  const refresh: string[] = [];
  const decode = (id: string, row: HistoryRow, markets: HistoryRow[]) => {
    const revision = revisionFromRows(row, markets);
    seal(row.integrity);
    for (const market of markets) seal(market.integrity);
    remember(row, markets, revision);
    result.set(id, revision);
  };
  for (const [id, row] of revisions) {
    const markets = groups.get(id) ?? [];
    if (markets.length !== 4) return historyFail("invalid-state");
    const entry = known.get(id);
    if (row.candidateJson !== null && markets.every(market => market.payloadJson !== null)) {
      decode(id, row, markets);
    } else {
      assertHistorySeal(row.validIntegrity);
      for (const market of markets) assertHistorySeal(market.validIntegrity);
      if (entry && bodyMatches(row, markets, entry)) {
        if (verified.get(id) === entry) {
          verified.delete(id);
          verified.set(id, entry);
        }
        result.set(id, entry.revision);
      } else {
        refresh.push(id);
      }
    }
  }
  if (refresh.length) {
    const live = await readRows(tx, refresh, new Map());
    for (const id of refresh) decode(id, live.revisions.get(id) ?? historyFail("invalid-state"), live.groups.get(id) ?? []);
  }
  return result;
}
