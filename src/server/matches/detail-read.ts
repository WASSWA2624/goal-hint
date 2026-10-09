import "server-only";

import { marketSelections, type MarketFamily } from "../../domain/markets.ts";
import type { DetailSnapshot } from "../../domain/match-detail.ts";
import type { StoredCycle, StoredRevision } from "../predictions/history-contract.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import type { EvidenceSnapshot } from "../evidence/evidence-contract.ts";
import { isSafeEvidenceUrl } from "../evidence/evidence-network.ts";
import { storedSettlementProjection } from "../settlement/settlement-read.ts";
import { publicVoidReason } from "./fixture-read.ts";

export const publicDetailCycle = (cycle: StoredCycle) => ({ id: cycle.id, ordinal: cycle.ordinal, state: cycle.state,
  currentRevisionId: cycle.currentSetId, lockedRevisionId: cycle.lockedSetId, kickoffAt: cycle.kickoffAt, cutoffAt: cycle.cutoffAt,
  openedAt: cycle.openedAt, closedAt: cycle.closedAt, lockedAt: cycle.lockedAt, voidedAt: cycle.voidedAt,
  voidReason: cycle.state === "void" ? publicVoidReason(cycle.voidReason) : null });
export const publicDetailRevision = (revision: StoredRevision) => ({ revisionId: revision.id, cycleId: revision.cycleId, runId: revision.runId,
  runSequence: String(revision.runSequence), fixtureRevision: revision.fixtureRevision, cycleRevision: revision.cycleRevision,
  fixtureDataVersion: String(revision.fixtureVersion), evidenceCutoffAt: revision.evidenceCutoffAt,
  generationCompletedAt: revision.generationCompletedAt, publishedAt: revision.publishedAt });

/** Only validated original explanations and permitted attribution leave this boundary.
 * Raw claims, prompts, proof references, model pins and private denial details are omitted. */
export function publicRevisionAnalysis(revision: StoredRevision, evidence: EvidenceSnapshot, asOf: number): DetailSnapshot["analysis"] {
  const available = Object.values(revision.candidate.markets).filter((m) => m.available);
  const ai = available.flatMap((m) => m.provenance.kind === "ai" ? [m.provenance] : []);
  const referenced = new Set(ai.flatMap((p) => p.sources.map((s) => s.sourceId)));
  const retained = evidence.sources.filter((s) => referenced.has(s.id) && s.reuse.allowSummary && s.reuse.retainUntil >= asOf);
  const allowed = new Set(retained.map((s) => s.id));
  const sources: DetailSnapshot["analysis"]["sources"] = retained.map((s) => ({ id: s.id, publisher: s.publisher, title: s.title,
    url: isSafeEvidenceUrl(s.sourceUrl) ? s.sourceUrl : null, publishedAt: s.publishedAt, retrievedAt: s.retrievedAt, providerUpdatedAt: s.providerUpdatedAt }));
  for (const m of available) if (m.provenance.kind === "api-football" && !sources.some((s) => s.id === "api-football")) {
    sources.push({ id: "api-football", publisher: "API-Football", title: "Statistical match prediction",
      url: isSafeEvidenceUrl(m.provenance.source.sourceUrl) ? m.provenance.source.sourceUrl : null,
      publishedAt: null, retrievedAt: m.timestamps.retrievedAt, providerUpdatedAt: m.timestamps.providerUpdatedAt });
  }
  const permittedUrls = new Set(sources.flatMap((s) => s.url === null ? [] : [s.url]));
  const explain = (item: StoredRevision["candidate"]["uncertainty"]) => ({ text: item.text, sourceUrls: [...item.sourceUrls] });
  // The resolver retains URLs rather than claim references. If any AI source has
  // expired, withhold the whole explanation instead of guessing which text survives.
  const permitted = ai.every((p) => p.sources.every((s) => allowed.has(s.sourceId))) &&
    [...revision.candidate.reasons, revision.candidate.uncertainty].every((item) => item.sourceUrls.every((url) => permittedUrls.has(url) && isSafeEvidenceUrl(url)));
  return { state: permitted ? "available" : "withheld", reasons: permitted ? revision.candidate.reasons.map(explain) : [],
    uncertainty: permitted ? explain(revision.candidate.uncertainty) : null,
    limitedNews: ai.some((p) => p.evidence.coverage.limitedNews), sources };
}

export async function publicDetailSnapshot(tx: Prisma.TransactionClient, revision: StoredRevision, cycle: StoredCycle,
  currentRevisionId: string | null, evidence: EvidenceSnapshot, asOf: number): Promise<DetailSnapshot> {
  const historical = revision.id !== currentRevisionId;
  const applicability = cycle.state === "void" ? "void" : cycle.lockedSetId === revision.id ? "locked" : historical ? "historical" : "current";
  const analysis = publicRevisionAnalysis(revision, evidence, asOf);
  const markets: DetailSnapshot["markets"] = Object.values(revision.candidate.markets).filter((m) => m.available).map((m) => ({
    market: m.market, reasons: [], uncertainty: null, timestamps: { ...m.timestamps },
    alternatives: marketSelections[m.market.family].filter((s) => s !== m.market.selection).map((selection) => ({ selection,
      probability: (m.market.probabilities as Readonly<Record<string, number>>)[selection]! })),
    source: { kind: m.provenance.kind, provisional: m.provenance.kind === "api-football" || m.provenance.provisional,
      fallbackReason: m.fallback?.reason ?? null, sourceIds: m.provenance.kind === "api-football" ? ["api-football"]
        : m.provenance.sources.filter((s) => analysis.sources.some((a) => a.id === s.sourceId)).map((s) => s.sourceId) },
  }));
  const unavailableMarkets: DetailSnapshot["unavailableMarkets"] = (Object.keys(marketSelections) as MarketFamily[]).flatMap((family) => {
    const m = revision.candidate.markets[family];
    return m.available ? [] : [{ family, reason: ["unsupported-family", "unsupported-markets"].includes(m.reason) ? "unsupported" : "insufficient-data" }];
  });
  const settlement = cycle.lockedSetId === revision.id ? await storedSettlementProjection(tx, revision.fixtureId, cycle.id) : null;
  const outcomes: DetailSnapshot["outcomes"] = applicability === "historical" ? [] : markets.map(({ market }) => {
    const entry = settlement?.cycles[0]?.markets.find((m) => m.base.family === market.family), recorded = entry?.previous;
    const current = recorded && entry?.inputHash === recorded.inputHash && recorded.lockedSetId === revision.id;
    const status = applicability === "void" ? "void" : current && ["correct", "incorrect"].includes(recorded.status) ? recorded.status as "correct" | "incorrect" : "pending";
    const correctedAt = current ? recorded.correctedAt : null;
    return { family: market.family, cycleId: cycle.id, revisionId: revision.id, selection: market.selection, status,
      reason: status === "void" ? "void-cycle" : status === "pending" ? "awaiting-result" : correctedAt !== null ? "result-correction" : "verified-result",
      explanation: status === "void" ? publicVoidReason(cycle.voidReason).explanation : status === "pending" ? "Awaiting a verified regulation-time result."
        : correctedAt !== null ? "The verified regulation-time result was corrected; the original selected pick is preserved." : "Settled against the verified regulation-time result.",
      settledAt: current && status !== "pending" ? recorded.at : null, correctedAt, voidedAt: status === "void" ? cycle.voidedAt : null };
  });
  return { ...publicDetailRevision(revision), historical, applicability, cycle: publicDetailCycle(cycle), markets, unavailableMarkets, analysis, outcomes };
}
