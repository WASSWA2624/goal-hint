import { randomUUID } from "node:crypto";
import { link, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { openForecastDatabase } from "./lib/forecast-database-target.mjs";
import { LOCAL_FIRST_MARKET_REGISTRY_VERSION, reconcileOddsCatalog } from "../src/domain/market-registry.ts";
import { legacyLocalFeaturedDecisionVersion, localFeaturedDecisionVersion, previousLocalFeaturedDecisionVersion } from "../src/domain/local-featured-decision.ts";
import { inclusiveReplayEvidenceCutoff, novemberReplayRange, replaySuppressionClocks, resolveReplayRange } from "../src/domain/november-replay.ts";
import { evidenceFingerprint } from "../src/server/evidence/evidence-input.ts";
import { localGoalModelVersion } from "../src/server/intelligence/local-goals-model.ts";
import { auditNovemberReplay } from "../src/server/intelligence/november-replay-audit.ts";
import { evaluateNovemberReplay, evaluateReplayFeaturedDelta } from "../src/server/intelligence/november-replay-evaluation.ts";
import { readNovemberReplayPage, readNovemberReplayTrainingMembership } from "../src/server/intelligence/november-replay-evidence.ts";
import { loadNovemberReplayPrices, preparePricedNovemberReplay, replayFeaturedMode, replayFeaturedSelection, sameReplayFeaturedDisplay } from "../src/server/intelligence/november-replay-featured.ts";
import { storedPreMatchBetCatalogAt } from "../src/server/odds/odds-mysql-store.ts";
import { statusShowsPlay } from "../src/server/predictions/publication-eligibility.ts";

const phases = ["canonical", "displaced"];
const pageSize = 100;
const occurrenceKey = ({ fixtureId, kickoffAt }) => `${fixtureId}:${kickoffAt}`;
const missingFile = (error) => error?.code === "ENOENT";
const abort = new AbortController();
const validOperationId = (value) => /^[a-z0-9][a-z0-9._:-]{0,95}$/iu.test(value ?? "");
const deltaManifestFile = "policy-delta.json";
const deltaDiffFile = "policy-delta-activation-diff.json";
const coverageVersion = "november-market-coverage-v1";
// This optimization is only valid when the new rule adds lower rungs to the same gates.
const deltaDecisionVersion = previousLocalFeaturedDecisionVersion;
class ReplayCommandError extends Error {}
const stop = () => abort.abort();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

async function readSealed(path) {
  const { hash, body } = JSON.parse(await readFile(path, "utf8"));
  if (hash !== evidenceFingerprint(body)) throw new ReplayCommandError("The replay workspace contains an invalid checkpoint.");
  return body;
}

/** Publish a complete private checkpoint in one filesystem operation. */
async function sealOnce(path, body) {
  const hash = evidenceFingerprint(body);
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify({ hash, body }), { flag: "wx", mode: 0o600, flush: true });
    try { await link(temp, path); }
    catch (error) {
      if (error?.code !== "EEXIST" || evidenceFingerprint(await readSealed(path)) !== hash) throw error;
    }
  } finally { await rm(temp, { force: true }); }
}

async function loadPages(workspace, audit, requireCoverage = false) {
  const names = (await readdir(workspace)).filter((name) => /^page-\d{5}\.json$/u.test(name)).sort();
  const pages = [];
  for (const [index, name] of names.entries()) {
    const page = await readSealed(join(workspace, name));
    if (page.auditHash !== audit.auditHash || page.index !== index || !phases.includes(page.phase) ||
      requireCoverage && page.coverageVersion !== coverageVersion)
      throw new ReplayCommandError("The replay pages do not match the audit.");
    pages.push(page);
  }
  return pages;
}

async function inspectOccurrence(database, audit, occurrence, original, training, trace) {
  if (original?.status === "scheduled" && original.effectiveCutoffAt > audit.auditedAt) {
    return { fixtureId: occurrence.fixtureId, kickoffAt: occurrence.kickoffAt, status: "prospective",
      reason: "normal-prospective-processing", cutoffAt: original.effectiveCutoffAt,
      evidenceHash: evidenceFingerprint({ auditedAt: audit.auditedAt, original }) };
  }
  const { evidence, result, diagnostic, priceGates, inventoryClock } = await database.query((tx) =>
    preparePricedNovemberReplay(tx, occurrence, audit.auditedAt, training, localFeaturedDecisionVersion, undefined, trace ? "trace" : "counts"));
  const { fixtureId, kickoffAt } = occurrence;
  const input = result ? { fixtureId, kickoffAt, cycleId: evidence.scheduleVersion === null ? null : occurrence.cycleId,
    scheduleVersion: evidence.scheduleVersion, sourceRevisionId: evidence.scheduleVersion === null ? null : original?.sourceRevisionId ?? null,
    evidenceCutoffAt: evidence.cutoffAt, evidenceHash: evidence.evidenceHash, engineVersion: audit.engineVersion,
    registryVersion: audit.registryVersion, evidenceReceiptIds: evidence.evidenceReceiptIds,
    replayAsOf: audit.auditedAt, teams: [occurrence.homeTeamId, occurrence.awayTeamId],
    generatedAt: Date.now(), status: "estimated", reason: null, ...result } : null;
  const archived = evidence.archivedDecision;
  const unavailableMarkets = {};
  for (const group of archived?.unavailable ?? []) unavailableMarkets[group.reason] = (unavailableMarkets[group.reason] ?? 0) + group.marketKeys.length;
  for (const { source } of archived?.markets ?? []) if (source !== "local-engine")
    unavailableMarkets["no-validated-local-model"] = (unavailableMarkets["no-validated-local-model"] ?? 0) + 1;
  const modelEvidence = evidence.modelCoverage ?? null;
  const contextCoverage = evidence.contextCoverage ?? null;
  return { fixtureId, kickoffAt, evidenceHash: evidence.evidenceHash, cutoffAt: evidence.cutoffAt, decisionAt: evidence.decisionAt ?? null,
    historyMatches: evidence.historyMatches,
    status: result ? "estimated" : evidence.status === "prospective" ? "prospective" : "abstained",
    reason: result ? result.featuredDecision.reason ?? null : evidence.reason ?? "unqualified-local-engine",
    forecastOrigin: result ? evidence.archivedDecision ? "archived" : "rebuilt" : null,
    input, probabilities: result ? evidence.forecast?.probabilities ?? null : null,
    expectedGoals: result ? evidence.forecast?.expectedGoals ?? null : null,
    coverage: { auditedQuoteCutoff: diagnostic ? inventoryClock === null ? "nominal-only" : "proven" : null,
      marketCounts: diagnostic?.counts ?? null, priceGates, unavailableMarkets, modelEvidence, contextCoverage },
    ...(trace && { trace: { marketCoverage: diagnostic, modelEvidence, contextCoverage, archivedMarketAvailability: archived?.unavailable ?? null,
      archivedSample: archived?.markets.find(({ source, confidence }) => source === "local-engine" && confidence.sample)?.confidence.sample ?? null } }) };
}

async function dryRun(database, workspace, audit, maxPages, traceFixtures) {
  const originals = new Map(audit.occurrences.map((row) => [occurrenceKey(row), row]));
  const pages = await loadPages(workspace, audit, true);
  const processed = new Set(pages.flatMap(({ rows }) => rows.map(occurrenceKey)));
  let remaining = maxPages;
  for (const phase of phases) {
    const last = pages.findLast((page) => page.phase === phase);
    if (last?.finished) continue;
    const membership = phase === "canonical" && remaining > 0 ? await readNovemberReplayTrainingMembership(database, audit.auditedAt) : undefined;
    let cursor = last?.cursor;
    while (remaining > 0 && !abort.signal.aborted) {
      const occurrences = await readNovemberReplayPage(database, { after: cursor, limit: pageSize, auditedAt: audit.auditedAt,
        scope: phase, range: audit.range });
      const rows = [];
      // Match the development pool's two connections and retain the database's keyset order.
      for (let offset = 0; offset < occurrences.length && !abort.signal.aborted; offset += 2) {
        const batch = occurrences.slice(offset, offset + 2);
        const records = await Promise.all(batch.map(async (occurrence) => {
          const { fixtureId, kickoffAt } = occurrence;
          const key = occurrenceKey(occurrence), original = originals.get(key) ?? null;
          if (processed.has(key) || phase === "canonical" && !original) return null;
          if (phase === "canonical" && (occurrence.cycleId !== original.cycleId ||
            occurrence.originalRevisionId !== original.sourceRevisionId && original.cycleState !== "void" ||
            occurrence.homeTeamId !== original.teams[0] || occurrence.awayTeamId !== original.teams[1] ||
            occurrence.status !== original.status && !(statusShowsPlay(original.status) && statusShowsPlay(occurrence.status)))) {
            return { fixtureId, kickoffAt, status: "abstained", reason: "occurrence-changed-since-audit",
              evidenceHash: evidenceFingerprint({ original, occurrence }) };
          }
          return inspectOccurrence(database, audit, occurrence, original, membership, traceFixtures.has(fixtureId));
        }));
        for (const record of records) if (record) { rows.push(record); processed.add(occurrenceKey(record)); }
        const { fixtureId, kickoffAt } = batch.at(-1);
        cursor = { fixtureId, kickoffAt };
      }
      const finished = occurrences.length < pageSize && !abort.signal.aborted;
      const page = { auditHash: audit.auditHash, coverageVersion, index: pages.length, phase, cursor: cursor ?? null, finished, rows };
      await sealOnce(join(workspace, `page-${String(page.index).padStart(5, "0")}.json`), page);
      pages.push(page);
      if (--remaining <= 0 || finished) break;
    }
  }
  const finished = phases.every((phase) => pages.some((page) => page.phase === phase && page.finished));
  const rows = pages.flatMap((page) => page.rows);
  const summary = { finished, processed: rows.length, estimated: 0, prospective: 0, abstained: 0, reasons: {}, byStatus: {},
    archived: 0, rebuilt: 0, priced: 0, forecastOnly: 0, featuredAbstentions: 0, modes: {}, marketFamiliesByMode: {}, originalsMissingFromReplay: 0,
    marketCoverage: { provenCutoffFixtures: 0, nominalCutoffOnlyFixtures: 0, noOddsInventoryFixtures: 0, auditedWithoutVerifiedBooks: 0,
      modelEvidenceFixtures: 0, modelEvidenceAtSampleCap: 0, fixturesWithHeadToHead: 0, fixturesWithVerifiedHalfTimeHistory: 0,
      archivedContextFixtures: 0, counts: {}, unavailableMarkets: {}, archivedContextGaps: {},
      standardGates: { comparable: 0, meetsPrice: 0, positiveReturn: 0, eligibleByRung: {} } } };
  for (const row of rows) {
    summary[row.status]++;
    if (row.reason) summary.reasons[row.reason] = (summary.reasons[row.reason] ?? 0) + 1;
    const originalStatus = originals.get(occurrenceKey(row))?.status ?? "displaced";
    const statuses = summary.byStatus[originalStatus] ??= { estimated: 0, prospective: 0, abstained: 0, priced: 0,
      forecastOnly: 0, featuredAbstentions: 0, modes: {} };
    statuses[row.status]++;
    const coverage = row.coverage, totals = summary.marketCoverage;
    if (coverage?.auditedQuoteCutoff === "proven") totals.provenCutoffFixtures++;
    else if (coverage?.auditedQuoteCutoff === "nominal-only") totals.nominalCutoffOnlyFixtures++;
    else totals.noOddsInventoryFixtures++;
    if (coverage?.marketCounts?.bookmakerBooks === 0) totals.auditedWithoutVerifiedBooks++;
    if (coverage?.modelEvidence) {
      totals.modelEvidenceFixtures++;
      if (coverage.modelEvidence.competitionMatches >= coverage.modelEvidence.sampleCap) totals.modelEvidenceAtSampleCap++;
      if (coverage.modelEvidence.headToHeadMatches) totals.fixturesWithHeadToHead++;
      if (coverage.modelEvidence.verifiedHalfTime) totals.fixturesWithVerifiedHalfTimeHistory++;
    }
    if (coverage?.contextCoverage) {
      totals.archivedContextFixtures++;
      for (const [name, count] of Object.entries(coverage.contextCoverage.missingOrConflicting))
        totals.archivedContextGaps[name] = (totals.archivedContextGaps[name] ?? 0) + count;
    }
    if (coverage?.priceGates) {
      const { comparableQuoteOutcomes, oddsFloorOutcomes, positiveReturnOutcomes, eligibleByRung } = coverage.priceGates;
      totals.standardGates.comparable += comparableQuoteOutcomes;
      totals.standardGates.meetsPrice += oddsFloorOutcomes;
      totals.standardGates.positiveReturn += positiveReturnOutcomes;
      for (const { threshold, outcomes } of eligibleByRung)
        totals.standardGates.eligibleByRung[threshold] = (totals.standardGates.eligibleByRung[threshold] ?? 0) + outcomes;
    }
    for (const [name, count] of Object.entries(coverage?.marketCounts ?? {})) totals.counts[name] = (totals.counts[name] ?? 0) + count;
    for (const [name, count] of Object.entries(coverage?.unavailableMarkets ?? {})) totals.unavailableMarkets[name] = (totals.unavailableMarkets[name] ?? 0) + count;
    if (row.input) {
      summary[row.forecastOrigin]++;
      const mode = replayFeaturedMode(row.input.featuredDecision);
      const category = mode === "forecast-only" ? "forecastOnly" : mode === "abstained" ? "featuredAbstentions" : "priced";
      summary[category]++; statuses[category]++;
      summary.modes[mode] = (summary.modes[mode] ?? 0) + 1;
      statuses.modes[mode] = (statuses.modes[mode] ?? 0) + 1;
      countFeaturedFamily(summary.marketFamiliesByMode, mode, row.input.selected?.marketKey);
    }
  }
  if (finished && !abort.signal.aborted) {
    summary.originalsMissingFromReplay = [...originals.keys()].filter((key) => !processed.has(key)).length;
    const path = join(workspace, "dry-run.json");
    const existing = await readSealed(path).catch((error) => { if (!missingFile(error)) throw error; });
    if (!existing) {
      const evaluation = await evaluateNovemberReplay(database, audit, rows.flatMap(({ fixtureId, kickoffAt, input, probabilities }) => {
        if (!input) return [];
        const definition = input.selected && input.markets.find(({ definition }) => definition.key === input.selected.marketKey)?.definition;
        const featured = definition ? { definition, selection: input.selected.selection, mode: replayFeaturedMode(input.featuredDecision) } : undefined;
        return [{ fixtureId, kickoffAt, probabilities, featured }];
      }));
      await sealOnce(path, { auditHash: audit.auditHash, coverageVersion, summary, evaluation });
    }
  }
  const final = finished && !abort.signal.aborted ? await readSealed(join(workspace, "dry-run.json")) : null;
  console.log(JSON.stringify({ auditHash: audit.auditHash, ...summary, ...(final && { evaluation: final.evaluation }) }));
}

async function stage(workspace, audit, store) {
  const complete = await readSealed(join(workspace, "dry-run.json"));
  if (complete.auditHash !== audit.auditHash || complete.coverageVersion !== coverageVersion || !complete.summary.finished)
    throw new ReplayCommandError("Finish the audited dry run before staging.");
  const rows = (await loadPages(workspace, audit, true)).flatMap((page) => page.rows);
  // Checkpoints from an earlier dry run recorded the exclusive lock for rebuilt
  // forecasts without an original. Keep the checkpoint and its evidence hash.
  const candidates = rows.flatMap(({ input }) => !input ? [] : [input.sourceRevisionId === null ? { ...input,
    evidenceCutoffAt: inclusiveReplayEvidenceCutoff(input.evidenceCutoffAt, input.decisionAt) } : input]);
  const skippedSuppressions = [];
  const byOccurrence = new Map(rows.map((row) => [occurrenceKey(row), row]));
  const originals = new Map(audit.occurrences.map((row) => [occurrenceKey(row), row]));
  for (const prior of await store.activeProjections(audit.range)) {
    const key = occurrenceKey(prior), row = byOccurrence.get(key), original = originals.get(key);
    if (prior.featuredDecision || !row || !original || row.status !== "abstained" ||
      row.reason === "occurrence-changed-since-audit" || prior.sourceRevisionId !== original.sourceRevisionId ||
      prior.cycleId !== original.cycleId || prior.scheduleVersion !== original.scheduleVersion) continue;
    const { fixtureId, kickoffAt, cycleId, scheduleVersion, sourceRevisionId } = prior;
    const clocks = replaySuppressionClocks(prior.evidenceCutoffAt, row.decisionAt);
    if (!clocks) {
      skippedSuppressions.push({ fixtureId, kickoffAt, previousProjectionRevisionId: prior.revisionId,
        reason: "prior-evidence-cutoff-after-decision" });
      continue;
    }
    candidates.push({ fixtureId, kickoffAt, cycleId, scheduleVersion, sourceRevisionId, ...clocks,
      engineVersion: audit.engineVersion, registryVersion: audit.registryVersion, evidenceHash: row.evidenceHash, evidenceReceiptIds: [],
      replayAsOf: audit.auditedAt, generatedAt: Date.now(), teams: original.teams,
      status: "abstained", reason: row.reason, artifactHash: null, markets: [], selected: null,
      featuredDecision: { version: audit.featuredDecisionVersion, status: "abstained", reason: "no-local-forecast" },
      suppressedProjectionRevisionId: prior.revisionId });
  }
  const records = [];
  for (const input of candidates) {
    if (abort.signal.aborted) return;
    const { id, fixtureId } = await store.stage(input);
    records.push({ id, fixtureId });
  }
  const diff = await store.activationDiff(records.map(({ id }) => id));
  await sealOnce(join(workspace, "activation-diff.json"), { auditHash: audit.auditHash, diff,
    ...(skippedSuppressions.length > 0 && { skippedSuppressions }) });
  const summary = { staged: records.length, proposedReplacements: 0, priced: 0, forecastOnly: 0, suppressed: 0, replacedProjections: 0,
    modes: {}, marketFamiliesByMode: {}, reasons: {} };
  for (const { reason } of skippedSuppressions) summary.reasons[reason] = (summary.reasons[reason] ?? 0) + 1;
  for (const row of diff) {
    summary.reasons[row.reason] = (summary.reasons[row.reason] ?? 0) + 1;
    if (!row.eligible) continue;
    summary.proposedReplacements++;
    const mode = reviewedDisplayMode(row);
    const category = mode === "forecast-only" ? "forecastOnly" : mode === "abstained" ? "suppressed" : "priced";
    summary[category]++;
    summary.modes[mode] = (summary.modes[mode] ?? 0) + 1;
    countFeaturedFamily(summary.marketFamiliesByMode, mode, row.selected?.marketKey);
    if (row.previousProjectionRevisionId) summary.replacedProjections++;
  }
  console.log(JSON.stringify(summary));
}

function reviewedDisplayMode(row) {
  return row.featuredDecision ? replayFeaturedMode(row.featuredDecision) : row.selected ? "legacy" : "abstained";
}

function countFeaturedFamily(counts, mode, marketKey) {
  if (!marketKey) return;
  const family = marketKey.startsWith("goal:") ? marketKey.split(":", 3)[2] : marketKey;
  const families = counts[mode] ??= {};
  families[family] = (families[family] ?? 0) + 1;
}

async function deltaAudit(database, workspace, audit, baseline, v1OperationId) {
  const path = join(workspace, deltaManifestFile);
  const complete = await readSealed(join(workspace, "dry-run.json"));
  const reviewed = await readSealed(join(workspace, "activation-diff.json"));
  if (complete.auditHash !== audit.auditHash || !complete.summary.finished || reviewed.auditHash !== audit.auditHash)
    throw new ReplayCommandError("The policy delta requires a completed and reviewed v1 replay.");
  const approved = new Map(reviewed.diff.filter(({ eligible }) => eligible).map((item) => [occurrenceKey(item), item]));
  const baselineOperationId = baseline === "active" ? evidenceFingerprint({ operationId: v1OperationId, auditHash: audit.auditHash, action: "activate" }) : null;
  if (baselineOperationId) {
    const receipt = await readSealed(join(workspace, `activate-${baselineOperationId}.json`));
    const actions = new Map(receipt.actions.map((item) => [item.fixtureId, item]));
    if (receipt.auditHash !== audit.auditHash || actions.size !== approved.size || [...approved.values()].some((row) => {
      const action = actions.get(row.fixtureId);
      return action?.revisionId !== row.revisionId || action.kind !== "activate" || action.activationOperationId !== baselineOperationId;
    })) throw new ReplayCommandError("The active policy delta requires a matching completed v1 activation receipt.");
  }
  const estimates = (await loadPages(workspace, audit)).flatMap(({ rows }) => rows.flatMap(({ input }) => input ? [input] : []));
  const inputs = new Map(estimates.map((value) => [occurrenceKey(value), value]));
  let delta = await readSealed(path).catch((error) => { if (!missingFile(error)) throw error; });
  if (delta && (delta.auditHash !== audit.auditHash || delta.version !== deltaDecisionVersion ||
    delta.baseline !== baseline || delta.baselineOperationId !== baselineOperationId))
    throw new ReplayCommandError("The existing policy delta uses a different baseline or version.");
  if (!delta) {
    const rows = [];
    for (const input of estimates) {
      if (abort.signal.aborted) return;
      const { fixtureId, kickoffAt, decisionAt, replayAsOf, evidenceHash, sourceRevisionId, markets, featuredDecision: v1 } = input;
      if (v1?.version !== legacyLocalFeaturedDecisionVersion || replayAsOf !== audit.auditedAt)
        throw new ReplayCommandError("A v1 replay checkpoint has an unexpected policy or decision clock.");
      const evidenceCutoffAt = sourceRevisionId === null ? inclusiveReplayEvidenceCutoff(input.evidenceCutoffAt, decisionAt) : input.evidenceCutoffAt;
      const old = approved.get(occurrenceKey(input));
      const row = { fixtureId, kickoffAt, evidenceCutoffAt, decisionAt, replayAsOf, evidenceHash, sourceRevisionId, v1,
        baselineRevisionId: old?.revisionId ?? null,
        expectedProjectionRevisionId: baseline === "active" ? old?.revisionId ?? null : old?.previousProjectionRevisionId ?? null };
      // Lower rungs cannot displace a priced v1 selection or change the discovery of modeled, comparable offers.
      if (v1.status === "priced" || v1.reason !== "no-qualifying-outcome") {
        rows.push({ ...row, status: "unchanged", method: "sealed-v1", reason: old ? null : "v1-replay-ineligible",
          v2: { ...v1, version: deltaDecisionVersion } });
        continue;
      }
      const price = await database.query(async (tx) => {
        const assess = await loadNovemberReplayPrices(tx, { fixtureId, kickoffAt, decisionAt }, replayAsOf, markets);
        return { reproduced: assess(legacyLocalFeaturedDecisionVersion), candidate: assess(deltaDecisionVersion) };
      });
      if (evidenceFingerprint(v1) !== evidenceFingerprint(price.reproduced)) {
        rows.push({ ...row, status: "unverifiable", method: "retained-odds", reason: "v1-decision-no-longer-reproducible", v2: null });
      } else {
        rows.push({ ...row, status: sameReplayFeaturedDisplay(v1, price.candidate) ? "unchanged" : "changed",
          method: "retained-odds", reason: old ? null : "v1-replay-ineligible", v2: price.candidate });
      }
    }
    delta = { auditHash: audit.auditHash, version: deltaDecisionVersion, baseline, baselineOperationId,
      approvedWithoutEstimate: [...approved.keys()].filter((key) => !inputs.has(key)).length, rows };
    await sealOnce(path, delta);
  }
  const calibrationPath = join(workspace, "policy-delta-calibration.json"), deltaHash = evidenceFingerprint(delta);
  let calibration = await readSealed(calibrationPath).catch((error) => { if (!missingFile(error)) throw error; });
  if (calibration && calibration.deltaHash !== deltaHash) throw new ReplayCommandError("Calibration belongs to a different frozen policy delta.");
  if (!calibration) {
    const pairs = delta.rows.flatMap((row) => {
      if (!row.v2 || row.v1.status !== "priced" && row.v2.status !== "priced") return [];
      const { fixtureId, kickoffAt } = row;
      const input = inputs.get(occurrenceKey(row));
      const pick = (decision) => {
        if (decision.status !== "priced") return null;
        const definition = input?.markets.find(({ definition }) => definition.key === decision.marketKey)?.definition;
        if (!definition) throw new ReplayCommandError("A frozen pick has no verified market definition.");
        return { definition, selection: decision.selection, probability: decision.probability };
      };
      return [{ fixtureId, kickoffAt, v1: pick(row.v1), v2: pick(row.v2) }];
    });
    const evaluatedAt = await database.query(async (tx) => {
      const [{ at }] = await tx.$queryRaw`SELECT UTC_TIMESTAMP(3) AS at`;
      return at.getTime();
    });
    const evaluation = await evaluateReplayFeaturedDelta(database, audit, pairs, evaluatedAt);
    calibration = { deltaHash, evaluation };
    await sealOnce(calibrationPath, calibration);
  }
  const summary = { compared: 0, changed: 0, unchanged: 0, unverifiable: 0, reviewedChanges: 0, quoteRechecks: 0,
    retained: {}, approvedWithoutEstimate: delta.approvedWithoutEstimate };
  for (const row of delta.rows) {
    summary[row.status]++;
    if (row.v2) summary.compared++;
    if (row.status === "changed" && row.baselineRevisionId) summary.reviewedChanges++;
    if (row.method === "retained-odds") summary.quoteRechecks++;
    else {
      const key = row.v1.status === "priced" ? "priced" : row.v1.reason;
      summary.retained[key] = (summary.retained[key] ?? 0) + 1;
    }
  }
  console.log(JSON.stringify({ deltaHash, baseline, ...summary, calibration: calibration.evaluation }));
}

async function readPolicyDelta(workspace, audit) {
  const delta = await readSealed(join(workspace, deltaManifestFile));
  if (delta.auditHash !== audit.auditHash || delta.version !== deltaDecisionVersion)
    throw new ReplayCommandError("The reviewed policy delta uses another audit or version.");
  return delta;
}

async function stageDelta(workspace, audit, store) {
  const delta = await readPolicyDelta(workspace, audit);
  const changes = delta.rows.filter((row) => row.status === "changed" && row.baselineRevisionId && row.v2);
  const estimates = (await loadPages(workspace, audit)).flatMap(({ rows }) => rows.flatMap(({ input }) => input ? [[occurrenceKey(input), input]] : []));
  const inputs = new Map(estimates), active = new Map(changes.length
    ? (await store.activeProjections(audit.range)).map((prior) => [occurrenceKey(prior), prior]) : []);
  const records = [], skipped = [];
  for (const row of changes) {
    if (abort.signal.aborted) return;
    const key = occurrenceKey(row), input = inputs.get(key);
    const { baselineRevisionId, expectedProjectionRevisionId } = row;
    if ((active.get(key)?.revisionId ?? null) !== expectedProjectionRevisionId) {
      skipped.push({ fixtureId: row.fixtureId, kickoffAt: row.kickoffAt, reason: "baseline-projection-changed" });
      continue;
    }
    if (!input || evidenceFingerprint(input.featuredDecision) !== evidenceFingerprint(row.v1))
      throw new ReplayCommandError("A frozen policy delta no longer matches its v1 evidence.");
    const { id } = await store.stage({ ...input, generatedAt: Date.now(), evidenceCutoffAt: row.evidenceCutoffAt,
      selected: replayFeaturedSelection(row.v2), featuredDecision: row.v2, policyDelta: { baselineRevisionId, expectedProjectionRevisionId } });
    records.push(id);
  }
  const diff = await store.activationDiff(records);
  await sealOnce(join(workspace, deltaDiffFile), { auditHash: audit.auditHash, deltaHash: evidenceFingerprint(delta), diff, skipped });
  const reasons = {};
  for (const row of [...diff, ...skipped]) reasons[row.reason] = (reasons[row.reason] ?? 0) + 1;
  console.log(JSON.stringify({ staged: records.length, proposedReplacements: diff.filter(({ eligible }) => eligible).length, reasons }));
}

async function changeProjection(workspace, audit, store, action, operationId, policyDelta = false) {
  if (!validOperationId(operationId))
    throw new ReplayCommandError("Supply a stable --operation-id for activation or rollback.");
  const { diff, auditHash, deltaHash } = await readSealed(join(workspace, policyDelta ? deltaDiffFile : "activation-diff.json"));
  if (auditHash !== audit.auditHash) throw new ReplayCommandError("The activation diff does not belong to this audit.");
  if (policyDelta && deltaHash !== evidenceFingerprint(await readPolicyDelta(workspace, audit)))
    throw new ReplayCommandError("The activation diff does not belong to this policy delta.");
  const ready = diff.filter(({ eligible }) => eligible), actions = [], modes = {};
  const identity = { operationId, auditHash, ...(policyDelta && { deltaHash }) };
  const activationOperationId = evidenceFingerprint({ ...identity, action: "activate" });
  const rollbackOperationId = evidenceFingerprint({ ...identity, action: "rollback" });
  for (const row of ready) {
    if (abort.signal.aborted) break;
    const { fixtureId, revisionId, previousProjectionRevisionId: expectedProjectionRevisionId } = row;
    const result = action === "activate" ? await store.activate({ operationId: activationOperationId, revisionId, expectedProjectionRevisionId })
      : await store.rollback({ operationId: rollbackOperationId, activationOperationId, fixtureId });
    actions.push(result);
    const mode = reviewedDisplayMode(row);
    modes[mode] = (modes[mode] ?? 0) + 1;
  }
  const completed = actions.length === ready.length;
  if (completed) await sealOnce(join(workspace, `${action}-${activationOperationId}.json`), { auditHash, actions });
  console.log(JSON.stringify({ action, completed, proposed: ready.length, checked: actions.length, modes, ...(policyDelta && { deltaHash }) }));
}

let database;
try {
  const { positionals: [action, ...extra], values } = parseArgs({ allowPositionals: true, options: {
    environment: { type: "string", default: "development" }, workspace: { type: "string" },
    pages: { type: "string" }, "operation-id": { type: "string" }, from: { type: "string" }, to: { type: "string" },
    "delta-baseline": { type: "string" }, "v1-operation-id": { type: "string" }, "trace-fixture": { type: "string", multiple: true },
  } });
  const actions = ["audit", "dry-run", "stage", "activate", "rollback", "delta-audit", "delta-stage", "delta-activate", "delta-rollback"];
  if (!values.workspace || extra.length || !actions.includes(action) ||
    values.pages !== undefined && !/^[1-9]\d{0,3}$/u.test(values.pages))
    throw new ReplayCommandError("Supply a replay or policy-delta action and --workspace.");
  const traces = new Set(values["trace-fixture"] ?? []);
  if (traces.size > 10 || traces.size && (action !== "dry-run" || [...traces].some((id) =>
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(id)))) throw new ReplayCommandError("Supply up to ten fixture UUIDs to trace in the dry run.");
  const delta = action.startsWith("delta-"), baseline = values["delta-baseline"] ?? "active";
  if (action === "delta-audit" ? !["active", "reviewed"].includes(baseline) ||
      (baseline === "active" ? !validOperationId(values["v1-operation-id"]) : values["v1-operation-id"] !== undefined)
    : values["delta-baseline"] !== undefined || values["v1-operation-id"] !== undefined)
    throw new ReplayCommandError("Use delta-audit with an active v1 operation ID or an explicitly reviewed baseline.");
  const workspace = resolve(values.workspace);
  if ((values.from === undefined) !== (values.to === undefined) || values.from !== undefined && action !== "audit")
    throw new ReplayCommandError("Use --from and --to together when creating an audit.");
  const range = values.from === undefined ? novemberReplayRange : resolveReplayRange(values.from, values.to);
  database = await openForecastDatabase(values.environment);
  if (action === "audit") {
    await mkdir(workspace, { recursive: true, mode: 0o700 });
    const scope = values.environment === "development" ? undefined : process.env.GOAL_HINT_COMPETITION_IDS?.split(",").map(Number) ?? [];
    const path = join(workspace, "audit.json");
    const existing = await readSealed(path).catch((error) => { if (!missingFile(error)) throw error; });
    const audit = existing ?? { ...await auditNovemberReplay(database, scope, range), environment: values.environment };
    if (audit.environment !== values.environment || audit.featuredDecisionVersion !== localFeaturedDecisionVersion ||
        evidenceFingerprint(audit.range) !== evidenceFingerprint(range.window))
      throw new ReplayCommandError("The audit workspace belongs to another target, date range or decision policy.");
    if (!existing) await sealOnce(path, audit);
    const catalog = await database.query((tx) => storedPreMatchBetCatalogAt(tx, audit.auditedAt));
    await sealOnce(join(workspace, "market-catalog.json"), { auditHash: audit.auditHash, coverageVersion,
      latestAtAudit: catalog, bindingInventory: catalog ? reconcileOddsCatalog("pre-match", catalog.catalog) : null });
    console.log(JSON.stringify({ auditHash: audit.auditHash, auditedAt: new Date(audit.auditedAt).toISOString(), ...audit.summary }));
  } else {
    const audit = await readSealed(join(workspace, "audit.json"));
    const versionMatches = delta ? audit.featuredDecisionVersion === legacyLocalFeaturedDecisionVersion :
      audit.featuredDecisionVersion === localFeaturedDecisionVersion ||
        action === "rollback" && [legacyLocalFeaturedDecisionVersion, previousLocalFeaturedDecisionVersion].includes(audit.featuredDecisionVersion);
    if (audit.environment !== values.environment || audit.engineVersion !== localGoalModelVersion() ||
      audit.registryVersion !== LOCAL_FIRST_MARKET_REGISTRY_VERSION || !versionMatches)
      throw new ReplayCommandError("The audit target or model no longer matches this operation.");
    if (action === "dry-run") await dryRun(database, workspace, audit, Number(values.pages ?? Infinity), traces);
    else if (action === "delta-audit") await deltaAudit(database, workspace, audit, baseline, values["v1-operation-id"]);
    else {
      const { createMysqlNovemberReplayStore } = await import("../src/server/intelligence/november-replay-store.ts");
      const store = createMysqlNovemberReplayStore(database);
      if (action === "stage") await stage(workspace, audit, store);
      else if (action === "delta-stage") await stageDelta(workspace, audit, store);
      else await changeProjection(workspace, audit, store, delta ? action.slice(6) : action, values["operation-id"], delta);
    }
  }
} catch (error) {
  console.error(error instanceof ReplayCommandError || error?.name === "NovemberReplayStoreError" ? error.message :
    "The November replay operation could not complete for the selected target and workspace.");
  process.exitCode = 1;
} finally {
  if (abort.signal.aborted) process.exitCode = 130;
  await database?.disconnect().catch(() => { process.exitCode = 1; });
}
