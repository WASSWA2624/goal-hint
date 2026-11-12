import "server-only";

import { createHash } from "node:crypto";
import type { DatabaseRuntime } from "../database/client.ts";
import type { FootballHistoryReferenceTarget } from "./api-football-contract.ts";
import { footballHistoryPersonOmissionEndpoint, historyPersonRecordBatchSize, type FootballHistoryPersonRecordEndpoint,
  type FootballHistorySubjectKind } from "./history-person-records.ts";
import { readPendingHistorySubjectIds } from "./history-subjects.ts";

const endpoints = ["trophies", "sidelined"] as const;
const kinds = ["player", "coach"] as const;
const subjectHash = (kind: FootballHistorySubjectKind, id: number) =>
  createHash("sha256").update(JSON.stringify({ [kind]: String(id) })).digest("hex");

/** Reuse indexed subjects and confirm missing batch groups with an exact singleton request. */
export async function readHistoryPersonRecordTargets(database: DatabaseRuntime,
  dataset: FootballHistoryPersonRecordEndpoint | undefined, maxTargets: number) {
  const selectors = (dataset === undefined ? endpoints : [dataset]).flatMap((endpoint) => kinds.map((kind) => ({ endpoint, kind })));
  const lookupLimit = maxTargets * historyPersonRecordBatchSize + 1;
  const pending = await Promise.all(selectors.map(async ({ endpoint, kind }) => ({
    endpoint, kind, ids: await readPendingHistorySubjectIds(database, endpoint, kind, lookupLimit),
  })));
  const omissionLookups = pending.filter(({ ids }) => ids.length > 0).map(({ endpoint, kind, ids }) => ({
    endpoint: footballHistoryPersonOmissionEndpoint(endpoint), selectorHash: { in: ids.map((id) => subjectHash(kind, id)) },
  }));
  const omitted = omissionLookups.length ? await database.query((client) => client.footballHistorySourcePage.findMany({
    where: { OR: omissionLookups }, select: { endpoint: true, selectorHash: true },
  })) : [];
  const omissions = new Set(omitted.map(({ endpoint, selectorHash }) => `${endpoint}:${selectorHash}`));
  let hasMoreTargets = false;
  const queues = pending.map(({ endpoint, kind, ids }) => {
    const subjects: number[][] = [];
    let batch: number[] = [];
    for (const id of ids) {
      if (omissions.has(`${footballHistoryPersonOmissionEndpoint(endpoint)}:${subjectHash(kind, id)}`)) {
        subjects.push([id]);
        continue;
      }
      batch.push(id);
      if (batch.length === historyPersonRecordBatchSize) {
        subjects.push(batch);
        batch = [];
      }
    }
    if (batch.length) subjects.push(batch);
    hasMoreTargets ||= subjects.length > maxTargets || ids.length === lookupLimit;
    return subjects.slice(0, maxTargets).map((subjectIds) => ({ endpoint, kind, subjectIds }));
  });
  const targets: FootballHistoryReferenceTarget[] = [];
  const maximum = Math.max(...queues.map((queue) => queue.length));
  for (let index = 0; index < maximum; index++) {
    for (const queue of queues) {
      const target = queue[index];
      if (target) targets.push(target);
    }
  }
  return { targets, hasMoreTargets };
}
