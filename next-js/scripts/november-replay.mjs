import { randomUUID } from "node:crypto";
import { link, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { openForecastDatabase } from "./lib/forecast-database-target.mjs";
import { LOCAL_FIRST_MARKET_REGISTRY_VERSION } from "../src/domain/market-registry.ts";
import { localFeaturedDecisionVersion } from "../src/domain/local-featured-decision.ts";
import { novemberReplayRange, resolveReplayRange } from "../src/domain/november-replay.ts";
import { evidenceFingerprint } from "../src/server/evidence/evidence-input.ts";
import { localGoalModelVersion } from "../src/server/intelligence/local-goals-model.ts";
import { auditNovemberReplay } from "../src/server/intelligence/november-replay-audit.ts";
import { evaluateNovemberReplay } from "../src/server/intelligence/november-replay-evaluation.ts";
import { readNovemberReplayPage, readNovemberReplayTrainingMembership } from "../src/server/intelligence/november-replay-evidence.ts";
import { preparePricedNovemberReplay } from "../src/server/intelligence/november-replay-featured.ts";
import { statusShowsPlay } from "../src/server/predictions/publication-eligibility.ts";

const phases = ["canonical", "displaced"];
const pageSize = 100;
const occurrenceKey = ({ fixtureId, kickoffAt }) => `${fixtureId}:${kickoffAt}`;
const missingFile = (error) => error?.code === "ENOENT";
const abort = new AbortController();
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

async function loadPages(workspace, audit) {
  const names = (await readdir(workspace)).filter((name) => /^page-\d{5}\.json$/u.test(name)).sort();
  const pages = [];
  for (const [index, name] of names.entries()) {
    const page = await readSealed(join(workspace, name));
    if (page.auditHash !== audit.auditHash || page.index !== index || !phases.includes(page.phase))
      throw new ReplayCommandError("The replay pages do not match the audit.");
    pages.push(page);
  }
  return pages;
}

async function inspectOccurrence(database, audit, occurrence, original, training) {
  if (original?.status === "scheduled" && original.effectiveCutoffAt > audit.auditedAt) {
    return { fixtureId: occurrence.fixtureId, kickoffAt: occurrence.kickoffAt, status: "prospective",
      reason: "normal-prospective-processing", cutoffAt: original.effectiveCutoffAt,
      evidenceHash: evidenceFingerprint({ auditedAt: audit.auditedAt, original }) };
  }
  const { evidence, result } = await database.query((tx) => preparePricedNovemberReplay(tx, occurrence, audit.auditedAt, training));
  const { fixtureId, kickoffAt } = occurrence;
  const input = result ? { fixtureId, kickoffAt, cycleId: evidence.scheduleVersion === null ? null : occurrence.cycleId,
    scheduleVersion: evidence.scheduleVersion, sourceRevisionId: evidence.scheduleVersion === null ? null : original?.sourceRevisionId ?? null,
    evidenceCutoffAt: evidence.cutoffAt, evidenceHash: evidence.evidenceHash, engineVersion: audit.engineVersion,
    registryVersion: audit.registryVersion, evidenceReceiptIds: evidence.evidenceReceiptIds,
    replayAsOf: audit.auditedAt, teams: [occurrence.homeTeamId, occurrence.awayTeamId],
    generatedAt: Date.now(), status: "estimated", reason: null, ...result } : null;
  return { fixtureId, kickoffAt, evidenceHash: evidence.evidenceHash, cutoffAt: evidence.cutoffAt, decisionAt: evidence.decisionAt ?? null,
    historyMatches: evidence.historyMatches,
    status: result ? "estimated" : evidence.status === "prospective" ? "prospective" : "abstained",
    reason: result ? result.featuredDecision.reason ?? null : evidence.reason ?? "unqualified-local-engine",
    forecastOrigin: result ? evidence.archivedDecision ? "archived" : "rebuilt" : null,
    input, probabilities: result ? evidence.forecast?.probabilities ?? null : null };
}

async function dryRun(database, workspace, audit, maxPages) {
  const originals = new Map(audit.occurrences.map((row) => [occurrenceKey(row), row]));
  const pages = await loadPages(workspace, audit);
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
          return inspectOccurrence(database, audit, occurrence, original, membership);
        }));
        for (const record of records) if (record) { rows.push(record); processed.add(occurrenceKey(record)); }
        const { fixtureId, kickoffAt } = batch.at(-1);
        cursor = { fixtureId, kickoffAt };
      }
      const finished = occurrences.length < pageSize && !abort.signal.aborted;
      const page = { auditHash: audit.auditHash, index: pages.length, phase, cursor: cursor ?? null, finished, rows };
      await sealOnce(join(workspace, `page-${String(page.index).padStart(5, "0")}.json`), page);
      pages.push(page);
      if (--remaining <= 0 || finished) break;
    }
  }
  const finished = phases.every((phase) => pages.some((page) => page.phase === phase && page.finished));
  const rows = pages.flatMap((page) => page.rows);
  const summary = { finished, processed: rows.length, estimated: 0, prospective: 0, abstained: 0, reasons: {}, byStatus: {},
    archived: 0, rebuilt: 0, priced: 0, featuredAbstentions: 0, originalsMissingFromReplay: 0 };
  for (const row of rows) {
    summary[row.status]++;
    if (row.reason) summary.reasons[row.reason] = (summary.reasons[row.reason] ?? 0) + 1;
    const originalStatus = originals.get(occurrenceKey(row))?.status ?? "displaced";
    const statuses = summary.byStatus[originalStatus] ??= { estimated: 0, prospective: 0, abstained: 0, priced: 0, featuredAbstentions: 0 };
    statuses[row.status]++;
    if (row.input) {
      summary[row.forecastOrigin]++;
      if (row.input.selected) { summary.priced++; statuses.priced++; }
      else { summary.featuredAbstentions++; statuses.featuredAbstentions++; }
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
        const featured = definition ? { definition, selection: input.selected.selection } : undefined;
        return [{ fixtureId, kickoffAt, probabilities, featured }];
      }));
      await sealOnce(path, { auditHash: audit.auditHash, summary, evaluation });
    }
  }
  const final = finished && !abort.signal.aborted ? await readSealed(join(workspace, "dry-run.json")) : null;
  console.log(JSON.stringify({ auditHash: audit.auditHash, ...summary, ...(final && { evaluation: final.evaluation }) }));
}

async function stage(workspace, audit, store) {
  const complete = await readSealed(join(workspace, "dry-run.json"));
  if (complete.auditHash !== audit.auditHash || !complete.summary.finished) throw new ReplayCommandError("Finish the audited dry run before staging.");
  const rows = (await loadPages(workspace, audit)).flatMap((page) => page.rows);
  const candidates = rows.flatMap(({ input }) => input ? [input] : []);
  const byOccurrence = new Map(rows.map((row) => [occurrenceKey(row), row]));
  const originals = new Map(audit.occurrences.map((row) => [occurrenceKey(row), row]));
  for (const prior of await store.activeProjections(audit.range)) {
    const key = occurrenceKey(prior), row = byOccurrence.get(key), original = originals.get(key);
    if (prior.featuredDecision || !row || !original || row.status !== "abstained" ||
      row.reason === "occurrence-changed-since-audit" || prior.sourceRevisionId !== original.sourceRevisionId ||
      prior.cycleId !== original.cycleId || prior.scheduleVersion !== original.scheduleVersion) continue;
    const { fixtureId, kickoffAt, cycleId, scheduleVersion, sourceRevisionId, evidenceCutoffAt } = prior;
    candidates.push({ fixtureId, kickoffAt, cycleId, scheduleVersion, sourceRevisionId, evidenceCutoffAt,
      engineVersion: audit.engineVersion, registryVersion: audit.registryVersion, evidenceHash: row.evidenceHash, evidenceReceiptIds: [],
      replayAsOf: audit.auditedAt, decisionAt: row.decisionAt ?? evidenceCutoffAt, generatedAt: Date.now(), teams: original.teams,
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
  await sealOnce(join(workspace, "activation-diff.json"), { auditHash: audit.auditHash, diff });
  const summary = { staged: records.length, proposedReplacements: 0, priced: 0, suppressed: 0, replacedProjections: 0, reasons: {} };
  for (const row of diff) {
    summary.reasons[row.reason] = (summary.reasons[row.reason] ?? 0) + 1;
    if (!row.eligible) continue;
    summary.proposedReplacements++;
    if (row.selected) summary.priced++;
    else summary.suppressed++;
    if (row.previousProjectionRevisionId) summary.replacedProjections++;
  }
  console.log(JSON.stringify(summary));
}

async function changeProjection(workspace, audit, store, action, operationId) {
  if (!/^[a-z0-9][a-z0-9._:-]{0,95}$/iu.test(operationId ?? ""))
    throw new ReplayCommandError("Supply a stable --operation-id for activation or rollback.");
  const { diff, auditHash } = await readSealed(join(workspace, "activation-diff.json"));
  if (auditHash !== audit.auditHash) throw new ReplayCommandError("The activation diff does not belong to this audit.");
  const ready = diff.filter(({ eligible }) => eligible), actions = [];
  const activationOperationId = evidenceFingerprint({ operationId, auditHash, action: "activate" });
  const rollbackOperationId = evidenceFingerprint({ operationId, auditHash, action: "rollback" });
  for (const { fixtureId, revisionId, previousProjectionRevisionId: expectedProjectionRevisionId } of ready) {
    if (abort.signal.aborted) break;
    const result = action === "activate" ? await store.activate({ operationId: activationOperationId, revisionId, expectedProjectionRevisionId })
      : await store.rollback({ operationId: rollbackOperationId, activationOperationId, fixtureId });
    actions.push(result);
  }
  const completed = actions.length === ready.length;
  if (completed) await sealOnce(join(workspace, `${action}-${activationOperationId}.json`), { auditHash, actions });
  console.log(JSON.stringify({ action, completed, proposed: ready.length, checked: actions.length }));
}

let database;
try {
  const { positionals: [action, ...extra], values } = parseArgs({ allowPositionals: true, options: {
    environment: { type: "string", default: "development" }, workspace: { type: "string" },
    pages: { type: "string" }, "operation-id": { type: "string" }, from: { type: "string" }, to: { type: "string" },
  } });
  if (!values.workspace || extra.length || !["audit", "dry-run", "stage", "activate", "rollback"].includes(action) ||
    values.pages !== undefined && !/^[1-9]\d{0,3}$/u.test(values.pages))
    throw new ReplayCommandError("Use audit, dry-run, stage, activate or rollback with --workspace.");
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
    console.log(JSON.stringify({ auditHash: audit.auditHash, auditedAt: new Date(audit.auditedAt).toISOString(), ...audit.summary }));
  } else {
    const audit = await readSealed(join(workspace, "audit.json"));
    if (audit.environment !== values.environment || audit.engineVersion !== localGoalModelVersion() ||
      audit.registryVersion !== LOCAL_FIRST_MARKET_REGISTRY_VERSION || audit.featuredDecisionVersion !== localFeaturedDecisionVersion)
      throw new ReplayCommandError("The audit target or model no longer matches this operation.");
    if (action === "dry-run") await dryRun(database, workspace, audit, Number(values.pages ?? Infinity));
    else {
      const { createMysqlNovemberReplayStore } = await import("../src/server/intelligence/november-replay-store.ts");
      const store = createMysqlNovemberReplayStore(database);
      if (action === "stage") await stage(workspace, audit, store);
      else await changeProjection(workspace, audit, store, action, values["operation-id"]);
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
