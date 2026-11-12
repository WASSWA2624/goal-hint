import { parseArgs } from "node:util";
import { DatabaseOperationError } from "../src/server/database/client.ts";
import { CatalogStoreError } from "../src/server/football/catalog-mysql-store.ts";
import { historyBackfillLimits } from "../src/server/football/history-backfill.ts";
import { historyReferenceDatasets } from "../src/server/football/history-reference-targets.ts";
import { createLiveRuntime, LiveConfigurationError } from "../src/server/live/live-runtime.ts";
import { loadLocalFootballPolicy } from "./lib/local-football-policy.mjs";
import { seedFootballHistory } from "./lib/seed-football-history.mjs";

const usage = `Usage: npm run history:backfill -- [--reuse-pages | --details | --reference] [--requests 1–${historyBackfillLimits.maximumRequests}] [--competition <id>] [--oldest-season <year>] [--dataset ${historyReferenceDatasets.join("|")}]
       npm run history:backfill -- --continuous [--requests 2–${historyBackfillLimits.maximumRequests}]`;
function argumentsForRun() {
  const { values } = parseArgs({ options: { requests: { type: "string" }, competition: { type: "string" },
    "oldest-season": { type: "string" }, "reuse-pages": { type: "boolean" }, details: { type: "boolean" },
    reference: { type: "boolean" }, dataset: { type: "string" }, help: { type: "boolean" } } });
  const integer = (value) => {
    if (value === undefined) return undefined;
    if (!/^\d+$/u.test(value) || !Number.isSafeInteger(Number(value))) throw new RangeError(usage);
    return Number(value);
  };
  const maxRequests = integer(values.requests) ?? historyBackfillLimits.defaultRequests;
  if (maxRequests < (values.details || values.reference ? 1 : 2) || maxRequests > historyBackfillLimits.maximumRequests) throw new RangeError(usage);
  if ([values["reuse-pages"], values.details, values.reference].filter(Boolean).length > 1 ||
      (values["reuse-pages"] && (values.requests || values.competition)) ||
      ((values["reuse-pages"] || values.details || values.reference) && values["oldest-season"]) ||
      (values.dataset !== undefined && (!values.reference || !historyReferenceDatasets.includes(values.dataset)))) throw new RangeError(usage);
  return { help: values.help, reusePages: values["reuse-pages"], details: values.details, reference: values.reference, dataset: values.dataset, maxRequests,
    competitionId: integer(values.competition), oldestSeason: integer(values["oldest-season"]) };
}

function reportFailure(error) {
  const configuration = error instanceof LiveConfigurationError, invalid = error instanceof RangeError;
  const reason = error instanceof DatabaseOperationError ? `database-${error.code}` :
    error instanceof CatalogStoreError ? `catalog-${error.reason}` : configuration ? "configuration" : invalid ? "invalid-input" : "unexpected";
  const retryable = configuration ? error.issues.includes("The application database is unavailable.") :
    !invalid && reason !== "catalog-not-authorized";
  console.error(configuration || invalid ? error.message : "History import paused. Completed batches remain saved. Private diagnostics are withheld.");
  console.error(JSON.stringify({ event: "history-error", reason, retryable }));
}

let args;
try { args = argumentsForRun(); } catch { console.error(usage); process.exitCode = 1; }
if (args?.help) console.log(usage);
else if (args) {
  const stop = new AbortController(), abort = () => stop.abort();
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  let runtime;
  try {
    const policy = await loadLocalFootballPolicy({ aiEnabled: "false", includeArchiveCatalog: !args.reusePages });
    if (args.reusePages) {
      console.log(JSON.stringify({ event: "history-existing-pages", ...await seedFootballHistory(stop.signal) }));
    } else {
      if (args.competitionId !== undefined && !policy.choices.competitionIds?.includes(args.competitionId)) {
        throw new RangeError("Choose a competition included in the local football scope.");
      }
      runtime = await createLiveRuntime(policy, { localFootball: true, historyBackfill: true });
      let result;
      if (args.reference) {
        if (!runtime.historyReference) throw new Error("The owned reference importer is unavailable.");
        result = await runtime.historyReference(args, stop.signal);
      } else {
        const kind = args.details ? "history-details" : "history-season";
        const run = args.details ? runtime.historyDetails : runtime.historyBackfill;
        if (!run) throw new Error("The owned history importer is unavailable.");
        result = await run(args, (receipt) => console.log(JSON.stringify({ event: kind, ...receipt })), stop.signal);
      }
      console.log(JSON.stringify({ event: "history-batch", ...result }));
      if (result.status === "catalog-unavailable") process.exitCode = 1;
    }
    if (stop.signal.aborted) process.exitCode = 130;
  } catch (error) {
    reportFailure(error);
    process.exitCode = 1;
  } finally {
    try { await runtime?.close(); }
    catch (error) { reportFailure(error); process.exitCode ||= 1; }
    process.off("SIGINT", abort);
    process.off("SIGTERM", abort);
  }
}
